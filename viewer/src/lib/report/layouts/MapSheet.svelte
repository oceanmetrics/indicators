<script lang="ts">
  // the Map sheet layout: one indicator as a choropleth over the chosen places, with a period slider. it is the Map view's
  // model (map/classes.ts: classes, legend and table; status and trend only through @oceanmetrics/status) and canvas (MapCanvas, the
  // gazetteer's PMTiles, and Marine Regions' own WMS for reference places: no geometry of ours), on the chosen places only.
  // on paper the map is a picture of itself at the period shown, with the legend and the table beside it.
  import { Button, Notice, Select, Slider } from '@marinebon/ui'
  import { periodLabel } from '@oceanmetrics/status'
  import type { Catalog, Indicator } from '../../data.ts'
  import type { MapColor } from '../../hash.ts'
  import type { ColumnGroup, CoverageIndex, Place } from '../../matrix.ts'
  import { dataCredit, partsCredit } from '../../map/credit.ts'
  import { MODE_LABELS, mapModel, periodToT } from '../../map/classes.ts'
  import { loadGazetteer } from '../../map/gazetteer.ts'
  import type { GazLayer } from '../../map/gazetteer.ts'
  import MapLegend from '../../map/MapLegend.svelte'
  import MapTable from '../../map/MapTable.svelte'
  import { byIdOrder } from '../../map/tableOrder.ts'
  import { buildParts, partsBbox } from '../../map/parts.ts'
  import type { PlaceRow } from '../../valuesData.ts'
  import { loadSheetValues, sheetCoverage, sheetGroups } from './maps.ts'
  import { watchTheme } from './mapTheme.svelte.ts'
  import PrintableMap from './PrintableMap.svelte'

  interface Props {
    catalog: Catalog
    idx: CoverageIndex
    places: Place[]
    groups: ColumnGroup[]
    titles: (coll: string) => string
    placeHref: (placeId: string, coll: string) => string
    heading?: string | null
    /** the reader chose an order for the places: the table follows it (else it is by class, then value) */
    ordered?: boolean
  }
  let { catalog, idx, places, groups, titles, placeHref, heading = null, ordered = false }: Props = $props()

  const th = watchTheme()
  const ind = $derived<Indicator | undefined>(groups.flatMap(g => g.indicators)[0])
  const rows = $derived(ind ? sheetCoverage(catalog.coverage, places, ind) : [])
  const members = $derived(sheetGroups(rows))

  // ---- the record of the chosen places, for the slider ----
  let values = $state.raw<Map<string, PlaceRow[]> | null>(null)
  let valuesError = $state('')
  $effect(() => {
    const i = ind, r = rows, g = members
    values = null
    valuesError = ''
    if (!i || !g.length) return
    let live = true
    loadSheetValues(catalog, i, r, g).then(v => { if (live) values = v }, e => { if (live) valuesError = e instanceof Error ? e.message : String(e) })
    return () => { live = false }
  })

  let gaz = $state.raw<Record<string, GazLayer> | null>(null)
  let layerError = $state('')
  $effect(() => { loadGazetteer().then(l => (gaz = l), e => (layerError = e instanceof Error ? e.message : String(e))) })

  // ---- what the reader chose: how to colour, and the period (the latest until moved) ----
  let color = $state<MapColor | null>(null)
  let t = $state<string | null>(null)
  let cls = $state<string | null>(null)
  const model = $derived(ind && rows.length ? mapModel(ind, rows, values, { groups: members, color, t, method: null, cls }) : null)

  const colors = $derived(model ? model.legend.map(l => th.css(l.token)) : [])
  const built = $derived(gaz && model ? buildParts(members, gaz, model.items, idx.places, members.length > 1) : null)
  const parts = $derived(built?.parts ?? [])
  const bbox = $derived(parts.length ? partsBbox(parts) : ([-180, -85, 180, 85] as [number, number, number, number]))
  const fitIds = $derived(places.map(p => p.id))
  $effect(() => { if (built) layerError = built.missing.length && !built.parts.length ? `The gazetteer has no drawable layer for ${built.missing.join(', ')}.` : '' })

  // ---- the slider ----
  const periods = $derived(model?.periods ?? [])
  let slider = $state(0)
  $effect(() => { slider = model?.period ? Math.max(0, periods.indexOf(model.period)) : 0 })
  const onslide = (i: number) => { if (model) t = i >= periods.length - 1 ? null : periodToT(periods[i], model.grain) }
  const periodWord = (i: number) => (model && periods[i] ? periodLabel(periods[i], model.grain) + (i === periods.length - 1 ? ' (latest)' : '') : '')
  const canSlide = $derived(periods.length > 1 && values != null)

  // the basemap's credit, from the attribution of the style the map set
  let baseCredit = $state('')
  const credit = $derived([baseCredit, partsCredit(parts.map(p => p.home)), ind ? dataCredit(ind) : ''].filter(Boolean).map(s => s.replace(/\.+$/, '') + '.').join(' '))
  const sub = $derived(ind && model ? `${ind.title} · by ${MODE_LABELS[model.color].toLowerCase()}${model.period ? ` · ${periodLabel(model.period, model.grain)}` : ''}` : '')
  const noop = () => {}
</script>

<section class="ms om-stack" aria-label={heading ?? 'Map sheet'}>
  {#if heading}<h3 class="sh om-st">{heading}</h3>{/if}
  {#if !ind || !model}
    <Notice kind="info">No chosen place has a value for this indicator to map.</Notice>
  {:else}
    <div class="controls">
      <div class="group" role="group" aria-label="Colour by">
        <span class="mbon-label">Colour by</span>
        <div class="row">
          {#each model.modes as c (c)}
            <Button variant="quiet" size="sm" pressed={c === model.color} onclick={() => (color = c as MapColor)}>{MODE_LABELS[c]}</Button>
          {/each}
        </div>
      </div>
      {#if model.color === 'share' && model.classChoices.length}
        <div class="group">
          <Select label="Class" value={model.cls ?? ''} options={model.classChoices.map(c => ({ value: c.cls, label: c.label }))} onchange={(v: string) => (cls = v)} />
        </div>
      {/if}
      <div class="group slide">
        {#if periods.length > 1}
          <Slider label="Period" bind:value={slider} min={0} max={periods.length - 1} step={1} format={periodWord} disabled={!canSlide} oninput={onslide} ticks={[0, periods.length - 1]} />
        {:else}
          <span class="mbon-label">Period</span>
          <span class="one">{model.period ? periodLabel(model.period, model.grain) : '–'}</span>
        {/if}
        {#if valuesError}<span class="hint" role="status">The record did not load, so only the latest period is shown ({valuesError}).</span>
        {:else if !values && periods.length < 2}<span class="hint" role="status">Loading the record for the period slider…</span>{/if}
      </div>
    </div>
    <p class="sub" role="status" aria-live="polite">{sub}{model.pending ? ' · loading the record…' : ''}</p>

    <div class="layout">
      <div class="mapcol">
        {#if parts.length}
          <div class="frame" style:--map-h="min(58dvh, 34rem)">
            <PrintableMap {parts} {bbox} {colors} line={th.css('--map-line')} none={th.css(model.none)} nofill={th.css('--bg-tint')} faint={th.css('--map-member')} focus={th.css('--map-focus')}
              dark={th.dark} selected={null} marker={null} onpick={noop} oncredit={c => (baseCredit = c)} {fitIds} label={`Map of ${ind.short} over the places of this report`} />
          </div>
        {:else if layerError}
          <Notice kind="error">{layerError}</Notice>
        {:else}
          <p class="msg" role="status">Loading the map…</p>
        {/if}
        <p class="credits">{credit}</p>
      </div>
      <aside class="side"><MapLegend {model} unit={ind.unit_label ?? ''} /></aside>
    </div>
    <MapTable {model} inOrder={ordered ? (items => byIdOrder(items, places.map(p => p.id))) : null} placeHref={id => placeHref(id, places.find(p => p.id === id)?.coll ?? '')} selected={null} caption={`${ind.title}: value, period and class of every chosen place`} />
  {/if}
</section>

<style>
  .controls { display: flex; flex-wrap: wrap; gap: var(--space-3) var(--space-5); align-items: flex-start; }
  .group { display: grid; gap: var(--space-2); min-width: 0; }
  .group.slide { min-width: min(20rem, 100%); flex: 1; max-width: 32rem; }
  .row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .one { font: var(--fw-semibold) var(--text-sm) / 1 var(--font-mono); color: var(--text-strong); }
  .hint { font: var(--type-small); color: var(--text-body); }
  .sub { margin: 0; font: var(--type-small); color: var(--text-body); }
  .layout { display: grid; grid-template-columns: minmax(0, 1fr) 16rem; gap: var(--space-4); align-items: start; min-width: 0; }
  .mapcol { display: grid; gap: var(--space-2); min-width: 0; }
  .frame { min-width: 0; }
  .msg { display: grid; place-items: center; min-height: 12rem; margin: 0; background: var(--bg-tint); border-radius: var(--radius-md); color: var(--text-body); }
  .credits { margin: 0; font: var(--type-small); color: var(--text-body); overflow-wrap: anywhere; }
  .side { min-width: 0; }
  @media (max-width: 900px) {
    .group.slide { padding-inline-end: var(--space-6, 2rem); }
    .layout { grid-template-columns: minmax(0, 1fr); }
  }
  @media print {
    .controls { display: none; }
    .layout { grid-template-columns: minmax(0, 1fr) 14rem; }
  }
</style>
