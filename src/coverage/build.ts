// coverage: place x indicator x grain -> time range, periods, last value, a sparkline, and on the indicator's
// status_grain row its default status and trend (schema/coverage.schema.json). the status comes from src/status/,
// the same module the viewer runs, so a cell in the Matrix and a card in a report cannot disagree.
import { assess, categoricalSentence, periodLabel } from '../status/index.ts'
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
  coll: string
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
const IMPLEMENTED = new Set<string>(['iea-sd', 'names-pct', 'values'])

const empty = (r: ValueRow, placeName = r.place_id): CoverageRow => ({
  place_id: r.place_id, place_name: placeName, coll: r.coll, indicator: r.indicator, time_grain: r.time_grain,
  t0: null, t1: null, n_periods: 0, last_time: null, last_value: null, last_class: null,
  status_method: null, status: null, trend: null, recent_mean: null, recent_from: null, recent_to: null,
  lt_mean: null, lt_sd: null, why: null, sentence: null, spark: '[]',
})

/** one coverage row for a continuous (place, grain) group */
export function continuousRow(rows: ValueRow[], ind: ManifestIndicator, placeName: string): CoverageRow {
  const out = empty(rows[0], placeName)
  const grain = rows[0].time_grain
  const series: Point[] = rows
    .filter(r => r.value != null && r.time != null)
    .map(r => ({ t: r.time as string, v: r.value }))
    .sort((a, b) => a.t.localeCompare(b.t))
  if (series.length === 0) return out
  const last = series[series.length - 1]
  Object.assign(out, {
    t0: series[0].t, t1: last.t, n_periods: series.length, last_time: last.t, last_value: last.v,
    spark: JSON.stringify(series.slice(-SPARK_PERIODS).map(p => [p.t, p.v])),
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
export function categoricalRow(rows: ValueRow[], ind: ManifestIndicator, placeName: string): CoverageRow {
  const out = empty(rows[0], placeName)
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
export function coverageOf(rows: ValueRow[], ind: ManifestIndicator, names: Map<string, string>): CoverageRow[] {
  const groups = new Map<string, ValueRow[]>()
  for (const r of rows) {
    const k = `${r.place_id}\u0000${r.time_grain}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const out: CoverageRow[] = []
  for (const g of groups.values()) {
    const name = names.get(g[0].place_id) ?? g[0].place_id
    out.push(ind.kind === 'categorical' ? categoricalRow(g, ind, name) : continuousRow(g, ind, name))
  }
  return out.sort((a, b) =>
    a.coll.localeCompare(b.coll) || a.place_id.localeCompare(b.place_id) || a.indicator.localeCompare(b.indicator) ||
    a.time_grain.localeCompare(b.time_grain))
}
