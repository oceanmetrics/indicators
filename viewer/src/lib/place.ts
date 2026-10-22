// the Place view's rules, in plain functions: which coverage rows are a place's, how its indicator cards group by
// vocabulary and series, what a card shows for a grain and a status method, the CSV text and the file names.
// the status, trend, sentence and alt text are never computed here: assess() in @oceanmetrics/status does it, on the
// place's rows, in the browser, with the options the coverage builder used, so a card's default equals its coverage row.
import { assess, categoricalAlt, categoricalSentence, completeGrid, noValues, periodLabel } from '@oceanmetrics/status'
import type { Grain, MethodId, Point, Status, StatusResult, Trend } from '@oceanmetrics/status'
import type { CoverageRow } from '../../../src/coverage/build.ts'
import type { Indicator, Term, Vocab, VocabId } from './data.ts'
import { METHOD_IDS } from './hash.ts'
import { groupColumns, indexCoverage, pickRow } from './matrix.ts'
import type { CoverageIndex, Place } from './matrix.ts'
import { stackShares } from './chart.ts'
import type { StackModel } from './chart.ts'
import type { PlaceRow, ValueRow } from './valuesData.ts'

export { METHOD_IDS }
export const METHOD_LABELS: Record<MethodId, string> = { 'iea-sd': 'iea-sd', 'names-pct': 'names-pct', values: 'values' }
export const METHOD_NOTES: Record<MethodId, string> = {
  'iea-sd': 'The recent mean against the long-term mean ± 1 SD of the place’s own record (CCIEA).',
  'names-pct': 'The recent mean against the 10th and 90th percentiles of the place’s own record (NaMES).',
  values: 'The values as they are, with no status.',
}

// ---- a place's coverage ----

/**
 * a place's coverage rows, from every values collection that holds it (Pitcairn's EEZ is in `places` and `mr_eez`: one
 * place). the place's `coll` is its group, its home gazetteer collection; `colls` are the values collections.
 */
export function placeCoverage(all: CoverageRow[], placeId: string) {
  const rows = all.filter(r => r.place_id === placeId)
  const place: Place | null = rows.length ? indexCoverage(rows).places[0] : null
  return { place, colls: place?.valuesColls ?? [], rows }
}

/** the indicators with coverage for the place, in manifest order */
export function coveredIndicators(idx: CoverageIndex, placeId: string, indicators: Indicator[]): Indicator[] {
  return indicators.filter(i => pickRow(idx, placeId, i) != null)
}

export { indexCoverage }

// ---- cards by vocabulary and series ----

export interface SeriesGroup {
  series: string
  title: string
  lead: Indicator
  /** the other indicators of the series that have coverage here: shown collapsed under the lead */
  more: Indicator[]
}
export interface CardGroup { term: Term; series: SeriesGroup[] }

/**
 * the cards grouped by the vocabulary's terms (its term order, "Other" last), a series' lead first and its other
 * indicators behind it. a series whose lead has no coverage here is led by its first indicator.
 */
export function groupCards(indicators: Indicator[], vocabs: Record<VocabId, Vocab>, vocab: VocabId): CardGroup[] {
  return groupColumns(indicators, vocabs, vocab).map(g => {
    const by = new Map<string, Indicator[]>()
    for (const i of g.indicators) by.set(i.series, [...(by.get(i.series) ?? []), i])
    return {
      term: g.term,
      series: [...by.entries()].map(([series, list]) => {
        const lead = list.find(i => i.lead) ?? list[0]
        return { series, title: lead.series_title ?? series, lead, more: list.filter(i => i !== lead) }
      }),
    }
  })
}

// ---- grains and series ----

export const GRAIN_ORDER: Grain[] = ['year', 'month', 'decade', 'day', 'all']

export function grainsOf(rows: Pick<ValueRow, 'time_grain'>[]): Grain[] {
  const have = new Set(rows.map(r => r.time_grain))
  return GRAIN_ORDER.filter(g => have.has(g))
}

/**
 * the grain a card opens at: the indicator's status grain when the place has rows there, else the first grain with a
 * time axis (year, month, decade, day). null when there is nothing to chart.
 */
export function primaryGrain(ind: Pick<Indicator, 'status_grain'>, present: Grain[]): Grain | null {
  if (present.includes(ind.status_grain)) return ind.status_grain
  return present.find(g => g !== 'all') ?? null
}

/** the grains a card can switch between: its primary grain and, when there is one, the months */
export function toggleGrains(ind: Pick<Indicator, 'status_grain'>, present: Grain[]): Grain[] {
  const p = primaryGrain(ind, present)
  if (!p) return []
  return p !== 'month' && present.includes('month') ? [p, 'month'] : [p]
}

/** a continuous series at a grain: the periods with a value, in time order */
export function seriesOf(rows: Pick<ValueRow, 'time_grain' | 'time' | 'value'>[], grain: Grain): Point[] {
  return rows
    .filter(r => r.time_grain === grain && r.value != null && r.time != null)
    .map(r => ({ t: r.time as string, v: r.value }))
    .sort((a, b) => a.t.localeCompare(b.t))
}

const IMPLEMENTED = new Set<string>(METHOD_IDS)

/** the method the manifest asks for; one that is not implemented yet is shown as values, as the coverage builder does */
export function defaultMethod(ind: Pick<Indicator, 'status_method'>): MethodId {
  return IMPLEMENTED.has(ind.status_method) ? (ind.status_method as MethodId) : 'values'
}

// ---- one card ----

/** the pieces of a coverage row the Method element shows (a CoverageRow has them all) */
export type StatLike = Pick<CoverageRow, 'status_method' | 'status' | 'trend' | 'recent_mean' | 'recent_from' | 'recent_to' | 'lt_mean' | 'lt_sd' | 'why' | 't0' | 't1' | 'time_grain'>

export interface CardModel {
  kind: 'continuous' | 'categorical' | 'empty'
  /** the grain shown, null when there is nothing to chart */
  grain: Grain | null
  /** the grains the card can switch between */
  grains: Grain[]
  /** the method that produced the status: the one asked for at the status grain, 'values' elsewhere */
  method: MethodId
  /** the status method the reader asked for (the manifest's, or an override) */
  requested: MethodId
  sentence: string
  alt: string
  status: Status | null
  trend: Trend | null
  result: StatusResult | null
  /** the series on its calendar grid (missing periods are nulls): what the line chart draws */
  series: Point[]
  stack: StackModel | null
  stat: StatLike | null
  /** periods with a value */
  n: number
  /** the last period's value, for a one-line read */
  last: Point | null
}

export interface CardOptions {
  /** a status method override; the manifest's by default */
  method?: MethodId | null
  /** a grain; the primary grain by default (ignored when the place has no rows there) */
  grain?: Grain | null
  /** a report's style: the recent window (the indicator's by default), a baseline [from, to] years, and the years kept */
  recent?: number | null
  baseline?: [number, number] | null
  from?: number | null
  to?: number | null
}

/** a series cut to the years from..to (either end open) */
export function clipYears(series: Point[], from?: number | null, to?: number | null): Point[] {
  if (from == null && to == null) return series
  return series.filter(p => {
    const y = Number(p.t.slice(0, 4))
    return (from == null || y >= from) && (to == null || y <= to)
  })
}

function statLike(r: StatusResult, grain: Grain): StatLike {
  return {
    status_method: r.method, status: r.status, trend: r.trend, recent_mean: r.recentMean, recent_from: r.recentFrom,
    recent_to: r.recentTo, lt_mean: r.ltMean, lt_sd: r.ltSd, why: r.why, t0: r.t0, t1: r.t1, time_grain: grain,
  }
}

const EMPTY: Omit<CardModel, 'sentence' | 'alt' | 'requested'> = {
  kind: 'empty', grain: null, grains: [], method: 'values', status: null, trend: null, result: null, series: [], stack: null, stat: null, n: 0, last: null,
}

/** what a card shows for a place's rows of one indicator: the status, sentence and alt text by @oceanmetrics/status, the series, the stack */
export function cardModel(ind: Indicator, placeName: string, rows: ValueRow[], opts: CardOptions = {}): CardModel {
  const requested = opts.method ?? defaultMethod(ind)
  const present = grainsOf(rows)
  const grains = toggleGrains(ind, present)
  const grain = opts.grain && grains.includes(opts.grain) ? opts.grain : primaryGrain(ind, present)
  if (!grain) {
    const none = noValues({ title: ind.short, place: placeName })
    return { ...EMPTY, requested, sentence: none, alt: none }
  }
  if (ind.kind === 'categorical') return categoricalCard(ind, placeName, rows, grain, grains, requested)
  const series = clipYears(seriesOf(rows, grain), opts.from, opts.to)
  // a status exists at the indicator's status grain only; any other grain shows its values
  const method: MethodId = grain === ind.status_grain ? requested : 'values'
  const ctx = { title: ind.short, place: placeName, unit: ind.unit_label ?? '', decimals: ind.decimals ?? 2 }
  const a = assess(series, method, { grain, recent: opts.recent ?? ind.recent, minPeriods: ind.min_periods, baseline: opts.baseline ?? null }, ctx)
  const vals = series.filter(p => p.v != null)
  return {
    kind: 'continuous', grain, grains, method, requested, sentence: a.sentence, alt: a.alt, status: a.result.status, trend: a.result.trend,
    result: a.result, series: completeGrid(series, grain), stack: null, stat: statLike(a.result, grain), n: vals.length, last: vals[vals.length - 1] ?? null,
  }
}

function categoricalCard(ind: Indicator, placeName: string, rows: ValueRow[], grain: Grain, grains: Grain[], requested: MethodId): CardModel {
  const mine = rows.filter(r => r.time_grain === grain && r.time != null && r.value != null && r.class != null)
  const stack = stackShares(mine.map(r => ({ t: r.time as string, cls: r.class as string, v: r.value })), ind.classes ?? {}, grain)
  if (stack.periods.length === 0) {
    const none = noValues({ title: ind.short, place: placeName })
    return { ...EMPTY, kind: 'empty', grain, grains, requested, sentence: none, alt: none }
  }
  // the last period's largest class, ties by class name, as the coverage builder picks it
  const lastT = stack.periods[stack.periods.length - 1].t
  const top = mine.filter(r => r.time === lastT).sort((a, b) => (b.value as number) - (a.value as number) || (a.class as string).localeCompare(b.class as string))[0]
  const label = ind.classes?.[top.class as string] ?? (top.class as string)
  const sentence = categoricalSentence({ title: ind.short, place: placeName }, label, top.value as number, periodLabel(lastT, grain))
  const first = stack.periods[0].t
  const names = stack.classes.map(c => c.label)
  const alt = categoricalAlt(sentence, first, lastT, grain, stack.periods.length, names)
  return {
    ...EMPTY, kind: 'categorical', grain, grains, method: 'values', requested, sentence, alt, stack, n: stack.periods.length,
    last: { t: lastT, v: top.value },
  }
}

// ---- downloads and the citation ----

export const CONTRACT_COLUMNS = ['place_id', 'coll', 'indicator', 'time_grain', 'time', 'class', 'value', 'n', 'sd', 'unit'] as const

/**
 * the contract's columns a download carries: all of them, except `sd` when the rows come from a 1.1 file, which has no
 * such column (a 1.2 file whose sd is null everywhere has the key, so the column stays)
 */
export function contractColumns(rows: readonly object[]): (typeof CONTRACT_COLUMNS)[number][] {
  const hasSd = rows.some(r => 'sd' in r)
  return CONTRACT_COLUMNS.filter(c => c !== 'sd' || hasSd)
}

/** `<place_id>_<indicator>.<ext>` with every ':' (and anything else a file system dislikes) made a '-' */
export function fileName(placeId: string, indicator: string, ext: 'csv' | 'parquet'): string {
  return `${placeId}_${indicator}`.replace(/[^A-Za-z0-9._=-]+/g, '-') + '.' + ext
}

const grainRank = (g: string) => { const i = GRAIN_ORDER.indexOf(g as Grain); return i < 0 ? 99 : i }

/** a place's rows in file order: grain, then time, then class */
export function sortRows<T extends Pick<ValueRow, 'time_grain' | 'time' | 'class'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    grainRank(a.time_grain) - grainRank(b.time_grain) || (a.time ?? '').localeCompare(b.time ?? '') || (a.class ?? '').localeCompare(b.class ?? ''))
}

/** the producer columns (x_*) present in the rows, sorted */
export function extraColumns(rows: PlaceRow[]): string[] {
  const s = new Set<string>()
  for (const r of rows) for (const k of Object.keys(r)) if (k.startsWith('x_')) s.add(k)
  return [...s].sort()
}

const csvCell = (v: unknown): string => {
  if (v == null) return ''
  const s = typeof v === 'bigint' ? v.toString() : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/** plain CSV (RFC 4180, a header row, `\n` line ends): the contract's columns, then any producer columns, all grains */
export function placeCsv(rows: PlaceRow[]): string {
  const cols = [...contractColumns(rows), ...extraColumns(rows)]
  const lines = [cols.join(',')]
  for (const r of sortRows(rows)) lines.push(cols.map(c => csvCell((r as Record<string, unknown>)[c])).join(','))
  return lines.join('\n') + '\n'
}

/**
 * the manifest's citation with the place added to its "Values:" clause, e.g. "... Values: Ocean Metrics Indicators,
 * manifest 2026.10.20, erddap:dhw_5km:CRW_SST:mean, place NMS:FKNMS, CC BY 4.0, https://oceanmetrics.io/indicators/".
 * a manifest without a citation gets the clause alone.
 */
export function placeCitation(ind: Pick<Indicator, 'id' | 'citation'>, placeId: string): string {
  const c = ind.citation?.trim() ?? ''
  const at = `${ind.id}, `
  if (c.includes(`Values: `) && c.includes(at)) return c.replace(at, `${at}place ${placeId}, `)
  return `${c}${c ? ' ' : ''}Values: Ocean Metrics Indicators, ${ind.id}, place ${placeId}.`
}
