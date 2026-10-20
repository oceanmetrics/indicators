// what the Map draws of the shared selection, in plain functions: the place groups (each drawn as a part of its own, layered as a
// place set is), the places of a group that are chosen (a vector filter, an SLD filter) and the words that name the selection.
// the selection is the report spec's rules (src/report/spec.ts); nothing here reads a map.
import { matchPlaces } from '../../../../src/report/spec.ts'
import type { PlaceSetLike } from '../../../../src/report/spec.ts'
import type { PlaceSel } from '../selection.ts'
import { orderGroups } from '../matrix.ts'
import type { Place } from '../matrix.ts'

export interface MapGroup {
  group: string
  /** the places of the group that are chosen, when it is not the whole group (null = the whole group is drawn) */
  only: string[] | null
}

const isGroupRule = (r: string) => r.startsWith('coll:') || r.startsWith('set:')

/** does the selection name places one by one, or take some away? then the places themselves (the universe) are needed, not only the groups */
export const needsPlaces = (sel: PlaceSel): boolean => sel.exclude.length > 0 || sel.include.some(r => !isGroupRule(r) && r !== '*' && r !== 'none')

/**
 * the groups of a selection with, for each, the chosen places when the group is not whole: a group named by `coll:<slug>` or
 * `set:<id>` (or `*`) is whole unless an exclude takes places of it away, then it is the other places of the group; places named
 * by id alone make their group a part restricted to them. a group with nothing left is not drawn. `universe` is every place the
 * selection can name (null: only whole groups are known, as in the embed); `groupsAll` are the groups `*` stands for.
 */
export function selectionGroups(sel: PlaceSel, universe: readonly Place[] | null, sets: readonly PlaceSetLike[] = [], groupsAll: readonly string[] = []): MapGroup[] {
  const whole = new Set<string>()
  const named = new Map<string, Set<string>>()
  for (const r of sel.include) {
    if (r === '*') for (const g of groupsAll) whole.add(g)
    else if (r.startsWith('coll:')) whole.add(r.slice(5))
    else if (r.startsWith('set:')) for (const g of sets.find(s => `set:${s.id}` === r)?.groups ?? []) whole.add(g)
    else if (r !== 'none') {
      const p = universe?.find(x => x.id === r)
      if (p) named.set(p.coll, (named.get(p.coll) ?? new Set()).add(p.id))
    }
  }
  const out = new Map<string, string[] | null>()
  const removed = new Set<string>()
  if (universe && sel.exclude.length) for (const r of sel.exclude) for (const p of matchPlaces(r, [...universe], sets)) removed.add(p.id)
  for (const g of whole) {
    const mine = universe ? universe.filter(p => p.coll === g) : []
    const gone = mine.filter(p => removed.has(p.id))
    out.set(g, gone.length ? mine.filter(p => !removed.has(p.id)).map(p => p.id) : null)
  }
  for (const [g, ids] of named) if (!whole.has(g)) out.set(g, [...ids].filter(id => !removed.has(id)))
  return orderGroups(out.keys()).map(group => ({ group, only: out.get(group) ?? null })).filter(g => g.only == null || g.only.length > 0)
}

/** is a place of a group chosen? (the filter for the rows of the coverage the model reads) */
export function placeFilter(groups: readonly MapGroup[]): (placeId: string, group: string) => boolean {
  const by = new Map(groups.map(g => [g.group, g.only ? new Set(g.only) : null]))
  return (placeId, group) => {
    const only = by.get(group)
    return only === undefined ? false : only === null || only.has(placeId)
  }
}

/** what names the selection above the map: a group's title, a place set's title when it is the only rule, else "3 groups" */
export function selectionTitle(sel: PlaceSel, groups: readonly MapGroup[], titles: (coll: string) => string): string {
  if (groups.length === 0) return 'No places'
  if (sel.include.length === 1 && sel.include[0].startsWith('set:') && sel.exclude.length === 0) return titles(sel.include[0])
  if (groups.length === 1) {
    const g = groups[0]
    return g.only ? `${titles(g.group)} (${g.only.length} ${g.only.length === 1 ? 'place' : 'places'})` : titles(g.group)
  }
  return `${groups.length} groups`
}
