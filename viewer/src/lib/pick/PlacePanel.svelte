<script lang="ts">
  // the place picker's panel: a search over the places (name and id), the place sets and the gazetteer's polygon collections as a
  // tri-state tree (multi; computed or not, "n of N computed"), or a tree to choose one computed place from (place). the places
  // of a collection nothing is computed for come from the gazetteer's index, read the first time one is opened or a search is
  // typed. built by places.ts and placesTree.ts; this only wires it. loaded on the first open.
  import { onMount } from 'svelte'
  import Tree from '../report/Tree.svelte'
  import PickSearch from './PickSearch.svelte'
  import type { TreeNode } from '../report/tree.ts'
  import type { Layers, PlaceSet } from '../data.ts'
  import type { CoverageIndex, Place } from '../matrix.ts'
  import { arrowNav } from './nav.ts'
  import { placeGroups, placeSetInfos } from './places.ts'
  import type { PickMode } from './places.ts'
  import { placePickTree } from './placesTree.ts'

  interface Props {
    mode: PickMode
    idx: CoverageIndex
    universe: Place[]
    layers: Layers
    sets?: PlaceSet[]
    chosen: ReadonlySet<string>
    ontoggle?: (node: { kind: 'collection' | 'place'; key: string }, on: boolean) => void
    current: string | null
    onchoose?: (c: { coll: string; placeId: string | null }) => void
    gazetteer: boolean
    loading: boolean
    ongazetteer?: () => void
    close: () => void
  }
  let { mode, idx, universe, layers, sets = [], chosen, ontoggle, current, onchoose, gazetteer, loading, ongazetteer, close }: Props = $props()

  let query = $state('')
  let root = $state<HTMLDivElement>()
  // the panel arrives after the button was pressed (it is loaded on the first open): the search box takes the focus now
  onMount(() => root?.querySelector<HTMLElement>('[data-autofocus]')?.focus())
  const multi = $derived(mode === 'multi')
  const groups = $derived(placeGroups(universe, idx, layers, { all: multi, gazetteer }))
  const setInfos = $derived(multi ? placeSetInfos(sets, groups) : [])
  const searching = $derived(query.trim() !== '')
  // a search looks in the whole gazetteer: its places are read when one is typed
  $effect(() => { if (multi && searching && !gazetteer) ongazetteer?.() })
  const nodes = $derived<TreeNode[]>(placePickTree(groups, mode === 'place' ? new Set(current ? [current] : []) : chosen, query, setInfos, { loading }))
  const nHits = $derived(nodes.reduce((n, g) => n + g.children.length, 0))

  function toggle(n: TreeNode, on: boolean) {
    if (multi) return ontoggle?.({ kind: n.kind === 'collection' ? 'collection' : 'place', key: n.key }, on)
    onchoose?.({ coll: idx.places.find(x => x.id === n.key)?.coll ?? '', placeId: n.key })
    close()
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pc" bind:this={root} onkeydown={e => arrowNav(e, root, 'input[type=search], .pc button.cb')}>
  <PickSearch bind:value={query} label="Search places by name or id" />
  <p class="mbon-sr-only" role="status" aria-live="polite">{searching ? `${nHits} ${nHits === 1 ? 'place' : 'places'} found${loading ? ', still reading the gazetteer' : ''}` : ''}</p>
  <Tree {nodes} label="Places" ontoggle={toggle} pick={!multi} expandAll={searching} onopen={() => ongazetteer?.()}
    empty={searching ? (loading ? 'Reading the gazetteer…' : `No place matches “${query.trim()}”.`) : 'No place has a computed value yet.'} />
  {#if multi}
    <p class="om-note">Every area collection of the gazetteer is listed, computed or not: a place with no value yet shows empty cells you can compute or ask for. Lines and points (cables, stations) are not offered.</p>
  {/if}
</div>
