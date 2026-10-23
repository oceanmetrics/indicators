// the Matrix's rules, in plain functions: which coverage row fills a cell, what state the cell is in, how columns
// group by vocabulary and rows by collection, and the words a cell speaks. the status itself is never computed here:
// it is read from the coverage row, which src/coverage/ built with @oceanmetrics/status.
import { rollups, STATUS_RULES } from '@oceanmetrics/catalog/cards'
import type { Rollup, Rollups, StatusCounts } from '@oceanmetrics/catalog/cards'
import { fmt, periodLabel, STATUS_WORDS, TREND_WORDS } from '@oceanmetrics/status'
import type { Grain, Status, Trend } from '@oceanmetrics/status'
import { shownGrainOrder } from '../../../src/coverage/build.ts'
import type { CoverageRow } from '../../../src/coverage/build.ts'
import { GROUP_ORDER } from './data.ts'
import type { Indicator, Term, VocabId, Vocab } from './data.ts'
import { DEFAULT_ORDER, orderIndicators, orderPlaces } from '../../../src/report/order.ts'
import type { AxisOrder, IndicatorSort, PlaceSort, StatusRank } from '../../../src/report/order.ts'

/**
 * a place. `coll` is its group: its home gazetteer collection (coverage `place_coll`, else the values collection).
 * `valuesColls` are the values collections that hold rows of it (a place can be in two: Pitcairn's EEZ is in `places`
 * and `mr_eez`); a values file is read from the coverage row of the indicator, never from the group.
 */
export interface Place {
  id: string
  name: string
  coll: string
  valuesColls?: string[]
  /** a place of a derived layer: the id of the feature of another layer that draws it (coverage `display_id`) */
  displayId?: string | null
  /** the centre of the place's bbox (coverage `lat` and `lon`; the gazetteer index's bbox for a place nobody computed): what north to south and west to east order by */
  lat?: number | null
  lon?: number | null
}

/** the values collections that hold rows of a place */
export const valuesCollsOf = (p: Place): string[] => (p.valuesColls?.length ? p.valuesColls : [p.coll])

export interface CoverageIndex {
  rows: Map<string, Map<Grain, CoverageRow>>
  places: Place[]
  /** the groups that have coverage, in the order of `orderGroups` */
  colls: string[]
}

const key = (placeId: string, indicator: string) => `${placeId}\u0000${indicator}`

/** groups in the order the Matrix lists them (GROUP_ORDER: sanctuaries first), then unknown ones alphabetically */
export function orderGroups(colls: Iterable<string>): string[] {
  const rank = new Map(GROUP_ORDER.map((c, n) => [c, n]))
  return [...new Set(colls)].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9) || a.localeCompare(b))
}

/** one place per place_id however many values collections hold it; its group is the first row's `place_coll ?? coll` */
export function indexCoverage(rows: CoverageRow[]): CoverageIndex {
  const byKey = new Map<string, Map<Grain, CoverageRow>>()
  const places = new Map<string, Place>()
  for (const r of rows) {
    const k = key(r.place_id, r.indicator)
    if (!byKey.has(k)) byKey.set(k, new Map())
    byKey.get(k)!.set(r.time_grain, r)
    const have = places.get(r.place_id)
    if (!have) {
      places.set(r.place_id, {
        id: r.place_id, name: r.place_name || r.place_id, coll: r.place_coll || r.coll, valuesColls: [r.coll],
        ...(r.display_id ? { displayId: r.display_id } : {}), ...(r.lat != null && r.lon != null ? { lat: r.lat, lon: r.lon } : {}),
      })
    } else if (!have.valuesColls!.includes(r.coll)) have.valuesColls!.push(r.coll)
  }
  const list = [...places.values()]
  for (const p of list) p.valuesColls!.sort()
  return { rows: byKey, places: list, colls: orderGroups(list.map(p => p.coll)) }
}

/** "19 of 20" (computed of the gazetteer's total), or just "19" while layers.json has not loaded */
export const computedOf = (computed: number, total: number | null) => (total == null ? String(computed) : `${computed} of ${total}`)

/**
 * a place's short name for a column header: "Florida Keys National Marine Sanctuary" is "Florida Keys", "National
 * Marine Sanctuary of American Samoa" is "American Samoa", "... Marine National Monument" is "... MNM",
 * "... Exclusive Economic Zone" is "... EEZ", "... National Estuarine Research Reserve" drops the suffix. the full
 * name stays in the header's title and accessible name; a name that would come out empty is kept whole.
 */
export function shortPlaceName(name: string): string {
  const short = name
    .replace(/^National Marine Sanctuary of /, '')
    .replace(/ National Marine Sanctuary(?= - |$)/, '')
    .replace(/ National Estuarine Research Reserve(?= - |$)/, '')
    .replace(/ Marine National Monument(?= - |$)/, ' MNM')
    .replace(/ Exclusive Economic Zone\b/, ' EEZ')
    .trim()
  return short || name
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

/** does the manifest list values for this indicator in a values collection that holds the place? */
export const hasValues = (ind: Indicator, place: Place) => valuesCollsOf(place).some(v => ind.collections.some(c => c.coll === v))

/**
 * the values collection to read for a place and indicator: the coverage row's, else the first collection holding the
 * place that has values for the indicator, else the group
 */
export function valuesCollOf(ind: Indicator, place: Place, row: Pick<CoverageRow, 'coll'> | null): string {
  return row?.coll ?? valuesCollsOf(place).find(v => ind.collections.some(c => c.coll === v)) ?? place.coll
}

/** the producer that can compute an indicator in the browser (erddap-places) */
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
  // a row without a value: the place was computed and has no data
  if (row) return { kind: 'nodata', row, statusIcon: null, trendIcon: null, stateIcon: 'cell-na', reason: row.why ?? null }
  // no row and erddap-places can compute it: it computes place by place (precomputed or on request), so another place's
  // values in the same collection say nothing about this one: not computed yet (a reserve beside the one requested, 2026-10-20)
  if (isLiveProducer(ind)) return { kind: 'live', row, statusIcon: null, trendIcon: null, stateIcon: 'cell-live', reason: null }
  // no row from a producer that computes whole collections (OBIS, eco-indicators, SDG): a place it left out has no data
  if (hasValues(ind, place)) return { kind: 'nodata', row, statusIcon: null, trendIcon: null, stateIcon: 'cell-na', reason: null }
  return { kind: 'na', row, statusIcon: null, trendIcon: null, stateIcon: null, reason: null }
}

// ---- words (STATUS_WORDS and TREND_WORDS are @oceanmetrics/status's) ----

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

/** what an empty cell says: it is not computed yet (but can be), has no data here, or is not offered for this kind of place */
export const STATE_WORDS = { live: 'not computed yet', nodata: 'no data here', na: '\u2014' } as const

/**
 * the button's accessible name: place, indicator, value and status in words, so nothing depends on colour.
 * `groupTitle` is the place's group, for a cell the indicator is not offered for.
 */
export function cellAria(ind: Indicator, place: Place, m: CellModel, groupTitle = place.coll): string {
  const head = `${place.name}, ${ind.short}`
  const r = m.row
  switch (m.kind) {
    case 'value': {
      const status = m.statusIcon ? STATUS_WORDS[m.statusIcon.slice(3) as Status | 'none'] : 'no status at this grain'
      const trend = r?.trend ? `trend ${TREND_WORDS[r.trend]}` : 'no trend'
      return `${head}: ${valueText(ind, r!)} in ${periodText(r!)}; ${status}; ${trend}.`
    }
    case 'class': return `${head}: ${classText(ind, r!)} of the area in ${periodText(r!)}; categorical, no status.`
    case 'nodata': return `${head}: ${STATE_WORDS.nodata}${m.reason ? ` (${m.reason})` : ''}.`
    case 'live': return `${head}: ${STATE_WORDS.live}; open it to compute it or ask for it.`
    default: return `${place.name}: ${ind.short} is not offered for ${groupTitle}.`
  }
}

// ---- columns and rows ----

export interface ColumnGroup {
  term: Term
  indicators: Indicator[]
}

const OTHER: Term = { id: 'other', label: 'Other' }
/** the one group of an ungrouped list of indicators (its id is empty: a view that draws group headers leaves this one out) */
export const FLAT_TERM: Term = { id: '', label: 'All indicators' }
/** the order the Place view's cards keep: the vocabulary's term order, a series together with its lead first */
export const VOCAB_ORDER: AxisOrder<IndicatorSort> = { sort: 'vocab', group: true, custom: [] }

/**
 * columns (or rows) of indicators in the order given (src/report/order.ts: grouped by a vocabulary's categories, the groups and the
 * indicators A-Z by default, or the vocabulary's own order, or the reader's custom order; ungrouped it is one group, `FLAT_TERM`).
 * an indicator whose tag is not a term of the vocabulary goes to a last group "Other". with no order given it is the vocabulary
 * order, where a series' indicators stay together (the lead first) in the order given.
 */
export function groupColumns(indicators: Indicator[], vocabs: Record<VocabId, Vocab>, vocab: VocabId, order: AxisOrder<IndicatorSort> = VOCAB_ORDER, rank?: StatusRank): ColumnGroup[] {
  const terms = vocabs[vocab]?.terms ?? []
  const byId = new Map<string, Term>([...terms.map(t => [t.id, t] as [string, Term]), [OTHER.id, OTHER]])
  return orderIndicators(indicators, order, vocab, terms, rank).map(g => ({ term: order.group ? byId.get(g.id) ?? OTHER : FLAT_TERM, indicators: g.items }))
}

/**
 * the indicators with no value for any place on display are left out (a column of empty cells says nothing); ids in
 * `keep` stay (what the reader named by hand). groups left empty are dropped. when no place on display has a value for any
 * of them (places no one has computed yet), all stay, so each empty cell can be asked for.
 */
export function withValues(cols: ColumnGroup[], rows: RowGroup[], idx: CoverageIndex, keep: Iterable<string> = []): ColumnGroup[] {
  const kept = new Set(keep)
  const places = rows.flatMap(g => g.places)
  const has = (ind: Indicator) => kept.has(ind.id) || places.some(p => pickRow(idx, p.id, ind)?.last_value != null)
  const out = cols.map(g => ({ term: g.term, indicators: g.indicators.filter(has) })).filter(g => g.indicators.length > 0)
  return out.length || !places.length ? out : cols
}

export interface RowGroup {
  coll: string
  places: Place[]
  /** the group's places before the cap, when it was capped */
  total?: number
}

/** the most places one group shows: a group of thousands lists the first of them, and the reader narrows it by search or by picking places */
export const ROW_CAP = 300

/**
 * the rows of the chosen places in the order given (src/report/order.ts: grouped by their home collection with the groups A-Z by
 * title and the places A-Z by default, or by a sort key, or the reader's custom order; ungrouped it is one group with the
 * collection ''). a case-insensitive search of name or id narrows them first. a group of more than `cap` places shows `cap` of
 * them, in order: the computed places (some coverage) are kept before the others, so a group of thousands still shows what has
 * values; its `total` says how many there are.
 */
export function selectionRows(
  places: Place[], idx: CoverageIndex, q: string, order: AxisOrder<PlaceSort> = DEFAULT_ORDER.places, groupLabel: (coll: string) => string = c => c, cap = ROW_CAP,
  rank?: StatusRank,
): RowGroup[] {
  const needle = q.trim().toLowerCase()
  const computed = new Set(idx.places.map(p => p.id))
  const hits = needle ? places.filter(p => p.name.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle)) : places
  return orderPlaces(hits, order, groupLabel, rank).map(g => {
    if (g.items.length <= cap) return { coll: g.id, places: g.items }
    const keep = new Set([...g.items.filter(p => computed.has(p.id)), ...g.items.filter(p => !computed.has(p.id))].slice(0, cap))
    return { coll: g.id, places: g.items.filter(p => keep.has(p)), total: g.items.length }
  })
}

// ---- the summary: the rollups of the selection (@oceanmetrics/catalog `rollups`) ----

export type { Rollup, Rollups, StatusCounts }

/** the rollups of the places and indicators given: one cell per place x indicator, from the coverage rows of those only */
export function selectionRollups(coverage: CoverageRow[], places: readonly Pick<Place, 'id'>[], indicators: readonly Pick<Indicator, 'id'>[]): Rollups {
  const p = new Set(places.map(x => x.id))
  const i = new Set(indicators.map(x => x.id))
  return rollups(coverage.filter(r => p.has(r.place_id) && i.has(r.indicator)))
}

/** what the status sorts read (src/report/order.ts): the counts above and below and the latest period, per id, from rollups */
export function statusRank(list: readonly Rollup[]): StatusRank {
  const by = new Map(list.map(r => [r.id, r]))
  return { above: id => by.get(id)?.above ?? 0, below: id => by.get(id)?.below ?? 0, latest: id => by.get(id)?.latest?.time ?? null }
}

/** the latest period of any of the rollups, as a reader says it ("2025", "2025-07"); null when none has a value */
export function latestOf(list: readonly Rollup[]): string | null {
  let best: Rollup['latest'] = null
  for (const r of list) if (r.latest && (!best || r.latest.time > best.time)) best = r.latest
  return best?.label ?? null
}

/** the counts the summary and the headers say, in this order, with the glyph of each */
export const COUNT_PARTS = [
  { k: 'above', glyph: 'st-above', word: 'above' },
  { k: 'within', glyph: 'st-within', word: 'within' },
  { k: 'below', glyph: 'st-below', word: 'below' },
  { k: 'none', glyph: 'st-none', word: 'without a status' },
] as const

/** "3 above, 10 within, 1 below, 5 without a status" */
export const countsText = (c: StatusCounts): string => COUNT_PARTS.map(p => `${c[p.k].toLocaleString('en-US')} ${p.word}`).join(', ')

/** what a row or column header says of its cells: "3 above, 10 within, 1 below, 5 without a status; latest 2025" */
export const headerCounts = (r: Rollup | undefined): string =>
  r ? `${countsText(r)}${r.latest ? `; latest ${r.latest.label}` : ''}` : 'no cells with a value'

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/** the head of the summary line: "241 places × 20 indicators" */
export const summaryHead = (places: number, indicators: number) => `${plural(places, 'place', 'places')} × ${plural(indicators, 'indicator', 'indicators')}`

/** the summary line above the grid: "241 places × 20 indicators: 50 above, 262 within, 31 below, 224 without a status; latest 2025" */
export function summaryText(places: number, indicators: number, r: Rollups): string {
  const latest = latestOf(r.places)
  return `${summaryHead(places, indicators)}: ${countsText(r.total)}${latest ? `; latest ${latest}` : ''}`
}

// ---- paging: the grid shows the places a page at a time ----

/** the places one page of the grid shows */
export const PAGE_SIZE = 60

export interface Paged {
  /** the groups cut to the page: a group with none of its places on the page is left out, one cut in two keeps its head */
  rows: RowGroup[]
  /** the page shown (1-based, within 1..pages), the number of pages, and the first and last place shown (1-based) of the total */
  page: number
  pages: number
  from: number
  to: number
  total: number
}

/** the page `page` (1-based; out of range is the nearest page) of the places in order, across their groups */
export function pageRows(rows: RowGroup[], page = 1, size = PAGE_SIZE): Paged {
  const total = rows.reduce((n, g) => n + g.places.length, 0)
  const pages = Math.max(1, Math.ceil(total / size))
  const p = Math.min(pages, Math.max(1, Math.floor(Number.isFinite(page) ? page : 1)))
  const start = (p - 1) * size, end = Math.min(total, start + size)
  const out: RowGroup[] = []
  let at = 0
  for (const g of rows) {
    const lo = Math.max(start, at), hi = Math.min(end, at + g.places.length)
    if (lo < hi) out.push({ ...g, places: g.places.slice(lo - at, hi - at) })
    at += g.places.length
  }
  return { rows: out, page: p, pages, from: total ? start + 1 : 0, to: end, total }
}

/** "places 61 to 120 of 241"; "241 places" when they fit on one page */
export const pageText = (pg: Paged) => (pg.pages > 1 ? `places ${pg.from} to ${pg.to} of ${pg.total.toLocaleString('en-US')}` : plural(pg.total, 'place', 'places'))

// ---- the fold: the OBIS series without a status rule, one row (or column) each ----

/**
 * the series that fold in the Matrix: OBIS counts of records and species with no status rule (they track sampling effort), as
 * @oceanmetrics/catalog's `isObisWithoutRule` folds them on a place's cards (`STATUS_RULES` is the package's)
 */
export const foldsInMatrix = (ind: Pick<Indicator, 'id' | 'status_method'>) => ind.id.startsWith('obis:') && !STATUS_RULES.has(ind.status_method)

export interface SeriesFold {
  series: string
  title: string
  /** the indicator whose row carries the disclosure: the series' lead on display, else its first */
  lead: string
  /** the other indicators of the series on display, folded away unless open */
  rest: Indicator[]
  open: boolean
}

/**
 * the matrix-wide fold (the per-place rule is @oceanmetrics/catalog `foldSeriesWithoutRule`): in each column group, a series that
 * folds (`foldsInMatrix`) and has two or more indicators on display becomes one row, its lead (or first) indicator, with a
 * disclosure; open (its id in `open`), its other indicators follow the lead, together. `folds` is keyed by the lead's id.
 */
export function foldColumns(cols: ColumnGroup[], open: ReadonlySet<string> = new Set(), fold: (i: Indicator) => boolean = foldsInMatrix): { cols: ColumnGroup[]; folds: Map<string, SeriesFold> } {
  const folds = new Map<string, SeriesFold>()
  const out = cols.map(g => {
    const bySeries = new Map<string, Indicator[]>()
    for (const i of g.indicators) if (fold(i)) bySeries.set(i.series, [...(bySeries.get(i.series) ?? []), i])
    const done = new Set<string>()
    const indicators: Indicator[] = []
    for (const i of g.indicators) {
      const members = fold(i) ? bySeries.get(i.series)! : null
      if (!members || members.length < 2) { indicators.push(i); continue }
      if (done.has(i.series)) continue
      done.add(i.series)
      const lead = members.find(m => m.lead) ?? members[0]
      const rest = members.filter(m => m !== lead)
      const isOpen = open.has(i.series)
      folds.set(lead.id, { series: i.series, title: lead.series_title ?? i.series, lead: lead.id, rest, open: isOpen })
      indicators.push(lead, ...(isOpen ? rest : []))
    }
    return { term: g.term, indicators }
  })
  return { cols: out, folds }
}

/** the disclosure's words: "Show 8 more of OBIS (fish)" / "Hide 8 more of OBIS (fish)" */
export const foldWords = (f: SeriesFold) => `${f.open ? 'Hide' : 'Show'} ${f.rest.length} more of ${f.title}`
