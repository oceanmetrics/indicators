<script lang="ts">
  // the Order control's panel: for the places and the indicators, a sort key (A to Z, north to south, south to north, west to east for
  // the places; A to Z or the vocabulary's order for the indicators), grouping on or off, and a reset. "Custom" shows when the reader
  // has moved a header; it is made by dragging a header in the Matrix or with Alt and the arrow keys. built by order.ts; this only
  // wires it. loaded on the first open.
  import { Button, Toggle } from '@marinebon/ui'
  import { INDICATOR_SORT_WORDS, isDefaultAxis, PLACE_SORT_WORDS } from '../../../../src/report/order.ts'
  import type { OrderSpec } from '../../../../src/report/order.ts'
  import type { VocabId } from '../data.ts'
  import { VOCAB_LABELS } from './indicators.ts'
  import { hasCustom, INDICATOR_KEYS, PLACE_KEYS, resetAxis, resetOrder, setGroup, setIndicatorSort, setPlaceSort } from './order.ts'

  interface Props {
    order: OrderSpec
    vocab: VocabId
    onchange: (o: OrderSpec) => void
  }
  let { order, vocab, onchange }: Props = $props()
</script>

<div class="pc">
  <section class="om-stack-s" aria-label="Order of the places">
    <span class="mbon-label">Places</span>
    <div class="om-row" role="group" aria-label="Sort places by">
      {#each PLACE_KEYS as k (k)}
        <Button variant="quiet" size="sm" pressed={order.places.sort === k} onclick={() => onchange(setPlaceSort(order, k))}>{PLACE_SORT_WORDS[k]}</Button>
      {/each}
      {#if hasCustom(order.places) || order.places.sort === 'custom'}
        <Button variant="quiet" size="sm" pressed={order.places.sort === 'custom'} onclick={() => onchange(setPlaceSort(order, 'custom'))}>{PLACE_SORT_WORDS.custom}</Button>
      {/if}
    </div>
    <Toggle checked={order.places.group} label="Group places by collection" onchange={(v: boolean) => onchange(setGroup(order, 'places', v))} />
    <div class="om-row"><Button variant="quiet" size="sm" disabled={isDefaultAxis(order.places) && !hasCustom(order.places)} onclick={() => onchange(resetAxis(order, 'places'))}>Reset the places' order</Button></div>
  </section>
  <section class="om-stack-s" aria-label="Order of the indicators">
    <span class="mbon-label">Indicators</span>
    <div class="om-row" role="group" aria-label="Sort indicators by">
      {#each INDICATOR_KEYS as k (k)}
        <Button variant="quiet" size="sm" pressed={order.indicators.sort === k} onclick={() => onchange(setIndicatorSort(order, k))}>{INDICATOR_SORT_WORDS[k]}</Button>
      {/each}
      {#if hasCustom(order.indicators) || order.indicators.sort === 'custom'}
        <Button variant="quiet" size="sm" pressed={order.indicators.sort === 'custom'} onclick={() => onchange(setIndicatorSort(order, 'custom'))}>{INDICATOR_SORT_WORDS.custom}</Button>
      {/if}
    </div>
    <Toggle checked={order.indicators.group} label="Group indicators by {VOCAB_LABELS[vocab]}" onchange={(v: boolean) => onchange(setGroup(order, 'indicators', v))} />
    <div class="om-row"><Button variant="quiet" size="sm" disabled={isDefaultAxis(order.indicators) && !hasCustom(order.indicators)} onclick={() => onchange(resetAxis(order, 'indicators'))}>Reset the indicators' order</Button></div>
  </section>
  <p class="om-note">Groups are A to Z by title; places and indicators are A to Z within them. North to south, south to north and west to east use the centre of each place's bounding box.
    To set your own order, drag a row or column header (a whole group by its title) in the Matrix, or press Alt and an arrow key on it. With grouping off, anything can go anywhere.</p>
  <div class="om-row"><Button variant="quiet" size="sm" onclick={() => onchange(resetOrder())}>Reset both</Button></div>
</div>
