<script lang="ts">
  // the Order control of the Select section: one button that says how the places and the indicators are ordered, and the panel it opens
  // (OrderPanel, loaded on the first open). the order is part of the shared selection, so it is the same in the Matrix, Map and Report.
  import Popover from './Popover.svelte'
  import type { OrderSpec } from '../../../../src/report/order.ts'
  import type { VocabId } from '../data.ts'
  import { orderLabel } from './order.ts'

  interface Props {
    order: OrderSpec
    vocab: VocabId
    onchange: (o: OrderSpec) => void
  }
  let { order, vocab, onchange }: Props = $props()

  let Panel = $state.raw<typeof import('./OrderPanel.svelte').default | null>(null)
  const load = () => { if (!Panel) import('./OrderPanel.svelte').then(m => { Panel = m.default }) }
</script>

<Popover label={orderLabel(order)} kicker="Order" icon="ui-sort" onopen={load}>
  {#snippet children()}
    {#if Panel}
      <Panel {order} {vocab} {onchange} />
    {:else}
      <p role="status">Loading the order…</p>
    {/if}
  {/snippet}
</Popover>
