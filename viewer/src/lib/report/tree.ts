// the Report builder's selection trees, in plain functions. an indicator tree (category -> series -> indicator) and a
// place tree (collection -> place), each a tree of tri-state checkboxes over a spec's rules. the state of a node is
// read from what the rules expand to (src/report/spec.ts); a click returns a NEW rule set, never an expanded list, so a
// live report still picks up what is published later. the rules the engine writes:
// - include and exclude hold `*`, `cat:<term>`, `series:<id>` (its lead), `series:<id>:*`, `coll:<slug>` or an id.
// - nothing selected is `["none"]` (NONE): an empty include would read back as `*` from a URL.
// - coverage gates the tree: an indicator with no value for the chosen places is left out, unless the spec includes it
//   by id. a series shows when any of its members does, and always shows its lead.
import { coverageCounts, expandIndicators, expandPlaces, matchIndicators, matchPlaces, seriesLeads } from '../../../../src/report/spec.ts'
import type { IndicatorLike, PlaceLike, ReportSpec } from '../../../../src/report/spec.ts'

export type Check = 'checked' | 'mixed' | 'unchecked'
/** the include rule of an empty selection: an id that matches nothing, so it survives the round trip through a URL */
export const NONE = 'none'
/** the node of the indicators the vocabulary does not name */
export const CAT_OTHER = 'other'

export type IndSel = ReportSpec['indicators']
export type PlaceSel = ReportSpec['places']
type Sel = { include: string[]; exclude: string[] }

export interface TreeNode {
  kind: 'category' | 'series' | 'indicator' | 'collection' | 'place'
  /** term id, series id, indicator id, collection slug or place id */
  key: string
  label: string
  /** the longer name, for a tooltip */
  title?: string
  state: Check
  /** "7 of 9 places", "226 places", or the place id */
  hint: string
  children: TreeNode[]
  /** a series' other members: shown collapsed under "more in this series" */
  more: TreeNode[]
}

// ---- rule sets ----

const uniq = (xs: string[]) => [...new Set(xs)]
const without = (xs: string[], drop: Iterable<string>) => {
  const d = new Set(drop)
  return xs.filter(x => !d.has(x))
}

/** a selection kept honest: no duplicates, no `none` beside a rule, `none` when empty, no exclude that changes nothing */
function normalize<T extends { id: string }>(sel: Sel, items: T[], match: (rule: string, items: T[]) => T[]): Sel {
  const include = uniq(sel.include).filter(r => r !== NONE)
  const inc = new Set(include.flatMap(r => match(r, items)))
  const exclude = uniq(sel.exclude).filter(r => match(r, items).some(i => inc.has(i)))
  return { include: include.length ? include : [NONE], exclude: include.length ? exclude : [] }
}

// ---- the generic leaf toggle (an indicator or a place) ----

interface Engine<T extends { id: string }> {
  items: T[]
  match: (rule: string, items: T[]) => T[]
  expand: (sel: Sel, items: T[]) => T[]
}

const isIn = <T extends { id: string }>(e: Engine<T>, sel: Sel, id: string) => e.expand(sel, e.items).some(i => i.id === id)

function leaf<T extends { id: string }>(e: Engine<T>, sel: Sel, id: string, on: boolean): Sel {
  let { include, exclude } = sel
  if (on) {
    exclude = without(exclude, [id])
    if (!isIn(e, { include, exclude }, id)) include = [...include, id]
    // still out: a rule such as `series:x:*` excludes it. swap that rule for the members it meant, except this one
    if (!isIn(e, { include, exclude }, id)) {
      exclude = exclude.flatMap(r => {
        const hit = e.match(r, e.items)
        return hit.some(i => i.id === id) ? hit.filter(i => i.id !== id).map(i => i.id) : [r]
      })
    }
  } else {
    include = without(include, [id])
    if (isIn(e, { include, exclude }, id)) exclude = [...exclude, id]
  }
  return normalize({ include, exclude }, e.items, e.match)
}

// ---- indicators ----

/** what the tree needs of an indicator (the manifest's Indicator has all of it) */
export interface TreeIndicator extends IndicatorLike {
  title: string
  short: string
  series_title?: string
}

const indEngine = <T extends TreeIndicator>(items: T[]): Engine<T> => ({ items, match: matchIndicators, expand: expandIndicators })
const indNorm = <T extends TreeIndicator>(sel: Sel, all: T[]) => normalize(sel, all, matchIndicators)

/** the ids of the indicators a selection expands to */
export const selectedIds = <T extends IndicatorLike>(sel: IndSel, all: T[]): Set<string> => new Set(expandIndicators(sel, all).map(i => i.id))

/** one indicator on or off: its id goes in or out of include, and in exclude when another rule still holds it */
export function toggleIndicator<T extends TreeIndicator>(sel: IndSel, all: T[], id: string, on: boolean): IndSel {
  return leaf(indEngine(all), sel, id, on)
}

/**
 * a series on: `series:<id>` (its lead) joins include and an exclude of its lead (the id, `series:<id>`,
 * `series:<id>:*`) goes. off: its rules and member ids leave include, and the lead goes in exclude if another rule holds it.
 */
export function toggleSeries<T extends TreeIndicator>(sel: IndSel, all: T[], series: string, on: boolean): IndSel {
  const lead = seriesLeads(all).get(series)
  if (!lead) return sel
  const rules = [`series:${series}`, `series:${series}:*`]
  let { include, exclude } = sel
  if (on) {
    exclude = without(exclude, [lead.id, ...rules])
    if (!include.includes(rules[0])) include = [...include, rules[0]]
  } else {
    const members = all.filter(i => i.series === series).map(i => i.id)
    include = without(include, [...rules, ...members])
    if (selectedIds({ include, exclude }, all).has(lead.id)) exclude = [...exclude, lead.id]
  }
  return indNorm({ include, exclude }, all)
}

/** the series whose lead carries a category's tag; `other` takes the leads whose tag the vocabulary does not name */
export function seriesOfCategory<T extends IndicatorLike>(all: T[], vocab: string, known: string[], term: string): string[] {
  const k = new Set(known)
  return [...seriesLeads(all)].filter(([, lead]) => {
    const tag = lead.category[vocab]
    return term === CAT_OTHER ? !tag || !k.has(tag) : tag === term
  }).map(([s]) => s)
}

/**
 * a category on: `cat:<term>` joins include, and the excludes of its leads go (the id, `series:<s>`, `series:<s>:*`).
 * off: `cat:<term>` leaves include, and each of its series still included through another rule is excluded whole
 * (`series:<s>:*`). `other` has no rule, so it goes series by series.
 */
export function toggleCategory<T extends TreeIndicator>(sel: IndSel, all: T[], vocab: string, known: string[], term: string, on: boolean): IndSel {
  const series = seriesOfCategory(all, vocab, known, term)
  if (term === CAT_OTHER) return series.reduce((s, id) => toggleSeries(s, all, id, on), sel)
  const rule = `cat:${term}`
  const leads = seriesLeads(all)
  let { include, exclude } = sel
  if (on) {
    if (!include.includes(rule)) include = [...include, rule]
    exclude = without(exclude, series.flatMap(s => [leads.get(s)!.id, `series:${s}`, `series:${s}:*`]))
  } else {
    include = without(include, [rule, ...series.flatMap(s => [`series:${s}`, `series:${s}:*`]), ...all.filter(i => series.includes(i.series)).map(i => i.id)])
    const held = selectedIds({ include, exclude }, all)
    for (const s of series) if (all.some(i => i.series === s && held.has(i.id))) exclude = [...exclude, `series:${s}:*`]
  }
  return indNorm({ include, exclude }, all)
}

/** every chosen indicator that is not its series' lead goes in exclude: "collapse series to their leads" */
export function collapseToLeads<T extends TreeIndicator>(sel: IndSel, all: T[]): IndSel {
  const leads = new Set(seriesLeads(all).values())
  const extra = expandIndicators(sel, all).filter(i => !leads.has(i)).map(i => i.id)
  return indNorm({ include: sel.include, exclude: [...sel.exclude, ...extra] }, all)
}

interface CoverageLike { place_id: string; coll: string; indicator: string; last_value: number | null }

export interface IndicatorTreeInput<T extends TreeIndicator> {
  indicators: T[]
  /** the vocabulary the categories come from (`onms`, `names`, `eov`) and its terms in order */
  vocab: string
  terms: { id: string; label: string }[]
  sel: IndSel
  rows: CoverageLike[]
  /** the chosen places: coverage is counted against them */
  places: PlaceLike[]
}

/** the indicator tree: categories in the vocabulary's order ("Other" last), series under their lead's category */
export function buildIndicatorTree<T extends TreeIndicator>(input: IndicatorTreeInput<T>): TreeNode[] {
  const { indicators, vocab, terms, sel, rows, places } = input
  const known = terms.map(t => t.id)
  const counts = coverageCounts(rows, places)
  const chosen = selectedIds(sel, indicators)
  const explicit = new Set(sel.include.filter(r => r !== NONE && !r.startsWith('cat:') && !r.startsWith('series:') && r !== '*'))
  const nPlaces = places.length
  const leads = seriesLeads(indicators)
  const by = new Map<string, T[]>()
  for (const i of indicators) by.set(i.series, [...(by.get(i.series) ?? []), i])
  // places covered by any indicator of a node: the rows are renamed to one indicator so coverageCounts takes the union
  const union = (ids: Set<string>) => coverageCounts(rows.filter(r => ids.has(r.indicator)).map(r => ({ ...r, indicator: '*' })), places).get('*') ?? 0
  const hint = (n: number) => `${n} of ${nPlaces} places`
  const leafOf = (i: T): TreeNode => ({
    kind: 'indicator', key: i.id, label: i.short, title: i.title, state: chosen.has(i.id) ? 'checked' : 'unchecked',
    hint: hint(counts.get(i.id) ?? 0), children: [], more: [],
  })
  const seriesNodes = new Map<string, TreeNode>()
  for (const [series, members] of by) {
    const lead = leads.get(series)!
    const shown = members.filter(m => m !== lead && ((counts.get(m.id) ?? 0) > 0 || explicit.has(m.id)))
    if (!(counts.get(lead.id) ?? 0) && !shown.length && !explicit.has(lead.id)) continue
    const anyChosen = members.some(m => chosen.has(m.id))
    seriesNodes.set(series, {
      kind: 'series', key: series, label: lead.series_title ?? series, state: chosen.has(lead.id) ? 'checked' : anyChosen ? 'mixed' : 'unchecked',
      hint: hint(union(new Set([lead, ...shown].map(m => m.id)))), children: [leafOf(lead)], more: shown.map(leafOf),
    })
  }
  const termIds = [...terms.map(t => t.id), CAT_OTHER]
  const out: TreeNode[] = []
  for (const id of termIds) {
    const label = id === CAT_OTHER ? 'Other' : terms.find(t => t.id === id)!.label
    const kids = seriesOfCategory(indicators, vocab, known, id).map(s => seriesNodes.get(s)).filter((n): n is TreeNode => !!n)
    if (!kids.length) continue
    const on = kids.filter(k => k.children[0].state === 'checked').length
    const ids = new Set(kids.flatMap(k => [...k.children, ...k.more].map(n => n.key)))
    out.push({
      kind: 'category', key: id, label, state: on === kids.length ? 'checked' : on ? 'mixed' : 'unchecked',
      hint: hint(union(ids)), children: kids, more: [],
    })
  }
  return out
}

// ---- places ----

export interface TreePlace extends PlaceLike { name: string }

const placeEngine = <T extends TreePlace>(items: T[]): Engine<T> => ({ items, match: matchPlaces, expand: (s, all) => expandPlaces({ ...s, context: false }, all) })
const placeNorm = <T extends TreePlace>(sel: Sel, all: T[]) => normalize(sel, all, matchPlaces)

export function togglePlace<T extends TreePlace>(sel: PlaceSel, all: T[], id: string, on: boolean): PlaceSel {
  return { ...sel, ...leaf(placeEngine(all), sel, id, on) }
}

/** a collection on: `coll:<slug>` joins include and the excludes of it and its places go. off: they leave include, and `coll:<slug>` is excluded when another rule (`*`) still holds the collection */
export function toggleCollection<T extends TreePlace>(sel: PlaceSel, all: T[], coll: string, on: boolean): PlaceSel {
  const rule = `coll:${coll}`
  const ids = all.filter(p => p.coll === coll).map(p => p.id)
  let { include, exclude } = sel
  if (on) {
    if (!include.includes(rule)) include = [...include, rule]
    exclude = without(exclude, [rule, ...ids])
  } else {
    include = without(include, [rule, ...ids])
    const held = new Set(expandPlaces({ ...sel, include, exclude }, all).map(p => p.id))
    if (all.some(p => p.coll === coll && held.has(p.id))) exclude = [...exclude, rule]
  }
  return { ...sel, ...placeNorm({ include, exclude }, all) }
}

export interface PlaceTreeInput<T extends TreePlace> {
  places: T[]
  /** the collections with coverage, in display order */
  colls: { id: string; title: string }[]
  sel: PlaceSel
  /** a case-insensitive search of name or id; empty = every place */
  query?: string
}

/** the place tree: collections in order, places by name; a search narrows the leaves, never the state */
export function buildPlaceTree<T extends TreePlace>(input: PlaceTreeInput<T>): TreeNode[] {
  const { places, colls, sel } = input
  const needle = (input.query ?? '').trim().toLowerCase()
  const chosen = new Set(expandPlaces(sel, places).map(p => p.id))
  const out: TreeNode[] = []
  for (const c of colls) {
    const mine = places.filter(p => p.coll === c.id).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    if (!mine.length) continue
    const on = mine.filter(p => chosen.has(p.id)).length
    const shown = needle ? mine.filter(p => p.name.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle)) : mine
    if (!shown.length) continue
    out.push({
      kind: 'collection', key: c.id, label: c.title, state: on === mine.length ? 'checked' : on ? 'mixed' : 'unchecked',
      hint: `${on} of ${mine.length} places`,
      children: shown.map(p => ({ kind: 'place' as const, key: p.id, label: p.name, state: chosen.has(p.id) ? 'checked' as const : 'unchecked' as const, hint: p.id, children: [], more: [] })),
      more: [],
    })
  }
  return out
}
