// the compare mode of the Map, its rules in plain functions: Then vs Now as two slices of one layer. the hash's `t` is the
// slice the map always shows (the Period scrubber's), `t2` the second period (absent = off), `anom=1` draws `t2 - t` per
// cell instead of the second slice. no MapLibre and no DuckDB here: MapCanvas draws, gridKind.ts makes the two slots,
// gridSource.ts runs the SQL.
//
// one map, two layer groups. the slot at `t2` sits just above the slot at `t`; each is cut to its side of the swipe handle
// (t2 left, t right) by two custom layers around its fill that set and clear the WebGL scissor box (`scissorBox`). MapLibre 6
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
 * the scissor box of a side of the swipe in drawing-buffer pixels, origin bottom-left as WebGL has it, the whole height:
 * `left` (the slot at t2) from the left edge to the handle, `right` (the slot at t) from the handle to the right edge. each
 * slot is cut to its own side, so neither shows through the other (both are drawn at 0.9 opacity). the buffer is the canvas
 * at the device pixel ratio, so the line lands on the handle at any ratio
 */
export function scissorBox(fraction: number, bufferWidth: number, bufferHeight: number, side: 'left' | 'right' = 'left'): [number, number, number, number] {
  const x = Math.round(clampSwipe(fraction) * bufferWidth)
  return side === 'left' ? [0, 0, x, bufferHeight] : [x, 0, bufferWidth - x, bufferHeight]
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
export function compareLegendLine(o: { title: string; via: string; first: CompareLegend; second: CompareLegend; anom: boolean; secondLabel?: string | null }, period: (t: string) => string): string {
  const p1 = o.first.t ? period(o.first.t) : 'the latest time'
  const p2 = o.secondLabel ?? (o.second.t ? period(o.second.t) : 'the latest time')
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

// ---- the climatology Then: t2 as a year range ----
//
// erddap-places' Then is a climatology (1985-2005, 2003-2012) or any year range, averaged in the browser. here `t2` may be a
// year range `2003-2012`: the mean, per cell, of that range's periods at the month of `t` (one slice per period through the
// shared slices, sliceCache.ts; averaged in the engine's SQL, gridAnomaly.ts `meanRows`), at most MAX_MEAN_PERIODS of them.

/** the most periods a year range averages: one slice each, so at most this many requests per lobe */
export const MAX_MEAN_PERIODS = 12
/** erddap-places' two baselines (thenNow/state.ts BASELINES) */
export const BASELINES = ['1985-2005', '2003-2012'] as const

const RANGE = /^(\d{4})-(\d{4})$/

/** `2003-2012` -> { y0: 2003, y1: 2012 }; null for a period ("2024-07" has a two-digit second part) or a range that runs backwards */
export function parseYearRange(t: string | null | undefined): { y0: number; y1: number } | null {
  const m = RANGE.exec(t ?? '')
  if (!m) return null
  const y0 = Number(m[1]), y1 = Number(m[2])
  return y0 <= y1 ? { y0, y1 } : null
}
export const isYearRange = (t: string | null | undefined) => parseYearRange(t) !== null

/** the month a year range averages: that of `t` (a step date, "2024-07-01"), else of the dataset's latest step, else January */
export function rangeMonth(t: string | null, latest: string | null): string {
  const m = /^\d{4}-(\d{2})/.exec(t ?? latest ?? '')
  return m ? m[1] : '01'
}

export interface MeanPlan {
  /** the step dates averaged, oldest first ("2003-07-01") */
  periods: string[]
  /** the years the range names, those outside the dataset's record, and whether the cap cut the rest */
  asked: number
  outside: number
  capped: boolean
  /** the periods inside the record before the cap */
  inside: number
}

/**
 * the periods of a year range at a month: one a year, those outside the dataset's record (its extent, by month) left out, the
 * first MAX_MEAN_PERIODS of the rest kept
 */
export function yearRangePeriods(range: { y0: number; y1: number }, month: string, extent: { start: string; end: string } | null, cap = MAX_MEAN_PERIODS): MeanPlan {
  const all: string[] = []
  for (let y = range.y0; y <= range.y1; y++) all.push(`${y}-${month}`)
  const lo = extent?.start.slice(0, 7) ?? '', hi = extent?.end.slice(0, 7) ?? '9999-12'
  const inside = all.filter(p => p >= lo && p <= hi)
  return { periods: inside.slice(0, cap).map(p => `${p}-01`), asked: all.length, outside: all.length - inside.length, capped: inside.length > cap, inside: inside.length }
}

/** what the mean was made of, once its slices are in: the plan, and the periods whose slice failed (left out of the mean) */
export interface MeanInfo extends MeanPlan { failed: string[] }

/**
 * the Then of a year range as the legend and the swipe caption name it: "mean of 2003-07..2012-07" before its slices are in
 * (from the range and the month alone), then with what it holds: "(10 periods)", "(12 periods: capped at 12 of 18)", "4 outside
 * the record", "1 failed: 2007-07"
 */
export function rangeLabel(range: { y0: number; y1: number }, month: string, period: (t: string) => string, info?: MeanInfo | null): string {
  if (!info || !info.periods.length) {
    const head = `mean of ${period(`${range.y0}-${month}-01`)}..${period(`${range.y1}-${month}-01`)}`
    return info && !info.periods.length ? `${head} (no period inside the record)` : head
  }
  const used = info.periods.filter(p => !info.failed.includes(p))
  const head = `mean of ${period(info.periods[0])}..${period(info.periods[info.periods.length - 1])}`
  const bits = [`${used.length} period${used.length === 1 ? '' : 's'}`]
  if (info.capped) bits[0] += `: capped at ${MAX_MEAN_PERIODS} of ${info.inside}`
  if (info.outside) bits.push(`${info.outside} outside the record`)
  if (info.failed.length) bits.push(`${info.failed.length} failed: ${info.failed.map(period).join(', ')}`)
  return `${head} (${bits.join('; ')})`
}

/**
 * the year ranges the "Compare with" select offers: erddap-places' baselines that overlap the record the scrubber walks, and
 * the ten years before t's year, newest last
 */
export function yearRangeChoices(periods: readonly string[], t: string | null): { value: string; label: string; group: string }[] {
  const years = periods.map(p => Number(p.slice(0, 4))).filter(Number.isFinite)
  if (!years.length) return []
  const lo = Math.min(...years), hi = Math.max(...years)
  const y = t ? Number(t.slice(0, 4)) : hi
  const out = new Set<string>()
  for (const b of BASELINES) { const r = parseYearRange(b)!; if (r.y1 >= lo && r.y0 <= hi) out.add(b) }
  if (y - 10 >= lo) out.add(`${y - 10}-${y - 1}`)
  return [...out].map(v => ({ value: v, label: `mean of ${v.replace('-', '–')}`, group: 'Then: the mean of a year range' }))
}

/**
 * the mean per cell of several slices as tables of `lat, lon, weight, value` (the engine's `insertRows`, a null value as NaN):
 * one row per cell (its centre rounded to 1e-5 degrees, as `anomalySql` joins), the mean of the periods with data there,
 * NULL where none has
 */
export function meanSql(tables: readonly string[]): string {
  if (!tables.length || tables.some(t => !TABLE.test(t))) throw new Error(`meanSql: bad table names ${tables.join(', ')}`)
  return [
    'SELECT any_value(lat) AS lat, any_value(lon) AS lon, any_value(weight) AS weight,',
    '  avg(value) FILTER (WHERE value IS NOT NULL AND NOT isnan(value)) AS value',
    `FROM (${tables.map(t => `SELECT lat, lon, weight, value FROM ${t}`).join(' UNION ALL ')})`,
    'GROUP BY ROUND(lat, 5), ROUND(lon, 5)',
    'ORDER BY lat, lon',
  ].join('\n')
}
