<script lang="ts">
  // one card, no header, nav or footer: the Place view's IndicatorCard for `#card=<place_id>|<indicator>`, a credit line
  // and a link to the Place view. data-state is "loading" until the card has its values and is drawn, then "done" (or
  // "error"): the daily figure job screenshots the element once it says done.
  // or one map: `#view=map&…` (the Map view's own keys, hash.ts) draws the Map view without the app's chrome, for the
  // marinebon.org tools page (the live CoastWatch OBIS) and other sites; its controls write the hash as in the app.
  import { onMount, tick } from 'svelte'
  import { Notice } from '@marinebon/ui'
  import { collTitle, loadCatalog, resolveDataBase } from './lib/data.ts'
  import type { Catalog, Indicator } from './lib/data.ts'
  import { appHome, parseEmbedHash } from './lib/embed.ts'
  import type { EmbedState } from './lib/embed.ts'
  import { parseHash, placeHref, serializeHash } from './lib/hash.ts'
  import type { ViewState } from './lib/hash.ts'
  import { indexCoverage, pickRow } from './lib/matrix.ts'
  import { placeCoverage } from './lib/place.ts'
  import { licenceText } from './lib/delivery.ts'
  import { pageTitle } from './lib/brand/brand.ts'
  import type { Brand } from './lib/brand/brand.ts'
  import IndicatorCard from './lib/IndicatorCard.svelte'

  let { brand }: { brand: Brand } = $props()

  let want = $state<EmbedState | null>(parseEmbedHash(location.hash))
  // a map embed: the hash names view=map
  const asMap = (h: string) => (parseHash(h).view === 'map' ? parseHash(h) : null)
  let mapView = $state.raw<ViewState | null>(asMap(location.hash))
  let MapView = $state.raw<typeof import('./lib/map/MapView.svelte').default | null>(null)
  $effect(() => { if (mapView && !MapView) import('./lib/map/MapView.svelte').then(m => { MapView = m.default }) })
  function patchMap(p: Partial<ViewState>) {
    if (!mapView) return
    mapView = { ...mapView, ...p }
    history.replaceState(null, '', location.pathname + location.search + '#' + serializeHash(mapView))
  }
  const mapHome = $derived(mapView ? appHome(location.href) + location.search + '#' + serializeHash(mapView) : '')
  let catalog = $state.raw<Catalog | null>(null)
  let phase = $state<'loading' | 'done' | 'error'>('loading')
  let error = $state('')
  let settled = $state(false)

  const ind = $derived<Indicator | undefined>(catalog && want ? catalog.manifest.indicators.find(i => i.id === want!.indicator) : undefined)
  const found = $derived(catalog && want ? placeCoverage(catalog.coverage, want.place) : null)
  const place = $derived(found?.place ?? null)
  const idx = $derived(catalog && found ? indexCoverage(found.rows) : null)
  const term = $derived(catalog && ind && want ? catalog.manifest.vocabularies[want.vocab].terms.find(t => t.id === ind.category[want!.vocab]) ?? { id: 'other', label: 'Other' } : null)
  const missing = $derived(mapView ? '' : !want ? 'Name a card as #card=<place_id>|<indicator>, for example #card=NMS:CINMS|erddap:dhw_5km:CRW_SST:mean.'
    : catalog && !ind ? `No indicator ${want.indicator} in this catalog.`
    : catalog && !place ? `No values for ${want.place} in this catalog.`
    : '')
  // the credit: the dataset's producers and licensors, the licence, and who computed the values
  const credit = $derived.by(() => {
    if (!ind) return ''
    const names = [...new Set(ind.dataset.providers.filter(p => p.roles.some(r => r === 'producer' || r === 'licensor')).map(p => p.name))]
    return `Data: ${names.length ? names.join(', ') : ind.producer.name}. Licence: ${licenceText(ind)}. Values: Ocean Metrics Indicators.`
  })
  const home = $derived(want && place ? appHome(location.href) + location.search + placeHref({ vocab: want.vocab, depth: want.depth, method: want.method }, place.id, place.coll, want.indicator) : '')

  async function drawn() {
    await tick()
    await document.fonts?.ready
    await new Promise(r => requestAnimationFrame(() => r(null)))
    settled = true
  }

  onMount(async () => {
    document.title = pageTitle(brand, mapView ? 'Map' : 'Indicator card')
    try {
      // this page is one folder down (embed/): a relative data folder (the dev catalog/) is one level up
      const base = resolveDataBase(location.search, import.meta.env.DEV)
      catalog = await loadCatalog(base.startsWith('./') ? '.' + base : base)
      phase = 'done'
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      phase = 'error'
    }
  })
  const root = $derived(phase === 'loading' ? 'loading' : phase === 'error' || missing ? 'error' : settled || mapView ? 'done' : 'loading')
</script>

<svelte:window onhashchange={() => { want = parseEmbedHash(location.hash); mapView = asMap(location.hash); settled = false }} />

<main class="embed" class:wide={!!mapView} data-state={root} data-brand={brand}>
  {#if phase === 'error'}
    <Notice kind="error">Could not load the catalog: {error}.</Notice>
  {:else if phase === 'loading'}
    <p class="status" role="status">Loading the card…</p>
  {:else if missing}
    <Notice kind="warn">{missing}</Notice>
  {:else if catalog && mapView}
    {#if MapView}
      <MapView {catalog} view={mapView} titles={c => collTitle(c)} onpatch={patchMap} />
      <p class="credit"><a href={mapHome} target="_top">View in Ocean Metrics Indicators</a></p>
    {:else}
      <p class="status" role="status">Loading the map…</p>
    {/if}
  {:else if catalog && want && ind && place && idx && term}
    {#key want.place + '|' + want.indicator}
      <IndicatorCard {catalog} {ind} {place} collTitle={collTitle(place.coll)} {term} vocab={want.vocab} depth={want.depth} method={want.method}
        cov={pickRow(idx, place.id, ind)} onsettled={drawn} still={want.still} />
    {/key}
    <p class="credit">{credit} <a href={home} target="_top">View in Ocean Metrics Indicators</a></p>
  {/if}
</main>

<style>
  .embed { padding: var(--space-3); max-width: 48rem; margin: 0 auto; display: grid; gap: var(--space-3); min-width: 0; width: 100%; box-sizing: border-box; }
  .embed.wide { max-width: none; }
  .status { margin: 0; color: var(--text-body); }
  .credit { margin: 0; font: var(--type-small); color: var(--text-body); }
</style>
