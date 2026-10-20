// the place picker panel's rules, in plain functions (loaded with PlacePanel.svelte, on the first open): the tri-state tree of the
// place sets, the groups (the gazetteer's polygon collections, computed or not) and their places, and a tick as the rules
// that are the selection (`pi`, `px`; report/tree.ts does the toggling).
import { gazetteerHref } from '../data.ts'
import type { PlaceSet } from '../data.ts'
import { ROW_CAP, computedOf } from '../matrix.ts'
import type { Check, TreeNode } from '../report/tree.ts'
import { toggleCollection, togglePlace, toggleSet } from '../report/tree.ts'
import type { TreePlace } from '../report/tree.ts'
import type { PlaceSel } from '../selection.ts'
import type { GroupInfo, SetInfo } from './places.ts'
import { isSetRef } from '../sets.ts'

const check = (on: number, of: number): Check => (on === 0 ? 'unchecked' : on === of ? 'checked' : 'mixed')

export interface PlaceTreeOpts {
  /** the most places listed under one group */
  cap?: number
  /** the gazetteer's places are being read: a group that waits on them says so */
  loading?: boolean
}

/** the line under a group of more places than are listed */
export const capNote = (cap: number, total: number) =>
  `The first ${cap.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} places. Search to find others, or tick the group to choose them all (the Matrix lists its first ${cap.toLocaleString('en-US')}).`

/**
 * place sets and groups -> places as tri-state nodes over a set of chosen place ids. a group's hint is its "n of N computed" and it
 * links to the collection in the gazetteer; a group whose places are not all read yet is `lazy` (it opens, and the panel asks for
 * the gazetteer's places); a place's hint is its id. a search narrows the places listed, never the state of a group, and lists
 * no place sets. a group longer than the cap lists its first places and says so.
 */
export function placePickTree(groups: GroupInfo[], chosen: ReadonlySet<string>, query = '', sets: readonly SetInfo[] = [], opts: PlaceTreeOpts = {}): TreeNode[] {
  const needle = query.trim().toLowerCase()
  const cap = opts.cap ?? ROW_CAP
  // the place sets come first, as ticks of their own: ticked when all their places are, mixed when some are
  const out: TreeNode[] = needle ? [] : sets.map(s => {
    const ids = s.groups.flatMap(g => g.places.map(p => p.id))
    return {
      kind: 'collection' as const, key: s.ref, label: s.title, title: s.note ?? undefined, desc: s.desc, state: check(ids.filter(id => chosen.has(id)).length, ids.length),
      hint: `${computedOf(s.computed, s.total)} computed · ${s.groups.length} ${s.groups.length === 1 ? 'group' : 'groups'}`, children: [], more: [],
    }
  })
  for (const g of groups) {
    const hits = needle ? g.places.filter(p => p.name.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle)) : g.places
    if (needle && !hits.length) continue
    const on = g.places.filter(p => chosen.has(p.id)).length
    const shown = hits.slice(0, cap)
    out.push({
      kind: 'collection', key: g.coll, label: g.title, state: check(on, g.places.length), hint: `${computedOf(g.computed, g.total)} computed`,
      link: { href: gazetteerHref(g.coll), label: 'in the gazetteer' },
      children: shown.map(p => ({ kind: 'place' as const, key: p.id, label: p.name, state: chosen.has(p.id) ? 'checked' as const : 'unchecked' as const, hint: p.id, children: [], more: [] })),
      more: [],
      ...(g.loaded ? {} : { lazy: true }),
      ...(hits.length > cap ? { note: capNote(cap, hits.length) } : !g.loaded && opts.loading ? { note: 'Loading the places…' } : {}),
    })
  }
  return out
}

/**
 * a tick in the picker as the selection's rules: a place set `set:<id>`, a group `coll:<slug>`, a place its id. `universe` is
 * every place the selection can name now (the computed ones, and the gazetteer's once read); `sets` expand `set:` rules.
 */
export function toggleSelectedPlaces(
  sel: PlaceSel, universe: TreePlace[], node: { kind: 'collection' | 'place'; key: string }, on: boolean, sets: readonly PlaceSet[] = [],
): PlaceSel {
  if (node.kind === 'place') return togglePlace(sel, universe, node.key, on, sets)
  if (isSetRef(node.key)) {
    const set = sets.find(s => `set:${s.id}` === node.key)
    return set ? toggleSet(sel, universe, set, on, sets) : sel
  }
  return toggleCollection(sel, universe, node.key, on, sets)
}
