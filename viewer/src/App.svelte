<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { Button, Header, Notice } from '@marinebon/ui'
  import { Icon } from '../../src/icons/index.ts'
  import { loadCatalog, loadLayerTitles, resolveDataBase, collTitle } from './lib/data.ts'
  import type { Catalog, Indicator } from './lib/data.ts'
  import { DEFAULT_STATE, parseHash, serializeHash } from './lib/hash.ts'
  import type { ViewState } from './lib/hash.ts'
  import { cellModel, groupColumns, groupRows, indexCoverage, matrixStats, pickRow } from './lib/matrix.ts'
  import { producerCredits } from './lib/delivery.ts'
  import { APP_NAME, TAGLINE } from './lib/brand/brand.ts'
  import type { Brand } from './lib/brand/brand.ts'
  import OmHeader from './lib/brand/OmHeader.svelte'
  import AppFooter from './lib/AppFooter.svelte'
  import Toolbar from './lib/Toolbar.svelte'
  import Matrix from './lib/Matrix.svelte'
  import MatrixLegend from './lib/MatrixLegend.svelte'
  import Drawer from './lib/Drawer.svelte'
  import { SOURCE_HREF } from './lib/credits.ts'

  let { brand }: { brand: Brand } = $props()

  let phase = $state<'loading' | 'done' | 'error'>('loading')
  let error = $state('')
  let catalog = $state.raw<Catalog | null>(null)
  let gazetteer = $state<Record<string, string>>({})
  let loadMs = $state<number | null>(null)
  let view = $state<ViewState>(parseHash(typeof location !== 'undefined' ? location.hash : ''))

  const title = (coll: string) => collTitle(coll, gazetteer)
  const patch = (p: Partial<ViewState>) => { view = { ...view, ...p } }

  // ---- derived tables ----
  const idx = $derived(catalog ? indexCoverage(catalog.coverage, catalog.manifest.indicators) : null)
  const cols = $derived(catalog ? groupColumns(catalog.manifest.indicators, catalog.manifest.vocabularies, view.vocab, view.leads) : [])
  const rows = $derived(idx ? groupRows(idx, view.colls, view.q) : [])
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
    if (serializeHash(next) !== serializeHash(view)) view = next
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

{#snippet lensWord()}matrix{/snippet}
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
    <h1 class="mbon-sr-only">{APP_NAME}: places by indicators</h1>
    {#if phase === 'loading'}
      <p class="status" role="status">Loading the manifest and the coverage table…</p>
    {:else if phase === 'error'}
      <Notice kind="error">Could not load the catalog: {error}. Use <code>?data=&lt;base URL&gt;</code> to point at another one.</Notice>
    {:else if catalog && idx}
      <Toolbar view={view} colls={collChips} onchange={patch} />
      <p class="summary" role="status" aria-live="polite">
        <Icon name="view-matrix" size={18} />
        <span>
          {stats?.places} places × {stats?.indicators} indicators ·
          {stats?.withValue} of {stats?.cells} cells have a value · {stats?.withStatus} have a status
        </span>
      </p>
      <Matrix {catalog} {idx} {cols} {rows} vocab={view.vocab} depth={view.depth} titles={title} open={view.cell} onopen={open} />
      <MatrixLegend vocab={view.vocab} />
    {/if}
  </div>
</main>

<AppFooter {brand} {credits} version={catalog?.manifest.version ?? '…'} {loadMs} />

{#if opened && catalog}
  <Drawer {catalog} ind={opened.ind} place={opened.place} model={opened.model} depth={view.depth}
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
