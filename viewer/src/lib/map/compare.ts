// the compare mode of the Map, its rules in plain functions: Then vs Now as two slices of one layer. the hash's `t` is the
// slice the map always shows (the Period scrubber's), `t2` the second period (absent = off), `anom=1` draws `t2 - t` per
// cell instead of the second slice. no MapLibre and no DuckDB here: MapCanvas draws, gridKind.ts makes the two slots,
// gridSource.ts runs the SQL.
//
// one map, two layer groups. the slot at `t` is drawn whole; the slot at `t2` sits above it and is clipped to the left of
// the swipe handle by two custom layers around its fill that set and clear the WebGL scissor box (`scissorBox`). MapLibre 6
// touches the scissor only in its debug drawing, so nothing else is clipped. that is erddap-places' `thenNow/swipe.ts`
// `clipFor` (a CSS clip of the right-hand map of two maps) done inside one canvas: a straight screen line on the flat map
// and on the globe alike, and nothing re-laid-out while the handle or the map moves (a `setFilter` on the cells' `lon`
// rebuilds every tile of a 100,000-square GeoJSON source per frame, and on the globe a meridian is not a screen line).
//
// erddap-places pairs a day of the year (`md`) across a climatology and a year. here `t` and `t2` are periods of the layer's
// grain (a month of MUR monthly, a year of a yearly grid), each one step of the dataset, so no day-of-year pairing is needed.
// what carries over: Then on the left, Now on the right (with `t2` earlier, the usual case), one colour scale over both
// periods (the union of the two slices' ranges), the anomaly on a diverging ramp symmetric about 0 with the swipe hidden.

// ---- the swipe ----

/** the swipe's share of the map width, kept off the edges so the handle stays in reach */
export const SWIPE_MIN = 0.02
export const SWIPE_MAX = 0.98
export const clampSwipe = (f: number) => (Number.isFinite(f) ? Math.min(SWIPE_MAX, Math.max(SWIPE_MIN, f)) : 0.5)

/** the handle's x in CSS pixels at a swipe fraction of a box `width` wide (erddap-places `clipFor`'s inset) */
export const swipeX = (fraction: number, width: number) => Math.round(clampSwipe(fraction) * width)

/**
 * the scissor box of the second slot (left of the handle) in drawing-buffer pixels, origin bottom-left as WebGL has it:
 * the whole height, from the left edge to the handle. the buffer is the canvas at the device pixel ratio, so the line
 * lands on the handle at any ratio
 */
export function scissorBox(fraction: number, bufferWidth: number, bufferHeight: number): [number, number, number, number] {
  return [0, 0, Math.round(clampSwipe(fraction) * bufferWidth), bufferHeight]
}

/** the handle's keys: arrows move it 5 % (Shift 1 %), Home and End to the edges, PageUp/PageDown 25 %; null for any other key */
export function keySwipe(key: string, shift: boolean, f: number): number | null {
  const step = shift ? 0.01 : 0.05
  switch (key) {
    case 'ArrowLeft': case 'ArrowDown': return clampSwipe(f - step)
    case 'ArrowRight': case 'ArrowUp': return clampSwipe(f + step)
    case 'PageDown': return clampSwipe(f - 0.25)
    case 'PageUp': return clampSwipe(f + 0.25)
    case 'Home': return SWIPE_MIN
    case 'End': return SWIPE_MAX
    default: return null
  }
}

// ---- the second period ----

/**
 * the period compare opens on: the start of the scrubber's window (t - w), so the two ends of the window are compared;
 * one period back when the window is one period, and null when there is no other period
 */
export function defaultT2(periods: readonly string[], idx: number, win: number): string | null {
  if (periods.length < 2) return null
  const i = Math.max(0, Math.min(periods.length - 1, idx))
  const j = Math.max(0, i - Math.max(1, win))
  return periods[j !== i ? j : i + 1]
}

// ---- the colour scale ----

/** one scale over both periods: the union of the ranges that are in (null while neither is) */
export function unionRange(ranges: readonly ([number, number] | null | undefined)[]): [number, number] | null {
  const r = ranges.filter((x): x is [number, number] => !!x)
  if (!r.length) return null
  return [Math.min(...r.map(x => x[0])), Math.max(...r.map(x => x[1]))]
}

/** the anomaly's domain: symmetric about 0 and holding every value ([-1, 1] when every cell is 0) */
export function anomalyDomain(range: [number, number] | null): [number, number] | null {
  if (!range) return null
  const m = Math.max(Math.abs(range[0]), Math.abs(range[1]))
  return m > 0 ? [-m, m] : [-1, 1]
}

// ---- the anomaly in the engine's SQL ----

/** a table name the anomaly may use (the engine inserts the two slices under these) */
const TABLE = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * `t2 - t` per cell from the two slices as tables of `lat, lon, weight, value` (the engine's `insertRows`, which writes a
 * null value as NaN): one row per cell of the `t2` slice, its own centre and weight, the value NULL where either period has
 * no data. the join is on the centres rounded to 1e-5 degrees (both slices come from one mask, so they are equal; the
 * rounding only guards a float printed twice)
 */
export function anomalySql(then: string, now: string): string {
  if (!TABLE.test(then) || !TABLE.test(now)) throw new Error(`anomalySql: bad table name ${then} or ${now}`)
  const missing = (c: string) => `${c}.value IS NULL OR isnan(${c}.value)`
  return [
    'SELECT b.lat AS lat, b.lon AS lon, b.weight AS weight,',
    `  CASE WHEN ${missing('a')} OR ${missing('b')} THEN NULL ELSE b.value - a.value END AS value`,
    `FROM ${now} b`,
    `LEFT JOIN ${then} a ON ROUND(a.lat, 5) = ROUND(b.lat, 5) AND ROUND(a.lon, 5) = ROUND(b.lon, 5)`,
    'ORDER BY b.lat, b.lon',
  ].join('\n')
}

// ---- the legend ----

/** what the compare line reads of each slot's legend */
export interface CompareLegend {
  t: string | null
  ramp?: { min: number; max: number } | null
  problem?: string | null
  units?: string | null
}

const num = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2))
const signed = (v: number) => (v > 0 ? `+${num(v)}` : v < 0 ? `−${num(-v)}` : num(0))

/**
 * the legend line of the compare mode, naming both periods. the swipe: "Compare: <title> · left of the handle <t2> ·
 * right <t> · one colour scale over both periods · <min> to <max> <units> · <via>". the anomaly: "Difference: <title>,
 * <t2> minus <t>, per cell · <−m> to <+m> <units> · blue lower in <t2>, red higher · <via>". "loading the slice at <p>…"
 * until a period is in, "· <problem>" when it failed
 */
export function compareLegendLine(o: { title: string; via: string; first: CompareLegend; second: CompareLegend; anom: boolean }, period: (t: string) => string): string {
  const p1 = o.first.t ? period(o.first.t) : 'the latest time'
  const p2 = o.second.t ? period(o.second.t) : 'the latest time'
  const units = o.second.units ?? o.first.units ?? null
  const u = units ? ` ${units}` : ''
  const states: string[] = []
  for (const [l, p] of [[o.second, p2], [o.first, p1]] as const) {
    if (l.problem) states.push(`${p}: ${l.problem}`)
    else if (!l.ramp) states.push(`loading the slice at ${p}…`)
  }
  const state = states.length ? ` · ${states.join(' · ')}` : ''
  if (o.anom) {
    const r = o.second.ramp
    const range = r ? ` · ${signed(r.min)} to ${signed(r.max)}${u}` : ''
    return `Difference: ${o.title}, ${p2} minus ${p1}, per cell${range} · blue lower in ${p2}, red higher${state} · ${o.via}`
  }
  const r = o.first.ramp ?? o.second.ramp
  const range = r ? ` · ${num(r.min)} to ${num(r.max)}${u}` : ''
  return `Compare: ${o.title} · left of the handle ${p2} · right ${p1} · one colour scale over both periods${range}${state} · ${o.via}`
}
