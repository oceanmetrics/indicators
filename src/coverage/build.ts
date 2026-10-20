// coverage: place x indicator x grain -> time range, periods, last value, a sparkline, and on the indicator's
// status_grain row its default status and trend (schema/coverage.schema.json). the status comes from src/status/,
// the same module the viewer runs, so a cell in the Matrix and a card in a report cannot disagree.
import { assess, categoricalSentence, completeGrid, periodLabel } from '../status/index.ts'
import type { Grain, MethodId, Point } from '../status/index.ts'

/** a contract row as read from a values file (time as an ISO date string or null) */
export interface ValueRow {
  place_id: string
  coll: string
  indicator: string
  time_grain: Grain
  time: string | null
  class: string | null
  value: number | null
  n: number | null
  unit: string
}

/** the manifest fields coverage needs */
export interface ManifestIndicator {
  id: string
  short: string
  title: string
  kind: 'continuous' | 'categorical'
  classes?: Record<string, string>
  status_method: MethodId | 'anomaly' | 'stacked'
  status_grain: Grain
  min_periods: number
  recent: number
  unit_label?: string
  decimals?: number
  collections: { coll: string; path: string }[]
}

export interface CoverageRow {
  place_id: string
  place_name: string
  /** the values collection the row was read from (`places`, `mr_eez`): which values file holds it */
  coll: string
  /**
   * the place's home gazetteer collection (`noaa_nerrs`, `mr_eez`): what the viewer groups places by. absent in a
   * coverage table built before 2026-10-20; readers use `place_coll ?? coll`.
   */
  place_coll?: string | null
  indicator: string
  time_grain: Grain
  t0: string | null
  t1: string | null
  n_periods: number
  last_time: string | null
  last_value: number | null
  last_class: string | null
  status_method: string | null
  status: 'above' | 'within' | 'below' | null
  trend: 'up' | 'flat' | 'down' | null
  recent_mean: number | null
  recent_from: string | null
  recent_to: string | null
  lt_mean: number | null
  lt_sd: number | null
  why: string | null
  sentence: string | null
  spark: string
}

export const SPARK_PERIODS = 40
/** spark values keep 4 significant digits: finer than a 96 px line can show, and it halves coverage.parquet */
export const SPARK_DIGITS = 4
const sparkValue = (v: number | null) => (v == null ? null : Number(v.toPrecision(SPARK_DIGITS)))

/**
 * the spark column: the last SPARK_PERIODS calendar periods at the grain, as `{"t0": first period start, "g": grain,
 * "v": [value or null, ...]}` (consecutive periods, null for a gap), values to SPARK_DIGITS significant digits; "[]"
 * for no values. a third of the size of [[period start, value], ...] pairs, which readers still accept.
 */
export function encodeSpark(series: Point[], grain: Grain): string {
  const grid = completeGrid(series, grain).slice(-SPARK_PERIODS)
  if (!grid.length) return '[]'
  return JSON.stringify({ t0: grid[0].t, g: grain, v: grid.map(p => sparkValue(p.v)) })
}
const IMPLEMENTED = new Set<string>(['iea-sd', 'names-pct', 'values'])

// ---- the home collection of a place ----

/** a place's collections in the gazetteer index (one row per place and collection) */
export interface IndexEntry {
  place_id: string
  collection: string
}

/**
 * the home collection of every place in the gazetteer index: the first of its collections in `order` (layers.json
 * order), a collection missing from `order` after those in it (alphabetically). places the index does not list are not
 * in the map.
 */
export function placeHomes(entries: IndexEntry[], order: string[]): Map<string, string> {
  const rank = new Map(order.map((c, n) => [c, n]))
  const at = (c: string) => rank.get(c) ?? Number.MAX_SAFE_INTEGER
  const homes = new Map<string, string>()
  for (const e of entries) {
    const have = homes.get(e.place_id)
    if (have == null || at(e.collection) < at(have) || (at(e.collection) === at(have) && e.collection < have)) homes.set(e.place_id, e.collection)
  }
  return homes
}

/** the home collection of a place; the values collection when the index does not list the place (or there is no index) */
export const homeColl = (placeId: string, valuesColl: string, homes?: Map<string, string> | null): string => homes?.get(placeId) ?? valuesColl

const empty = (r: ValueRow, placeName = r.place_id, placeColl = r.coll): CoverageRow => ({
  place_id: r.place_id, place_name: placeName, coll: r.coll, place_coll: placeColl, indicator: r.indicator, time_grain: r.time_grain,
  t0: null, t1: null, n_periods: 0, last_time: null, last_value: null, last_class: null,
  status_method: null, status: null, trend: null, recent_mean: null, recent_from: null, recent_to: null,
  lt_mean: null, lt_sd: null, why: null, sentence: null, spark: '[]',
})

/** one coverage row for a continuous (place, grain) group */
export function continuousRow(rows: ValueRow[], ind: ManifestIndicator, placeName: string, placeColl?: string): CoverageRow {
  const out = empty(rows[0], placeName, placeColl)
  const grain = rows[0].time_grain
  // the `all` grain is one value over the whole record, with no time: no series, no status, no line
  if (grain === 'all') {
    const v = rows.find(r => r.value != null)?.value ?? null
    return v == null ? out : { ...out, n_periods: 1, last_value: v }
  }
  const series: Point[] = rows
    .filter(r => r.value != null && r.time != null)
    .map(r => ({ t: r.time as string, v: r.value }))
    .sort((a, b) => a.t.localeCompare(b.t))
  if (series.length === 0) return out
  const last = series[series.length - 1]
  Object.assign(out, {
    t0: series[0].t, t1: last.t, n_periods: series.length, last_time: last.t, last_value: last.v,
    spark: encodeSpark(series, grain),
  })
  if (grain !== ind.status_grain) return out
  const ctx = { title: ind.short, place: placeName, unit: ind.unit_label ?? '', decimals: ind.decimals ?? 2 }
  const method: MethodId = IMPLEMENTED.has(ind.status_method) ? (ind.status_method as MethodId) : 'values'
  const a = assess(series, method, { grain, recent: ind.recent, minPeriods: ind.min_periods }, ctx)
  const r = a.result
  Object.assign(out, {
    status_method: ind.status_method, status: r.status, trend: r.trend, recent_mean: r.recentMean,
    recent_from: r.recentFrom, recent_to: r.recentTo, lt_mean: r.ltMean, lt_sd: r.ltSd, sentence: a.sentence,
    why: method === ind.status_method ? r.why : `${ind.status_method} is not implemented yet; shown as values`,
  })
  return out
}

/** one coverage row for a categorical (place, grain) group: the last period's largest class */
export function categoricalRow(rows: ValueRow[], ind: ManifestIndicator, placeName: string, placeColl?: string): CoverageRow {
  const out = empty(rows[0], placeName, placeColl)
  const grain = rows[0].time_grain
  const byT = new Map<string, ValueRow[]>()
  for (const r of rows) if (r.time != null && r.value != null) byT.set(r.time, [...(byT.get(r.time) ?? []), r])
  const ts = [...byT.keys()].sort()
  if (ts.length === 0) return out
  const lastT = ts[ts.length - 1]
  const top = [...(byT.get(lastT) as ValueRow[])].sort((a, b) => (b.value as number) - (a.value as number) || (a.class as string).localeCompare(b.class as string))[0]
  Object.assign(out, { t0: ts[0], t1: lastT, n_periods: ts.length, last_time: lastT, last_value: top.value, last_class: top.class })
  if (grain !== ind.status_grain) return out
  const label = ind.classes?.[top.class as string] ?? (top.class as string)
  const ctx = { title: ind.short, place: placeName }
  Object.assign(out, {
    status_method: ind.status_method, why: 'categorical: shown as class shares, with no status',
    sentence: categoricalSentence(ctx, label, top.value as number, periodLabel(lastT, grain)),
  })
  return out
}

/** every coverage row for one values file */
/**
 * the grains a viewer tries for a (place, indicator) cell, in order: the status grain, then year, month, decade, day
 * and all. the first row with a value fills the cell (viewer/src/lib/matrix.ts pickRow), so only that row needs a
 * sparkline.
 */
export function shownGrainOrder(statusGrain: Grain): Grain[] {
  return [...new Set<Grain>([statusGrain, 'year', 'month', 'decade', 'day', 'all'])]
}

export function coverageOf(rows: ValueRow[], ind: ManifestIndicator, names: Map<string, string>, homes?: Map<string, string> | null): CoverageRow[] {
  const groups = new Map<string, ValueRow[]>()
  for (const r of rows) {
    const k = `${r.place_id}\u0000${r.time_grain}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const out: CoverageRow[] = []
  for (const g of groups.values()) {
    const name = names.get(g[0].place_id) ?? g[0].place_id
    const home = homeColl(g[0].place_id, g[0].coll, homes)
    out.push(ind.kind === 'categorical' ? categoricalRow(g, ind, name, home) : continuousRow(g, ind, name, home))
  }
  // a sparkline only on the row a cell shows: the others would be bytes nobody draws (OBIS decades, months beside years)
  const order = shownGrainOrder(ind.status_grain)
  const byPlace = new Map<string, CoverageRow[]>()
  for (const r of out) byPlace.set(r.place_id, [...(byPlace.get(r.place_id) ?? []), r])
  for (const mine of byPlace.values()) {
    const shown = order.map(g => mine.find(r => r.time_grain === g && r.last_value != null)).find(Boolean)
    for (const r of mine) if (r !== shown) r.spark = '[]'
  }
  return out.sort((a, b) =>
    a.coll.localeCompare(b.coll) || a.place_id.localeCompare(b.place_id) || a.indicator.localeCompare(b.indicator) ||
    a.time_grain.localeCompare(b.time_grain))
}
