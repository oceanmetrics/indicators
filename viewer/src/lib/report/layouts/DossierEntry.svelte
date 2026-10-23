<script lang="ts">
  // one figure of the Dossier: the chart, the status sentence as its caption, the method, the citation and how to reproduce
  // it (the configuration hash, the values file, the Place view that draws the same card, and at the diver level the
  // DuckDB query). the values are read when the entry comes near the screen (or at once when `all`, for print), so a
  // dossier of a hundred figures does not read a hundred records on load.
  import { onMount } from 'svelte'
  import { placeCitation } from '@oceanmetrics/catalog/cards'
  import { METHOD_NOTES, STATUS_NOTE, STATUS_WORDS, TREND_WORDS } from '@oceanmetrics/status'
  import { Icon } from '../../../../../src/icons/index.ts'
  import type { IconName } from '../../../../../src/icons/index.ts'
  import type { ReportSpec } from '../../../../../src/report/spec.ts'
  import type { Catalog, Indicator } from '../../data.ts'
  import type { Depth } from '../../hash.ts'
  import type { CoverageIndex, Place } from '../../matrix.ts'
  import CopyButton from '../../CopyButton.svelte'
  import StackChart from '../../StackChart.svelte'
  import TimeChart from '../../TimeChart.svelte'
  import { cellKey, cellUrl, loadCells } from '../cells.ts'
  import type { CellResult } from '../cells.ts'
  import { recentFor } from '../scorecard.ts'
  import { figureCaption, reproduceOf } from './dossier.ts'

  interface Props {
    catalog: Catalog
    idx: CoverageIndex
    spec: ReportSpec
    place: Place
    ind: Indicator
    figure: number
    depth: Depth
    /** the Place view's address for this cell */
    placeLink: string
    /** read the values now, whatever the scroll (printing) */
    all?: boolean
  }
  let { catalog, idx, spec, place, ind, figure, depth, placeLink, all = false }: Props = $props()

  let root: HTMLElement | undefined = $state()
  let near = $state(false)
  onMount(() => {
    if (typeof IntersectionObserver === 'undefined') { near = true; return }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { near = true; io.disconnect() } }, { rootMargin: '700px 0px' })
    if (root) io.observe(root)
    return () => io.disconnect()
  })

  let result = $state.raw<CellResult | null>(null)
  $effect(() => {
    if (!near && !all) return
    result = null
    return loadCells(catalog, idx, spec, [{ place, ind }], r => (result = r.get(cellKey(place, ind)) ?? null))
  })
  const model = $derived(result?.s === 'ok' ? result.model : null)
  const url = $derived(cellUrl(catalog, idx, place, ind))
  const rep = $derived(reproduceOf(ind, place, catalog.manifest.version, url))
  const citation = $derived(placeCitation(ind, place.id))
  const unit = $derived(ind.unit_label ?? '')
  const style = $derived(`${spec.style.status === 'iea-sd' ? 'each indicator’s own method' : spec.style.status}, recent window ${recentFor(ind, spec)}${spec.style.baseline ? `, baseline ${spec.style.baseline[0]}–${spec.style.baseline[1]}` : ''}${spec.time.from != null || spec.time.to != null ? `, years ${spec.time.from ?? ''}–${spec.time.to ?? ''}` : ''}`)
  const abs = (h: string) => (typeof location === 'undefined' ? h : location.origin + location.pathname + location.search + h)
</script>

<article class="entry" bind:this={root} aria-busy={(near || all) && !model && result?.s !== 'error' ? 'true' : 'false'} aria-labelledby="df-{figure}">
  <h4 id="df-{figure}">{ind.title} <span class="u">{unit || 'unitless'}</span></h4>
  {#if result?.s === 'error'}
    <p class="err" role="alert">The values did not load: {result.msg}</p>
  {:else if !model}
    <p class="wait om-note">Reading the record…</p>
  {:else}
    {#if model.kind === 'categorical'}
      <StackChart {model} />
    {:else if model.kind === 'continuous'}
      <TimeChart {model} {unit} recent={recentFor(ind, spec)} />
    {/if}
    <div class="cap">
      <p class="sent"><strong>{figureCaption(figure, model.sentence)}</strong></p>
      {#if model.kind === 'continuous' && model.method !== 'values'}
        <ul class="marks om-marks">
          <li><Icon name={(`st-${model.status ?? 'none'}`) as IconName} size={18} /><span>{model.status ? STATUS_WORDS[model.status] : 'no status'}</span></li>
          {#if model.trend}<li><Icon name={(`tr-${model.trend}`) as IconName} size={18} /><span>trend {TREND_WORDS[model.trend]}</span></li>{/if}
        </ul>
      {/if}
    </div>
    {#if depth !== 'skim'}
      <dl class="facts">
        <dt>Method</dt>
        <dd>{METHOD_NOTES[model.method]}{#if model.method !== 'values'}{' '}{STATUS_NOTE}{/if}{' '}{ind.method.summary}{#if ind.method.code}{' '}<a href={ind.method.code}>Code</a>{/if}</dd>
        <dt>Report style</dt><dd>{style}.</dd>
      </dl>
    {/if}
    <p class="cite"><span class="mbon-label">Cite</span> {citation}</p>
    {#if depth !== 'skim'}
      <div class="repro">
        <p class="rh"><span class="mbon-label">Reproduce</span> configuration <code>{rep.hash}</code> (manifest {catalog.manifest.version})</p>
        <ul>
          <li><a href={abs(placeLink)}>Place view of this figure</a></li>
          {#if rep.valuesUrl}<li><a href={rep.valuesUrl}>Values (Parquet)</a></li>{/if}
          <li><a href={catalog.base + 'indicators.json'}>indicators.json</a></li>
        </ul>
        {#if depth === 'dive'}
          <ul class="cfg">{#each rep.config as l (l)}<li><code>{l}</code></li>{/each}</ul>
          {#if rep.snippet}<pre class="sql om-code">{rep.snippet}</pre><CopyButton text={rep.snippet} label="Copy query" />{/if}
        {/if}
      </div>
    {/if}
  {/if}
</article>

<style>
  .entry { display: grid; gap: var(--space-2); min-width: 0; padding: var(--space-3) 0 var(--space-4); border-top: 1px solid var(--divider); }
  h4 { margin: 0; font: var(--fw-semibold) var(--text-md) / 1.25 var(--font-display); color: var(--text-strong); }
  .u { font: var(--fw-regular) 0.75rem / 1.3 var(--font-mono); color: var(--text-body); margin-left: var(--space-2); }
  .wait { margin: 0; min-height: 8rem; }
  .err { margin: 0; padding: var(--space-3); background: var(--notice-err-bg); border-radius: var(--radius-sm); color: var(--text-strong); overflow-wrap: anywhere; }
  .cap { display: grid; gap: var(--space-1); }
  .sent { margin: 0; font: var(--fw-regular) var(--text-sm) / 1.45 var(--font-sans); color: var(--text-strong); text-wrap: pretty; }
  .facts { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: var(--space-1) var(--space-3); font: var(--type-small); color: var(--text-body); }
  .facts dt { font: var(--fw-semibold) var(--text-xs) / 1.6 var(--font-sans); color: var(--label-color); text-transform: uppercase; letter-spacing: 0.04em; }
  .facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  .cite { margin: 0; font: var(--type-small); font-size: 0.8125rem; line-height: 1.5; color: var(--text-body); overflow-wrap: anywhere; }
  .repro { display: grid; gap: var(--space-1); font: var(--type-small); color: var(--text-body); }
  .rh { margin: 0; }
  .repro ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); }
  .repro ul.cfg { display: grid; gap: 0; }
  .repro a { overflow-wrap: anywhere; }
  .sql { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  code { font-family: var(--font-mono); font-size: 0.75rem; }
  @media (max-width: 640px) { .facts { grid-template-columns: minmax(0, 1fr); } }
  @media print {
    .entry { break-inside: avoid; }
    .repro a { color: var(--text-strong); }
  }
</style>
