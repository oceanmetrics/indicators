<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { Button, Header, Notice } from '@marinebon/ui'
  import { Icon } from '../../src/icons/index.ts'
  import { loadCatalog, loadLayers, resolveDataBase, collTitle } from './lib/data.ts'
  import type { Catalog, Indicator, Layers } from './lib/data.ts'
  import { DEFAULT_STATE, groupHref, mapHref, mapToMatrixHref, matrixHref, matrixToMapHref, parseHash, placeHref, placeToMapHref, reportHref, serializeHash } from './lib/hash.ts'
  import { DEFAULT_SPEC } from '../../src/report/spec.ts'
  import type { ViewState } from './lib/hash.ts'
  import { cellModel, groupColumns, groupRows, indexCoverage, matrixStats, pickRow, shownGroups, withValues } from './lib/matrix.ts'
  import { producerCredits } from './lib/delivery.ts'
  import { APP_NAME, TAGLINE, pageTitle } from './lib/brand/brand.ts'
  import type { Brand } from './lib/brand/brand.ts'
  import OmHeader from './lib/brand/OmHeader.svelte'
  import AppFooter from './lib/AppFooter.svelte'
  import Toolbar from './lib/Toolbar.svelte'
  import Matrix from './lib/Matrix.svelte'
  import MatrixLegend from './lib/MatrixLegend.svelte'
  import Drawer from './lib/Drawer.svelte'
  import ViewNav from './lib/ViewNav.svelte'
  import { placeCoverage } from './lib/place.ts'
  import { computedGroups } from './lib/nextSteps.ts'
  import { leadForGroup } from './lib/map/pick.ts'
  import { matrixToSpec } from './lib/report/fromMatrix.ts'
  import { SOURCE_HREF } from './lib/credits.ts'

  let { brand }: { brand: Brand } = $props()

  let phase = $state<'loading' | 'done' | 'error'>('loading')
  let error = $state('')
  let catalog = $state.raw<Catalog | null>(null)
  let layers = $state<Layers>({})
  let loadMs = $state<number | null>(null)
  let view = $state<ViewState>(parseHash(typeof location !== 'undefined' ? location.hash : ''))

  // the Place view is its own chunk: the Matrix never pays for the charts, the CSV or the Parquet writer
  let PlaceView = $state.raw<typeof import('./lib/PlaceView.svelte').default | null>(null)
  // the Map view is its own chunk too (MapLibre)
  let MapView = $state.raw<typeof import('./lib/map/MapView.svelte').default | null>(null)
  // and the Report view (builder and layouts)
  let ReportView = $state.raw<typeof import('./lib/report/ReportView.svelte').default | null>(null)
  // the Matrix state the reader left to open a place, so "Back to the matrix" can restore it; null on a cold permalink
  let cameFrom = $state.raw<ViewState | null>(null)
  // the last Matrix and Map states, so the view switch returns to each as it was left
  let lastMatrix = $state.raw<ViewState | null>(null)
  let lastMap = $state.raw<ViewState | null>(null)
  let lastReport = $state.raw<ViewState | null>(null)
  $effect(() => {
    if (view.view === 'matrix') lastMatrix = view
    else if (view.view === 'map') lastMap = view
    else if (view.view === 'report') lastReport = view
  })
  // the view switch carries the context: Matrix -> Map opens the group and the indicator of the last opened cell, Map -> Matrix the
  // Map's group (and the cell of the selected place), Place -> Map the place's group and opened indicator with the place selected
  let lastCell = $state.raw<{ place: string; indicator: string } | null>(null)
  $effect(() => { if (view.view === 'matrix' && view.cell) lastCell = view.cell })
  const firstLead = (group: string) => (catalog ? leadForGroup(catalog.manifest.indicators, catalog.coverage, group)?.id ?? null : null)
  const placeOf = (id: string) => idx?.places.find(p => p.id === id) ?? null
  const navMatrix = $derived(
    view.view === 'map' ? mapToMatrixHref(view, view.coll, view.ind, view.place)
      : '#' + serializeHash(lastMatrix ?? { ...DEFAULT_STATE, vocab: view.vocab, depth: view.depth }),
  )
  const navReport = $derived(lastReport ? '#' + serializeHash(lastReport) : reportHref(view, DEFAULT_SPEC))
  const navMap = $derived.by(() => {
    if (view.view === 'matrix') {
      const p = lastCell ? placeOf(lastCell.place) : null
      return matrixToMapHref(view, groups, lastCell && p ? { indicator: lastCell.indicator, group: p.coll } : null, firstLead)
    }
    if (view.view === 'place') {
      const p = view.place ? placeOf(view.place) : null
      if (p) return placeToMapHref(view, p, view.ind, firstLead)
    }
    return lastMap ? '#' + serializeHash(lastMap) : mapHref(view, null)
  })
  // when the Place view was entered (0 on a cold page), and how long its lead cards took
  let placeT0 = $state(0)
  let placeMs = $state<number | null>(null)

  const title = (coll: string) => collTitle(coll, layers, catalog?.manifest.place_sets)
  const total = (coll: string) => layers[coll]?.n ?? null
  const patch = (p: Partial<ViewState>) => { view = { ...view, ...p } }

  // ---- derived tables ----
  const idx = $derived(catalog ? indexCoverage(catalog.coverage) : null)
  // the groups on display: those asked for, else the sanctuaries (every group while searching)
  const groups = $derived(idx ? shownGroups(idx.colls, view.colls, view.q, catalog?.manifest.place_sets) : [])
  const allCols = $derived(catalog
    ? groupColumns(catalog.manifest.indicators, catalog.manifest.vocabularies, view.vocab, view.leads, { add: view.addInds, hide: view.hideInds })
    : [])
  const rows = $derived(idx ? groupRows(idx, groups, view.q, view.hidePlaces) : [])
  // an indicator with no value for any place on display is hidden, unless the reader asks for it or added it by hand
  const cols = $derived(idx && !view.showEmpty ? withValues(allCols, rows, idx, view.addInds) : allCols)
  const nHidden = $derived(allCols.reduce((n, g) => n + g.indicators.length, 0) - cols.reduce((n, g) => n + g.indicators.length, 0))
  const shown = $derived(new Set(cols.flatMap(g => g.indicators.map(i => i.id))))
  const displayed = $derived(rows.flatMap(g => g.places))
  const stats = $derived(idx ? matrixStats(rows, cols, idx) : null)
  const credits = $derived(catalog ? producerCredits(catalog.manifest) : [])
  // "Report" in the Matrix toolbar: what the Matrix shows now, as a report spec
  const matrixReportHref = $derived(catalog && idx && view.view === 'matrix' ? reportHref(view, matrixToSpec({ ...view, colls: groups }, { idx, indicators: catalog.manifest.indicators })) : '')
  const opened = $derived.by(() => {
    if (!catalog || !idx || !view.cell) return null
    const ind: Indicator | undefined = catalog.manifest.indicators.find(i => i.id === view.cell!.indicator)
    const place = idx.places.find(p => p.id === view.cell!.place)
    return ind && place ? { ind, place, model: cellModel(ind, place, pickRow(idx, place.id, ind)) } : null
  })

  // ---- the URL hash is the state ----
  $effect(() => {
    const h = serializeHash(view)
    if (h !== location.hash.replace(/^#/, '')) {
      history.replaceState(null, '', location.pathname + location.search + (h ? '#' + h : ''))
    }
  })
  function onHashChange() {
    const next = parseHash(location.hash)
    if (serializeHash(next) === serializeHash(view)) return
    const was = view
    if (was.view === 'matrix' && next.view === 'place') { cameFrom = was; placeT0 = performance.now(); placeMs = null }
    view = next
    // back from a place: scroll to it and put focus on its row header
    // (a Matrix that reopens a cell puts focus in its drawer, and Esc returns it to the cell)
    if (was.view === 'place' && next.view === 'matrix' && was.place && !next.cell) {
      tick().then(() => {
        const a = [...document.querySelectorAll<HTMLAnchorElement>('a.pn')].find(x => x.dataset.place === was.place)
        a?.scrollIntoView({ block: 'nearest' })
        a?.focus({ preventScroll: true })
      })
    } else if (next.view !== was.view || next.place !== was.place) {
      window.scrollTo(0, 0)
    }
  }

  // ---- the page title: "<view> · Ocean Metrics Indicators" (or "· MBON") ----
  const placeName = $derived(catalog && view.view === 'place' ? placeCoverage(catalog.coverage, view.place ?? '').place?.name ?? view.place : null)
  $effect(() => { document.title = pageTitle(brand, view.view === 'place' ? (placeName ?? 'Place') : view.view === 'map' ? 'Map' : view.view === 'report' ? (view.spec.title ?? 'Report') : 'Matrix') })
  $effect(() => {
    if (view.view === 'place' && !PlaceView) import('./lib/PlaceView.svelte').then(m => { PlaceView = m.default })
    if (view.view === 'map' && !MapView) import('./lib/map/MapView.svelte').then(m => { MapView = m.default })
    if (view.view === 'report' && !ReportView) import('./lib/report/ReportView.svelte').then(m => { ReportView = m.default })
  })
  // "Matrix" in the Place view's breadcrumb: back to the Matrix the reader came from, with the drawer open on the cell they opened this place from
  const backHref = $derived(matrixHref(
    cameFrom,
    { vocab: view.vocab, depth: view.depth, coll: catalog && view.place ? placeCoverage(catalog.coverage, view.place).place?.coll ?? null : null },
    view.place && view.ind ? { place: view.place, indicator: view.ind } : null,
  ))
  const linkToPlace = (placeId: string, coll: string) => placeHref(view, placeId, coll)

  // ---- removing from the display ----
  // an indicator added beyond the leads is taken back out of the additions; any other goes on the removed list
  function hide(kind: 'place' | 'indicator', id: string) {
    if (kind === 'place') patch({ hidePlaces: [...new Set([...view.hidePlaces, id])] })
    else if (view.addInds.includes(id)) patch({ addInds: view.addInds.filter(x => x !== id) })
    else patch({ hideInds: [...new Set([...view.hideInds, id])] })
  }

  // ---- the drawer ----
  const open = (place: string, indicator: string) => patch({ cell: { place, indicator } })
  async function close() {
    const was = view.cell
    patch({ cell: null })
    await tick()
    if (!was) return
    const btn = [...document.querySelectorAll<HTMLButtonElement>('button.cell')].find(b => b.dataset.place === was.place && b.dataset.ind === was.indicator)
    btn?.focus()
  }

  onMount(async () => {
    const t0 = performance.now()
    try {
      catalog = await loadCatalog(resolveDataBase(location.search, import.meta.env.DEV))
      loadMs = Math.round(performance.now() - t0)
      phase = 'done'
      loadLayers().then(l => { layers = l })
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      phase = 'error'
    }
  })

  const issueHref = `${SOURCE_HREF}/issues/new`
</script>

<svelte:window onhashchange={onHashChange} />

{#snippet lensWord()}{view.view}{/snippet}
{#snippet helpItems(close: () => void)}
  <button type="button" onclick={() => { document.getElementById('legend')?.scrollIntoView({ block: 'start' }); close() }}>How to read a cell</button>
  <a href={SOURCE_HREF} target="_blank" rel="noopener">Source on GitHub</a>
  <a href={issueHref} target="_blank" rel="noopener">Feedback (GitHub issue)</a>
  {#if catalog}<a href={catalog.base + 'indicators.json'} target="_blank" rel="noopener">Manifest (indicators.json)</a>{/if}
{/snippet}
{#snippet feedback()}<span class="fb"><Button variant="quiet" size="sm" href={issueHref} target="_blank">Feedback</Button></span>{/snippet}

{#if brand === 'mbon'}
  <Header appName={APP_NAME} tagline={TAGLINE} lens={lensWord} help={helpItems} {feedback} />
{:else}
  <OmHeader appName="Indicators" tagline={TAGLINE} lens={lensWord} help={helpItems} {feedback} />
{/if}

<main class="lens" data-state={phase} data-brand={brand}>
  <div class="wrap">
    <h1 class="mbon-sr-only">{APP_NAME}: {view.view === 'place' ? `${placeName} (place view)` : view.view === 'map' ? 'map of one indicator' : view.view === 'report' ? 'report' : 'places by indicators'}</h1>
    {#if catalog}<ViewNav current={view.view} matrixHref={navMatrix} mapHref={navMap} reportHref={navReport} {placeName} />{/if}
    {#if phase === 'loading'}
      <p class="status" role="status">Loading the manifest and the coverage table…</p>
    {:else if phase === 'error'}
      <Notice kind="error">Could not load the catalog: {error}. Use <code>?data=&lt;base URL&gt;</code> to point at another one.</Notice>
    {:else if catalog && view.view === 'place'}
      {#if PlaceView}
        {#key view.place}<PlaceView {catalog} {view} titles={title} idxAll={idx!} {layers} {backHref} onpatch={patch} onready={ms => (placeMs = ms)} t0={placeT0} />{/key}
      {:else}
        <p class="status" role="status">Loading the place view…</p>
      {/if}
    {:else if catalog && view.view === 'map'}
      {#if MapView}
        <MapView {catalog} {view} titles={title} {idx} {layers} onpatch={patch} />
      {:else}
        <p class="status" role="status">Loading the map…</p>
      {/if}
    {:else if catalog && view.view === 'report'}
      {#if ReportView}
        <ReportView {catalog} {view} titles={title} {layers} onpatch={patch} />
      {:else}
        <p class="status" role="status">Loading the report…</p>
      {/if}
    {:else if catalog && idx}
      <Toolbar {view} {idx} {layers} {groups} sets={catalog.manifest.place_sets} onchange={patch} indicators={catalog.manifest.indicators} vocabs={catalog.manifest.vocabularies} {shown} {displayed} reportHref={matrixReportHref} />
      <p class="summary" role="status" aria-live="polite">
        <Icon name="view-matrix" size={18} />
        <span>
          {stats?.places} places × {stats?.indicators} indicators ·
          {stats?.withValue} of {stats?.cells} cells have a value · {stats?.withStatus} have a status{#if nHidden}
          · {nHidden} {nHidden === 1 ? 'indicator' : 'indicators'} hidden: no value here{/if}
        </span>
      </p>
      <MatrixLegend vocab={view.vocab} />
      <Matrix {catalog} {idx} {cols} {rows} vocab={view.vocab} depth={view.depth} axes={view.axes} titles={title} totals={total} open={view.cell} onopen={open}
        onhide={hide} placeHref={linkToPlace} />
    {/if}
  </div>
</main>

<AppFooter {brand} {credits} version={catalog?.manifest.version ?? '…'} {loadMs} {placeMs} />

{#if opened && catalog && view.view === 'matrix'}
  <Drawer {catalog} ind={opened.ind} place={opened.place} model={opened.model} depth={view.depth} vocab={view.vocab}
    collTitle={title(opened.place.coll)} groups={opened.model.kind === 'na' && idx ? computedGroups(idx, opened.ind) : []} titles={title}
    groupHref={c => groupHref(view, c)} onclose={close} />
{/if}

<style>
  .lens { flex: 1; }
  .wrap { display: grid; gap: var(--space-4); padding: var(--space-4) max(var(--space-4), env(safe-area-inset-right, 0px)) var(--space-6) max(var(--space-4), env(safe-area-inset-left, 0px)); max-width: var(--container-wide); margin: 0 auto; min-width: 0; }
  .status { margin: 0; color: var(--text-body); }
  .summary { display: flex; align-items: center; gap: var(--space-2); margin: 0; font: var(--type-small); color: var(--text-body); }
  .summary :global(svg) { color: var(--label-color); }
  @media (max-width: 640px) {
    .fb { display: none; }
    .wrap { padding-inline: var(--space-3); gap: var(--space-3); }
  }
</style>
