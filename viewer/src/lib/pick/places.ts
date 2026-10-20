// the place picker's rules that the page needs before the panel opens, in plain functions: the groups that have computed
// places, the places the Matrix shows and the words on the picker's button. the panel's own rules (search, tree, ticks,
// the collections nothing is computed for) are in placesTree.ts, loaded with the panel.
import { collTitle } from '../data.ts'
import type { Layers } from '../data.ts'
import { shortPlaceName } from '../matrix.ts'
import type { CoverageIndex, Place } from '../matrix.ts'

export type PickMode = 'multi' | 'group' | 'place'

export interface GroupInfo {
  coll: string
  title: string
  /** places of the group with a computed value (the index's places) */
  computed: number
  /** the gazetteer's number of places in the collection, null until layers.json has loaded */
  total: number | null
  /** the computed places by name */
  places: Place[]
}

/** every group with computed places, in the index's group order, with its places by name */
export function placeGroups(idx: CoverageIndex, layers: Layers = {}): GroupInfo[] {
  return idx.colls.map(coll => {
    const places = idx.places.filter(p => p.coll === coll).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    return { coll, title: collTitle(coll, layers), computed: places.length, total: layers[coll]?.n ?? null, places }
  })
}

export interface GroupNote {
  /** "19 with SST" or "no values for SST" */
  text: string
  /** the group has values for the indicator shown */
  has: boolean
}

// ---- the Matrix's selection: groups shown, minus the places removed ----

/** the places the Matrix shows: those of the groups on display that were not removed */
export function matrixChosen(idx: CoverageIndex, groups: string[], hidePlaces: string[]): Set<string> {
  const shown = new Set(groups)
  const hidden = new Set(hidePlaces)
  return new Set(idx.places.filter(p => shown.has(p.coll) && !hidden.has(p.id)).map(p => p.id))
}

export interface MatrixPlaces {
  colls: string[]
  hidePlaces: string[]
}

// ---- the button's words ----

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** what the multi picker's button says: "Sanctuaries and Tortugas reserve · 19 places", a place's short name, "2 groups · 21 places" */
export function multiLabel(groups: GroupInfo[], chosen: ReadonlySet<string>): string {
  const withChosen = groups.map(g => ({ g, on: g.places.filter(p => chosen.has(p.id)) })).filter(x => x.on.length)
  const n = withChosen.reduce((s, x) => s + x.on.length, 0)
  if (n === 0) return 'No places'
  if (n === 1) return shortPlaceName(withChosen[0].on[0].name)
  if (withChosen.length === 1) {
    const { g, on } = withChosen[0]
    return on.length === g.places.length ? `${g.title} · ${plural(n, 'place')}` : `${g.title} · ${on.length} of ${g.places.length} places`
  }
  return `${plural(withChosen.length, 'group')} · ${plural(n, 'place')}`
}

/** what the group picker's button says: "Exclusive Economic Zones · 281 places" */
export function groupLabel(g: Pick<GroupInfo, 'title' | 'computed'> | null): string {
  return g ? `${g.title} · ${plural(g.computed, 'place')}` : 'Choose a place group'
}

/** what the place picker's button says: the place's short name */
export const placeLabel = (p: Pick<Place, 'name'> | null) => (p ? shortPlaceName(p.name) : 'Choose a place')
