<script lang="ts">
  // the Map view: one indicator over the places of the shared selection (the Select section above the tabs: the hash's pi, px, ii and
  // ix), coloured by its latest value, its departure from the place's own record, its status or trend, the length of its record (or,
  // for a categorical indicator, its largest class or the share of one class) at a period the slider chooses. every group of the
  // selection is a part of the map, layered as a place set is (parts.ts), with one legend, one table and one colour scale across all
  // their places; a group chosen in part is drawn restricted to its chosen places. the indicator is the hash's `ind` when it is in
  // the selection, else the first selected one with values in the selected places. the classes, legend and table come from
  // classes.ts (status and trend from @oceanmetrics/status); MapCanvas only draws. all state is the URL hash:
  // #view=map&ind=&pi=&px=&ii=&ix=&place=&color=&t=&cls=&layer=&method=
  // under the places, the layer the hash's `layer` names (layerSlot.ts; Day 6: an ERDDAP dataset's own WMS) at the same period.
  // the group's members that are not computed are drawn faint (and as a small hollow circle from far away), and a click on one offers
  // the next steps.
  import { onMount } from 'svelte'
  import { Button, Notice, Select, Slider } from '@marinebon/ui'
  import { Icon } from '../../../../src/icons/index.ts'
  import { periodLabel } from '@oceanmetrics/status'
  import type { MethodId } from '@oceanmetrics/status'
  import { expandIndicators } from '../../../../src/report/spec.ts'
  import type { Catalog, Layers } from '../data.ts'
  import { groupHref, mapToMatrixHref, placeHref } from '../hash.ts'
  import type { MapColor, ViewState } from '../hash.ts'
  import { cellModel, indexCoverage, isLiveProducer, orderGroups, STATUS_WORDS, TREND_WORDS } from '../matrix.ts'
  import type { CoverageIndex, Place } from '../matrix.ts'
  import { defaultMethod, METHOD_LABELS } from '../place.ts'
  import { includeIndicator, withSelection } from '../selection.ts'
  import { loadValuesFile } from '../valuesData.ts'
  import type { PlaceRow } from '../valuesData.ts'
  import { valuesUrl } from '../delivery.ts'
  import { computedGroups } from '../nextSteps.ts'
  import NextSteps from '../NextSteps.svelte'
  import IndicatorPicker from '../pick/IndicatorPicker.svelte'
  import { placesWithValueAnywhere } from '../pick/indicatorsTree.ts'
  import { MODE_LABELS, mapModel, periodToT } from './classes.ts'
  import type { MapItem } from './classes.ts'
  import { basemapCredit, dataCredit, partsCredit, slotCredit } from './credit.ts'
  import { parseLayerKey, registerSlotKind, slotFor } from './layerSlot.ts'
  import type { LayerSlot } from './layerSlot.ts'
  import { erddapSlot } from './erddapSlot.ts'
  import { layerChoices, slotLegendLine } from './erddapWms.ts'
  import { loadGazetteer } from './gazetteer.ts'
  import type { GazLayer } from './gazetteer.ts'
  import { buildParts, partsBbox } from './parts.ts'
  import { groupOf, mappable, pickMapIndicator, valuesCollsOfGroup } from './pick.ts'
  import { needsPlaces, placeFilter, selectionGroups, selectionTitle } from './selection.ts'
  import { familyId, familyOf, FAMILY_DEFAULT, FAMILY_LABEL, isFamily } from './family.ts'
  import MapCanvas from './MapCanvas.svelte'
  import MapFrameControls from './MapFrameControls.svelte'
  import type { FullMode } from './frame.ts'
  import MapLegend from './MapLegend.svelte'
  import MapTable from './MapTable.svelte'
  import { tableInOrder } from './tableOrder.ts'
  import { isDefaultAxis } from '../../../../src/report/order.ts'

  interface Props {
    catalog: Catalog
    view: ViewState
    titles: (coll: string) => string
    /** every place's coverage (for the next steps of a place not computed) and the gazetteer's layers */
    idx?: CoverageIndex | null
    layers?: Layers
    /** every place the selection can name (the Select section's); the embed has none and reads the coverage's when a rule needs places */
    universe?: Place[] | null
    onpatch: (p: Partial<ViewState>) => void
    /** "another indicator": the indicator picker of the Select section (the app only) */
    onother?: () => void
    /** ms from the start of the view until the map was drawn */
    onready?: (ms: number) => void
  }
  let { catalog, view, titles, idx = null, layers: _layers = {}, universe = null, onpatch, onother, onready }: Props = $props()

  const t0 = performance.now()
  registerSlotKind('erddap', erddapSlot)
  const m = $derived(catalog.manifest)

  // ---- what is mapped: the groups of the selection and the indicator ----
  const sets = $derived(m.place_sets ?? [])
  const selPlaces = $derived(view.spec.places)
  const places = $derived(universe ?? (needsPlaces(selPlaces) ? indexCoverage(catalog.coverage).places : null))
  // the table follows the order the reader chose for the places (Select section); the default is its class order
  const inOrder = $derived(isDefaultAxis(view.spec.order.places) ? null : (items: MapItem[]) => tableInOrder(items, places ?? [], view.spec.order.places, titles))
  const chosenGroups = $derived(selectionGroups(selPlaces, places, sets, selPlaces.include.includes('*') ? orderGroups(catalog.coverage.map(groupOf)) : []))
  const members = $derived(chosenGroups.map(g => g.group))
  const keep = $derived(placeFilter(chosenGroups))
  const selectedInds = $derived(expandIndicators(view.spec.indicators, m.indicators))
  // indicator id -> the selected places with a value for it
  const have = $derived(placesWithValueAnywhere(catalog.coverage, r => keep(r.place_id, groupOf(r))))
  const nSelected = $derived(new Set([...have.values()].flatMap(s => [...s])).size)
  const ind = $derived(pickMapIndicator(selectedInds, have, view.ind))
  const selTitle = $derived(selectionTitle(selPlaces, chosenGroups, titles))
  // the hash always names what is shown, so the view is a permalink even when it opened on the defaults
  $effect(() => { if (ind && view.ind !== ind.id) onpatch({ ind: ind.id }) })
  // a sentence above the map when the indicator asked for is selected but has no value for these places
  const wanted = $derived(view.ind ? selectedInds.find(i => i.id === view.ind) ?? null : null)
  const notice = $derived(ind && wanted && wanted.id !== ind.id ? `${wanted.short} has no values for these places; showing ${ind.title.replace(/\.$/, '')}.` : '')

  // the OBIS indicators are one choice in the picker (OBIS biodiversity), then a metric and an EOV (family.ts)
  const mappableList = $derived(mappable(m.indicators, catalog.coverage))
  const family = $derived(ind ? familyOf(ind, mappableList) : null)
  const pickList = $derived.by(() => {
    const here = selectedInds.filter(i => (have.get(i.id)?.size ?? 0) > 0)
    const fam = here.filter(i => isFamily(i.id))
    const rep = ind && isFamily(ind.id) ? ind.id : (fam.find(i => i.id === FAMILY_DEFAULT) ?? fam[0])?.id
    return here.filter(i => !isFamily(i.id) || i.id === rep).map(i => (isFamily(i.id) ? { ...i, short: FAMILY_LABEL } : i))
  })
  const chosenInd = $derived(new Set(ind ? [ind.id] : []))
  // by year or by decade, when the indicator has both
  const grains = $derived(ind ? (['year', 'decade'] as const).filter(g => ind.time_grains.includes(g)) : [])

  function chooseInd(id: string) {
    onpatch({ ind: id, color: null, t: null, cls: null, method: null, grain: null })
  }
  // an indicator the reader reaches from here (another metric of the OBIS family) joins the selection, so the Map keeps showing it
  function selectInd(id: string, extra: Partial<ViewState> = {}) {
    const next = m.indicators.find(i => i.id === id)
    onpatch({ ind: id, ...extra, ...(next ? { spec: withSelection(view, { indicators: includeIndicator(view.spec.indicators, next, m.indicators) }).spec } : {}) })
  }

  // ---- the values files of the groups: the slider's periods, departure, past statuses ----
  let values = $state.raw<Map<string, PlaceRow[]> | null>(null)
  let valuesError = $state('')
  $effect(() => {
    const urls = ind && members.length ? valuesCollsOfGroup(ind, catalog.coverage, members).map(c => valuesUrl(catalog.base, ind, c)).filter((u): u is string => !!u) : []
    values = null
    valuesError = ''
    if (!urls.length) return
    let live = true
    Promise.all(urls.map(u => loadValuesFile(u))).then(
      maps => {
        if (!live) return
        const all = new Map<string, PlaceRow[]>()
        for (const mp of maps) for (const [id, rows] of mp) all.set(id, [...(all.get(id) ?? []), ...rows])
        values = all
      },
      e => { if (live) valuesError = e instanceof Error ? e.message : String(e) },
    )
    return () => { live = false }
  })

  // ---- the gazetteer layers that draw the groups ----
  let gaz = $state.raw<Record<string, GazLayer> | null>(null)
  let layerError = $state('')
  $effect(() => {
    let live = true
    loadGazetteer().then(
      l => { if (live) gaz = l },
      e => { if (live) layerError = e instanceof Error ? e.message : String(e) },
    )
    return () => { live = false }
  })

  // ---- the model ----
  const model = $derived(
    ind ? mapModel(ind, catalog.coverage, values, { group: null, groups: members, keep, color: view.color, t: view.t, method: view.method, cls: view.cls, grain: view.grain }) : null,
  )
  const method = $derived<MethodId | null>(ind ? defaultMethod(ind) : null)

  // ---- colours: the tokens, resolved against the theme in force ----
  let theme = $state(typeof document === 'undefined' ? 'light' : document.documentElement.dataset.theme ?? 'light')
  onMount(() => {
    const mo = new MutationObserver(() => { theme = document.documentElement.dataset.theme ?? 'light' })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  })
  const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const colors = $derived.by(() => { void theme; return model ? model.legend.map(l => css(l.token)) : [] })
  const lineColor = $derived.by(() => { void theme; return css('--map-line') })
  const noneColor = $derived.by(() => { void theme; return css(model?.none ?? '--map-none') })
  const faintColor = $derived.by(() => { void theme; return css('--map-member') })
  const focusColor = $derived.by(() => { void theme; return css('--map-focus') })
  // a reference group's places with no class are filled with the no-data colour under a layer of ours (several groups), so nothing below shows through
  const nofillColor = $derived.by(() => { void theme; return css('--bg-tint') })

  // ---- the parts the map draws ----
  const built = $derived(gaz && model ? buildParts(chosenGroups, gaz, model.items, idx?.places ?? [], chosenGroups.length > 1) : null)
  const parts = $derived(built?.parts ?? [])
  const bbox = $derived(parts.length ? partsBbox(parts) : ([-180, -85, 180, 85] as [number, number, number, number]))
  $effect(() => { if (built) layerError = built.missing.length && !built.parts.length ? `The gazetteer has no drawable layer for ${built.missing.join(', ')}.` : '' })

  // ---- the period slider ----
  const periods = $derived(model?.periods ?? [])
  const idxNow = $derived(model?.period ? Math.max(0, periods.indexOf(model.period)) : 0)
  let slider = $state(0)
  $effect(() => { slider = idxNow })
  const canSlide = $derived(periods.length > 1 && values != null)
  function onslide(i: number) {
    if (!model) return
    const last = i >= periods.length - 1
    onpatch({ t: last ? null : periodToT(periods[i], model.grain) })
  }
  const periodWord = (i: number) => (model && periods[i] ? periodLabel(periods[i], model.grain) + (i === periods.length - 1 ? ' (latest)' : '') : '')

  // ---- the layer under the map (the hash's `layer`), at the period shown ----
  let slot = $state.raw<LayerSlot | null>(null)
  let slotError = $state('')
  // the slot says when its legend changes (a new period, no tiles); the legend line reads it again
  let slotTick = $state(0)
  $effect(() => {
    const spec = parseLayerKey(view.layer)
    slot = null
    slotError = ''
    if (!spec) return
    let live = true
    try {
      slotFor(spec, { onchange: () => { if (live) slotTick++ } }).then(
        sl => { if (live) slot = sl },
        e => { if (live) slotError = `The layer ${view.layer} did not load (${e instanceof Error ? e.message : String(e)}).` },
      )
    } catch (e) { slotError = `The layer ${view.layer} cannot be drawn here (${e instanceof Error ? e.message : String(e)}).` }
    return () => { live = false }
  })
  const layerOptions = $derived(layerChoices(m.indicators, ind, view.layer))
  const slotLine = $derived.by(() => {
    void slotTick
    const l = slot?.legend()
    return l && model ? slotLegendLine(l, t => periodLabel(t, model.grain)) : slotError
  })

  // ---- the selected place (the hash's `place`): computed, or a member the group has not computed yet ----
  const selectedId = $derived(view.place)
  let marker = $state<{ lng: number; lat: number } | null>(null)
  let pickedName = $state<{ id: string; name: string; group: string | null } | null>(null)
  $effect(() => { void members.join(); marker = null })
  const selectedItem = $derived(model?.items.find(i => i.placeId === selectedId) ?? null)
  const selectedName = $derived(selectedItem?.name ?? (pickedName?.id === selectedId && pickedName.name ? pickedName.name : null) ?? places?.find(p => p.id === selectedId)?.name ?? idx?.places.find(p => p.id === selectedId)?.name ?? selectedId ?? '')
  // the group of the selected place: where it was clicked, else its place in the index, else the first group drawn
  const notYetGroup = $derived((pickedName?.id === selectedId ? pickedName.group : null) ?? places?.find(p => p.id === selectedId)?.coll ?? idx?.places.find(p => p.id === selectedId)?.coll ?? members[0] ?? '')
  // a member of the group with no computed row: the same states and ways forward as a Matrix cell with no value
  const notYet = $derived.by(() => {
    if (!ind || !selectedId || selectedItem) return null
    const place: Place = { id: selectedId, name: selectedName, coll: notYetGroup }
    // a member with no computed row: not computed yet (erddap-places can make it), else the producer has not done it
    const cm = cellModel(ind, place, null)
    return cm.kind === 'value' || cm.kind === 'class' ? null : { place, kind: cm.kind === 'na' ? 'na' as const : isLiveProducer(ind) ? 'live' as const : 'nodata' as const }
  })
  function onpick(p: { placeId: string | null; lng: number; lat: number; name?: string | null; group?: string | null }) {
    marker = p.placeId ? { lng: p.lng, lat: p.lat } : null
    if (p.placeId) pickedName = { id: p.placeId, name: p.name ?? '', group: p.group ?? null }
    onpatch({ place: p.placeId })
  }
  const toPlace = (id: string) => placeHref(view, id, members[0] ?? null, ind?.id ?? null)
  const toMatrix = (id: string) => mapToMatrixHref(view, ind?.id ?? null, id)

  // ---- the map is ready once it has drawn the data ----
  let drawn = $state<'loading' | 'done'>('loading')
  let reported = false
  $effect(() => { if (drawn === 'done' && !reported) { reported = true; onready?.(Math.round(performance.now() - t0)) } })

  const dark = $derived(theme === 'dark')
  const credit = $derived(
    [basemapCredit(dark), partsCredit(parts.map(p => p.home)), slotCredit(slot), ind ? dataCredit(ind) : '']
      .filter(Boolean).map(s => s.replace(/\.+$/, '') + '.').join(' '),
  )
  const heading = $derived(
    ind && model ? `${ind.title} · ${selTitle} · by ${MODE_LABELS[model.color].toLowerCase()}${model.period ? ` · ${periodLabel(model.period, model.grain)}` : ''}` : '',
  )
  const methodChoices: MethodId[] = ['iea-sd', 'names-pct']
  // full screen: the wrapper of the map, its credit line and the side column (legend, selected place) goes full screen as one
  let fsEl = $state<HTMLElement>()
  let full = $state<FullMode>('off')
</script>

{#if !ind || !model}
  <Notice kind="info">No selected indicator has values for the selected places. Choose others in the Select section above{#if onother}, or <button type="button" class="lnk" onclick={onother}>choose another indicator</button>{/if}.</Notice>
{:else}
  <section class="controls" aria-label="Map controls">
    <IndicatorPicker mode="single" label={family ? FAMILY_LABEL : ind.short} indicators={pickList} vocabs={m.vocabularies} vocab={view.vocab}
      onvocab={v => onpatch({ vocab: v })} chosen={chosenInd} withValues={have} nPlaces={nSelected} onchoose={chooseInd} {onother} order={view.spec.order.indicators} />
    {#if family}
      <div class="group">
        <Select label="Metric" value={family.metric} options={family.metrics.map(c => ({ value: c.id, label: c.label }))}
          onchange={(v: string) => selectInd(familyId(v, family.eov), { color: null, cls: null })} />
      </div>
      <div class="group">
        <Select label="EOV" value={family.eov} options={family.eovs.map(c => ({ value: c.id, label: c.label }))}
          onchange={(v: string) => selectInd(familyId(family.metric, v), { color: null, cls: null })} />
      </div>
    {/if}
    {#if grains.length > 1}
      <div class="group" role="group" aria-label="Time grain">
        <span class="mbon-label">By</span>
        <div class="row">
          {#each grains as g (g)}
            <Button variant="quiet" size="sm" pressed={model.grain === g} onclick={() => onpatch({ grain: g === ind.status_grain ? null : g, t: null })}>{g}</Button>
          {/each}
        </div>
      </div>
    {/if}
    <div class="group" role="group" aria-label="Colour by">
      <span class="mbon-label">Colour by</span>
      <div class="row">
        {#each model.modes as c (c)}
          <Button variant="quiet" size="sm" pressed={c === model.color} onclick={() => onpatch({ color: c as MapColor })}>{MODE_LABELS[c]}</Button>
        {/each}
      </div>
    </div>
    {#if (model.color === 'status' || model.color === 'trend') && method && method !== 'values' && model.grain === ind.status_grain}
      <div class="group" role="group" aria-label="Status method">
        <span class="mbon-label">Method</span>
        <div class="row">
          {#each methodChoices as id (id)}
            <Button variant="quiet" size="sm" pressed={model.method === id} onclick={() => onpatch({ method: id === method ? null : id })}>{METHOD_LABELS[id]}</Button>
          {/each}
        </div>
      </div>
    {/if}
    {#if model.color === 'share' && model.classChoices.length}
      <div class="group">
        <Select label="Class" value={model.cls ?? ''} options={model.classChoices.map(c => ({ value: c.cls, label: c.label }))}
          onchange={(v: string) => onpatch({ cls: v })} />
      </div>
    {/if}
    <div class="group slide">
      {#if periods.length > 1}
        <Slider label="Period" bind:value={slider} min={0} max={periods.length - 1} step={1} format={periodWord}
          disabled={!canSlide} oninput={onslide} ticks={[0, periods.length - 1]} />
      {:else}
        <span class="mbon-label">Period</span>
        <span class="one">{model.period ? periodLabel(model.period, model.grain) : '–'}</span>
      {/if}
      {#if valuesError}<span class="warn" role="status">The record did not load, so only the latest period is shown ({valuesError}).</span>
      {:else if !values && periods.length < 2}<span class="hint" role="status">Loading the record for the period slider…</span>{/if}
    </div>
    <div class="group layer">
      <Select label="Layer under the map" value={view.layer ?? ''} options={layerOptions} onchange={(v: string) => onpatch({ layer: v || null })} />
    </div>
  </section>

  {#if notice}<p class="notice" role="status"><Icon name="ui-info" size={16} />{notice}</p>{/if}
  <p class="summary" role="status" aria-live="polite">
    <Icon name="view-map" size={18} />
    <span>{heading}{model.pending ? ' · loading the record…' : ''}</span>
  </p>

  <div class="layout" class:full={full !== 'off'} class:expanded={full === 'expanded'} bind:this={fsEl}>
    <div class="mapcol">
      <div class="frame">
        {#if parts.length}
          <MapCanvas {parts} {bbox} {colors} line={lineColor} none={noneColor} nofill={nofillColor} faint={faintColor} focus={focusColor} {dark} selected={selectedId} proj={view.proj} {marker}
            {onpick} onstate={s => (drawn = s)} label={`Map of ${ind.short} by place`} {slot} slotT={model.period} />
          <MapFrameControls target={fsEl} proj={view.proj} onproj={p => onpatch({ proj: p })} bind:mode={full} />
        {:else if layerError}
          <div class="msg"><Notice kind="error">{layerError}</Notice></div>
        {:else}
          <p class="msg" role="status">Loading the map…</p>
        {/if}
      </div>
      <p class="credits">
        {credit}
      </p>
    </div>

    <aside class="side">
      <MapLegend {model} unit={ind.unit_label ?? ''} layer={slotLine} />
      <section class="pick" aria-labelledby="pick-h" aria-live="polite">
        <h2 id="pick-h" class="mbon-label">Selected place</h2>
        {#if selectedId}
          {@const it = selectedItem}
          <p class="name">{selectedName}</p>
          {#if it}
            {@const leg = it.k != null ? model.legend[it.k] : null}
            <p class="line">
              {#if leg}<span class="sw" style:background="var({leg.token})" aria-hidden="true"></span>{:else}<span class="sw none" style:border-color="var({model.none})" aria-hidden="true"></span>{/if}
              <span>{it.label}</span>
            </p>
            {#if it.valueText}<p class="line"><strong>{it.valueText}</strong><span> in {it.periodText}</span></p>{/if}
            {#if it.status || it.trend}
              <ul class="marks">
                {#if it.status}<li><Icon name={`st-${it.status}`} size={20} /><span>{STATUS_WORDS[it.status]}</span></li>{/if}
                {#if it.trend}<li><Icon name={`tr-${it.trend}`} size={20} /><span>trend {TREND_WORDS[it.trend]}</span></li>{/if}
              </ul>
            {/if}
          {:else if notYet}
            <NextSteps ind={ind} place={notYet.place} kind={notYet.kind} groupTitle={titles(notYet.place.coll)}
              groups={notYet.kind === 'na' && idx ? computedGroups(idx, ind) : []} {titles} groupHref={c => groupHref(view, c)} />
          {/if}
          <p class="links">
            <a href={toPlace(selectedId)}><Icon name="view-place" size={16} />Open place view</a>
            <a href={toMatrix(selectedId)}><Icon name="view-matrix" size={16} />Open in matrix</a>
          </p>
        {:else}
          <p class="line">Click or tap a place on the map, or pick one from the table below. Places drawn faint (from far away, as a small hollow circle) are in the group but not computed yet.</p>
        {/if}
      </section>
    </aside>
  </div>

  <MapTable {model} {inOrder} placeHref={toPlace} selected={selectedId} caption={`${ind.title}, ${selTitle}: value, period and class of every place`} />
{/if}

<style>
  .controls { display: flex; flex-wrap: wrap; gap: var(--space-3) var(--space-5); align-items: flex-start; }
  .group { display: grid; gap: var(--space-2); min-width: 0; }
  .group.slide { min-width: min(20rem, 100%); flex: 1; max-width: 32rem; }
  .group.layer { width: min(18rem, 100%); }
  .row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .one { font: var(--fw-semibold) var(--text-sm) / 1 var(--font-mono); color: var(--text-strong); }
  .notice { display: flex; align-items: center; gap: var(--space-2); margin: 0; padding: var(--space-2) var(--space-3); background: var(--bg-tint); border-radius: var(--radius-sm); font: var(--type-small); color: var(--text-strong); }
  .notice :global(svg) { flex: none; color: var(--label-color); }
  .hint, .warn { font: var(--type-small); color: var(--text-body); }
  .lnk { padding: 0; border: 0; background: none; color: var(--link); font: inherit; text-decoration: underline; cursor: pointer; }
  .summary { display: flex; align-items: center; gap: var(--space-2); margin: 0; font: var(--type-small); color: var(--text-body); }
  .summary :global(svg) { color: var(--label-color); flex: none; }

  .layout { display: grid; grid-template-columns: minmax(0, 1fr) 19rem; gap: var(--space-4); align-items: start; min-width: 0; }
  .mapcol { display: grid; gap: var(--space-2); min-width: 0; }
  .frame { position: relative; height: 62dvh; min-height: 24rem; min-width: 0; }
  .msg { display: grid; place-items: center; height: 100%; margin: 0; background: var(--bg-tint); border-radius: var(--radius-md); color: var(--text-body); }
  .credits { margin: 0; font: var(--type-small); color: var(--text-body); overflow-wrap: anywhere; }
  .side { display: grid; gap: var(--space-4); min-width: 0; align-content: start; }

  .pick { display: grid; gap: var(--space-2); background: var(--bg-tint); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); }
  .pick h2 { margin: 0; }
  .name { margin: 0; font: var(--fw-bold) var(--text-md) / 1.2 var(--font-display); color: var(--text-strong); overflow-wrap: anywhere; }
  .line { display: flex; align-items: center; gap: var(--space-2); margin: 0; font: var(--type-small); color: var(--text-body); flex-wrap: wrap; }
  .line strong { color: var(--text-strong); font-variant-numeric: tabular-nums; }
  .marks { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); }
  .marks li { display: flex; align-items: center; gap: var(--space-2); font: var(--type-small); color: var(--text-strong); }
  .sw { flex: none; width: 1.25rem; height: 1rem; border-radius: 2px; border: 1px solid var(--border-strong); }
  .sw.none { background: transparent; border-width: 2px; }
  .links { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); margin: 0; }
  .links a { display: inline-flex; align-items: center; gap: var(--space-2); font: var(--fw-semibold) var(--text-sm) / 1.2 var(--font-sans); }

  /* full screen (the browser's, or expanded to the viewport where it has none): the map fills the screen with its credit line
     under it, and the side column (legend, selected place) floats over the map on a raised surface, readable in both themes */
  .layout.full { position: relative; height: 100dvh; box-sizing: border-box; gap: 0; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); align-items: stretch; background: var(--bg-page); }
  .layout.expanded { position: fixed; inset: 0; z-index: calc(var(--z-overlay) + 2); height: auto; }
  .full .mapcol { grid-template-rows: minmax(0, 1fr) auto; gap: 0; height: 100%; min-height: 0; }
  .full .frame { height: 100%; min-height: 0; }
  .full .credits { padding: var(--space-1) var(--space-3); max-height: 4.5rem; overflow: auto; font-size: 0.75rem; background: var(--bg-surface); }
  .full .side {
    position: absolute; z-index: 3; top: 3.25rem; left: var(--space-2); width: min(19rem, calc(100% - 2 * var(--space-2))); max-height: calc(100% - 6rem); overflow: auto;
    padding: var(--space-3); background: var(--overlay-bg); border: 1px solid var(--overlay-border); border-radius: var(--radius-md); box-shadow: var(--overlay-shadow);
  }

  @media (max-width: 900px) {
    /* on a phone the column goes under the map, so it covers none of it */
    .layout.full { grid-template-rows: minmax(0, 1fr) auto; }
    .full .side { position: static; width: auto; max-height: 36dvh; border-width: 1px 0 0; border-radius: 0; box-shadow: none; }
    /* the last tick's label ("the 2020s (latest)") is centred on the end of the track: leave it room */
    .group.slide { padding-inline-end: var(--space-6, 2rem); }
    .layout { grid-template-columns: minmax(0, 1fr); }
    .frame { height: 56dvh; min-height: 20rem; }
  }
</style>
