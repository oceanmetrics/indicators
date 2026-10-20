<script lang="ts">
  // the Report view: a spec (places x indicators in a layout), its builder and its layout. the spec lives in the URL hash
  // (src/report/spec.ts keys), so every report is a permalink; every change goes out through onpatch({ spec }).
  // the report is the spec expanded against this catalog and gated by coverage (report.ts); the layouts draw it.
  import { onMount, tick } from 'svelte'
  import { Button, Menu, Notice } from '@marinebon/ui'
  import { Icon } from '../../../../src/icons/index.ts'
  import { LAYOUTS, budgetLine, specId, specJson, specParams } from '../../../../src/report/spec.ts'
  import type { Fix, ReportSpec } from '../../../../src/report/spec.ts'
  import type { Catalog, VocabId } from '../data.ts'
  import { downloadBlob } from '../download.ts'
  import { placeHref, reportHref } from '../hash.ts'
  import type { Depth, ViewState } from '../hash.ts'
  import { indexCoverage } from '../matrix.ts'
  import CopyButton from '../CopyButton.svelte'
  import { availablePresets, PRESETS } from './presets.ts'
  import { buildReport, reportTitle, requestHref, summaryLine } from './report.ts'
  import { collapseToLeads } from './tree.ts'
  import Builder from './Builder.svelte'
  import CardsLayout from './CardsLayout.svelte'
  import Fixes from './Fixes.svelte'
  import ScoreCard from './ScoreCard.svelte'

  interface Props {
    catalog: Catalog
    view: ViewState
    titles: (coll: string) => string
    onpatch: (p: Partial<ViewState>) => void
  }
  let { catalog, view, titles, onpatch }: Props = $props()

  const spec = $derived(view.spec)
  const idx = $derived(indexCoverage(catalog.coverage, catalog.manifest.indicators))
  const model = $derived(buildReport(catalog, idx, spec, view.vocab))
  const info = $derived(LAYOUTS[spec.layout])
  const title = $derived(reportTitle(spec))
  const drawn = $derived(spec.layout === 'cards' || spec.layout === 'scorecard')

  let editing = $state(false)
  let split = $state<'place' | 'category' | null>(null)
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
    else if (f.kind === 'split') split = f.by
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
  const showBody = $derived(drawn && (model.budget.ok || split != null) && model.places.length > 0 && model.indicators.length > 0)

  // ---- links ----
  const permalink = $derived(typeof location === 'undefined' ? '' : location.origin + location.pathname + location.search + reportHref(view, spec))
  const linkToPlace = (id: string, coll: string) => placeHref(view, id, coll)
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
    .filter(c => model.places.some(p => p.coll === c.coll))
    .map(c => ({ key: i.id + c.coll, label: `${i.short} (${c.coll})`, href: catalog.base + c.path }))))

  // the cards of every category are mounted first and given a moment to load their values, then the browser prints
  async function printNow() {
    printing = true
    await tick()
    for (let n = 0; n < 40 && document.querySelector('.rv article.card[aria-busy="true"]'); n++) await new Promise(r => setTimeout(r, 250))
    window.print()
  }

  // ---- print: light colours whatever the theme, the app chrome hidden (styles below) ----
  onMount(() => {
    document.body.classList.add('rp-on')
    const root = document.documentElement
    let saved: string | undefined
    const light = () => { printing = true; if (saved === undefined) { saved = root.dataset.theme ?? 'light'; root.dataset.theme = 'light'; root.style.colorScheme = 'light' } }
    const back = () => { printing = false; if (saved !== undefined) { root.dataset.theme = saved; root.style.colorScheme = saved; saved = undefined } }
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
      <h2 bind:this={head} tabindex="-1">{title}</h2>
      <p class="sum" role="status">{summaryLine(spec, model.places.length, model.indicators.length)}</p>
    </div>
    <div class="acts">
      <Button variant="quiet" size="sm" pressed={editing} onclick={() => (editing = !editing)}><Icon name="ui-settings" size={16} />{editing ? 'Close builder' : 'Edit'}</Button>
      <Menu label="Export" align="end">
        {#snippet children(close)}
          <button type="button" onclick={() => { saveJson(); close() }}>report.json</button>
          <button type="button" onclick={() => copyLink(close)}>Copy permalink</button>
          <button type="button" onclick={() => { close(); printNow() }}>Print or save as PDF</button>
          <button type="button" disabled>SanctuaryWatch bundle (next)</button>
        {/snippet}
      </Menu>
    </div>
  </header>

  {#if editing}
    <Builder {catalog} {idx} {spec} {model} vocab={view.vocab} depth={view.depth} {titles} {split} onspec={setSpec} onview={setView} onfix={fix}
      onunsplit={() => (split = null)} ondone={() => { editing = false; head?.focus({ preventScroll: true }) }} />
  {:else if !model.budget.ok || split}
    <Fixes layout={spec.layout} budget={model.budget} {split} onfix={fix} onunsplit={() => (split = null)} />
  {/if}

  {#if !drawn}
    <Notice kind="info">{info.title} is coming next. Your selection stays in the link: {budgetLine(spec.layout, model.budget)}.</Notice>
  {:else if model.places.length === 0 || model.indicators.length === 0}
    <Notice kind="warn">Nothing to show: no chosen place has a value for a chosen indicator. Open the builder to choose others.</Notice>
  {:else if !showBody}
    <Notice kind="info">The report is too large for {info.title} as it is. Use one of the fixes above, or open the builder.</Notice>
  {/if}

  {#if showBody}
    {#each sections as s, n (n)}
      <section class="sec" aria-label={s.title ?? 'Report'}>
        {#if spec.layout === 'cards'}
          {#if s.title && split === 'category'}<h3 class="st">{s.title}</h3>{/if}
          <CardsLayout {catalog} {idx} {spec} places={s.places} groups={s.groups} depth={view.depth} vocab={view.vocab} {titles} placeHref={linkToPlace} all={printing} />
        {:else}
          <ScoreCard {catalog} {idx} {spec} places={s.places} groups={s.groups} depth={view.depth} vocab={view.vocab} {titles} placeHref={linkToPlace} heading={s.title} />
        {/if}
      </section>
    {/each}
    {#if split && spec.layout === 'scorecard'}
      <p class="small">Statuses are relative to each place's own record, not better or worse.</p>
    {/if}
  {/if}

  {#if drawn && model.empties.length > 0}
    <p class="empties">
      <span>{model.empties.length} {model.empties.length === 1 ? 'cell has' : 'cells have'} no values.</span>
      <a href={request} target="_blank" rel="noopener">Request {model.empties.length === 1 ? 'it' : 'them'} (a prefilled GitHub issue)</a>
    </p>
  {/if}

  {#if view.depth === 'dive'}
    <section class="dive" aria-label="Report configuration">
      <h3 class="mbon-label">Configuration</h3>
      <p class="id">Report id <code>{id}</code> = hash of this spec with manifest <code>{catalog.manifest.version}</code></p>
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
  h2 { margin: 0; font: var(--fw-bold) var(--text-xl) / 1.15 var(--font-display); color: var(--text-strong); text-wrap: balance; }
  h2:focus, h2:focus-visible { outline: none; }
  .sum { margin: 0; font: var(--type-small); color: var(--text-body); }
  .acts { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .sec { display: grid; gap: var(--space-3); min-width: 0; }
  .st { margin: 0; font: var(--fw-semibold) var(--text-md) / 1.25 var(--font-display); color: var(--text-strong); }
  .small, .empties { margin: 0; font: var(--type-small); color: var(--text-body); }
  .empties { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-3); }
  .dive { display: grid; gap: var(--space-2); padding: var(--space-4); background: var(--bg-tint); border-radius: var(--radius-md); min-width: 0; }
  .dive h3 { margin: var(--space-2) 0 0; }
  .id { margin: 0; font: var(--type-small); color: var(--text-body); overflow-wrap: anywhere; }
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
    .bar, .empties, .dive :global(button) { display: none; }
    :global(.rv .card), :global(.rv .pc), :global(.rv .heads li) { break-inside: avoid; }
    :global(.rv thead) { display: table-header-group; }
    :global(.rv tr) { break-inside: avoid; }
    :global(.rv .box) { max-height: none !important; overflow: visible !important; }
  }
</style>
