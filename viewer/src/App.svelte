<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import { Button, Header, Menu, Notice, ThemeToggle, currentTheme, onThemeChange } from '@marinebon/ui'
  import { loadCatalog, loadLayers, resolveDataBase, collTitle } from './lib/data.ts'
  import type { Catalog, Indicator, Layers } from './lib/data.ts'
  import { carryOver, DEFAULT_STATE, groupHref, historyStep, mapToMatrixHref, matrixHref, matrixToMapHref, parseHash, placeToMapHref, serializeHash } from './lib/hash.ts'
  import type { ViewState } from './lib/hash.ts'
  import { indicatorsCustom, placesCustom, usesRank } from '../../src/report/order.ts'
  import type { OrderSpec, Shown } from '../../src/report/order.ts'
  import { expandIndicators, expandPlaces } from '@oceanmetrics/catalog/report'
  import { cellModel, foldColumns, groupColumns, indexCoverage, pageRows, pickRow, ROW_CAP, selectionRollups, selectionRows, statusRank, withValues } from './lib/matrix.ts'
  import { producerCredits } from './lib/delivery.ts'
  import { APP_NAME, TAGLINE, navAttrs, pageTitle } from './lib/brand/brand.ts'
  import type { Brand } from './lib/brand/brand.ts'
  import AppFooter from './lib/AppFooter.svelte'
  import SelectBar from './lib/SelectBar.svelte'
  import Toolbar from './lib/Toolbar.svelte'
  import Matrix from './lib/Matrix.svelte'
  import MatrixLegend from './lib/MatrixLegend.svelte'
  import MatrixBar from './lib/MatrixBar.svelte'
  import Drawer from './lib/Drawer.svelte'
  import ViewNav from './lib/ViewNav.svelte'
  import { placeCoverage } from './lib/place.ts'
  import { computedGroups } from './lib/nextSteps.ts'
  import { loadGazetteerPlaces, placeUniverse, selectionNeedsGazetteer } from './lib/gazetteerPlaces.ts'
  import type { GazetteerPlaces } from './lib/gazetteerPlaces.ts'
  import { groupSelection, includeIndicator, includePlace, namedIndicators, selectionOf, withSelection } from './lib/selection.ts'
  import { SOURCE_HREF } from './lib/credits.ts'
  import { SHORTCUTS } from './lib/keys.ts'
  import { TRY_THESE, tryHref } from './lib/tryThese.ts'

  let { brand }: { brand: Brand } = $props()

  // the shared bar (@oceanmetrics/nav) wears the viewer's resolved theme: the kit writes it to <html data-theme> and announces a change
  let theme = $state(currentTheme())
  onMount(() => onThemeChange(t => (theme = t)))
  const nav = $derived(navAttrs(brand, theme))

  let selectBar = $state<{ showIndicators: () => void } | undefined>()
  // Help ▾ → Keyboard: the shortcuts (lib/keys.ts), a dismissible notice above the view
  let keysOpen = $state(false)
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
  // the view switch carries the selection and the shared keys into the view it opens (each view keeps its own keys as it was left);
  // Matrix -> Map opens the indicator and place of the last opened cell, Map -> Matrix the Map's indicator and selected place as a
  // cell, Place -> Map the place and the indicator opened, with both in the selection
  let lastCell = $state.raw<{ place: string; indicator: string } | null>(null)
  $effect(() => { if (view.view === 'matrix' && view.cell) lastCell = view.cell })
  const carry = (target: ViewState | null, fallback: ViewState) => '#' + serializeHash(carryOver(target ?? fallback, view))
  const navMatrix = $derived(view.view === 'map' ? mapToMatrixHref(view, view.ind, view.place) : carry(lastMatrix, DEFAULT_STATE))
  const navReport = $derived(carry(lastReport, { ...DEFAULT_STATE, view: 'report' }))
  const navMap = $derived.by(() => {
    if (view.view === 'matrix') {
      const c = lastCell
      return matrixToMapHref(view, c && displayed.some(p => p.id === c.place) && selected.some(i => i.id === c.indicator) ? c : null)
    }
    if (view.view === 'place' && view.place) return placeToMapHref(inSelection(view.place, view.ind), view.place, view.ind)
    return carry(lastMap, { ...DEFAULT_STATE, view: 'map' })
  })
  // the state with a place and an indicator in its selection (a place of another group, an indicator that is not a lead: a link to them adds them)
  function inSelection(placeId: string, indicator: string | null): ViewState {
    const place = universe.find(p => p.id === placeId)
    const ind = indicator ? catalog?.manifest.indicators.find(i => i.id === indicator) : null
    return withSelection(view, {
      places: place ? includePlace(view.spec.places, place, sets) : view.spec.places,
      indicators: ind && catalog ? includeIndicator(view.spec.indicators, ind, catalog.manifest.indicators) : view.spec.indicators,
    })
  }
  // when the Place view was entered (0 on a cold page), and how long its lead cards took
  let placeT0 = $state(0)
  let placeMs = $state<number | null>(null)

  const title = (coll: string) => collTitle(coll, layers, catalog?.manifest.place_sets)
  const total = (coll: string) => layers[coll]?.n ?? null
  // a new selection, order or search starts the Matrix on its first page (a removal or a move keeps the page: they pass it)
  const patch = (p: Partial<ViewState>) => {
    const reset = view.view === 'matrix' && !('page' in p) && ('spec' in p || 'q' in p)
    view = { ...view, ...p, ...(reset ? { page: 1 } : {}) }
  }

  // ---- the selection: places and indicators as rules (the hash's pi, px, ii, ix) expanded against this catalog ----
  const sets = $derived(catalog?.manifest.place_sets ?? [])
  const idx = $derived(catalog ? indexCoverage(catalog.coverage) : null)
  // the gazetteer's places (the whole gazetteer in the place picker, rows for places no one has computed) are read the first
  // time the selection or the picker needs them, never for the default selection
  let gaz = $state.raw<GazetteerPlaces | null>(null)
  let gazLoading = $state(false)
  let gazFailed = false
  async function readGazetteer() {
    if (gaz || gazLoading || gazFailed) return
    gazLoading = true
    try { gaz = await loadGazetteerPlaces() } catch { gazFailed = true } finally { gazLoading = false }
  }
  $effect(() => { if (idx && view.view !== 'place' && selectionNeedsGazetteer(view.spec.places, idx, layers, sets)) void readGazetteer() })
  const universe = $derived(idx ? placeUniverse(idx, gaz, layers) : [])
  const chosen = $derived(expandPlaces(view.spec.places, universe, sets))
  const selected = $derived(catalog ? expandIndicators(view.spec.indicators, catalog.manifest.indicators) : [])
  // the order the selection is shown in (the Select section's Order, or a drag): places grouped by collection and indicators by the
  // vocabulary's categories, both A-Z by default
  const order = $derived(view.spec.order)
  // a status sort (most above, most below, most recent) reads the counts of the chosen places by the chosen indicators
  const ranked = $derived(catalog && usesRank(order) ? selectionRollups(catalog.coverage, chosen, selected) : null)
  const rows = $derived(idx ? selectionRows(chosen, idx, view.q, order.places, title, ROW_CAP, ranked ? statusRank(ranked.places) : undefined) : [])
  const allCols = $derived(catalog ? groupColumns(selected, catalog.manifest.vocabularies, view.vocab, order.indicators, ranked ? statusRank(ranked.indicators) : undefined) : [])
  // an indicator with no value for any place on display is hidden, unless the reader asks for it or named it by hand
  const cols = $derived(idx && !view.showEmpty ? withValues(allCols, rows, idx, namedIndicators(view.spec.indicators)) : allCols)
  const nHidden = $derived(allCols.reduce((n, g) => n + g.indicators.length, 0) - cols.reduce((n, g) => n + g.indicators.length, 0))
  const displayed = $derived(rows.flatMap(g => g.places))
  const shownInds = $derived(cols.flatMap(g => g.indicators))
  // the summary above the grid and the counts of each header: the rollups of the places and indicators on display (every page)
  const summary = $derived(catalog ? selectionRollups(catalog.coverage, displayed, shownInds) : null)
  const counts = $derived(summary ? { places: new Map(summary.places.map(r => [r.id, r])), indicators: new Map(summary.indicators.map(r => [r.id, r])) } : undefined)
  // the OBIS series without a status rule fold into one row each (unfold= opens them), and the grid shows 60 places a page (page=)
  const folded = $derived(foldColumns(cols, new Set(view.unfold)))
  const paged = $derived(pageRows(rows, view.page))
  const nFolded = $derived([...folded.folds.values()].reduce((n, f) => n + (f.open ? 0 : f.rest.length), 0))
  const pageHref = (page: number) => '#' + serializeHash({ ...view, page })
  const toggleFold = (series: string) => patch({ unfold: view.unfold.includes(series) ? view.unfold.filter(x => x !== series) : [...view.unfold, series] })
  const setOrder = (o: OrderSpec) => patch({ spec: withSelection(view, { order: o }).spec })
  const credits = $derived(catalog ? producerCredits(catalog.manifest) : [])
  const opened = $derived.by(() => {
    if (!catalog || !idx || !view.cell) return null
    const ind: Indicator | undefined = catalog.manifest.indicators.find(i => i.id === view.cell!.indicator)
    const place = displayed.find(p => p.id === view.cell!.place) ?? universe.find(p => p.id === view.cell!.place)
    return ind && place ? { ind, place, model: cellModel(ind, place, pickRow(idx, place.id, ind)) } : null
  })

  // ---- the URL hash is the state ----
  // the state the history entry holds now: compare on or off and a new view push an entry (hash.ts historyStep), the rest rewrites it
  let written: ViewState = untrack(() => view)
  $effect(() => {
    const h = serializeHash(view)
    if (h !== location.hash.replace(/^#/, '')) {
      const url = location.pathname + location.search + (h ? '#' + h : '')
      if (historyStep(written, view) === 'push') history.pushState(null, '', url)
      else history.replaceState(null, '', url)
    }
    written = view
  })
  function onHashChange() {
    const next = parseHash(location.hash)
    written = next
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
  const placeName = $derived(catalog && view.view === 'place' ? placeCoverage(catalog.coverage, view.place ?? '').place?.name ?? universe.find(p => p.id === view.place)?.name ?? view.place : null)
  $effect(() => { document.title = pageTitle(brand, view.view === 'place' ? (placeName ?? 'Place') : view.view === 'map' ? 'Map' : view.view === 'report' ? (view.spec.title ?? 'Report') : 'Matrix') })
  $effect(() => {
    if (view.view === 'place' && !PlaceView) import('./lib/PlaceView.svelte').then(m => { PlaceView = m.default })
    if (view.view === 'map' && !MapView) import('./lib/map/MapView.svelte').then(m => { MapView = m.default })
    if (view.view === 'report' && !ReportView) import('./lib/report/ReportView.svelte').then(m => { ReportView = m.default })
  })
  // "Matrix" in the Place view's breadcrumb: back to the Matrix the reader came from, with the drawer open on the cell they opened this place from.
  // the Place view carries the selection; on a cold permalink whose selection does not hold the place, the Matrix opens on the place's group
  const backState = $derived.by(() => {
    const p = view.place ? universe.find(x => x.id === view.place) : null
    const coll = p?.coll ?? view.coll
    if (cameFrom || !coll || (p && expandPlaces(view.spec.places, [p], sets).length)) return view
    return withSelection(view, { places: groupSelection(selectionOf(view), coll).places })
  })
  const backHref = $derived(matrixHref(cameFrom, backState, view.place && view.ind ? { place: view.place, indicator: view.ind } : null))

  // ---- removing from the display: a place goes in px, an indicator in ix (or out of the rules that hold it) ----
  // (the toggling rules load with the first removal, as with the pickers' ticks)
  async function hide(kind: 'place' | 'indicator', id: string) {
    const { toggleIndicator, togglePlace } = await import('./lib/report/tree.ts')
    if (kind === 'place') patch({ spec: withSelection(view, { places: togglePlace(view.spec.places, universe, id, false, sets) }).spec, page: view.page })
    else if (catalog) patch({ spec: withSelection(view, { indicators: toggleIndicator(view.spec.indicators, catalog.manifest.indicators, id, false) }).spec, page: view.page })
  }

  // ---- moving a header: the arrangement now on display becomes that axis's custom order ----
  function move(axis: 'places' | 'indicators', shown: Shown[]) {
    if (!catalog) return
    const next = axis === 'places'
      ? { ...order, places: placesCustom(displayed, shown, order.places, title) }
      : { ...order, indicators: indicatorsCustom(cols.flatMap(g => g.indicators), shown, order.indicators, view.vocab, catalog.manifest.vocabularies[view.vocab].terms) }
    patch({ spec: withSelection(view, { order: next }).spec, page: view.page })
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
  <button type="button" onclick={() => { keysOpen = true; close() }}>Keyboard shortcuts</button>
  <a href={SOURCE_HREF} target="_blank" rel="noopener">Source on GitHub</a>
  <a href={issueHref} target="_blank" rel="noopener">Feedback (GitHub issue)</a>
  {#if catalog}<a href={catalog.base + 'indicators.json'} target="_blank" rel="noopener">Manifest (indicators.json)</a>{/if}
  <hr />
  <span class="mbon-label">Try these</span>
  {#each TRY_THESE as t (t.id)}<a href={tryHref(t)} onclick={() => close()}>{t.label}</a>{/each}
{/snippet}
{#snippet feedback()}<span class="fb"><Button variant="quiet" size="sm" href={issueHref} target="_blank">Feedback</Button></span>{/snippet}

{#if brand === 'mbon'}
  <Header appName={APP_NAME} tagline={TAGLINE} lens={lensWord} help={helpItems} {feedback} />
{:else}
  <om-nav {...nav}>
    <div class="nav-end">
      <span class="nav-lens">{@render lensWord()}</span>
      <Menu label="Help" align="end" variant="plain">
        {#snippet children(close)}{@render helpItems(close)}{/snippet}
      </Menu>
      {@render feedback()}
      <ThemeToggle />
    </div>
  </om-nav>
{/if}

<main class="lens" data-state={phase} data-brand={brand}>
  <div class="wrap">
    <h1 class="mbon-sr-only">{APP_NAME}: {view.view === 'place' ? `${placeName} (place view)` : view.view === 'map' ? 'map of one indicator' : view.view === 'report' ? 'report' : 'places by indicators'}</h1>
    {#if keysOpen}
      <Notice kind="info" ondismiss={() => (keysOpen = false)}><span id="keys">Keyboard: {#each SHORTCUTS as k, i (i)}{#if i} · {/if}{#each k.keys as key, j (j)}{#if j}&nbsp;{/if}<kbd>{key}</kbd>{/each} {k.what}{/each}.</span></Notice>
    {/if}
    {#if catalog && idx && view.view !== 'place'}
      <SelectBar bind:this={selectBar} {view} {catalog} {idx} {layers} {universe} places={chosen} indicators={selected} gazetteer={gaz != null} loading={gazLoading}
        ongazetteer={readGazetteer} onchange={patch} />
    {/if}
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
        <MapView {catalog} {view} titles={title} {idx} {layers} {universe} onpatch={patch} onother={() => selectBar?.showIndicators()} />
      {:else}
        <p class="status" role="status">Loading the map…</p>
      {/if}
    {:else if catalog && view.view === 'report'}
      {#if ReportView}
        <ReportView {catalog} {view} titles={title} {layers} axes={view.axes} onpatch={patch} />
      {:else}
        <p class="status" role="status">Loading the report…</p>
      {/if}
    {:else if catalog && idx}
      <Toolbar {view} onchange={patch} />
      {#if summary}
        <MatrixBar places={displayed.length} indicators={shownInds.length} {summary} {paged} {order} onorder={setOrder} {pageHref} />
      {/if}
      {#if nHidden}<p class="summary">{nHidden} {nHidden === 1 ? 'indicator' : 'indicators'} hidden: no value for these places (turn on "Show indicators without values here")</p>{/if}
      {#if nFolded}<p class="summary">{nFolded} OBIS {nFolded === 1 ? 'indicator is' : 'indicators are'} folded into the row of their series (counts of records and species have no status rule): “Show more” opens one</p>{/if}
      <MatrixLegend vocab={view.vocab} />
      <Matrix {catalog} {idx} cols={folded.cols} rows={paged.rows} folds={folded.folds} ontogglefold={toggleFold} {counts} vocab={view.vocab} depth={view.depth} axes={view.axes} {order}
        titles={title} totals={total} open={view.cell} onopen={open} onhide={hide} onmove={move} />
    {/if}
  </div>
</main>

<AppFooter {brand} {credits} version={catalog?.manifest.version ?? '…'} {loadMs} {placeMs} />

{#if opened && catalog && view.view === 'matrix'}
  <Drawer {catalog} ind={opened.ind} place={opened.place} model={opened.model} depth={view.depth} vocab={view.vocab} carry={inSelection(opened.place.id, opened.ind.id)}
    collTitle={title(opened.place.coll)} groups={opened.model.kind === 'na' && idx ? computedGroups(idx, opened.ind) : []} titles={title}
    groupHref={c => groupHref(view, c)} onclose={close} />
{/if}

<style>
  .lens { flex: 1; }
  .nav-end { display: flex; align-items: center; gap: var(--space-2); }
  .nav-lens { font: var(--type-label); text-transform: uppercase; letter-spacing: var(--ls-label); color: var(--label-color); }
  .wrap { display: grid; gap: var(--space-4); padding: var(--space-4) max(var(--space-4), env(safe-area-inset-right, 0px)) var(--space-6) max(var(--space-4), env(safe-area-inset-left, 0px)); max-width: var(--container-wide); margin: 0 auto; min-width: 0; }
  .status { margin: 0; color: var(--text-body); }
  .summary { display: flex; align-items: center; gap: var(--space-2); margin: 0; font: var(--type-small); color: var(--text-body); }
  .summary :global(svg) { color: var(--label-color); }
  @media (max-width: 640px) {
    .fb, .nav-lens { display: none; }
    .nav-end { gap: var(--space-1); }
    .wrap { padding-inline: var(--space-3); gap: var(--space-3); }
  }
</style>
