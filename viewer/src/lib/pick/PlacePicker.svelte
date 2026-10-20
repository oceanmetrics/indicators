<script lang="ts">
  // the one place picker: a button that states the selection and the panel it opens (PlacePanel, loaded on the first open).
  // modes: `multi` (the Select section above Matrix, Map and Report: tick place sets, groups and places of the whole gazetteer),
  // `place` (Place view: one computed place; choosing hands it back and the caller navigates).
  import Popover from './Popover.svelte'
  import type { Layers, PlaceSet } from '../data.ts'
  import type { CoverageIndex, Place } from '../matrix.ts'
  import type { PickMode } from './places.ts'

  interface Props {
    mode: PickMode
    idx: CoverageIndex
    /** every place the picker can list: the computed ones, and the gazetteer's once read */
    universe: Place[]
    layers: Layers
    /** what the button says */
    label: string
    /** multi: the chosen place ids, and a tick on a place set, a group or a place */
    chosen?: ReadonlySet<string>
    ontoggle?: (node: { kind: 'collection' | 'place'; key: string }, on: boolean) => void
    /** place: the current place id */
    current?: string | null
    /** place: a choice (a place found by search carries its id) */
    onchoose?: (c: { coll: string; placeId: string | null }) => void
    kicker?: string
    /** the place sets offered above the groups (multi only) */
    sets?: PlaceSet[]
    /** the gazetteer's places are read / being read, and the way to ask for them (the first time a group with places not computed is opened) */
    gazetteer?: boolean
    loading?: boolean
    ongazetteer?: () => void
  }
  let { mode, idx, universe, layers, label, chosen = new Set(), ontoggle, current = null, onchoose, kicker = mode === 'place' ? 'Place' : 'Places', sets = [], gazetteer = false, loading = false, ongazetteer }: Props = $props()

  // the panel is its own chunk: nothing of it is fetched until the button is first pressed
  let Panel = $state.raw<typeof import('./PlacePanel.svelte').default | null>(null)
  const load = () => { if (!Panel) import('./PlacePanel.svelte').then(m => { Panel = m.default }) }
</script>

<Popover {label} {kicker} icon="view-place" onopen={load}>
  {#snippet children(close)}
    {#if Panel}
      <Panel {mode} {idx} {universe} {layers} {sets} {chosen} {ontoggle} {current} {onchoose} {gazetteer} {loading} {ongazetteer} {close} />
    {:else}
      <p role="status">Loading the places…</p>
    {/if}
  {/snippet}
</Popover>
