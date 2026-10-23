<script lang="ts">
  // the line above the grid: the summary of the selection on display (@oceanmetrics/catalog rollups, said by matrix.ts), the sort of
  // the places and of the indicators (two native selects, which write the order's ps and is) and the pager (60 places a page, page= in
  // the hash; the pages are links, so each is a permalink and the selection and sort travel with it). the rules are in matrix.ts and
  // src/report/order.ts; this only wires them.
  import { Select } from '@marinebon/ui'
  import { Icon } from '../../../src/icons/index.ts'
  import { INDICATOR_SORT_WORDS, PLACE_SORT_WORDS } from '../../../src/report/order.ts'
  import type { IndicatorSort, OrderSpec, PlaceSort } from '../../../src/report/order.ts'
  import { setIndicatorSort, setPlaceSort } from './pick/order.ts'
  import { COUNT_PARTS, latestOf, pageText, summaryHead } from './matrix.ts'
  import type { Paged, Rollups } from './matrix.ts'

  interface Props {
    /** the places and indicators on display (every page), and their rollups */
    places: number
    indicators: number
    summary: Rollups
    paged: Paged
    order: OrderSpec
    onorder: (o: OrderSpec) => void
    /** the href of a page of the grid */
    pageHref: (page: number) => string
  }
  let { places, indicators, summary, paged, order, onorder, pageHref }: Props = $props()

  // the sorts the select offers; a sort chosen elsewhere (north to south, custom: the Order control) is offered too, so it shows
  const P_KEYS: PlaceSort[] = ['az', 'above', 'below', 'recent']
  const I_KEYS: IndicatorSort[] = ['az', 'series', 'above', 'below']
  const withCurrent = <S extends string>(keys: S[], cur: S) => (keys.includes(cur) ? keys : [...keys, cur])
  const pOpts = $derived(withCurrent(P_KEYS, order.places.sort).map(k => ({ value: k, label: k === 'az' ? 'Name, A to Z' : PLACE_SORT_WORDS[k] })))
  const iOpts = $derived(withCurrent(I_KEYS, order.indicators.sort).map(k => ({ value: k, label: INDICATOR_SORT_WORDS[k] })))
  const latest = $derived(latestOf(summary.places))
</script>

<section class="mbar" aria-label="Summary, sort and pages of the matrix">
  <p class="sum" role="status" aria-live="polite">
    <Icon name="view-matrix" size={18} />
    <span class="h">{summaryHead(places, indicators)}:</span>
    {#each COUNT_PARTS as c, n (c.k)}
      <span class="c"><Icon name={c.glyph} size={16} />{summary.total[c.k].toLocaleString('en-US')} {c.word}{n < COUNT_PARTS.length - 1 ? ',' : ''}</span>
    {/each}
    {#if latest}<span class="c">· latest {latest}</span>{/if}
  </p>
  <div class="ctl">
    <div class="sel"><Select label="Sort places" value={order.places.sort} options={pOpts} onchange={(v: string) => onorder(setPlaceSort(order, v as PlaceSort))} /></div>
    <div class="sel"><Select label="Sort indicators" value={order.indicators.sort} options={iOpts} onchange={(v: string) => onorder(setIndicatorSort(order, v as IndicatorSort))} /></div>
    {#if paged.pages > 1}
    <nav class="pager" aria-label="Pages of places">
      <span class="mbon-label">Pages</span>
      <span class="pg">
        {#if paged.page > 1}<a class="pb" href={pageHref(paged.page - 1)} aria-label="Previous page of places"><Icon name="ui-prev" size={16} />Previous</a>
        {:else}<span class="pb off" aria-hidden="true"><Icon name="ui-prev" size={16} />Previous</span>{/if}
        <span class="at">{pageText(paged)}{paged.pages > 1 ? ` · page ${paged.page} of ${paged.pages}` : ''}</span>
        {#if paged.page < paged.pages}<a class="pb" href={pageHref(paged.page + 1)} aria-label="Next page of places">Next<Icon name="ui-next" size={16} /></a>
        {:else}<span class="pb off" aria-hidden="true">Next<Icon name="ui-next" size={16} /></span>{/if}
      </span>
    </nav>
    {/if}
  </div>
</section>

<style>
  .mbar { display: grid; gap: var(--space-3); min-width: 0; }
  .sum { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-2); margin: 0; font: var(--type-small); color: var(--text-body); }
  .sum > :global(svg) { color: var(--label-color); }
  .h { font-weight: var(--fw-semibold); color: var(--text-strong); }
  .c { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .c :global(svg) { color: var(--label-color); }
  .ctl { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-3) var(--space-4); }
  .sel { min-width: 11rem; }
  .pager { display: flex; flex-direction: column; gap: var(--space-1); }
  .pg { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); font: var(--type-small); color: var(--text-body); min-height: 2.25rem; }
  .at { font-variant-numeric: tabular-nums; color: var(--text-strong); }
  .pb { display: inline-flex; align-items: center; gap: 2px; padding: var(--space-1) var(--space-2); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--control-bg); color: var(--text-strong); text-decoration: none; font: var(--type-small); }
  a.pb:hover { border-color: var(--accent); }
  .pb.off { opacity: 0.45; }
  @media (max-width: 640px) {
    .sel { flex: 1 1 10rem; min-width: 0; }
    .pager { flex-basis: 100%; }
    .at { flex-basis: 100%; order: -1; }
  }
</style>
