<script lang="ts">
  // the place picker's panel: a search over the computed places (name and id), the groups with computed places as a tri-state
  // tree (multi), a list (group) or a tree to choose from (place), and the collections nothing is computed for yet, each with
  // its link into the gazetteer and a request. built by places.ts; this only wires it. loaded on the first open.
  import { Icon } from '../../../../src/icons/index.ts'
  import { onMount } from 'svelte'
  import { Button } from '@marinebon/ui'
  import Tree from '../report/Tree.svelte'
  import PickSearch from './PickSearch.svelte'
  import type { TreeNode } from '../report/tree.ts'
  import type { Layers } from '../data.ts'
  import type { CoverageIndex } from '../matrix.ts'
  import { arrowNav } from './nav.ts'
  import { placeGroups } from './places.ts'
  import type { GroupNote, PickMode } from './places.ts'
  import { groupPickNodes, placePickTree, uncomputedCollections } from './placesTree.ts'

  interface Props {
    mode: PickMode
    idx: CoverageIndex
    layers: Layers
    chosen: ReadonlySet<string>
    ontoggle?: (node: { kind: 'collection' | 'place'; key: string }, on: boolean) => void
    current: string | null
    onchoose?: (c: { coll: string; placeId: string | null }) => void
    noteOf: (coll: string) => GroupNote | null
    removed: number
    onrestore?: () => void
    close: () => void
  }
  let { mode, idx, layers, chosen, ontoggle, current, onchoose, noteOf, removed, onrestore, close }: Props = $props()

  let query = $state('')
  let root = $state<HTMLDivElement>()
  // the panel arrives after the button was pressed (it is loaded on the first open): the search box takes the focus now
  onMount(() => root?.querySelector<HTMLElement>('[data-autofocus]')?.focus())
  const groups = $derived(placeGroups(idx, layers))
  const searching = $derived(query.trim() !== '')
  // a search is the same tree narrowed to the places that match (every group open); the group picker lists groups until one is typed
  const nodes = $derived<TreeNode[]>(
    mode === 'group' && !searching ? groupPickNodes(groups, current, noteOf)
      : placePickTree(groups, mode === 'place' ? new Set(current ? [current] : []) : mode === 'multi' ? chosen : new Set(), query),
  )
  const nHits = $derived(nodes.reduce((n, g) => n + g.children.length, 0))
  const uncomputed = $derived(uncomputedCollections(layers, idx))

  function toggle(n: TreeNode, on: boolean) {
    if (mode === 'multi') return ontoggle?.({ kind: n.kind === 'collection' ? 'collection' : 'place', key: n.key }, on)
    // the group list's rows are groups (their key is the collection); in a search or the place picker a leaf is a place
    const asGroup = mode === 'group' && !searching
    const coll = asGroup ? n.key : idx.places.find(x => x.id === n.key)?.coll ?? ''
    onchoose?.({ coll, placeId: asGroup ? null : n.key })
    close()
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pc" bind:this={root} onkeydown={e => arrowNav(e, root, 'input[type=search], .pc button.cb')}>
  <PickSearch bind:value={query} label="Search places by name or id" />
  <p class="mbon-sr-only" role="status" aria-live="polite">{searching ? `${nHits} ${nHits === 1 ? 'place' : 'places'} found` : ''}</p>
  <Tree {nodes} label={mode === 'group' && !searching ? 'Place groups' : 'Places'} ontoggle={toggle} pick={mode !== 'multi'} expandAll={searching}
    empty={searching ? `No computed place matches “${query.trim()}”.` : 'No place has a computed value yet.'} />

  {#if removed && onrestore}
    <Button variant="quiet" size="sm" onclick={onrestore}>Restore the {removed} removed {removed === 1 ? 'place' : 'places'}</Button>
  {/if}

  {#if uncomputed.length}
    <details class="nc">
      <summary><span class="mbon-label">Not computed yet</span> <span class="om-count">{uncomputed.length} collections in the gazetteer</span></summary>
      <p class="om-note">Polygon collections with no computed place. Ask for one and a maintainer reviews what to compute.</p>
      <ul>
        {#each uncomputed as u (u.coll)}
          <li>
            <span class="t">{u.title}{#if u.n != null} <span class="om-count">{u.n} places</span>{/if}</span>
            <span class="acts">
              <a href={u.gazetteer} target="_blank" rel="noopener" aria-label="{u.title}: in the gazetteer (opens in a new tab)">in the gazetteer<Icon name="ui-external" size={12} /></a>
              <a href={u.request} target="_blank" rel="noopener" aria-label="Ask for indicators for {u.title} (opens in a new tab)">Ask for it<Icon name="ui-external" size={12} /></a>
            </span>
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</div>
