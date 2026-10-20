<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { Button, Header, Notice } from '@marinebon/ui'
  import { Icon } from '../../src/icons/index.ts'
  import { loadCatalog, loadLayerTitles, resolveDataBase, collTitle } from './lib/data.ts'
  import type { Catalog, Indicator } from './lib/data.ts'
  import { DEFAULT_STATE, mapHref, matrixHref, parseHash, placeHref, reportHref, serializeHash } from './lib/hash.ts'
  import { DEFAULT_SPEC } from '../../src/report/spec.ts'
  import type { ViewState } from './lib/hash.ts'
  import { cellModel, groupColumns, groupRows, hiddenPlaces, indexCoverage, matrixStats, pickRow } from './lib/matrix.ts'
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
  import { SOURCE_HREF } from './lib/credits.ts'

  let { brand }: { brand: Brand } = $props()

  let phase = $state<'loading' | 'done' | 'error'>('loading')
  let error = $state('')
  let catalog = $state.raw<Catalog | null>(null)
  let gazetteer = $state<Record<string, string>>({})
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
  const navMatrix = $derived('#' + serializeHash(lastMatrix ?? { ...DEFAULT_STATE, vocab: view.vocab, depth: view.depth }))
  const navReport = $derived(lastReport ? '#' + serializeHash(lastReport) : reportHref(view, DEFAULT_SPEC))
  const navMap = $derived(lastMap ? '#' + serializeHash(lastMap) : mapHref(view, view.view === 'place' ? null : view.cell?.indicator ?? null))
  // when the Place view was entered (0 on a cold page), and how long its lead cards took
  let placeT0 = $state(0)
  let placeMs = $state<number | null>(null)

  const title = (coll: string) => collTitle(coll, gazetteer)
  const patch = (p: Partial<ViewState>) => { view = { ...view, ...p } }

  // ---- derived tables ----
  const idx = $derived(catalog ? indexCoverage(catalog.coverage, catalog.manifest.indicators) : null)
  const cols = $derived(catalog
    ? groupColumns(catalog.manifest.indicators, catalog.manifest.vocabularies, view.vocab, view.leads, { add: view.addInds, hide: view.hideInds })
    : [])
  const rows = $derived(idx ? groupRows(idx, view.colls, view.q, view.hidePlaces) : [])
  const shown = $derived(new Set(cols.flatMap(g => g.indicators.map(i => i.id))))
  const removedPlaces = $derived(idx ? hiddenPlaces(idx, view.hidePlaces) : [])
  const stats = $derived(idx ? matrixStats(rows, cols, idx) : null)
  const collChips = $derived(
    idx ? idx.colls.map(c => ({ id: c, title: title(c), places: idx.places.filter(p => p.coll === c).length })) : [],
  )
  const credits = $derived(catalog ? producerCredits(catalog.manifest) : [])
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
    if (was.view === 'place' && next.view === 'matrix' && was.place) {
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
  const placeName = $derived(catalog && view.view === 'place' ? placeCoverage(catalog.coverage, view.place ?? '', view.coll).place?.name ?? view.place : null)
  $effect(() => { document.title = pageTitle(brand, view.view === 'place' ? (placeName ?? 'Place') : view.view === 'map' ? 'Map' : view.view === 'report' ? (view.spec.title ?? 'Report') : 'Matrix') })
  $effect(() => {
    if (view.view === 'place' && !PlaceView) import('./lib/PlaceView.svelte').then(m => { PlaceView = m.default })
    if (view.view === 'map' && !MapView) import('./lib/map/MapView.svelte').then(m => { MapView = m.default })
    if (view.view === 'report' && !ReportView) import('./lib/report/ReportView.svelte').then(m => { ReportView = m.default })
  })
  const backHref = $derived(matrixHref(cameFrom, { vocab: view.vocab, depth: view.depth, coll: catalog && view.place ? placeCoverage(catalog.coverage, view.place, view.coll).place?.coll ?? null : null }))
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
      loadLayerTitles().then(t => { gazetteer = t })
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
        <PlaceView {catalog} {view} titles={title} {backHref} onpatch={patch} onready={ms => (placeMs = ms)} t0={placeT0} />
      {:else}
        <p class="status" role="status">Loading the place view…</p>
      {/if}
    {:else if catalog && view.view === 'map'}
      {#if MapView}
        <MapView {catalog} {view} titles={title} onpatch={patch} />
      {:else}
        <p class="status" role="status">Loading the map…</p>
      {/if}
    {:else if catalog && view.view === 'report'}
      {#if ReportView}
        <ReportView {catalog} {view} titles={title} onpatch={patch} />
      {:else}
        <p class="status" role="status">Loading the report…</p>
      {/if}
    {:else if catalog && idx}
      <Toolbar view={view} colls={collChips} onchange={patch} indicators={catalog.manifest.indicators} {shown} {removedPlaces} />
      <p class="summary" role="status" aria-live="polite">
        <Icon name="view-matrix" size={18} />
        <span>
          {stats?.places} places × {stats?.indicators} indicators ·
          {stats?.withValue} of {stats?.cells} cells have a value · {stats?.withStatus} have a status
        </span>
      </p>
      <Matrix {catalog} {idx} {cols} {rows} vocab={view.vocab} depth={view.depth} axes={view.axes} titles={title} open={view.cell} onopen={open}
        onhide={hide} placeHref={linkToPlace} />
      <MatrixLegend vocab={view.vocab} />
    {/if}
  </div>
</main>

<AppFooter {brand} {credits} version={catalog?.manifest.version ?? '…'} {loadMs} {placeMs} />

{#if opened && catalog && view.view === 'matrix'}
  <Drawer {catalog} ind={opened.ind} place={opened.place} model={opened.model} depth={view.depth} vocab={view.vocab}
    collTitle={title(opened.place.coll)} onclose={close} />
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
