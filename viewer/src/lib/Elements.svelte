<script lang="ts">
  // the paper's four elements in pipeline order (dataset, place, method, delivery, in the pipeline colours): shared by
  // the Matrix drawer and the Place view's cards. `row` is anything with a coverage row's statistics (a CoverageRow,
  // or a card's own result when the reader chose another method), so the Method element tells what is on screen.
  import { Icon } from '../../../src/icons/index.ts'
  import { fmt, spanLabel } from '../../../src/status/index.ts'
  import type { Grain } from '../../../src/status/index.ts'
  import type { Catalog, Indicator } from './data.ts'
  import { datasetLink, duckdbSnippet, licenceText, valuesUrl } from './delivery.ts'
  import type { Depth } from './hash.ts'
  import type { Place } from './matrix.ts'
  import type { StatLike } from './place.ts'
  import CopyButton from './CopyButton.svelte'

  interface Props {
    catalog: Catalog
    ind: Indicator
    place: Place
    collTitle: string
    row: StatLike | null
    depth: Depth
    /** the status method shown; the manifest's by default */
    method?: string
    /** the grain the status is at; the manifest's by default */
    grain?: Grain
  }
  let { catalog, ind, place, collTitle, row, depth, method = ind.status_method, grain = ind.status_grain }: Props = $props()

  const url = $derived(valuesUrl(catalog.base, ind, place.coll))
  const hasStatus = $derived(!!row?.status)
  const dec = $derived(ind.decimals ?? 2)
  const longTerm = $derived.by(() => {
    if (!row || row.lt_mean == null) return ''
    const sd = row.lt_sd != null && method === 'iea-sd' ? ` ± ${fmt(row.lt_sd, dec)}` : ''
    const span = row.t0 && row.t1 ? ` (${spanLabel(row.t0, row.t1, row.time_grain)})` : ''
    return `${fmt(row.lt_mean, dec)}${sd}${ind.unit_label ? ' ' + ind.unit_label : ''}${span}`
  })
  const recentText = $derived(
    row?.recent_from && row.recent_to
      ? `${spanLabel(row.recent_from, row.recent_to, row.time_grain)} (the last ${ind.recent} ${row.time_grain === 'year' ? 'years' : 'periods'})`
      : `the last ${ind.recent} periods`,
  )
</script>

<section class="els" aria-label="The four elements">
  <article class="el dataset">
    <h3 class="k"><Icon name="el-dataset" size={18} />Dataset</h3>
    <p class="main">{ind.dataset.title}</p>
    <ul class="plain">
      {#each ind.dataset.providers.filter(p => !/^(na|n\/a)$/i.test(p.name.trim())) as p (p.name)}
        <li>{#if p.url}<a href={p.url} target="_blank" rel="noopener">{p.name}</a>{:else}{p.name}{/if} <span class="role">{p.roles.join(', ')}</span></li>
      {/each}
    </ul>
    <p class="small">Licence: {licenceText(ind)}</p>
    {#if datasetLink(ind)}<p class="small"><a href={datasetLink(ind)} target="_blank" rel="noopener">Dataset page <Icon name="ui-external" size={14} /></a></p>{/if}
  </article>

  <article class="el place">
    <h3 class="k"><Icon name="el-place" size={18} />Place</h3>
    <p class="main">{place.name}</p>
    <p class="small"><code>{place.id}</code></p>
    <p class="small">Collection: {collTitle} (<code>{place.coll}</code>)</p>
  </article>

  <article class="el method">
    <h3 class="k"><Icon name="el-method" size={18} />Method</h3>
    <p class="main">{method} <span class="role">status at the {grain} grain</span></p>
    {#if hasStatus && row}
      <p class="small">Recent window: {recentText}; mean {fmt(row.recent_mean, dec)}{ind.unit_label ? ' ' + ind.unit_label : ''}.</p>
      <p class="small">{method === 'names-pct' ? 'Long-term median' : 'Long-term mean ± SD'}: {longTerm}.</p>
    {:else if row && row.status_method}
      <p class="small">No status: {row.why ?? 'none computed'}.</p>
    {:else}
      <p class="small">No status at this grain.</p>
    {/if}
    <p class="small">{ind.method.summary}</p>
    {#if ind.method.code}<p class="small"><a href={ind.method.code} target="_blank" rel="noopener">Code <Icon name="ui-external" size={14} /></a></p>{/if}
  </article>

  <article class="el delivery">
    <h3 class="k"><Icon name="el-delivery" size={18} />Delivery</h3>
    <ul class="plain links">
      {#if url}<li><a href={url} target="_blank" rel="noopener">Values (Parquet) <Icon name="ui-external" size={14} /></a></li>{/if}
      <li><a href={catalog.base + 'indicators.json'} target="_blank" rel="noopener">indicators.json <Icon name="ui-external" size={14} /></a></li>
      <li><a href={catalog.base + 'coverage.parquet'} target="_blank" rel="noopener">coverage.parquet <Icon name="ui-external" size={14} /></a></li>
      {#if ind.producer.url}<li><a href={ind.producer.url} target="_blank" rel="noopener">Producer: {ind.producer.name} <Icon name="ui-external" size={14} /></a></li>{/if}
    </ul>
    {#if depth === 'dive' && url}
      <pre class="code">{duckdbSnippet(url, place.id)}</pre>
      <CopyButton text={duckdbSnippet(url, place.id)} label="Copy query" />
    {:else if !url}
      <p class="small">No values file for this place's collection.</p>
    {/if}
  </article>
</section>

<style>
  .els { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); gap: var(--space-3); }
  .el { background: var(--bg-tint); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); min-width: 0; }
  .k { display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-2); font: var(--type-label); text-transform: uppercase; letter-spacing: var(--ls-label); }
  .dataset .k { color: var(--pipe-dataset-ink); }
  .place .k { color: var(--pipe-place-ink); }
  .method .k { color: var(--pipe-method-ink); }
  .delivery .k { color: var(--pipe-delivery-ink); }
  .main { margin: 0 0 var(--space-1); font: var(--fw-semibold) var(--text-sm) / 1.35 var(--font-sans); color: var(--text-strong); overflow-wrap: anywhere; }
  .small { margin: 0 0 var(--space-1); font: var(--type-small); font-size: 0.8125rem; line-height: 1.45; color: var(--text-body); overflow-wrap: anywhere; }
  .small code { font-size: 0.75rem; }
  .role { font: var(--fw-regular) 0.75rem / 1 var(--font-mono); color: var(--text-body); }
  ul.plain { list-style: none; margin: 0 0 var(--space-2); padding: 0; display: grid; gap: var(--space-1); font: var(--type-small); font-size: 0.8125rem; }
  ul.links li { overflow-wrap: anywhere; }
  .code { margin: var(--space-2) 0; padding: var(--space-2) var(--space-3); background: var(--bg-page); border: 1px solid var(--border); border-radius: var(--radius-sm); overflow-x: auto; font: var(--fw-regular) 0.75rem / 1.5 var(--font-mono); color: var(--text-strong); white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
