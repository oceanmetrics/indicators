// the Report builder's selection trees, in plain functions. an indicator tree (category -> series -> indicator) and a
// place tree (collection -> place), each a tree of tri-state checkboxes over a spec's rules. the state of a node is
// read from what the rules expand to (src/report/spec.ts); a click returns a NEW rule set, never an expanded list, so a
// live report still picks up what is published later. the rules the engine writes:
// - include and exclude hold `*`, `all`, `cat:<term>`, `series:<id>` (its lead), `series:<id>:*`, `coll:<slug>`, `set:<id>` or an id.
// - nothing selected is `["none"]` (NONE): an empty include would read back as `*` from a URL.
// the pickers (src/lib/pick/) build the trees they show; this file turns a tick into new rules, for every view.
import { expandIndicators, expandPlaces, matchIndicators, matchPlaces, seriesLeads } from '../../../../src/report/spec.ts'
import type { IndicatorLike, PlaceLike, PlaceSetLike, ReportSpec } from '../../../../src/report/spec.ts'

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
  /** a link beside the label (the place picker's "in the gazetteer") */
  link?: { href: string; label: string }
  /** a line of what the node is, under its label (a place set: the groups it combines) */
  desc?: string
  /** the children load on the first open (a gazetteer collection no place of which is computed): the node can be opened while it has none */
  lazy?: boolean
  /** a line after the children ("The first 300 of 13,061 places: search or pick places to narrow it") */
  note?: string
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

// ---- places ----

export interface TreePlace extends PlaceLike { name: string }

const placeEngine = <T extends TreePlace>(items: T[], sets: readonly PlaceSetLike[]): Engine<T> => ({
  items, match: (r, all) => matchPlaces(r, all, sets), expand: (s, all) => expandPlaces({ ...s, context: false }, all, sets),
})
const placeNorm = <T extends TreePlace>(sel: Sel, all: T[], sets: readonly PlaceSetLike[]) => normalize(sel, all, (r, items) => matchPlaces(r, items, sets))

export function togglePlace<T extends TreePlace>(sel: PlaceSel, all: T[], id: string, on: boolean, sets: readonly PlaceSetLike[] = []): PlaceSel {
  return { ...sel, ...leaf(placeEngine(all, sets), sel, id, on) }
}

/** a collection on: `coll:<slug>` joins include and the excludes of it and its places go. off: they leave include, and `coll:<slug>` is excluded when another rule (`*`, a set) still holds the collection */
export function toggleCollection<T extends TreePlace>(sel: PlaceSel, all: T[], coll: string, on: boolean, sets: readonly PlaceSetLike[] = []): PlaceSel {
  const rule = `coll:${coll}`
  const ids = all.filter(p => p.coll === coll).map(p => p.id)
  let { include, exclude } = sel
  if (on) {
    if (!include.includes(rule)) include = [...include, rule]
    exclude = without(exclude, [rule, ...ids])
  } else {
    include = without(include, [rule, ...ids])
    const held = new Set(expandPlaces({ ...sel, include, exclude }, all, sets).map(p => p.id))
    if (all.some(p => p.coll === coll && held.has(p.id))) exclude = [...exclude, rule]
  }
  return { ...sel, ...placeNorm({ include, exclude }, all, sets) }
}

/**
 * a place set on: `set:<id>` joins include (its groups' rules, redundant now, leave) and the excludes of it, of its groups and of their places go. off: it and its
 * groups leave include, and `set:<id>` is excluded when another rule (`*`, another set) still holds a place of it.
 */
export function toggleSet<T extends TreePlace>(sel: PlaceSel, all: T[], set: PlaceSetLike, on: boolean, sets: readonly PlaceSetLike[] = []): PlaceSel {
  const rule = `set:${set.id}`
  const groups = new Set(set.groups)
  const rules = set.groups.map(g => `coll:${g}`)
  const ids = all.filter(p => groups.has(p.coll)).map(p => p.id)
  let { include, exclude } = sel
  if (on) {
    // the set holds its groups, so their own rules (and the places of them named by id) are redundant
    include = without(include, [...rules, ...ids])
    if (!include.includes(rule)) include = [...include, rule]
    exclude = without(exclude, [rule, ...rules, ...ids])
  } else {
    include = without(include, [rule, ...rules, ...ids])
    const held = new Set(expandPlaces({ ...sel, include, exclude }, all, sets).map(p => p.id))
    if (ids.some(id => held.has(id))) exclude = [...exclude, rule]
  }
  return { ...sel, ...placeNorm({ include, exclude }, all, sets) }
}
