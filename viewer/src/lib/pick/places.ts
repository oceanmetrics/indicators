// the place picker's rules that the page needs before the panel opens, in plain functions: the groups (the gazetteer's polygon
// collections, computed or not), the place sets and the words on the picker's button. the panel's own rules (search, tree,
// ticks as rules) are in placesTree.ts, loaded with the panel.
import { collTitle, GROUP_ORDER } from '../data.ts'
import type { Layers, PlaceSet } from '../data.ts'
import { isPolygonLayer } from '../gazetteerPlaces.ts'
import { setRef } from '../sets.ts'
import { orderGroups, shortPlaceName } from '../matrix.ts'
import { orderPlaces } from '../../../../src/report/order.ts'
import type { AxisOrder, PlaceSort } from '../../../../src/report/order.ts'
import type { CoverageIndex, Place } from '../matrix.ts'

export type PickMode = 'multi' | 'place'

export interface GroupInfo {
  coll: string
  title: string
  /** places of the group with a computed value (the index's places) */
  computed: number
  /** the gazetteer's number of places in the collection, null until layers.json has loaded */
  total: number | null
  /** the places the picker can list: the computed ones first, then (once the gazetteer's index is read) the others, each by name */
  places: Place[]
  /** every place of the group is in `places`: nothing more would come from the gazetteer's index */
  loaded: boolean
}

export interface GroupOpts {
  /** also the polygon collections of the gazetteer that nothing is computed for (the Matrix, Map and Report; the Place view lists computed places only) */
  all?: boolean
  /** the gazetteer's places are read (the universe holds them) */
  gazetteer?: boolean
  /** the order of the places (the Select section's): within a group the computed places come first, then the others in this order; absent = by name */
  order?: AxisOrder<PlaceSort>
}

/**
 * the groups the picker lists, in the index's group order, then (with `all`) the gazetteer's other polygon collections by
 * their place in the group order and title; each with its places from the universe, computed first
 */
export function placeGroups(universe: Place[], idx: CoverageIndex, layers: Layers = {}, opts: GroupOpts = {}): GroupInfo[] {
  const computedIds = new Set(idx.places.map(p => p.id))
  const by = new Map<string, Place[]>()
  for (const p of universe) by.set(p.coll, [...(by.get(p.coll) ?? []), p])
  const nComputed = new Map<string, number>()
  for (const p of idx.places) nComputed.set(p.coll, (nComputed.get(p.coll) ?? 0) + 1)
  const rank = new Map(GROUP_ORDER.map((c, n) => [c, n]))
  const others = opts.all
    ? Object.keys(layers).filter(c => isPolygonLayer(layers[c].geom) && !idx.colls.includes(c))
      .sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9) || collTitle(a, layers).localeCompare(collTitle(b, layers)))
    : []
  return [...orderGroups(idx.colls), ...others].map(coll => {
    const mine = by.get(coll) ?? []
    const inOrder = orderPlaces(mine, { ...(opts.order ?? { sort: 'az', custom: [] }), group: true }, c => c).flatMap(g => g.items)
    const places = [...inOrder.filter(p => computedIds.has(p.id)), ...inOrder.filter(p => !computedIds.has(p.id))]
    const computed = nComputed.get(coll) ?? 0
    const total = layers[coll]?.n ?? null
    return { coll, title: collTitle(coll, layers), computed, total, places, loaded: !!opts.gazetteer || (computed > 0 && (total == null || computed >= total)) }
  })
}

export interface SetInfo {
  /** `set:political`: what a link and the pickers call it */
  ref: string
  title: string
  note: string | null
  /** what it combines, in a line: its groups' titles */
  desc: string
  /** the set's groups the picker lists, in the set's order */
  groups: GroupInfo[]
  /** the computed places of those groups */
  computed: number
  /** the gazetteer's places in all of the set's groups; null until layers.json has loaded, or when it lacks one of them */
  total: number | null
}

/** the place sets with a group the picker lists, each with its groups, "n of N", note and the line of what it combines */
export function placeSetInfos(sets: readonly PlaceSet[], groups: GroupInfo[]): SetInfo[] {
  return sets.map(s => {
    const mine = s.groups.map(c => groups.find(g => g.coll === c)).filter((g): g is GroupInfo => !!g)
    return { s, mine }
  }).filter(x => x.mine.length > 0).map(({ s, mine }) => {
    const ns = mine.map(g => g.total)
    return {
      ref: setRef(s), title: s.title, note: s.note ?? null, desc: mine.map(g => g.title).join(' + '), groups: mine,
      computed: mine.reduce((n, g) => n + g.computed, 0), total: ns.every(n => n != null) ? ns.reduce((a, n) => a + (n as number), 0) : null,
    }
  })
}

// ---- the button's words ----

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/**
 * what the multi picker's button says: "National Marine Sanctuaries · 19 places", a place's short name, "2 groups · 21 places";
 * a place set whose every place is chosen, and nothing else, by its title ("Ocean by jurisdiction · 299 places")
 */
export function multiLabel(groups: GroupInfo[], chosen: ReadonlySet<string>, sets: readonly SetInfo[] = []): string {
  const withChosen = groups.map(g => ({ g, on: g.places.filter(p => chosen.has(p.id)) })).filter(x => x.on.length)
  const n = withChosen.reduce((s, x) => s + x.on.length, 0)
  if (n === 0) return 'No places'
  const whole = sets.find(s => s.groups.length > 1 && s.groups.length === withChosen.length && s.groups.every(g => withChosen.some(x => x.g.coll === g.coll && x.on.length === x.g.places.length)))
  if (whole) return `${whole.title} · ${plural(n, 'place')}`
  if (n === 1) return shortPlaceName(withChosen[0].on[0].name)
  if (withChosen.length === 1) {
    const { g, on } = withChosen[0]
    return on.length === g.places.length ? `${g.title} · ${plural(n, 'place')}` : `${g.title} · ${on.length} of ${g.places.length} places`
  }
  return `${plural(withChosen.length, 'group')} · ${plural(n, 'place')}`
}

/** the line of the Select section: "National Marine Sanctuaries · 18 places × 24 indicators" */
export function selectionLine(placeLabel: string, indicators: number): string {
  return `${placeLabel} × ${plural(indicators, 'indicator')}`
}

/** what the place picker's button says in the Place view: the place's short name */
export const placeLabel = (p: Pick<Place, 'name'> | null) => (p ? shortPlaceName(p.name) : 'Choose a place')
