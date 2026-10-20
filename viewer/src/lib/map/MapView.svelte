<script lang="ts">
  // the Map view: one indicator over one collection of places, coloured by its latest value, its departure from the
  // place's own record, its status or trend, the length of its record (or, for a categorical indicator, its largest
  // class or the share of one class) at a period the slider chooses. the classes, legend and table come from
  // classes.ts (status and trend from src/status); MapCanvas only draws. all state is the URL hash:
  // #view=map&ind=&coll=&color=&t=&cls=&method=
  import { onMount } from 'svelte'
  import { Button, Notice, Select, Slider } from '@marinebon/ui'
  import { Icon } from '../../../../src/icons/index.ts'
  import { periodLabel } from '../../../../src/status/index.ts'
  import type { MethodId } from '../../../../src/status/index.ts'
  import type { Catalog } from '../data.ts'
  import { DEFAULT_STATE, placeHref, serializeHash } from '../hash.ts'
  import type { MapColor, ViewState } from '../hash.ts'
  import { groupColumns } from '../matrix.ts'
  import { STATUS_WORDS, TREND_WORDS } from '../matrix.ts'
  import { defaultMethod, METHOD_LABELS } from '../place.ts'
  import { loadValuesFile } from '../valuesData.ts'
  import type { PlaceRow } from '../valuesData.ts'
  import { valuesUrl } from '../delivery.ts'
  import { MODE_LABELS, mapModel, periodToT } from './classes.ts'
  import { basemapCredit, dataCredit, layerCredit } from './credit.ts'
  import { layerFor } from './gazetteer.ts'
  import type { GazLayer } from './gazetteer.ts'
  import { mappable, pickMap } from './pick.ts'
  import { familyId, familyOf, foldFamily } from './family.ts'
  import MapCanvas from './MapCanvas.svelte'
  import MapLegend from './MapLegend.svelte'
  import MapTable from './MapTable.svelte'

  interface Props {
    catalog: Catalog
    view: ViewState
    titles: (coll: string) => string
    onpatch: (p: Partial<ViewState>) => void
    /** ms from the start of the view until the map was drawn */
    onready?: (ms: number) => void
  }
  let { catalog, view, titles, onpatch, onready }: Props = $props()

  const t0 = performance.now()
  const m = $derived(catalog.manifest)

  // ---- what is mapped ----
  const pick = $derived(pickMap(m.indicators, catalog.coverage, { ind: view.ind, coll: view.coll }))
  const ind = $derived(pick.ind)
  const coll = $derived(pick.coll)
  // the hash always names what is shown, so the view is a permalink even when it opened on the defaults
  $effect(() => { if (ind && coll && (view.ind !== ind.id || view.coll !== coll)) onpatch({ ind: ind.id, coll }) })

  const indicatorOptions = $derived(foldFamily(
    groupColumns(mappable(m.indicators, catalog.coverage), m.vocabularies, view.vocab, false)
      .flatMap(g => g.indicators.map(i => ({ value: i.id, label: i.short, group: g.term.label }))),
    ind?.id ?? null,
  ))
  // the OBIS indicators are one choice above, then a metric and an EOV (family.ts)
  const family = $derived(ind ? familyOf(ind, mappable(m.indicators, catalog.coverage)) : null)
  // by year or by decade, when the indicator has both
  const grains = $derived(ind ? (['year', 'decade'] as const).filter(g => ind.time_grains.includes(g)) : [])

  // ---- the values file: the slider's periods, departure, past statuses ----
  let values = $state.raw<Map<string, PlaceRow[]> | null>(null)
  let valuesError = $state('')
  $effect(() => {
    const url = ind && coll ? valuesUrl(catalog.base, ind, coll) : null
    values = null
    valuesError = ''
    if (!url) return
    let live = true
    loadValuesFile(url).then(
      v => { if (live) values = v },
      e => { if (live) valuesError = e instanceof Error ? e.message : String(e) },
    )
    return () => { live = false }
  })

  // ---- the gazetteer layer that draws the collection ----
  let layer = $state.raw<GazLayer | null>(null)
  let layerError = $state('')
  $effect(() => {
    const c = coll
    layer = null
    layerError = ''
    if (!c) return
    let live = true
    layerFor(c).then(
      l => { if (live) { layer = l; if (!l) layerError = `The gazetteer has no layer for ${c}.` } },
      e => { if (live) layerError = e instanceof Error ? e.message : String(e) },
    )
    return () => { live = false }
  })

  // ---- the model ----
  const model = $derived(
    ind ? mapModel(ind, catalog.coverage, values, { coll, color: view.color, t: view.t, method: view.method, cls: view.cls, grain: view.grain }) : null,
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
  const focusColor = $derived.by(() => { void theme; return css('--map-focus') })
  const classOf = $derived(new Map((model?.items ?? []).filter(i => i.k != null).map(i => [i.placeId, i.k as number])))

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

  // ---- the selected place ----
  let selectedId = $state<string | null>(null)
  let marker = $state<{ lng: number; lat: number } | null>(null)
  $effect(() => { void coll; selectedId = null; marker = null })
  const selectedItem = $derived(model?.items.find(i => i.placeId === selectedId) ?? null)
  function onpick(p: { placeId: string | null; lng: number; lat: number }) {
    selectedId = p.placeId
    marker = p.placeId ? { lng: p.lng, lat: p.lat } : null
  }
  const toPlace = (id: string) => placeHref(view, id, coll, ind?.id ?? null)
  const toMatrix = (id: string) => '#' + serializeHash({ ...DEFAULT_STATE, vocab: view.vocab, depth: view.depth, cell: { place: id, indicator: ind?.id ?? '' } })

  // ---- the map is ready once it has drawn the data ----
  let drawn = $state<'loading' | 'done'>('loading')
  let reported = false
  $effect(() => { if (drawn === 'done' && !reported) { reported = true; onready?.(Math.round(performance.now() - t0)) } })

  const dark = $derived(theme === 'dark')
  const credit = $derived(
    [basemapCredit(dark), layerCredit(layer) + (layer?.source_link ? ` (${layer.source_link.title})` : ''), ind ? dataCredit(ind) : '']
      .filter(Boolean).map(s => s.replace(/\.+$/, '') + '.').join(' '),
  )
  const heading = $derived(
    ind && model && coll ? `${ind.title} · ${titles(coll)} · by ${MODE_LABELS[model.color].toLowerCase()}${model.period ? ` · ${periodLabel(model.period, model.grain)}` : ''}` : '',
  )
  const methodChoices: MethodId[] = ['iea-sd', 'names-pct']
</script>

{#if !ind || !model || !coll}
  <Notice kind="info">No indicator in this catalog has values to map yet.</Notice>
{:else}
  <section class="controls" aria-label="Map controls">
    <div class="group wide">
      <Select label="Indicator" value={ind.id} options={indicatorOptions}
        onchange={(v: string) => onpatch({ ind: v, coll: null, color: null, t: null, cls: null, method: null, grain: null })} />
    </div>
    {#if family}
      <div class="group">
        <Select label="Metric" value={family.metric} options={family.metrics.map(c => ({ value: c.id, label: c.label }))}
          onchange={(v: string) => onpatch({ ind: familyId(v, family.eov), color: null, cls: null })} />
      </div>
      <div class="group">
        <Select label="EOV" value={family.eov} options={family.eovs.map(c => ({ value: c.id, label: c.label }))}
          onchange={(v: string) => onpatch({ ind: familyId(family.metric, v), color: null, cls: null })} />
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
    <div class="group" role="group" aria-label="Places">
      <span class="mbon-label">Places</span>
      <div class="row">
        {#each pick.colls as c (c)}
          <Button variant="quiet" size="sm" pressed={c === coll} onclick={() => onpatch({ coll: c, t: null, cls: null })}>{titles(c)}</Button>
        {/each}
      </div>
    </div>
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
        <span class="one">{model.period ? periodLabel(model.period, model.grain) : '–'}{values || !valuesError ? '' : ''}</span>
      {/if}
      {#if valuesError}<span class="warn" role="status">The record did not load, so only the latest period is shown ({valuesError}).</span>
      {:else if !values && periods.length < 2}<span class="hint" role="status">Loading the record for the period slider…</span>{/if}
    </div>
  </section>

  <p class="summary" role="status" aria-live="polite">
    <Icon name="view-map" size={18} />
    <span>{heading}{model.pending ? ' · loading the record…' : ''}</span>
  </p>

  <div class="layout">
    <div class="mapcol">
      <div class="frame">
        {#if layer}
          <MapCanvas {layer} {classOf} {colors} line={lineColor} none={noneColor} focus={focusColor} {dark} selected={selectedId} {marker}
            {onpick} onstate={s => (drawn = s)} label={`Map of ${ind.short} by place`} />
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
      <MapLegend {model} unit={ind.unit_label ?? ''} />
      <section class="pick" aria-labelledby="pick-h" aria-live="polite">
        <h2 id="pick-h" class="mbon-label">Selected place</h2>
        {#if selectedId}
          {@const it = selectedItem}
          <p class="name">{it?.name ?? selectedId}</p>
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
          {:else}
            <p class="line">No {ind.short} value for this place in this collection.</p>
          {/if}
          <p class="links">
            <a href={toPlace(selectedId)}><Icon name="view-place" size={16} />Open place view</a>
            <a href={toMatrix(selectedId)}><Icon name="view-matrix" size={16} />Open in matrix</a>
          </p>
        {:else}
          <p class="line">Click or tap a place on the map, or pick one from the table below.</p>
        {/if}
      </section>
    </aside>
  </div>

  <MapTable {model} placeHref={toPlace} selected={selectedId} caption={`${ind.title}, ${titles(coll)}: value, period and class of every place`} />
{/if}

<style>
  .controls { display: flex; flex-wrap: wrap; gap: var(--space-3) var(--space-5); align-items: flex-start; }
  .group { display: grid; gap: var(--space-2); min-width: 0; }
  .group.wide { min-width: min(18rem, 100%); }
  .group.slide { min-width: min(20rem, 100%); flex: 1; max-width: 32rem; }
  .row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .one { font: var(--fw-semibold) var(--text-sm) / 1 var(--font-mono); color: var(--text-strong); }
  .hint, .warn { font: var(--type-small); color: var(--text-body); }
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

  @media (max-width: 900px) {
    .layout { grid-template-columns: minmax(0, 1fr); }
    .frame { height: 56dvh; min-height: 20rem; }
  }
</style>
