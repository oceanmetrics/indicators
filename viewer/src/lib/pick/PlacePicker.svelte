<script lang="ts">
  // the one place picker: a button that states the selection and the panel it opens (PlacePanel, loaded on the first open).
  // modes: `multi` (Matrix, Report: tick groups and places), `group` (Map: exactly one group), `place` (Place view: one place;
  // choosing hands it back and the caller navigates).
  import Popover from './Popover.svelte'
  import type { Layers } from '../data.ts'
  import type { CoverageIndex } from '../matrix.ts'
  import type { GroupNote, PickMode } from './places.ts'

  interface Props {
    mode: PickMode
    idx: CoverageIndex
    layers: Layers
    /** what the button says */
    label: string
    /** multi: the chosen place ids, and a tick on a group or a place */
    chosen?: ReadonlySet<string>
    ontoggle?: (node: { kind: 'collection' | 'place'; key: string }, on: boolean) => void
    /** group: the current group; place: the current place id */
    current?: string | null
    /** group and place: a choice (a place found by search carries its id in the group mode too) */
    onchoose?: (c: { coll: string; placeId: string | null }) => void
    /** group: what to say beside each group (values for the indicator shown, or none) */
    noteOf?: (coll: string) => GroupNote | null
    /** multi: places removed from the display, and the way to bring them back */
    removed?: number
    onrestore?: () => void
    kicker?: string
  }
  let { mode, idx, layers, label, chosen = new Set(), ontoggle, current = null, onchoose, noteOf = () => null, removed = 0, onrestore, kicker = mode === 'place' ? 'Place' : mode === 'group' ? 'Place group' : 'Places' }: Props = $props()

  // the panel is its own chunk: nothing of it is fetched until the button is first pressed
  let Panel = $state.raw<typeof import('./PlacePanel.svelte').default | null>(null)
  const load = () => { if (!Panel) import('./PlacePanel.svelte').then(m => { Panel = m.default }) }
</script>

<Popover {label} {kicker} icon="view-place" onopen={load}>
  {#snippet children(close)}
    {#if Panel}
      <Panel {mode} {idx} {layers} {chosen} {ontoggle} {current} {onchoose} {noteOf} {removed} {onrestore} {close} />
    {:else}
      <p role="status">Loading the places…</p>
    {/if}
  {/snippet}
</Popover>
