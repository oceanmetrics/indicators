// the place picker panel's rules, in plain functions (loaded with PlacePanel.svelte, on the first open): the search, the
// tri-state tree, the Map's group list, the Matrix's ticks as its own keys, and the collections nothing is computed for yet.
import { collTitle, gazetteerHref, GROUP_ORDER } from '../data.ts'
import type { Layers } from '../data.ts'
import { computedOf } from '../matrix.ts'
import type { CoverageIndex } from '../matrix.ts'
import { requestHref } from '../nextSteps.ts'
import type { Check, TreeNode } from '../report/tree.ts'
import type { GroupInfo, GroupNote, MatrixPlaces } from './places.ts'

// ---- the multi tree (Matrix, Report) ----

const check = (on: number, of: number): Check => (on === 0 ? 'unchecked' : on === of ? 'checked' : 'mixed')

/**
 * groups -> places as tri-state nodes over a set of chosen place ids. a group's hint is its "n of N" computed of the
 * gazetteer's total and it links to the collection in the gazetteer; a place's hint is its id. a search narrows the places
 * listed, never the state of a group.
 */
export function placePickTree(groups: GroupInfo[], chosen: ReadonlySet<string>, query = ''): TreeNode[] {
  const needle = query.trim().toLowerCase()
  const out: TreeNode[] = []
  for (const g of groups) {
    const shown = needle ? g.places.filter(p => p.name.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle)) : g.places
    if (!shown.length) continue
    const on = g.places.filter(p => chosen.has(p.id)).length
    out.push({
      kind: 'collection', key: g.coll, label: g.title, state: check(on, g.places.length), hint: computedOf(g.computed, g.total),
      link: { href: gazetteerHref(g.coll), label: 'in the gazetteer' },
      children: shown.map(p => ({ kind: 'place' as const, key: p.id, label: p.name, state: chosen.has(p.id) ? 'checked' as const : 'unchecked' as const, hint: p.id, children: [], more: [] })),
      more: [],
    })
  }
  return out
}

/**
 * the Map's group choices as leaves of the pick tree: every group with computed places, "n of N computed" and the note beside it,
 * those with values for the indicator shown first (the others keep their order after them); the current group is checked.
 * a leaf is kind `place` so the tree draws it as a button; its key is the group's collection.
 */
export function groupPickNodes(groups: GroupInfo[], current: string | null, noteOf: (coll: string) => GroupNote | null): TreeNode[] {
  const nodes = groups.map(g => {
    const note = noteOf(g.coll)
    const node: TreeNode = {
      kind: 'place', key: g.coll, label: g.title, state: g.coll === current ? 'checked' : 'unchecked',
      hint: `${computedOf(g.computed, g.total)} computed${note ? ` \u00b7 ${note.text}` : ''}`,
      link: { href: gazetteerHref(g.coll), label: 'in the gazetteer' }, children: [], more: [],
    }
    return { node, has: note?.has ?? true }
  })
  return [...nodes.filter(x => x.has), ...nodes.filter(x => !x.has)].map(x => x.node)
}

/**
 * a tick in the picker as the Matrix's own keys: a group on shows all its places; a group off hides it (the last group
 * cannot be switched off); a place off is removed (`xp`); a place on in a group that is not shown shows the group with
 * every other place of it removed, so only that place appears.
 */
export function toggleMatrixPlaces(idx: CoverageIndex, state: MatrixPlaces, node: { kind: 'collection' | 'place'; key: string }, on: boolean): MatrixPlaces {
  const { colls, hidePlaces } = state
  const idsOf = (coll: string) => idx.places.filter(p => p.coll === coll).map(p => p.id)
  if (node.kind === 'collection') {
    const mine = new Set(idsOf(node.key))
    if (on) return { colls: [...new Set([...colls, node.key])], hidePlaces: hidePlaces.filter(x => !mine.has(x)) }
    const left = colls.filter(c => c !== node.key)
    return left.length ? { colls: left, hidePlaces: hidePlaces.filter(x => !mine.has(x)) } : state
  }
  const place = idx.places.find(p => p.id === node.key)
  if (!place) return state
  if (!on) return { colls, hidePlaces: [...new Set([...hidePlaces, place.id])] }
  if (colls.includes(place.coll)) return { colls, hidePlaces: hidePlaces.filter(x => x !== place.id) }
  return { colls: [...colls, place.coll], hidePlaces: [...new Set([...hidePlaces.filter(x => x !== place.id), ...idsOf(place.coll).filter(x => x !== place.id)])] }
}

// ---- collections nothing is computed for yet ----

export interface Uncomputed {
  coll: string
  title: string
  n: number | null
  gazetteer: string
  request: string
}

const isPolygon = (geom: string | null) => !!geom && /polygon/i.test(geom)

/**
 * every polygon collection of the gazetteer with no computed place, in the Matrix's group order and then by title, each
 * with its link into the gazetteer and the issue form pre-filled with the collection only (a maintainer reviews)
 */
export function uncomputedCollections(layers: Layers, idx: CoverageIndex): Uncomputed[] {
  const have = new Set(idx.places.flatMap(p => [p.coll, ...(p.valuesColls ?? [])]))
  const rank = new Map(GROUP_ORDER.map((c, n) => [c, n]))
  return Object.entries(layers)
    .filter(([coll, l]) => isPolygon(l.geom) && !have.has(coll))
    .map(([coll, l]) => ({ coll, title: collTitle(coll, layers), n: l.n, gazetteer: gazetteerHref(coll), request: requestHref({ collection: coll, collectionTitle: collTitle(coll, layers) }) }))
    .sort((a, b) => (rank.get(a.coll) ?? 1e9) - (rank.get(b.coll) ?? 1e9) || a.title.localeCompare(b.title))
}

