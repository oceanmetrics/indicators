// the indicator picker panel's rules, in plain functions (loaded with IndicatorPanel.svelte, on the first open): the tree
// category -> series -> indicators over the places on display, with how many of those places have a value, the Matrix's ticks as
// its own keys (`xi`, `ai`), and what the Map shows per indicator (which place groups have values).
import type { Indicator, Term, VocabId } from '../data.ts'
import { pickRow } from '../matrix.ts'
import type { CoverageIndex, Place } from '../matrix.ts'
import type { Check, TreeNode } from '../report/tree.ts'
import { CAT_OTHER } from '../report/tree.ts'

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
  /** a hint of its own for a leaf (the Map: which groups have values); the group nodes then carry none */
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

const leavesOf = (n: TreeNode): string[] => (n.kind === 'indicator' ? [n.key] : [...n.children, ...n.more].flatMap(leavesOf))

/**
 * the indicator ids a tick on a node stands for: on, an indicator is itself, a series is its lead and a category the leads
 * of its series (the rest is opened by hand); off, everything under the node
 */
export function nodeIndicatorIds(n: TreeNode, on: boolean): string[] {
  if (!on || n.kind === 'indicator') return leavesOf(n)
  return n.kind === 'series' ? [n.children[0].key] : n.children.map(s => s.children[0].key)
}

export interface IndicatorKeys {
  hideInds: string[]
  addInds: string[]
}

/**
 * ticks as the Matrix's own keys. `pool` is what the Matrix shows without additions (the leads, or every indicator with
 * the leads switch off): on, a removed one comes back (`xi` loses it) and one outside the pool is added (`ai`); off, an
 * added one is taken back out and one in the pool is removed.
 */
export function toggleMatrixIndicators(state: IndicatorKeys, ids: string[], on: boolean, pool: ReadonlySet<string>): IndicatorKeys {
  const set = new Set(ids)
  if (on) return { hideInds: state.hideInds.filter(x => !set.has(x)), addInds: [...new Set([...state.addInds, ...ids.filter(x => !pool.has(x))])] }
  return { hideInds: [...new Set([...state.hideInds, ...ids.filter(x => pool.has(x))])], addInds: state.addInds.filter(x => !set.has(x)) }
}

// ---- the Map: which groups have values ----

/** indicator id -> group -> how many places of the group have a value, from the coverage rows (a place's group is `place_coll ?? coll`) */
export function groupsWithValues(coverage: { indicator: string; place_id: string; coll: string; place_coll?: string | null; last_value: number | null; last_class: string | null }[]): Map<string, Map<string, number>> {
  const seen = new Map<string, Map<string, Set<string>>>()
  for (const r of coverage) {
    if (r.last_value == null && r.last_class == null) continue
    const g = r.place_coll ?? r.coll
    const byGroup = seen.get(r.indicator) ?? new Map<string, Set<string>>()
    byGroup.set(g, (byGroup.get(g) ?? new Set()).add(r.place_id))
    seen.set(r.indicator, byGroup)
  }
  return new Map([...seen].map(([ind, byGroup]) => [ind, new Map([...byGroup].map(([g, ids]) => [g, ids.size]))]))
}

/** "Sanctuaries and Tortugas reserve, Exclusive Economic Zones", or "3 groups" past two; "" when none */
export function groupsHint(counts: Map<string, number> | undefined, titles: (coll: string) => string, order: string[] = []): string {
  if (!counts || counts.size === 0) return ''
  const rank = new Map(order.map((c, n) => [c, n]))
  const names = [...counts.keys()].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9) || a.localeCompare(b)).map(titles)
  return names.length <= 2 ? names.join(', ') : `${names.length} groups`
}

/** indicator id -> the places (any group) that have a value for it: what the Map lists, since it shows one group at a time */
export function placesWithValueAnywhere(coverage: { indicator: string; place_id: string; last_value: number | null; last_class: string | null }[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const r of coverage) {
    if (r.last_value == null && r.last_class == null) continue
    const have = out.get(r.indicator) ?? new Set<string>()
    out.set(r.indicator, have.add(r.place_id))
  }
  return out
}
