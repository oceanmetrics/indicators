<script lang="ts">
  // the locator map at the top of every report (but the Map sheet, which is a map): the chosen places outlined, the map framed
  // to them when the gazetteer's tiles hold their geometry (a Marine Regions EEZ is drawn by its publisher's WMS and has no
  // geometry of ours to frame, so the map keeps the group's extent), place names on hover and listed under it. it can be
  // collapsed, loads when first opened, and prints as a picture.
  import { onMount } from 'svelte'
  import { Notice } from '@marinebon/ui'
  import type { Layers } from '../../data.ts'
  import type { Place } from '../../matrix.ts'
  import { partsCredit } from '../../map/credit.ts'
  import { loadGazetteer } from '../../map/gazetteer.ts'
  import type { GazLayer } from '../../map/gazetteer.ts'
  import { buildParts, partsBbox } from '../../map/parts.ts'
  import { locatorItems, placeGroups } from './maps.ts'
  import { watchTheme } from './mapTheme.svelte.ts'
  import PrintableMap from './PrintableMap.svelte'

  interface Props {
    places: Place[]
    /** every place of the index: a derived group draws all its pieces */
    indexPlaces: Place[]
    titles: (coll: string) => string
    layers?: Layers
  }
  let { places, indexPlaces, titles }: Props = $props()

  const th = watchTheme()
  let open = $state(true)
  onMount(() => { open = !matchMedia('(max-width: 640px)').matches })
  let gaz = $state.raw<Record<string, GazLayer> | null>(null)
  let error = $state('')
  $effect(() => {
    if (!open || gaz) return
    loadGazetteer().then(l => (gaz = l), e => (error = e instanceof Error ? e.message : String(e)))
  })

  const groups = $derived(placeGroups(places))
  const built = $derived(gaz ? buildParts(groups, gaz, locatorItems(places), indexPlaces, false) : null)
  const parts = $derived(built?.parts ?? [])
  const bbox = $derived(parts.length ? partsBbox(parts) : ([-180, -85, 180, 85] as [number, number, number, number]))
  const fitIds = $derived(places.map(p => p.id))
  const colors = $derived([th.css('--map-seq-3')])
  // the basemap's credit, from the attribution of the style the map set
  let baseCredit = $state('')
  const credit = $derived([baseCredit, partsCredit(parts.map(p => p.home))].filter(Boolean).map(s => s.replace(/\.+$/, '') + '.').join(' '))
  let hovered = $state<string | null>(null)
  const noop = () => {}
</script>

<details class="loc" bind:open>
  <summary><span class="mbon-label">Where</span> <span class="om-count">{places.length} {places.length === 1 ? 'place' : 'places'}</span></summary>
  {#if open}
    <div class="body">
      {#if error}
        <Notice kind="warn">The map could not load: {error}.</Notice>
      {:else if parts.length}
        <div class="frame" style:--map-h="var(--locator-h, 15rem)">
          <PrintableMap {parts} {bbox} {colors} line={th.css('--map-line')} none={th.css('--map-none')} nofill={th.css('--bg-tint')} faint={th.css('--map-member')} focus={th.css('--map-focus')}
            dark={th.dark} selected={null} marker={null} onpick={noop} oncredit={c => (baseCredit = c)} compact {fitIds} onhover={n => (hovered = n)} label={`Map of the ${places.length} places in this report`} />
          {#if hovered}<p class="hover" role="status">{hovered}</p>{/if}
        </div>
        {#if built?.missing.length}<p class="om-note">The gazetteer has no drawable layer for {built.missing.map(titles).join(', ')}.</p>{/if}
      {:else}
        <p class="wait om-note" role="status">Loading the map…</p>
      {/if}
      <p class="names om-note">{places.map(p => p.name).join(' · ')}</p>
      {#if credit}<p class="credit om-note-s">{credit}</p>{/if}
    </div>
  {/if}
</details>

<style>
  .loc { background: var(--bg-tint); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); min-width: 0; }
  .loc > summary { cursor: pointer; display: flex; align-items: baseline; gap: var(--space-2); padding: var(--space-1) 0; }
  .body { display: grid; gap: var(--space-2); padding-top: var(--space-2); min-width: 0; }
  .frame { position: relative; min-width: 0; }
  .hover { position: absolute; left: var(--space-2); bottom: var(--space-2); margin: 0; padding: var(--space-1) var(--space-2); background: var(--bg-surface); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); font: var(--type-small); color: var(--text-strong); pointer-events: none; }
  .wait, .names, .credit { margin: 0; }
  .names { overflow-wrap: anywhere; }
  @media (max-width: 640px) { .frame { --locator-h: 11rem; } }
  @media print {
    .loc { background: none; padding: 0; }
    .loc > summary { display: none; }
    .hover { display: none; }
  }
</style>
