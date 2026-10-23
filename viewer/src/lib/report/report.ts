// the report's model, in plain functions: which places and indicators a spec chooses in this catalog, how they group,
// what the layout's budget says, which cells are empty and the request that asks for them, and the exceptions-first
// order. the status itself is never computed here (@oceanmetrics/status, through scorecard.ts and place.ts).
import { budget, coverageCounts, expandIndicators, expandPlaces, LAYOUTS, seriesLeads } from '../../../../src/report/spec.ts'
import type { Budget, ReportSpec } from '../../../../src/report/spec.ts'
import type { Catalog, Indicator, VocabId } from '../data.ts'
import { orderPlaces, usesRank } from '../../../../src/report/order.ts'
import { cellModel, groupColumns, pickRow, selectionRollups, statusRank } from '../matrix.ts'
import type { CellKind, ColumnGroup, CoverageIndex, Place } from '../matrix.ts'
import { SOURCE_HREF } from '../credits.ts'

export interface EmptyCell {
  place: Place
  ind: Indicator
  kind: CellKind
}

export interface ReportModel {
  /** the places the spec chooses that have a value for at least one chosen indicator, in the spec's order (groups A-Z, places A-Z by default) */
  places: Place[]
  /** the indicators the spec chooses that have a value for at least one chosen place, in manifest order */
  indicators: Indicator[]
  /** the indicators in the spec's order: grouped by the vocabulary's categories (A-Z by default, "Other" last), or one group when the spec ungroups them */
  groups: ColumnGroup[]
  budget: Budget
  /** place x indicator pairs with no value */
  empties: EmptyCell[]
  /** true when a chosen indicator is not its series' lead (so collapsing would shrink the report) */
  nonLeads: boolean
}

const hasValue = (idx: CoverageIndex, p: Place, i: Indicator) => pickRow(idx, p.id, i)?.last_value != null

/** a spec in this catalog: the rules expanded (the place sets from the manifest), then gated by coverage (a column or a row with no value is left out) */
export function buildReport(
  catalog: Pick<Catalog, 'manifest' | 'coverage'>, idx: CoverageIndex, spec: ReportSpec, vocab: VocabId, groupLabel: (coll: string) => string = c => c,
): ReportModel {
  const all = catalog.manifest.indicators
  const chosenPlaces = expandPlaces(spec.places, idx.places, catalog.manifest.place_sets ?? [])
  const counts = coverageCounts(catalog.coverage, chosenPlaces)
  const indicators = expandIndicators(spec.indicators, all).filter(i => (counts.get(i.id) ?? 0) > 0)
  // a status sort (most above, most below, most recent) reads the counts of the report's own places and indicators, as the Matrix does
  const r = usesRank(spec.order) ? selectionRollups(catalog.coverage, chosenPlaces, indicators) : null
  const places = orderPlaces(chosenPlaces.filter(p => indicators.some(i => hasValue(idx, p, i))), spec.order.places, groupLabel, r ? statusRank(r.places) : undefined).flatMap(g => g.items)
  const groups = groupColumns(indicators, catalog.manifest.vocabularies, vocab, spec.order.indicators, r ? statusRank(r.indicators) : undefined)
  const leads = new Set(seriesLeads(all).values())
  const empties: EmptyCell[] = []
  for (const p of places) {
    for (const i of indicators) {
      const m = cellModel(i, p, pickRow(idx, p.id, i))
      if (m.kind !== 'value' && m.kind !== 'class') empties.push({ place: p, ind: i, kind: m.kind })
    }
  }
  return {
    places, indicators, groups, empties,
    budget: budget(spec.layout, places.length, indicators.length, groups.length, indicators.some(i => !leads.has(i))),
    nonLeads: indicators.some(i => !leads.has(i)),
  }
}

/** "9 places × 12 indicators · Scorecard · iea-sd" */
export function summaryLine(spec: ReportSpec, places: number, indicators: number): string {
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`
  return `${n(places, 'place')} × ${n(indicators, 'indicator')} · ${LAYOUTS[spec.layout].title} · ${spec.style.status}`
}

// ---- exceptions first ----

/** a stable sort, highest score first */
export function byScore<T>(items: T[], score: (t: T) => number): T[] {
  return items.map((t, n) => ({ t, n, s: score(t) })).sort((a, b) => b.s - a.s || a.n - b.n).map(x => x.t)
}

/** how much a panel counts toward its row or column when exceptions come first: an out-of-range status 3, a trend 2, a status in range 1 */
export const exceptionWeight = (rank: number) => Math.max(0, 3 - rank)

// ---- empty cells: one request ----

const KIND_WORDS: Record<string, string> = { nodata: 'no data', live: 'not computed yet', na: 'not applicable' }

/** the lines of the request body, at most `max`, then "... and N more" */
export function emptyLines(empties: EmptyCell[], max = 40): string[] {
  const lines = empties.slice(0, max).map(e => `- ${e.place.name} (${e.place.id}) / ${e.ind.short} (${e.ind.id}): ${KIND_WORDS[e.kind] ?? e.kind}`)
  if (empties.length > max) lines.push(`- ... and ${empties.length - max} more`)
  return lines
}

/** a prefilled GitHub issue asking for the empty cells of a report (the request form replaces this in a later phase) */
export function requestHref(permalink: string, empties: EmptyCell[], max = 40): string {
  const n = empties.length
  const q = new URLSearchParams({
    title: `Request: values for ${n} ${n === 1 ? 'cell' : 'cells'}`,
    body: [`Report: ${permalink}`, '', `These ${n === 1 ? 'cell has' : 'cells have'} no values in the report above:`, '', ...emptyLines(empties, max)].join('\n'),
  })
  return `${SOURCE_HREF}/issues/new?${q.toString()}`
}

// ---- words and links ----

export const reportTitle = (spec: ReportSpec) => spec.title?.trim() || 'Report'
