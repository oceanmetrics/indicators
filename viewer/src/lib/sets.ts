// place sets in plain functions: a set is a named list of place groups (config/place_sets.yml, the manifest's `place_sets`)
// that a link writes as `set:<id>` wherever it names a group (the Map's `coll`, the Matrix's `colls`). nothing here reads a
// place or a layer: the pickers, the Matrix and the Map expand a reference to its groups with these.
import type { PlaceSet } from './data.ts'

export const SET_PREFIX = 'set:'

/** is this a place set reference (`set:political`) rather than a group? */
export const isSetRef = (s: string | null | undefined): s is string => !!s && s.startsWith(SET_PREFIX)

export const setRef = (set: Pick<PlaceSet, 'id'>): string => SET_PREFIX + set.id

/** the set a reference names, null for a group or an unknown set */
export function findSet(ref: string | null | undefined, sets: readonly PlaceSet[]): PlaceSet | null {
  return isSetRef(ref) ? sets.find(s => setRef(s) === ref) ?? null : null
}

/**
 * the groups a list of group references means: a set reference becomes its groups (in the set's order), a group stays; no
 * group twice, first mention wins. an unknown set is dropped, so an old or mistyped link names nothing rather than a
 * group that does not exist.
 */
export function expandGroups(refs: readonly string[], sets: readonly PlaceSet[]): string[] {
  const out: string[] = []
  for (const r of refs) {
    const set = findSet(r, sets)
    if (isSetRef(r) && !set) continue
    for (const g of set ? set.groups : [r]) if (!out.includes(g)) out.push(g)
  }
  return out
}

/** the groups of a reference that have computed places (`available`, in the order of the reference); a group is its own */
export function groupsOf(ref: string, sets: readonly PlaceSet[], available: readonly string[]): string[] {
  return expandGroups([ref], sets).filter(g => available.includes(g))
}

/** the sets that have at least one group with computed places, in the manifest's order */
export function availableSets(sets: readonly PlaceSet[], available: readonly string[]): PlaceSet[] {
  return sets.filter(s => s.groups.some(g => available.includes(g)))
}
