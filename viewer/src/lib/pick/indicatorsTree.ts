// the indicator picker panel's rules, in plain functions (loaded with IndicatorPanel.svelte, on the first open): the tree
// category -> series -> indicators over the places of the selection, with how many of those places have a value, and a tick as
// the rules that are the selection (`ii`, `ix`; report/tree.ts does the toggling).
import type { Indicator, Term, VocabId } from '../data.ts'
import { pickRow } from '../matrix.ts'
import type { CoverageIndex, Place } from '../matrix.ts'
import type { Check, TreeNode } from '../report/tree.ts'
import { CAT_OTHER, toggleCategory, toggleIndicator, toggleSeries } from '../report/tree.ts'
import type { IndSel } from '../selection.ts'

/** for each indicator, the ids of the given places that have a value for it (the row a Matrix cell would show) */
export function placesWithValue(idx: CoverageIndex, places: Pick<Place, 'id'>[], indicators: Indicator[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const ind of indicators) {
    const have = new Set<string>()
    for (const p of places) if (pickRow(idx, p.id, ind)?.last_value != null) have.add(p.id)
    out.set(ind.id, have)
  }
  return out
}

export interface IndicatorTreeOpts {
  indicators: Indicator[]
  vocab: VocabId
  terms: Term[]
  /** the indicators chosen (multi) or the one shown (single) */
  chosen: ReadonlySet<string>
  /** indicator id -> the places (of the selection) with a value */
  withValues: Map<string, Set<string>>
  /** how many places the selection holds, for "n of N places" */
  nPlaces: number
  /** also list the indicators no place of the selection has a value for */
  showEmpty?: boolean
  /** a search of title, short title, series and id; empty = everything listed */
  query?: string
  /** a hint of its own for a leaf (the Place view: "not computed yet"); the group nodes then carry none */
  hintOf?: (ind: Indicator) => string
}

const ofPlaces = (n: number, of: number) => `${n} of ${of} places`
const check = (on: number, of: number): Check => (on === 0 ? 'unchecked' : on === of ? 'checked' : 'mixed')

/**
 * the tree of indicators the picker lists: categories in the vocabulary's order ("Other" last), each series under its lead's
 * category with its lead as the series' own box and the other members under "more". an indicator is listed when some
 * place of the selection has a value for it, when `showEmpty` is on or when it is chosen already; a search keeps the
 * leaves it matches.
 */
export function buildIndicatorPickTree(o: IndicatorTreeOpts): TreeNode[] {
  const { indicators, vocab, terms, chosen, withValues, nPlaces } = o
  const needle = (o.query ?? '').trim().toLowerCase()
  const known = new Set(terms.map(t => t.id))
  const has = (i: Indicator) => withValues.get(i.id)?.size ?? 0
  const text = (i: Indicator) => `${i.short} ${i.title} ${i.series_title ?? i.series} ${i.id}`.toLowerCase()
  const listed = indicators.filter(i => (o.showEmpty || has(i) > 0 || chosen.has(i.id)) && (!needle || text(i).includes(needle)))
  const byId = new Map(indicators.map(i => [i.id, i]))
  const bySeries = new Map<string, Indicator[]>()
  for (const i of listed) bySeries.set(i.series, [...(bySeries.get(i.series) ?? []), i])
  const hint = (n: number) => (o.hintOf ? '' : ofPlaces(n, nPlaces))
  const union = (members: Indicator[]) => new Set(members.flatMap(m => [...(withValues.get(m.id) ?? [])])).size
  const leaf = (i: Indicator): TreeNode => ({
    kind: 'indicator', key: i.id, label: i.short, title: i.title, state: chosen.has(i.id) ? 'checked' : 'unchecked',
    hint: o.hintOf ? o.hintOf(i) : ofPlaces(has(i), nPlaces), children: [], more: [],
  })
  const seriesOf = new Map<string, { node: TreeNode; lead: Indicator }>()
  for (const [series, members] of bySeries) {
    const lead = members.find(m => m.lead) ?? members[0]
    const rest = members.filter(m => m !== lead)
    const anyChosen = members.some(m => chosen.has(m.id))
    seriesOf.set(series, {
      lead,
      node: {
        kind: 'series', key: series, label: lead.series_title ?? series, state: chosen.has(lead.id) ? 'checked' : anyChosen ? 'mixed' : 'unchecked',
        hint: hint(union(members)), children: [leaf(lead)], more: rest.map(leaf),
      },
    })
  }
  const out: TreeNode[] = []
  for (const term of [...terms, { id: CAT_OTHER, label: 'Other' }]) {
    const kids = [...seriesOf.values()].filter(({ lead }) => {
      const tag = lead.category[vocab]
      return term.id === CAT_OTHER ? !tag || !known.has(tag) : tag === term.id
    }).map(x => x.node)
    if (!kids.length) continue
    const on = kids.filter(k => k.children[0].state === 'checked').length
    out.push({
      kind: 'category', key: term.id, label: term.label, state: check(on, kids.length),
      hint: hint(union(kids.flatMap(k => [...k.children, ...k.more]).map(n => byId.get(n.key)!))), children: kids, more: [],
    })
  }
  return out
}

// ---- ticks ----

/**
 * a tick on a node as the selection's rules: a leaf is its id, a series its lead (`series:<id>`; the others are opened by hand),
 * a category `cat:<term>`. off takes them out and, when another rule still holds them, excludes them (`ix`).
 */
export function toggleSelectedIndicators(
  sel: IndSel, indicators: Indicator[], vocab: VocabId, known: string[], node: Pick<TreeNode, 'kind' | 'key'>, on: boolean,
): IndSel {
  if (node.kind === 'category') return toggleCategory(sel, indicators, vocab, known, node.key, on)
  if (node.kind === 'series') return toggleSeries(sel, indicators, node.key, on)
  return toggleIndicator(sel, indicators, node.key, on)
}

// ---- the Map: which places have values ----

/**
 * indicator id -> the places that have a value for it, from the coverage rows (a row with a class counts too); `keep` narrows
 * the rows to the places of the selection
 */
export function placesWithValueAnywhere<R extends { indicator: string; place_id: string; last_value: number | null; last_class: string | null }>(
  coverage: readonly R[], keep: ((row: R) => boolean) | null = null,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const r of coverage) {
    if (r.last_value == null && r.last_class == null) continue
    if (keep && !keep(r)) continue
    const have = out.get(r.indicator) ?? new Set<string>()
    out.set(r.indicator, have.add(r.place_id))
  }
  return out
}
