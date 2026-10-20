// the Matrix's rules, in plain functions: which coverage row fills a cell, what state the cell is in, how columns
// group by vocabulary and rows by collection, and the words a cell speaks. the status itself is never computed here:
// it is read from the coverage row, which src/coverage/ built with src/status/.
import { fmt, periodLabel } from '../../../src/status/index.ts'
import type { Grain, Status, Trend } from '../../../src/status/index.ts'
import { shownGrainOrder } from '../../../src/coverage/build.ts'
import type { CoverageRow } from '../../../src/coverage/build.ts'
import type { Indicator, Term, VocabId, Vocab } from './data.ts'

export interface Place {
  id: string
  name: string
  coll: string
}

export interface CoverageIndex {
  rows: Map<string, Map<Grain, CoverageRow>>
  places: Place[]
  /** the collections that have coverage, in the order of `orderColls` */
  colls: string[]
}

const key = (placeId: string, indicator: string) => `${placeId}\u0000${indicator}`

/** collections in the order the manifest first lists them (the sanctuaries before the EEZs), then alphabetically */
export function orderColls(colls: Iterable<string>, indicators: Indicator[]): string[] {
  const rank = new Map<string, number>()
  for (const ind of indicators) for (const c of ind.collections) if (!rank.has(c.coll)) rank.set(c.coll, rank.size)
  return [...new Set(colls)].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9) || a.localeCompare(b))
}

export function indexCoverage(rows: CoverageRow[], indicators: Indicator[] = []): CoverageIndex {
  const byKey = new Map<string, Map<Grain, CoverageRow>>()
  const places = new Map<string, Place>()
  for (const r of rows) {
    const k = key(r.place_id, r.indicator)
    if (!byKey.has(k)) byKey.set(k, new Map())
    byKey.get(k)!.set(r.time_grain, r)
    if (!places.has(r.place_id)) places.set(r.place_id, { id: r.place_id, name: r.place_name || r.place_id, coll: r.coll })
  }
  const list = [...places.values()]
  return { rows: byKey, places: list, colls: orderColls(list.map(p => p.coll), indicators) }
}

/**
 * the coverage row that fills a cell: the one at the indicator's status_grain, else the year row, else month (then
 * the other grains). a row without a value is skipped for one with a value; when none has a value the first row
 * found is returned so its `why` can be shown.
 */
export function pickRow(idx: CoverageIndex, placeId: string, ind: Indicator): CoverageRow | null {
  const byGrain = idx.rows.get(key(placeId, ind.id))
  if (!byGrain) return null
  const order: Grain[] = shownGrainOrder(ind.status_grain)
  let first: CoverageRow | null = null
  for (const g of order) {
    const r = byGrain.get(g)
    if (!r) continue
    first ??= r
    if (r.last_value != null) return r
  }
  return first
}

// ---- cell state ----

export type CellKind = 'value' | 'class' | 'nodata' | 'live' | 'na'
export type StatusIcon = `st-${Status | 'none'}`
export type TrendIcon = `tr-${Trend}`

export interface CellModel {
  kind: CellKind
  row: CoverageRow | null
  statusIcon: StatusIcon | null
  trendIcon: TrendIcon | null
  /** the state glyph of an empty cell */
  stateIcon: 'cell-na' | 'cell-live' | null
  /** why a cell has no data, when the coverage row says */
  reason: string | null
}

/** does the manifest list values for this indicator in the place's collection? */
export const hasValues = (ind: Indicator, coll: string) => ind.collections.some(c => c.coll === coll)

/** the producer that can compute an indicator in the browser later (erddap-places) */
export const isLiveProducer = (ind: Indicator) => ind.producer.name === 'erddap-places'

export function cellModel(ind: Indicator, place: Place, row: CoverageRow | null): CellModel {
  if (row && row.last_value != null) {
    if (ind.kind === 'categorical') return { kind: 'class', row, statusIcon: null, trendIcon: null, stateIcon: null, reason: null }
    return {
      kind: 'value',
      row,
      // a status_method without a status is shown as "no status"; a row at another grain carries none at all
      statusIcon: row.status ? `st-${row.status}` : row.status_method ? 'st-none' : null,
      trendIcon: row.trend ? `tr-${row.trend}` : null,
      stateIcon: null,
      reason: null,
    }
  }
  if (hasValues(ind, place.coll)) return { kind: 'nodata', row, statusIcon: null, trendIcon: null, stateIcon: 'cell-na', reason: row?.why ?? null }
  if (isLiveProducer(ind)) return { kind: 'live', row, statusIcon: null, trendIcon: null, stateIcon: 'cell-live', reason: null }
  return { kind: 'na', row, statusIcon: null, trendIcon: null, stateIcon: 'cell-na', reason: null }
}

// ---- words ----

export const STATUS_WORDS: Record<Status | 'none', string> = {
  above: 'above its own record',
  within: 'within its own record',
  below: 'below its own record',
  none: 'no status',
}
export const TREND_WORDS: Record<Trend, string> = { up: 'up', flat: 'flat', down: 'down' }

/** the class label and share of a categorical row, e.g. "Tropical Seas 49%" */
export function classText(ind: Indicator, row: CoverageRow): string {
  const cls = row.last_class ?? ''
  return `${ind.classes?.[cls] ?? cls} ${fmt((row.last_value ?? 0) * 100, 0)}%`
}

/** a continuous row's last value with its unit, e.g. "26.96 °C" */
export function valueText(ind: Indicator, row: CoverageRow): string {
  const unit = ind.unit_label ?? ''
  return `${fmt(row.last_value, ind.decimals ?? 2)}${unit ? ' ' + unit : ''}`
}

/** the period of the last value, as a reader says it ("2025", "2025-09") */
export function periodText(row: CoverageRow): string {
  return row.last_time ? periodLabel(row.last_time, row.time_grain) : ''
}

/** the button's accessible name: place, indicator, value and status in words, so nothing depends on colour */
export function cellAria(ind: Indicator, place: Place, m: CellModel): string {
  const head = `${place.name}, ${ind.short}`
  const r = m.row
  switch (m.kind) {
    case 'value': {
      const status = m.statusIcon ? STATUS_WORDS[m.statusIcon.slice(3) as Status | 'none'] : 'no status at this grain'
      const trend = r?.trend ? `trend ${TREND_WORDS[r.trend]}` : 'no trend'
      return `${head}: ${valueText(ind, r!)} in ${periodText(r!)}; ${status}; ${trend}.`
    }
    case 'class': return `${head}: ${classText(ind, r!)} of the area in ${periodText(r!)}; categorical, no status.`
    case 'nodata': return `${head}: no data${m.reason ? ` (${m.reason})` : ''}.`
    case 'live': return `${head}: not computed yet; can be computed on the fly.`
    default: return `${head}: not applicable.`
  }
}

// ---- columns and rows ----

export interface ColumnGroup {
  term: Term
  indicators: Indicator[]
}

const OTHER: Term = { id: 'other', label: 'Other' }

/**
 * columns grouped by a vocabulary, in the vocabulary's term order; groups with no indicator are dropped, and an
 * indicator whose tag is not a term of the vocabulary goes to a last group "Other". `leadsOnly` keeps one column per
 * series (its lead), plus any id in `opts.add`; ids in `opts.hide` are always dropped. within a group, a series'
 * indicators stay together (the lead first) in manifest order.
 */
export function groupColumns(
  indicators: Indicator[], vocabs: Record<VocabId, Vocab>, vocab: VocabId, leadsOnly: boolean,
  opts: { add?: string[]; hide?: string[] } = {},
): ColumnGroup[] {
  const add = new Set(opts.add ?? [])
  const hide = new Set(opts.hide ?? [])
  const terms = vocabs[vocab]?.terms ?? []
  const known = new Set(terms.map(t => t.id))
  const seriesRank = new Map<string, number>()
  indicators.forEach(i => { if (!seriesRank.has(i.series)) seriesRank.set(i.series, seriesRank.size) })
  const pool = indicators.map((ind, n) => ({ ind, n })).filter(x => !hide.has(x.ind.id) && (!leadsOnly || x.ind.lead || add.has(x.ind.id)))
  const order = (a: { ind: Indicator; n: number }, b: { ind: Indicator; n: number }) =>
    (seriesRank.get(a.ind.series) as number) - (seriesRank.get(b.ind.series) as number) || Number(b.ind.lead) - Number(a.ind.lead) || a.n - b.n
  const groups: ColumnGroup[] = []
  for (const term of [...terms, OTHER]) {
    const inGroup = pool.filter(x => {
      const tag = x.ind.category[vocab]
      return term === OTHER ? !tag || !known.has(tag) : tag === term.id
    }).sort(order).map(x => x.ind)
    if (inGroup.length) groups.push({ term, indicators: inGroup })
  }
  return groups
}

export interface RowGroup {
  coll: string
  places: Place[]
}

/**
 * rows grouped by collection (empty `colls` = every collection), filtered by a case-insensitive search of name or id;
 * places in `hide` are dropped
 */
export function groupRows(idx: CoverageIndex, colls: string[], q: string, hide: string[] = []): RowGroup[] {
  const needle = q.trim().toLowerCase()
  const wanted = colls.length ? new Set(colls) : null
  const hidden = new Set(hide)
  const out: RowGroup[] = []
  for (const coll of idx.colls) {
    if (wanted && !wanted.has(coll)) continue
    const places = idx.places
      .filter(p => p.coll === coll && !hidden.has(p.id) && (!needle || p.name.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    if (places.length) out.push({ coll, places })
  }
  return out
}

export interface SeriesGroup {
  series: string
  title: string
  indicators: Indicator[]
}

/** the indicators not on display, grouped by series (manifest order, titled `series_title ?? series`), the lead first */
export function addableIndicators(indicators: Indicator[], shown: Set<string>): SeriesGroup[] {
  const groups = new Map<string, SeriesGroup>()
  for (const ind of indicators) {
    if (shown.has(ind.id)) continue
    if (!groups.has(ind.series)) groups.set(ind.series, { series: ind.series, title: ind.series_title ?? ind.series, indicators: [] })
    groups.get(ind.series)!.indicators.push(ind)
  }
  // a stable sort keeps manifest order among the non-leads
  for (const g of groups.values()) g.indicators.sort((a, b) => Number(b.lead) - Number(a.lead))
  return [...groups.values()]
}

/** the places removed from the display, in name order, for the restore list; ids that are not places are skipped */
export function hiddenPlaces(idx: CoverageIndex, hide: string[]): Place[] {
  const wanted = new Set(hide)
  return idx.places.filter(p => wanted.has(p.id)).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

export interface MatrixStats {
  places: number
  indicators: number
  cells: number
  withValue: number
  withStatus: number
}

export function matrixStats(rows: RowGroup[], cols: ColumnGroup[], idx: CoverageIndex): MatrixStats {
  const inds = cols.flatMap(c => c.indicators)
  const s: MatrixStats = { places: 0, indicators: inds.length, cells: 0, withValue: 0, withStatus: 0 }
  for (const g of rows) {
    for (const p of g.places) {
      s.places++
      for (const ind of inds) {
        const m = cellModel(ind, p, pickRow(idx, p.id, ind))
        s.cells++
        if (m.kind === 'value' || m.kind === 'class') s.withValue++
        if (m.row?.status) s.withStatus++
      }
    }
  }
  return s
}
