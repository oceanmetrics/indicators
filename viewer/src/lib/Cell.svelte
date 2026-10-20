<script lang="ts">
  // one matrix cell: a button that opens the drawer. skimmer = glyphs + value, swimmer = + sparkline, diver = + the
  // values file and the status method in mono. its accessible name says place, indicator, value and status in words.
  // the empty states read differently: "not computed yet" (inviting: it can be computed), "no data here" (with the reason),
  // and a quiet dash (the indicator is not offered for this kind of place).
  import { Icon } from '../../../src/icons/index.ts'
  import type { Indicator } from './data.ts'
  import { classText, cellAria, STATE_WORDS, STATUS_WORDS, TREND_WORDS, periodText, valueText, valuesCollOf } from './matrix.ts'
  import type { CellModel, Place } from './matrix.ts'
  import type { Depth } from './hash.ts'
  import Spark from './Spark.svelte'

  interface Props {
    ind: Indicator
    place: Place
    model: CellModel
    depth: Depth
    /** the place's group title, for the name of a cell the indicator is not offered for */
    groupTitle?: string
    open: boolean
    onopen: (placeId: string, indicator: string) => void
  }
  let { ind, place, model, depth, groupTitle = place.coll, open, onopen }: Props = $props()

  const row = $derived(model.row)
  const statusWord = $derived(model.statusIcon ? STATUS_WORDS[model.statusIcon.slice(3) as keyof typeof STATUS_WORDS] : '')
  const file = $derived.by(() => {
    // the values collection of the row, never the group: a place can have rows in two (Pitcairn: erddap-places and OBIS files)
    const vc = valuesCollOf(ind, place, row)
    const c = ind.collections.find(x => x.coll === vc)
    return c ? c.path.split('/').slice(-2).join('/') : null
  })
</script>

<button
  type="button"
  class="cell"
  class:open
  data-kind={model.kind}
  data-place={place.id}
  data-ind={ind.id}
  aria-label={cellAria(ind, place, model, groupTitle)}
  aria-haspopup="dialog"
  onclick={() => onopen(place.id, ind.id)}
>
  {#if model.kind === 'value' && row}
    <span class="top">
      {#if model.statusIcon}<span class="g st" title={statusWord}><Icon name={model.statusIcon} size={18} /></span>{/if}
      {#if model.trendIcon && row.trend}<span class="g tr" title="trend {TREND_WORDS[row.trend]}"><Icon name={model.trendIcon} size={18} /></span>{/if}
      <span class="v">{valueText(ind, row)}</span>
    </span>
    <span class="meta">{periodText(row)}</span>
    {#if depth !== 'skim'}<Spark spark={row.spark} />{/if}
  {:else if model.kind === 'class' && row}
    <span class="top"><span class="v cls">{classText(ind, row)}</span></span>
    <span class="meta">{periodText(row)} · top class</span>
  {:else if model.stateIcon}
    <span class="top">
      <span class="g state" data-state={model.kind}><Icon name={model.stateIcon} size={18} /></span>
      <span class="w">{STATE_WORDS[model.kind === 'live' ? 'live' : 'nodata']}</span>
    </span>
    {#if model.kind === 'nodata' && model.reason}<span class="meta">{model.reason}</span>{/if}
  {:else}
    <span class="dash" aria-hidden="true">{STATE_WORDS.na}</span>
  {/if}
  {#if depth === 'dive'}
    <span class="mono" title={file ?? ''}>
      {#if model.kind === 'value' || model.kind === 'class'}{row?.status_method ?? 'no status method'}<br />{/if}{#if file}{file.replace('/', '/\u200b')}{:else}no values file{/if}
    </span>
  {/if}
</button>

<style>
  .cell {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
    min-height: 3.5rem;
    padding: var(--space-2) var(--space-3);
    border: 0;
    background: none;
    text-align: left;
    cursor: pointer;
    color: var(--text-strong);
    font: var(--type-small);
  }
  .cell:hover { background: var(--control-hover); }
  .cell.open { background: var(--selected-bg); }
  .cell:focus-visible { outline-offset: -2px; }
  .top { display: flex; align-items: center; gap: var(--space-1); min-width: 0; }
  .g { display: inline-flex; flex: none; }
  .st { color: var(--text-strong); }
  .tr { color: var(--text-body); }
  .state { color: var(--text-body); }
  .state[data-state='live'] { color: var(--link); }
  .cell[data-kind='live'] { background: var(--bg-tint); }
  .cell[data-kind='live'] .w { color: var(--link); }
  .cell[data-kind='live']:hover, .cell[data-kind='live'].open { background: var(--selected-bg); }
  .cell[data-kind='na'] { min-height: 2.5rem; }
  .dash { color: var(--text-body); }
  .v { font-weight: var(--fw-semibold); font-variant-numeric: tabular-nums; white-space: nowrap; margin-left: var(--space-1); }
  .v.cls { margin-left: 0; white-space: normal; line-height: 1.25; }
  .w { color: var(--text-body); }
  .meta { font: var(--type-label); letter-spacing: 0; color: var(--text-body); }
  .mono { font: var(--fw-regular) 0.6875rem / 1.3 var(--font-mono); color: var(--text-body); overflow-wrap: anywhere; }
</style>
