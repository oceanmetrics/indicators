<script lang="ts">
  // the Map view: one indicator over the places of the shared selection (the Select section above the tabs: the hash's pi, px, ii and
  // ix), coloured by its latest value, its departure from the place's own record, its status or trend, the length of its record (or,
  // for a categorical indicator, its largest class or the share of one class) at a period the slider chooses. every group of the
  // selection is a part of the map, layered as a place set is (parts.ts), with one legend, one table and one colour scale across all
  // their places; a group chosen in part is drawn restricted to its chosen places. the indicator is the hash's `ind` when it is in
  // the selection, else the first selected one with values in the selected places. the classes, legend and table come from
  // classes.ts (status and trend from @oceanmetrics/status); MapCanvas only draws. all state is the URL hash:
  // #view=map&ind=&pi=&px=&ii=&ix=&place=&color=&t=&cls=&layer=&method=
  // under the places, the layer the hash's `layer` names (layerSlot.ts; the `grid` kind: a slice of the dataset at the step of `t`,
  // computed in the browser over the places drawn, gridKind.ts). the Period scrubber moves `t` and the window [t - w, t] behind it.
  // the group's members that are not computed are drawn faint (and as a small hollow circle from far away), and a click on one offers
  // the next steps. Compare (the hash's t2, compare.ts) draws the same layer at a second period left of a swipe handle, or with
  // anom=1 the difference t2 - t per cell; the legend names both periods. t2 may be a year range (2003-2012): the mean of its
  // periods at the month of t, at most 12 (compare.ts). the layer's palette is the hash's `pal` (a ramp of @oceanmetrics/map);
  // the cell under the pointer (or a tap) is read out beside it and in the legend, the legend counts the cells sliced (in all
  // and per place), and a failed slice gets a Retry. `l` turns the compare mode on and off (keys.ts).
  import { onMount, untrack } from 'svelte'
  import { valuesUrl } from '@oceanmetrics/catalog/cards'
  import { Button, Notice, Select, Toggle } from '@marinebon/ui'
  import { Icon } from '../../../../src/icons/index.ts'
  import { periodLabel, STATUS_WORDS, TREND_WORDS } from '@oceanmetrics/status'
  import type { MethodId } from '@oceanmetrics/status'
  import { expandIndicators } from '@oceanmetrics/catalog/report'
  import type { Catalog, Layers } from '../data.ts'
  import { groupHref, mapToMatrixHref, placeHref } from '../hash.ts'
  import type { MapColor, ViewState } from '../hash.ts'
  import { cellModel, indexCoverage, isLiveProducer, orderGroups } from '../matrix.ts'
  import type { CoverageIndex, Place } from '../matrix.ts'
  import { defaultMethod } from '../place.ts'
  import { includeIndicator, withSelection } from '../selection.ts'
  import { loadValuesFile } from '../valuesData.ts'
  import type { PlaceRow } from '../valuesData.ts'
  import { computedGroups } from '../nextSteps.ts'
  import NextSteps from '../NextSteps.svelte'
  import IndicatorPicker from '../pick/IndicatorPicker.svelte'
  import { placesWithValueAnywhere } from '../pick/indicatorsTree.ts'
  import { MODE_LABELS, mapModel, periodToT } from './classes.ts'
  import type { MapItem } from './classes.ts'
  import { dataCredit, partsCredit, slotCredit } from './credit.ts'
  import { parseLayerKey, registerSlotKind, slotFor } from './layerSlot.ts'
  import type { LayerSlot } from './layerSlot.ts'
  import { gridKind } from './gridKind.ts'
  import type { GridLayerSlot } from './gridKind.ts'
  import { cellCountLine, cellReadout, cellRows, clampLine, layerChoices, leftOutLine, palOf, paletteShown, rampChoices, readoutPlace, slicedIds, slicePlaces, slicePlacesKey, slotLegendLine, stepDate } from './gridLayer.ts'
  import { defaultRampFor, RAMPS } from '@oceanmetrics/map'
  import type { CellProps, GridSlot } from '@oceanmetrics/map'
  import { compareToggle, shortcutFor } from '../keys.ts'
  import { defaultWindow } from './timeWindow.ts'
  import TimeScrubber from './TimeScrubber.svelte'
  import SwipeHandle from './SwipeHandle.svelte'
  import { compareLegendLine, defaultT2, isYearRange, parseYearRange, rangeLabel, rangeMonth, yearRangeChoices } from './compare.ts'
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
  // the grid kind slices the places the map draws now (read when a slot is made; a new set of places makes a new slot)
  registerSlotKind('grid', gridKind(() => untrack(() => sliceSel)))
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

  // ---- the period scrubber: t and the window [t - w, t] (the window is the view's own, not in the hash) ----
  const periods = $derived(model?.periods ?? [])
  const idxNow = $derived(model?.period ? Math.max(0, periods.indexOf(model.period)) : 0)
  const canSlide = $derived(periods.length > 1 && values != null)
  function onslide(i: number) {
    if (!model) return
    const last = i >= periods.length - 1
    onpatch({ t: last ? null : periodToT(periods[Math.max(0, i)], model.grain) })
  }
  // the window opens at the grain's default and goes back to it when the indicator or the grain changes
  const winDefault = $derived(model ? defaultWindow(model.grain, periods.length) : 1)
  let winSet = $state<{ key: string; w: number } | null>(null)
  const winKey = $derived(`${ind?.id ?? ''}|${model?.grain ?? ''}`)
  const win = $derived(winSet?.key === winKey ? winSet.w : winDefault)
  const periodPlain = (i: number) => (model && periods[i] ? periodLabel(periods[i], model.grain) : '')
  const periodWord = (i: number) => (model && periods[i] ? periodLabel(periods[i], model.grain) + (i === periods.length - 1 ? ' (latest)' : '') : '')

  // ---- the layer under the map (the hash's `layer`), at the step of `t` (null: the dataset's latest) ----
  // the places the slice covers: the polygon places of the parts drawn (gridLayer.ts slicePlaces); the slot is made again when they change
  const sliceSel = $derived(slicePlaces(parts))
  const sliceKey = $derived(slicePlacesKey(sliceSel))
  // a boolean, so the slot is not made again each time the parts are rebuilt (a new t, a new colour mode): only update(t) runs then
  const haveParts = $derived(!!built)
  const slotT = $derived(stepDate(view.t))
  let slot = $state.raw<LayerSlot | null>(null)
  let slotError = $state('')
  // the slot says when its legend changes (a new period, the slice in, an error); the legend line reads it again
  let slotTick = $state(0)
  // a string, so a new hash (a new t) does not make the slot again: `view` is a new object each time, only update(t) runs then
  const layerKey = $derived(view.layer)
  // a Retry after the slot itself failed to load (its collection) makes it again
  let slotTry = $state(0)
  $effect(() => {
    const spec = parseLayerKey(layerKey)
    void sliceKey
    void slotTry
    slot = null
    slotError = ''
    if (!spec || !haveParts) return
    let live = true
    try {
      slotFor(spec, { onchange: () => { if (live) slotTick++ } }).then(
        sl => { if (live) slot = sl },
        e => { if (live) slotError = `The layer ${layerKey} did not load (${e instanceof Error ? e.message : String(e)}).` },
      )
    } catch (e) { slotError = `The layer ${layerKey} cannot be drawn here (${e instanceof Error ? e.message : String(e)}).` }
    return () => { live = false }
  })
  const layerOptions = $derived(layerChoices(m.indicators, ind, view.layer))
  const slotLegend = $derived.by(() => { void slotTick; return slot?.legend() ?? null })
  // the places the slice covers: their fills give way to it (MapCanvas), the ones it leaves out keep theirs
  const sliced = $derived.by(() => { void slotTick; return slicedIds(sliceSel.places, (slot as GridLayerSlot | null)?.leftOut?.() ?? [], slotLegend, !!slot) })

  // ---- compare: the same layer at a second period t2 (the hash's), left of the swipe; or t2 - t per cell (anom=1) ----
  const compareOn = $derived(!!view.t2)
  const anomOn = $derived(!!view.t2 && view.anom)
  // a year range stays as it is: the companion averages its periods at the month of t
  const slot2T = $derived(isYearRange(view.t2) ? view.t2 : stepDate(view.t2))
  let slot2 = $state.raw<LayerSlot | null>(null)
  let slot2Tick = $state(0)
  $effect(() => {
    const first = slot as GridLayerSlot | null
    const on = compareOn, a = anomOn
    slot2 = null
    if (!first?.companion || !on) return
    let live = true
    slot2 = first.companion({ anom: a, onchange: () => { if (live) slot2Tick++ } })
    return () => { live = false }
  })
  const slot2Legend = $derived.by(() => { void slot2Tick; void slotTick; return slot2?.legend() ?? null })
  // the handle's position: the hash's (written on release), followed live while a drag runs
  let swipeLive = $state<number | null>(null)
  const swipeHash = $derived(view.swipe ?? 0.5)
  $effect(() => { void swipeHash; swipeLive = null })
  const swipeF = $derived(swipeLive ?? swipeHash)
  const t2Options = $derived.by(() => {
    if (!model) return []
    const opts: { value: string; label: string; group?: string }[] = periods.map(p => ({ value: periodToT(p, model.grain), label: periodLabel(p, model.grain) }))
    opts.push(...yearRangeChoices(periods, view.t))
    if (view.t2 && !opts.some(o => o.value === view.t2)) opts.unshift({ value: view.t2, label: isYearRange(view.t2) ? `mean of ${view.t2.replace('-', '–')}` : view.t2 })
    return opts
  })
  const t2Default = $derived(model ? defaultT2(periods, idxNow, win) : null)
  const periodOf = (t: string | null) => (t && model ? periodLabel(t, model.grain) : 'the latest time')
  // a year range's Then: "mean of 2003-07..2012-07", with what it held once its slices are in
  const t2Range = $derived(parseYearRange(view.t2))
  const meanInfo = $derived.by(() => { void slot2Tick; return t2Range ? (slot2 as GridLayerSlot | null)?.meanInfo?.() ?? null : null })
  const rangeShort = $derived(t2Range && model ? rangeLabel(t2Range, rangeMonth(slotT, periods.at(-1) ?? null), t => periodLabel(t, model.grain)) : null)
  const rangeLong = $derived(t2Range && model ? rangeLabel(t2Range, rangeMonth(slotT, periods.at(-1) ?? null), t => periodLabel(t, model.grain), meanInfo) : null)
  // the periods asked for (a slot's legend has its t only once mounted)
  const leftLabel = $derived(rangeShort ?? periodOf(slot2T))
  const rightLabel = $derived(periodOf(slotT))

  const placeName = (id: string) => places?.find(p => p.id === id)?.name ?? idx?.places.find(p => p.id === id)?.name ?? titles(id)
  const slotLine = $derived.by(() => {
    void slotTick
    const l = slotLegend
    if (!l || !model) return slotError
    const g = slot as GridLayerSlot | null
    const left = g?.leftOut ? leftOutLine(g.leftOut(), g.without(), placeName) : ''
    void slot2Tick
    const l2 = slot2?.legend() ?? null
    // a year range's long Then is said once, then "Then" (compare.ts compareLegendLine)
    const line = l2 ? compareLegendLine({ title: l.title, via: l.via, first: { ...l, t: slotT }, second: { ...l2, t: slot2T }, anom: anomOn, secondLabel: rangeLong ? `Then: ${rangeLong}` : null, secondShort: rangeLong ? 'Then' : null }, t => periodLabel(t, model.grain)) : slotLegendLine(l, t => periodLabel(t, model.grain))
    // a period outside the layer's record draws its last (or first) step, and says so (gridLayer.ts clampStep)
    const c1 = g?.stepOf?.(slotT) ?? null
    const c2 = l2 && !isYearRange(slot2T) ? (slot2 as GridLayerSlot | null)?.stepOf?.(slot2T) ?? null : null
    const moved = [c1 ? clampLine(rightLabel, c1.day, c1.clamped) : '', c2 ? clampLine(leftLabel, c2.day, c2.clamped) : ''].filter(Boolean).join(' · ')
    return line + (moved ? ` · ${moved}` : '') + (left ? ` · ${left}` : '')
  })

  // ---- the palette (the hash's `pal`): the slot and the compare slot repaint, the anomaly keeps its diverging ramp ----
  const pal = $derived(palOf(view.pal, RAMPS))
  const slotVar = $derived(parseLayerKey(view.layer)?.variable ?? '')
  const palDefault = $derived((slot as GridLayerSlot | null)?.defaultRamp ?? defaultRampFor(slotVar))
  const palOptions = $derived(rampChoices(palDefault, RAMPS))
  $effect(() => {
    const r = pal, a = anomOn
    const s1 = slot as GridSlot | null, s2 = slot2 as GridSlot | null
    s1?.setRamp?.(r)
    if (s2 && !a) s2.setRamp?.(r)
  })

  // ---- the cells sliced: in all, at each period, and per place ----
  const countLine = $derived.by(() => {
    void slotTick; void slot2Tick
    const g = slot as GridLayerSlot | null
    if (!g?.perPlace) return null
    const s2 = slot2 as GridSlot | null
    return cellCountLine(g.perPlace(), [{ period: rightLabel, counts: g.counts?.() ?? null }, ...(s2 && !anomOn ? [{ period: leftLabel, counts: s2.counts?.() ?? null }] : [])])
  })
  const countRows = $derived.by(() => { void slotTick; const pp = (slot as GridLayerSlot | null)?.perPlace?.(); return pp ? cellRows(pp, placeName) : [] })

  // ---- a failed slice: Retry asks for it again (the slot itself, when it did not load) ----
  const noData = (l: { problem?: string | null } | null) => !!l?.problem?.startsWith('no data')
  const canRetry = $derived(!!slotError || noData(slotLegend) || noData(slot2Legend))
  function retry() {
    if (slotError) { slotTry++; return }
    if (noData(slotLegend)) (slot as GridSlot | null)?.retry?.()
    if (noData(slot2Legend)) (slot2 as GridSlot | null)?.retry?.()
  }

  // ---- the cell under the pointer (or the last tap): beside it, and in the legend ----
  let hover = $state<{ x: number; y: number; first: CellProps | null; second: CellProps | null } | null>(null)
  let frameW = $state(0)
  let frameH = $state(0)
  const readout = $derived.by(() => {
    const c = hover
    if (!c || !model) return null
    const units = slotLegend?.units ?? null
    const a = c.first, b = c.second
    const cell = a ?? b
    if (!cell) return null
    if (slot2 && b) {
      // with the anomaly the second slot holds t2 - t: t2 is t plus it
      const then = anomOn ? (a && a.value !== null && b.value !== null ? a.value + b.value : null) : b.value
      return cellReadout({ cell, units, now: { period: rightLabel, value: a?.value ?? null }, then: { period: leftLabel, value: then } })
    }
    return a ? cellReadout({ cell: a, units, now: { period: rightLabel, value: a.value } }) : null
  })
  const tip = $derived(hover ? readoutPlace(hover.x, hover.y, frameW, frameH) : null)
  $effect(() => { void layerKey; void slotT; void slot2T; hover = null })

  // ---- the keyboard: `l` turns the compare mode on and off (erddap-places' lens key) ----
  let layerBox = $state<HTMLElement>()
  let keyNote = $state('')
  $effect(() => { if (view.layer) keyNote = '' })
  function onkey(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null
    if (!model || !shortcutFor({ key: e.key, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, repeat: e.repeat, targetTag: el?.tagName, targetEditable: el?.isContentEditable })) return
    const r = compareToggle({ on: compareOn, layer: view.layer, t2Default: t2Default ? periodToT(t2Default, model.grain) : null })
    if (r === 'no-layer') {
      e.preventDefault()
      layerBox?.querySelector('select')?.focus()
      keyNote = 'Choose a layer under the map first: l then compares it at two periods.'
      return
    }
    if (r) { e.preventDefault(); onpatch(r) }
  }

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
  // the basemap's credit, from the attribution of the style MapCanvas set
  let baseCredit = $state('')
  const credit = $derived(
    [baseCredit, partsCredit(parts.map(p => p.home)), slotCredit(slot), ind ? dataCredit(ind) : '']
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

<svelte:window onkeydown={onkey} />

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
            <Button variant="quiet" size="sm" pressed={model.method === id} onclick={() => onpatch({ method: id === method ? null : id })}>{id}</Button>
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
        <TimeScrubber label="Period" n={periods.length} value={idxNow} {win} defaultWin={winDefault} format={periodWord} formatEdge={periodPlain}
          disabled={!canSlide} onchange={onslide} onwindow={w => (winSet = { key: winKey, w })} />
      {:else}
        <span class="mbon-label">Period</span>
        <span class="one">{model.period ? periodLabel(model.period, model.grain) : '–'}</span>
      {/if}
      {#if valuesError}<span class="warn" role="status">The record did not load, so only the latest period is shown ({valuesError}).</span>
      {:else if !values && periods.length < 2}<span class="hint" role="status">Loading the record for the period slider…</span>{/if}
    </div>
    <div class="group layer" bind:this={layerBox}>
      <Select label="Layer under the map" value={view.layer ?? ''} options={layerOptions} onchange={(v: string) => onpatch({ layer: v || null })} />
      {#if keyNote}<span class="hint" role="status">{keyNote}</span>{/if}
    </div>
    <!-- the difference keeps its own diverging ramp: no palette to choose then -->
    {#if paletteShown(view.layer, anomOn)}
      <div class="group layer">
        <Select label="Palette" value={pal ?? ''} options={palOptions} onchange={(v: string) => onpatch({ pal: v || null })} />
      </div>
    {/if}
    <div class="group compare" role="group" aria-label="Compare two periods">
      <Toggle label="Compare" hint={view.layer ? 'the layer at a second period, with a swipe' : 'choose a layer under the map first'} checked={compareOn}
        disabled={!view.layer || periods.length < 2} onchange={(on: boolean) => onpatch(on ? { t2: t2Default ? periodToT(t2Default, model.grain) : null } : { t2: null, anom: false, swipe: null })} />
      {#if compareOn}
        <div class="with"><Select label="Compare with" value={view.t2 ?? ''} options={t2Options} onchange={(v: string) => onpatch({ t2: v || null })} /></div>
        <Toggle label="Difference" hint={`${leftLabel} minus ${rightLabel}, per cell`} checked={anomOn} onchange={(a: boolean) => onpatch({ anom: a })} />
      {/if}
    </div>
  </section>

  {#if notice}<p class="notice" role="status"><Icon name="ui-info" size={16} />{notice}</p>{/if}
  <p class="summary" role="status" aria-live="polite">
    <Icon name="view-map" size={18} />
    <span>{heading}{model.pending ? ' · loading the record…' : ''}</span>
  </p>

  <div class="layout" class:full={full !== 'off'} class:expanded={full === 'expanded'} bind:this={fsEl}>
    <div class="mapcol">
      <div class="frame" bind:clientWidth={frameW} bind:clientHeight={frameH}>
        {#if parts.length}
          <MapCanvas {parts} {bbox} {colors} line={lineColor} none={noneColor} nofill={nofillColor} faint={faintColor} focus={focusColor} {dark} selected={selectedId} proj={view.proj} {marker}
            {onpick} onstate={s => (drawn = s)} label={`Map of ${ind.short} by place`} {slot} {slotT} {sliced} oncredit={c => (baseCredit = c)}
            {slot2} {slot2T} swipe={swipeF} anom={anomOn} oncell={c => (hover = c)} />
          {#if readout && tip}
            <div class="readout" class:fx={tip.flipX} class:fy={tip.flipY} style:left="{tip.left}px" style:top="{tip.top}px" aria-hidden="true">
              {#each readout as l, i (i)}<span>{l}</span>{/each}
            </div>
          {/if}
          {#if slot2 && !anomOn}<SwipeHandle value={swipeF} left={leftLabel} right={rightLabel} onchange={f => (swipeLive = f)} oncommit={f => onpatch({ swipe: f })} />{/if}
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
      <MapLegend {model} unit={ind.unit_label ?? ''} layer={slotLine} ramp={(anomOn ? slot2Legend?.ramp : slotLegend?.ramp) ?? null} rampUnit={slotLegend?.units ?? ''}
        counts={countLine} rows={countRows} cell={readout ? `Cell: ${readout.join(' · ')}` : ''} onretry={canRetry ? retry : null} />
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
  .group.compare { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--space-2) var(--space-5); min-width: 0; flex: 1 1 100%; }
  /* wide enough for a year range's "mean of 2003–2012" with the select's arrow */
  .group.compare .with { width: min(13rem, 100%); }
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
  /* the cell readout beside the pointer: small, on the overlay surface, never in the pointer's way */
  .readout {
    position: absolute; z-index: 4; display: grid; gap: 1px; max-width: min(18rem, 70%); padding: var(--space-1) var(--space-2); pointer-events: none;
    transform: translate(14px, 14px); background: var(--overlay-bg); border: 1px solid var(--overlay-border); border-radius: var(--radius-sm); box-shadow: var(--overlay-shadow);
    font: var(--text-xs) / 1.35 var(--font-sans); color: var(--text-strong); font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .readout span:last-child { color: var(--text-body); }
  .readout.fx { transform: translate(calc(-100% - 14px), 14px); }
  .readout.fy { transform: translate(14px, calc(-100% - 14px)); }
  .readout.fx.fy { transform: translate(calc(-100% - 14px), calc(-100% - 14px)); }
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
