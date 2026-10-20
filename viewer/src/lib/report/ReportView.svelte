<script lang="ts">
  // the Report view: a spec (places x indicators in a layout), its builder and its layout. the spec lives in the URL hash
  // (src/report/spec.ts keys), so every report is a permalink; every change goes out through onpatch({ spec }).
  // the report is the spec expanded against this catalog and gated by coverage (report.ts); the layouts draw it: Cards,
  // Scorecard, Small multiples, Quad plot, Map sheet and Dossier, each with the same sections when a fix split the report.
  // every layout but the Map sheet has the locator map on top. Export holds report.json, the permalink, print and the
  // SanctuaryWatch bundle (a ZIP built in the browser, loaded only when asked for).
  import { onMount, tick } from 'svelte'
  import { Button, Menu, Notice } from '@marinebon/ui'
  import { Icon } from '../../../../src/icons/index.ts'
  import { LAYOUTS, specId, specJson, specParams } from '../../../../src/report/spec.ts'
  import type { Fix, ReportSpec } from '../../../../src/report/spec.ts'
  import type { Catalog, Layers, VocabId } from '../data.ts'
  import { downloadBlob } from '../download.ts'
  import { placeHref, reportHref } from '../hash.ts'
  import type { Depth, ViewState } from '../hash.ts'
  import { indexCoverage, pickRow, valuesCollsOf } from '../matrix.ts'
  import CopyButton from '../CopyButton.svelte'
  import { loadCells } from './cells.ts'
  import type { CellResult } from './cells.ts'
  import { availablePresets, PRESETS } from './presets.ts'
  import { runPrintPrep } from './printHooks.ts'
  import { buildReport, reportTitle, requestHref, summaryLine } from './report.ts'
  import { collapseToLeads } from './tree.ts'
  import Builder from './Builder.svelte'
  import CardsLayout from './CardsLayout.svelte'
  import Fixes from './Fixes.svelte'
  import Dossier from './layouts/Dossier.svelte'
  import QuadPlot from './layouts/QuadPlot.svelte'
  import SmallMultiples from './layouts/SmallMultiples.svelte'
  import ScoreCard from './ScoreCard.svelte'

  interface Props {
    catalog: Catalog
    view: ViewState
    titles: (coll: string) => string
    layers?: Layers
    onpatch: (p: Partial<ViewState>) => void
    /** what the rows are in the Scorecard, Small multiples and Quad plot: indicators (the Matrix's default) or places */
    axes?: 'places' | 'indicators'
  }
  let { catalog, view, titles, layers = {}, onpatch, axes = 'indicators' }: Props = $props()

  const spec = $derived(view.spec)
  const idx = $derived(indexCoverage(catalog.coverage))
  const model = $derived(buildReport(catalog, idx, spec, view.vocab))
  const info = $derived(LAYOUTS[spec.layout])
  const title = $derived(reportTitle(spec))
  // the two layouts that hold a map are loaded when first needed: MapLibre is its own chunk (the Map view's)
  let LocatorMap = $state.raw<typeof import('./layouts/LocatorMap.svelte').default | null>(null)
  let MapSheet = $state.raw<typeof import('./layouts/MapSheet.svelte').default | null>(null)

  let editing = $state(false)
  // the sections a split fix chose live in the spec (split=), so a split report is a permalink too
  const split = $derived(spec.split)
  // printing: the Cards layout lists every category instead of the open tab, so the paper has them all
  let printing = $state(false)
  let head: HTMLElement | undefined = $state()

  // ---- changes: the spec and the shared keys ----
  const setSpec = (s: ReportSpec) => onpatch({ spec: { ...s, depth: view.depth } })
  function setView(p: { vocab?: VocabId; depth?: Depth }) {
    onpatch({ ...p, ...(p.depth ? { spec: { ...spec, depth: p.depth } } : {}) })
  }
  function fix(f: Fix) {
    if (f.kind === 'layout') setSpec({ ...spec, layout: f.layout })
    else if (f.kind === 'split') setSpec({ ...spec, split: f.by })
    else setSpec({ ...spec, indicators: collapseToLeads(spec.indicators, catalog.manifest.indicators) })
  }

  // ---- arriving: a bare #view=report starts from the first preset; an over-budget spec opens the builder ----
  let started = false
  $effect(() => {
    if (started) return
    started = true
    if (specParams(spec).length === 0) {
      const p = availablePresets(PRESETS, catalog.manifest.indicators, idx.places)[0]
      if (p) setSpec(p.spec)
    } else if (!model.budget.ok) editing = true
  })
  // a budget broken by a later change opens the builder too, where the fixes are
  let wasOk = true
  $effect(() => {
    const ok = model.budget.ok || split != null
    if (wasOk && !ok) editing = true
    wasOk = ok
  })

  // ---- the sections: one, or one per place or category when split ----
  const sections = $derived(
    split === 'place' ? model.places.map(p => ({ title: spec.layout === 'cards' ? null : p.name, places: [p], groups: model.groups }))
      : split === 'category' ? model.groups.map(g => ({ title: g.term.label, places: model.places, groups: [g] }))
        : [{ title: null as string | null, places: model.places, groups: model.groups }],
  )
  const showBody = $derived((model.budget.ok || split != null) && model.places.length > 0 && model.indicators.length > 0)
  $effect(() => {
    if (!showBody) return
    if (spec.layout === 'map-sheet') { if (!MapSheet) import('./layouts/MapSheet.svelte').then(m => { MapSheet = m.default }) }
    else if (!LocatorMap) import('./layouts/LocatorMap.svelte').then(m => { LocatorMap = m.default })
  })

  // ---- links ----
  const permalink = $derived(typeof location === 'undefined' ? '' : location.origin + location.pathname + location.search + reportHref(view, spec))
  const linkToPlace = (id: string, coll: string, ind?: string) => placeHref(view, id, coll, ind ?? null)
  const absolute = (h: string) => location.origin + location.pathname + location.search + h
  const id = $derived(specId(spec, catalog.manifest.version))
  const request = $derived(requestHref(permalink, model.empties))

  // ---- export ----
  const json = $derived(specJson({ ...spec, depth: view.depth }))
  const saveJson = () => downloadBlob(new Blob([json + '\n'], { type: 'application/json' }), 'report.json')
  async function copyLink(close: () => void) {
    try { await navigator.clipboard.writeText(permalink) } catch { /* the address bar has it */ }
    close()
  }
  const dataLinks = $derived(model.indicators.flatMap(i => i.collections
    .filter(c => model.places.some(p => valuesCollsOf(p).includes(c.coll)))
    .map(c => ({ key: i.id + c.coll, label: `${i.short} (${c.coll})`, href: catalog.base + c.path }))))

  // the SanctuaryWatch bundle: every place x indicator's values are read, the ones with a year-grain iea-sd or names-pct status
  // become folders of the job's files plus a figure.svg and figure.png, in one ZIP (swExport.ts, loaded now, not before)
  let swBusy = $state(false)
  let swNote = $state<{ text: string; left: string[] } | null>(null)
  async function exportSw() {
    if (swBusy) return
    swBusy = true
    swNote = { text: 'Reading the records for the SanctuaryWatch bundle…', left: [] }
    try {
      const sw = await import('./swExport.ts')
      const pairs = model.places.flatMap(place => model.indicators.filter(ind => pickRow(idx, place.id, ind)?.last_value != null).map(ind => ({ place, ind })))
      const results = await new Promise<Map<string, CellResult>>(res => {
        if (!pairs.length) return res(new Map())
        loadCells(catalog, idx, spec, pairs, r => { if (r.size >= pairs.length) res(r) })
      })
      const plan = sw.planSwBundle(model.places, model.indicators, results, { catalog, spec, permalink: (p, i) => absolute(placeHref(view, p.id, p.coll, i.id)) })
      const left = plan.skipped.map(x => `${x.place} · ${x.indicator}: ${x.why}`)
      if (!plan.figures.length) { swNote = { text: 'Nothing to export: the bundle holds the year-grain iea-sd and names-pct statuses, and this report has none.', left }; return }
      swNote = { text: `Drawing ${plan.figures.length} ${plan.figures.length === 1 ? 'figure' : 'figures'}…`, left: [] }
      const z = await sw.buildSwZip(plan)
      downloadBlob(z.blob, z.name)
      swNote = {
        text: `${z.name}: ${z.figures} ${z.figures === 1 ? 'figure' : 'figures'}${z.noPng ? `, ${z.noPng} without a PNG (this browser could not draw it; the folder has the SVG)` : ''}${left.length ? `; ${left.length} place × indicator ${left.length === 1 ? 'pair' : 'pairs'} left out` : ''}.`,
        left,
      }
    } catch (e) {
      swNote = { text: `The bundle could not be built: ${e instanceof Error ? e.message : String(e)}`, left: [] }
    } finally {
      swBusy = false
    }
  }

  // ---- print: light colours whatever the theme, the app chrome hidden (styles below) ----
  const root = typeof document === 'undefined' ? null : document.documentElement
  let saved: string | undefined
  const light = () => { printing = true; if (root && saved === undefined) { saved = root.dataset.theme ?? 'light'; root.dataset.theme = 'light'; root.style.colorScheme = 'light' } }
  const back = () => { printing = false; if (root && saved !== undefined) { root.dataset.theme = saved; root.style.colorScheme = saved; saved = undefined } }

  // the cards of every category and the entries of a dossier are mounted first and given a moment to load their values; the
  // light theme is switched on now, so the maps draw in it and take their picture (printHooks.ts), then the browser prints
  async function printNow() {
    light()
    await tick()
    for (let n = 0; n < 40 && document.querySelector('.rv [aria-busy="true"]'); n++) await new Promise(r => setTimeout(r, 250))
    await runPrintPrep()
    window.print()
  }

  onMount(() => {
    document.body.classList.add('rp-on')
    const mq = matchMedia('print')
    const onmq = (e: MediaQueryListEvent) => (e.matches ? light() : back())
    window.addEventListener('beforeprint', light)
    window.addEventListener('afterprint', back)
    mq.addEventListener('change', onmq)
    tick().then(() => window.scrollTo(0, 0))
    return () => {
      document.body.classList.remove('rp-on')
      window.removeEventListener('beforeprint', light)
      window.removeEventListener('afterprint', back)
      mq.removeEventListener('change', onmq)
      back()
    }
  })
</script>

<div class="rv" data-layout={spec.layout} data-depth={view.depth}>
  <div class="print-head">
    <h1>{title}</h1>
    <p>{summaryLine(spec, model.places.length, model.indicators.length)}</p>
    <p>Permalink: {permalink}</p>
    <p>Report id <code>{id}</code> · manifest {catalog.manifest.version}</p>
  </div>

  <header class="bar">
    <div class="ttl">
      <span class="mbon-label">Report</span>
      <h2 class="om-h2" bind:this={head} tabindex="-1">{title}</h2>
      <p class="sum om-note" role="status">{summaryLine(spec, model.places.length, model.indicators.length)}</p>
    </div>
    <div class="acts om-row">
      <Button variant="quiet" size="sm" pressed={editing} onclick={() => (editing = !editing)}><Icon name="ui-settings" size={16} />{editing ? 'Close builder' : 'Edit'}</Button>
      <Menu label="Export" align="end">
        {#snippet children(close)}
          <button type="button" onclick={() => { saveJson(); close() }}>report.json</button>
          <button type="button" onclick={() => copyLink(close)}>Copy permalink</button>
          <button type="button" onclick={() => { close(); printNow() }}>Print or save as PDF</button>
          <button type="button" disabled={swBusy} onclick={() => { close(); exportSw() }}>SanctuaryWatch bundle (zip)</button>
        {/snippet}
      </Menu>
    </div>
  </header>

  {#if editing}
    <Builder {catalog} {idx} {spec} {model} vocab={view.vocab} depth={view.depth} {titles} {layers} {split} onspec={setSpec} onview={setView} onfix={fix}
      onunsplit={() => setSpec({ ...spec, split: null })} ondone={() => { editing = false; head?.focus({ preventScroll: true }) }} />
  {:else if !model.budget.ok || split}
    <Fixes layout={spec.layout} budget={model.budget} {split} onfix={fix} onunsplit={() => setSpec({ ...spec, split: null })} />
  {/if}

  {#if swNote}
    <div class="swn" role="status">
      <p>{swNote.text}</p>
      {#if swNote.left.length}
        <details><summary>{swNote.left.length} left out and why</summary><ul>{#each swNote.left as l (l)}<li>{l}</li>{/each}</ul></details>
      {/if}
      {#if !swBusy}<button type="button" class="x" onclick={() => (swNote = null)}>Dismiss</button>{/if}
    </div>
  {/if}

  {#if model.places.length === 0 || model.indicators.length === 0}
    <Notice kind="warn">Nothing to show: no chosen place has a value for a chosen indicator. Open the builder to choose others.</Notice>
  {:else if !showBody}
    <Notice kind="info">The report is too large for {info.title} as it is. Use one of the fixes above, or open the builder.</Notice>
  {/if}

  {#if showBody}
    {#if spec.layout !== 'map-sheet' && LocatorMap}
      <LocatorMap places={model.places} indexPlaces={idx.places} {titles} {layers} />
    {/if}
    {#each sections as s, n (n)}
      <section class="sec om-stack" aria-label={s.title ?? 'Report'}>
        {#if spec.layout === 'cards'}
          {#if s.title && split === 'category'}<h3 class="st om-st">{s.title}</h3>{/if}
          <CardsLayout {catalog} {idx} {spec} places={s.places} groups={s.groups} depth={view.depth} vocab={view.vocab} {titles} placeHref={linkToPlace} all={printing} />
        {:else if spec.layout === 'scorecard'}
          <ScoreCard {catalog} {idx} {spec} places={s.places} groups={s.groups} depth={view.depth} vocab={view.vocab} {titles} placeHref={linkToPlace} heading={s.title} {axes} />
        {:else if spec.layout === 'small-multiples'}
          <SmallMultiples {catalog} {idx} {spec} places={s.places} groups={s.groups} depth={view.depth} placeHref={linkToPlace} heading={s.title} {axes}
            onyaxis={y => setSpec({ ...spec, yaxis: y })} />
        {:else if spec.layout === 'quad'}
          <QuadPlot {catalog} {idx} {spec} places={s.places} groups={s.groups} depth={view.depth} placeHref={linkToPlace} heading={s.title} {axes} />
        {:else if spec.layout === 'map-sheet'}
          {#if MapSheet}
            <MapSheet {catalog} {idx} places={s.places} groups={s.groups} {titles} placeHref={linkToPlace} heading={s.title} />
          {:else}
            <p class="status om-note" role="status">Loading the map…</p>
          {/if}
        {:else}
          <Dossier {catalog} {idx} {spec} places={s.places} groups={s.groups} depth={view.depth} {titles} placeHref={linkToPlace} all={printing} />
        {/if}
      </section>
    {/each}
    {#if split && spec.layout === 'scorecard'}
      <p class="small">Statuses are relative to each place's own record, not better or worse.</p>
    {/if}
  {/if}

  {#if model.empties.length > 0}
    <p class="empties">
      <span>{model.empties.length} {model.empties.length === 1 ? 'cell has' : 'cells have'} no values.</span>
      <a href={request} target="_blank" rel="noopener">Request {model.empties.length === 1 ? 'it' : 'them'} (a prefilled GitHub issue)</a>
    </p>
  {/if}

  {#if view.depth === 'dive'}
    <section class="dive" aria-label="Report configuration">
      <h3 class="mbon-label">Configuration</h3>
      <p class="id om-meta">Report id <code>{id}</code> = hash of this spec with manifest <code>{catalog.manifest.version}</code></p>
      <div class="jh"><span class="mbon-label">report.json</span><CopyButton text={json} label="Copy spec" /></div>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <pre class="json" tabindex="0" aria-label="report.json">{json}</pre>
      <h3 class="mbon-label">Data</h3>
      <ul class="links">
        {#each dataLinks as l (l.key)}<li><a href={l.href}>{l.label}</a></li>{/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .rv { display: grid; gap: var(--space-4); min-width: 0; }
  .print-head { display: none; }
  .bar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: var(--space-3); }
  .ttl { display: grid; gap: var(--space-1); min-width: 0; }
  .swn { display: grid; gap: var(--space-2); padding: var(--space-3) var(--space-4); background: var(--bg-tint); border-radius: var(--radius-md); font: var(--type-small); color: var(--text-strong); }
  .swn p { margin: 0; overflow-wrap: anywhere; }
  .swn ul { margin: var(--space-1) 0 0; padding-left: var(--space-5); color: var(--text-body); }
  .swn .x { justify-self: start; border: 0; background: none; padding: 0; cursor: pointer; color: var(--link); font: inherit; text-decoration: underline; }
  .small, .empties { margin: 0; font: var(--type-small); color: var(--text-body); }
  .empties { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-3); }
  .dive { display: grid; gap: var(--space-2); padding: var(--space-4); background: var(--bg-tint); border-radius: var(--radius-md); min-width: 0; }
  .dive h3 { margin: var(--space-2) 0 0; }
  .jh { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
  .json { margin: 0; max-height: 18rem; overflow: auto; padding: var(--space-3); background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-sm); font: var(--fw-regular) 0.75rem / 1.4 var(--font-mono); color: var(--text-strong); }
  .links { margin: 0; padding-left: var(--space-5); font: var(--type-small); columns: 2 18rem; }
  .links a { overflow-wrap: anywhere; }
  code { font-family: var(--font-mono); }

  /* print: no header, nav or footer, the title with its permalink and id on top, light tokens (the theme is switched to
     light for the print job), cards kept whole, scorecard header rows repeated on every page */
  @media print {
    :global(body.rp-on .mbon-header), :global(body.rp-on .om-header), :global(body.rp-on .mbon-footer), :global(body.rp-on nav.views) { display: none !important; }
    :global(body.rp-on) { background: var(--bg-surface); }
    .print-head { display: block; margin-bottom: var(--space-3); }
    .print-head h1 { margin: 0 0 var(--space-1); font: var(--fw-bold) var(--text-xl) / 1.15 var(--font-display); color: var(--text-strong); }
    .print-head p { margin: 0; font: var(--type-small); color: var(--text-body); overflow-wrap: anywhere; }
    .bar, .empties, .swn, .dive :global(button) { display: none; }
    :global(.rv .card), :global(.rv .pc), :global(.rv .heads li) { break-inside: avoid; }
    :global(.rv thead) { display: table-header-group; }
    :global(.rv tr) { break-inside: avoid; }
    :global(.rv .box) { max-height: none !important; overflow: visible !important; }
  }
</style>
