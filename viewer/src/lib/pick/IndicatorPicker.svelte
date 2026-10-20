<script lang="ts">
  // the one indicator picker: a button that states the selection and the panel it opens (IndicatorPanel, loaded on the first
  // open). modes: `multi` (Matrix, Report: tick indicators) and `single` (Map, Place view: choose one).
  import Popover from './Popover.svelte'
  import type { Indicator, Vocab, VocabId } from '../data.ts'
  import type { TreeNode } from '../report/tree.ts'
  import type { CoverageIndex, Place } from '../matrix.ts'

  interface Props {
    mode: 'multi' | 'single'
    label: string
    indicators: Indicator[]
    vocabs: Record<VocabId, Vocab>
    vocab: VocabId
    onvocab: (v: VocabId) => void
    /** multi: the indicators on display; single: the one shown */
    chosen: ReadonlySet<string>
    /** the places of the selection and the coverage the counts are made from; or the counts made already (indicator id -> places with a value) */
    idx?: CoverageIndex
    places?: Place[]
    withValues?: Map<string, Set<string>>
    nPlaces?: number
    ontoggle?: (node: TreeNode, on: boolean) => void
    onchoose?: (id: string) => void
    /** multi: the leads switch and the show-empty switch, which live in the URL */
    leads?: boolean
    onleads?: (v: boolean) => void
    showEmpty?: boolean
    onempty?: (v: boolean) => void
    /** single: offer "show indicators without values here" (kept in the panel, not in the URL) */
    canShowEmpty?: boolean
    /** single: a hint of its own beside each indicator (the Map: the groups that have values) */
    hintOf?: (ind: Indicator) => string
    removed?: number
    onrestore?: () => void
  }
  let props: Props = $props()

  let Panel = $state.raw<typeof import('./IndicatorPanel.svelte').default | null>(null)
  const load = () => { if (!Panel) import('./IndicatorPanel.svelte').then(m => { Panel = m.default }) }
</script>

<Popover label={props.label} kicker="Indicators" icon="view-indicator" onopen={load}>
  {#snippet children(close)}
    {#if Panel}
      <Panel {...props} {close} />
    {:else}
      <p role="status">Loading the indicators…</p>
    {/if}
  {/snippet}
</Popover>
