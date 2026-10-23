// the `grid` kind of the layer slot, its rules in plain functions: the gazetteer's collection of an ERDDAP dataset, the
// picker's choices, which places are sliced and which are left out (and why), the cell budget, the date a period asks for,
// the legend line and the credit. the wiring (the engine in DuckDB-WASM, the place geometry, `gridSlot` of
// `@oceanmetrics/map`) is gridSource.ts, loaded the first time a slot mounts. no MapLibre, no DuckDB here.
//
// the extent of the slice: one slice per place lobe (each lobe of each polygon place of the selection asks ERDDAP for its
// own bbox at the step and is masked by the place itself), never one box over the union of the places. the sanctuaries
// run from American Samoa to Lake Huron: their union box at 0.05° is about 4.5 million cells a step, the eighteen lobes
// together about 0.2 million, and a cell outside every place would be masked away anyway.
import type { Indicator } from '../data.ts'
import { store } from '../../../../src/storage.ts'
import { formatLayerKey, parseLayerKey } from './layerSlot.ts'
import type { LegendSpec } from './layerSlot.ts'
import type { MapPart } from './parts.ts'

/** the gazetteer's STAC root; an ERDDAP dataset is `erddap/<dataset id>/collection.json` under it, its places `<coll>/places.parquet` */
export const GAZETTEER_STAC = store('gazetteer/')
export const collectionUrl = (datasetId: string) => `${GAZETTEER_STAC}erddap/${datasetId}/collection.json`
export const placesParquetUrl = (coll: string) => `${GAZETTEER_STAC}${coll}/places.parquet`

export const hostOf = (url: string) => { try { return new URL(url).host } catch { return url } }

// ---- the picker's choices ----

export interface LayerChoice {
  value: string
  label: string
  group?: string
}

/**
 * "Layer under the map": none, then one entry per variable of the ERDDAP datasets the manifest's indicators come from, the
 * dataset of the indicator shown first, the others by title; a layer the link names that is not among them comes after none
 */
export function layerChoices(indicators: readonly Pick<Indicator, 'id' | 'short' | 'dataset'>[], current: Pick<Indicator, 'dataset'> | null, layer: string | null): LayerChoice[] {
  const byDataset = new Map<string, { title: string; vars: Map<string, string> }>()
  for (const ind of indicators) {
    const [src, ds, variable] = ind.id.split(':')
    if (src !== 'erddap' || !ds || !variable) continue
    const d = byDataset.get(ds) ?? { title: ind.dataset.title, vars: new Map<string, string>() }
    if (!d.vars.has(variable)) d.vars.set(variable, `${ind.short} (${variable})`)
    byDataset.set(ds, d)
  }
  const own = current?.dataset.id ?? null
  const order = [...byDataset.keys()].sort((a, b) => Number(b === own) - Number(a === own) || byDataset.get(a)!.title.localeCompare(byDataset.get(b)!.title))
  const key = (id: string, variable: string) => formatLayerKey({ kind: 'grid', id, variable })
  const out: LayerChoice[] = [{ value: '', label: 'None' }]
  const listed = order.flatMap(ds => [...byDataset.get(ds)!.vars.keys()].map(v => key(ds, v)))
  const spec = parseLayerKey(layer)
  if (spec && !listed.includes(formatLayerKey(spec))) out.push({ value: formatLayerKey(spec), label: `${spec.id}${spec.variable ? ` (${spec.variable})` : ''}`, group: 'From the link' })
  for (const ds of order) {
    const d = byDataset.get(ds)!
    for (const [v, label] of d.vars) out.push({ value: key(ds, v), label, group: d.title })
  }
  return out
}

// ---- which places are sliced ----

/** a place the slice masks: its gazetteer collection (where its polygon is) and its id */
export interface SlicePlace { coll: string; id: string }

export interface SlicePlaces {
  places: SlicePlace[]
  /** groups whose places have no polygon here: a reference group (Marine Regions, drawn by its own WMS) or a derived one */
  without: string[]
}

/**
 * the places of the map's parts the slice covers: every computed place of a vector group (its `known` features, only its
 * chosen ones when the group is chosen in part), from the group's own gazetteer collection. a reference group's geometry
 * is never hosted by us and a derived group's pieces are features of another layer, so neither is sliced; they are named.
 */
export function slicePlaces(parts: readonly Pick<MapPart, 'group' | 'kind' | 'derived' | 'known' | 'only' | 'home'>[]): SlicePlaces {
  const places: SlicePlace[] = []
  const without: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    if (p.kind !== 'vector' || p.derived) { without.push(p.group); continue }
    const only = p.only ? new Set(p.only) : null
    for (const id of [...p.known].sort()) {
      if (only && !only.has(id)) continue
      const k = `${p.home.slug}\u0001${id}`
      if (seen.has(k)) continue
      seen.add(k)
      places.push({ coll: p.home.slug, id })
    }
  }
  return { places, without }
}

/**
 * the places whose fill gives way to the slice: the ones sliced, less the ones it left out; null (every place keeps its
 * fill) without a slot, or when the slice failed whole (a problem and no ramp: the server did not answer)
 */
export function slicedIds(places: readonly SlicePlace[], leftOut: readonly string[], legend: Pick<LegendSpec, 'problem' | 'ramp'> | null, hasSlot: boolean): string[] | null {
  if (!hasSlot || (legend?.problem && !legend.ramp)) return null
  const out = new Set(leftOut)
  return places.map(p => p.id).filter(id => !out.has(id))
}

/** a key that changes when the sliced places do (the slot is made again) */
export const slicePlacesKey = (s: SlicePlaces) => s.places.map(p => `${p.coll}/${p.id}`).join(',')

// ---- the cell budget ----

/** one lobe's request is at most this many cells a step (PMNM's west lobe at 0.05° is about 100,000) */
export const MAX_LOBE_CELLS = 250_000
/** all lobes together, a step: what the mask, DuckDB and the map's GeoJSON hold at once */
export const MAX_SLICE_CELLS = 600_000

/** the cells a box covers on a grid of `step` degrees (both axes), counting a partial cell as one */
export function boxCells(bbox: readonly number[], step: readonly [number, number]): number {
  const [w, s, e, n] = bbox
  const nx = Math.max(1, Math.ceil(Math.abs(e - w) / step[0]))
  const ny = Math.max(1, Math.ceil(Math.abs(n - s) / step[1]))
  return nx * ny
}

/**
 * the lobes the slice asks for, place by place in order, within the budget: a place with a lobe over `lobe` cells is left
 * out whole (half a place would read as the place), and so is a place that would take the running total past `total`; the
 * places left out are named
 */
export function budgetLobes<L extends { bbox: readonly number[] }>(byPlace: readonly { place: string; lobes: readonly L[] }[], step: readonly [number, number],
  limits = { lobe: MAX_LOBE_CELLS, total: MAX_SLICE_CELLS }): { kept: L[]; left: string[]; cells: number } {
  const kept: L[] = []
  const left: string[] = []
  let cells = 0
  for (const { place, lobes } of byPlace) {
    const each = lobes.map(l => boxCells(l.bbox, step))
    const sum = each.reduce((s, c) => s + c, 0)
    if (each.some(c => c > limits.lobe) || cells + sum > limits.total) { left.push(place); continue }
    kept.push(...lobes)
    cells += sum
  }
  return { kept, left, cells }
}

/** a grid's axis steps in degrees [lon, lat] from its STAC `cube:dimensions` (0.05 when not stated) */
export function axisSteps(collection: { 'cube:dimensions'?: Record<string, { step?: number | string | null } | undefined> } | null | undefined): [number, number] {
  const d = collection?.['cube:dimensions'] ?? {}
  const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : Number(v) > 0 ? Number(v) : 0.05)
  return [num(d.longitude?.step ?? d.lon?.step), num(d.latitude?.step ?? d.lat?.step)]
}

// ---- the time asked for ----

/** the step's date of a period (`t` of the hash: "2024-07" -> "2024-07-01", "2024" -> "2024-01-01"); null stays null (the latest) */
export function stepDate(t: string | null | undefined): string | null {
  if (!t) return null
  const [y, m = '01', d = '01'] = t.slice(0, 10).split('-')
  return /^\d{4}$/.test(y) ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : null
}

/**
 * the step a slice asks for, inside the dataset's record (erddap-places: "t the window's last day clamped to the dataset's last
 * step"): a day past the record's last step asks for that step, a day before its first for the first; a day inside it, and null
 * (the latest), stay as they are. `clamped` says which end it was moved to. the extent is the server's (`/info`), so a layer
 * whose record ends before the indicator's (IMERG's final run lags by months) still draws its last month instead of failing
 */
export function clampStep(day: string | null, extent: { start: string; end: string } | null): { day: string | null; clamped: 'end' | 'start' | null } {
  if (!day || !extent) return { day, clamped: null }
  const d = day.slice(0, 10), lo = extent.start.slice(0, 10), hi = extent.end.slice(0, 10)
  if (hi && d > hi) return { day: hi, clamped: 'end' }
  if (lo && d < lo) return { day: lo, clamped: 'start' }
  return { day, clamped: null }
}

/** what the legend adds when the period asked for is outside the dataset's record: "2026-08 is past the record of this layer: its last step, 2026-06-01, is drawn" */
export function clampLine(asked: string, drawn: string, clamped: 'end' | 'start'): string {
  return clamped === 'end'
    ? `${asked} is past the record of this layer: its last step, ${drawn}, is drawn`
    : `${asked} is before the record of this layer: its first step, ${drawn}, is drawn`
}

// ---- the legend and the credit ----

/** how the slice is drawn: in the browser, from the dataset's own server */
export const gridVia = (host: string) => `grid slice in the browser (DuckDB-WASM) from ERDDAP at ${host}`

/** the layer's title: its variable as the dataset describes it, from the dataset */
export function gridTitle(ds: { title: string }, variable: { name: string; description?: string | null }): string {
  const d = variable.description || variable.name
  return `${d.charAt(0).toUpperCase()}${d.slice(1)} from ${ds.title}`
}

/** the credit line: the layer, the organisations that produce or license it, and where it is read from */
export function gridCredit(title: string, producers: readonly string[], host: string): string {
  return `${title}${producers.length ? ` (${producers.join('; ')})` : ''}, sliced in the browser from ERDDAP at ${host}`
}

/** the producers and licensors of a STAC collection */
export function producersOf(collection: { providers?: { name?: string; roles?: string[] }[] } | null | undefined): string[] {
  return (collection?.providers ?? []).filter(p => p.name && p.roles?.some(r => r === 'producer' || r === 'licensor')).map(p => p.name as string)
}

/** the unit as the legend says it: Celsius in any spelling, and Kelvin (the engine converts it), as °C */
export function unitLabel(unit: string | null | undefined): string | null {
  const u = (unit ?? '').trim()
  if (!u || u === '1' || u.toLowerCase() === 'none') return null
  if (/^(c|celsius|deg(ree)?s?_?c(elsius)?|°c|k|kelvin|degree_?k(elvin)?)$/i.test(u)) return '°C'
  return u
}

/** a number for the legend: three significant digits, no exponent */
const num = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2))

/**
 * "Layer: <title> at <period> · <via>", then its range ("12.3 to 30.1 °C") once the slice is in, "loading the slice…" until
 * then, and "· <problem>" when something went wrong
 */
export function slotLegendLine(l: LegendSpec, period: (t: string) => string): string {
  const at = l.t ? period(l.t) : 'the latest time'
  const range = l.ramp ? ` · ${num(l.ramp.min)} to ${num(l.ramp.max)}${l.units ? ` ${l.units}` : ''}` : ''
  const state = l.problem ? ` · ${l.problem}` : l.ramp || l.classes?.length ? '' : ' · loading the slice…'
  return `Layer: ${l.title} at ${at} · ${l.via}${range}${state}`
}

/** what the legend adds when places were left out of the slice: too large for the budget, or without a polygon here */
export function leftOutLine(left: readonly string[], without: readonly string[], name: (id: string) => string): string {
  const bits: string[] = []
  if (left.length) bits.push(`not sliced (more than ${MAX_LOBE_CELLS.toLocaleString('en-US')} cells a request at this grid): ${left.map(name).join(', ')}`)
  if (without.length) bits.push(`no polygon to mask here (drawn by their publisher): ${without.map(name).join(', ')}`)
  return bits.join(' · ')
}

// ---- the cells sliced (the legend's counts) ----

/** one place's share of the mask: its cells and those on its boundary (area weight below 1) */
export interface PlaceCells { id: string; cells: number; boundary: number }

/** what one slice holds (`@oceanmetrics/map` `sliceCounts`) */
export interface CountsLike { cells: number; withValue: number; boundary: number }

const n0 = (v: number) => v.toLocaleString('en-US')

/**
 * the counts the legend states, erddap-places' "462 cells · 278 on the boundary" for every place at once: "Cells: 101,626 sliced
 * in 17 places (3,120 on a boundary) · with data: 101,500 at 2024-07" (and at the second period in the compare mode). null
 * until the mask is in
 */
export function cellCountLine(perPlace: readonly PlaceCells[] | null, at: readonly { period: string; counts: CountsLike | null }[]): string | null {
  if (!perPlace) return null
  const cells = perPlace.reduce((s, p) => s + p.cells, 0)
  const boundary = perPlace.reduce((s, p) => s + p.boundary, 0)
  const places = perPlace.filter(p => p.cells > 0).length
  const data = at.filter(a => a.counts).map(a => `${n0(a.counts!.withValue)} at ${a.period}`)
  return `Cells: ${n0(cells)} sliced in ${places} place${places === 1 ? '' : 's'} (${n0(boundary)} on a boundary)${data.length ? ` · with data: ${data.join(', ')}` : ''}`
}

/** the rows of the legend's "cells per place": name, cells, on the boundary, the largest first (a place with none is said) */
export function cellRows(perPlace: readonly PlaceCells[], name: (id: string) => string): { id: string; name: string; cells: string; boundary: string }[] {
  return [...perPlace].sort((a, b) => b.cells - a.cells || name(a.id).localeCompare(name(b.id)))
    .map(p => ({ id: p.id, name: name(p.id), cells: p.cells ? n0(p.cells) : 'none', boundary: n0(p.boundary) }))
}

// ---- the palette (the hash's `pal`) ----

/** a ramp id the hash may carry: a ramp of `@oceanmetrics/map`, `_r` for it reversed */
export const PAL = /^[a-z]+(_r)?$/

/** the hash's `pal` when the map package has that ramp, else null (the layer's own default) */
export function palOf(pal: string | null | undefined, ramps: Readonly<Record<string, unknown>>): string | null {
  if (!pal || !PAL.test(pal)) return null
  return Object.hasOwn(ramps, pal.replace(/_r$/, '')) ? pal : null
}

const KIND_GROUP: Record<string, string> = { sequential: 'Sequential', diverging: 'Diverging', cyclic: 'Cyclic' }

/**
 * the palette select: the layer's default first (`''`, named), then every ramp of the map package by kind, each also
 * reversed where that reads (Spectral reversed is erddap-places' red = warm)
 */
export function rampChoices(defaultId: string, ramps: Readonly<Record<string, { label: string; kind: string }>>): LayerChoice[] {
  const lab = (id: string) => { const b = id.replace(/_r$/, ''); return `${ramps[b]?.label ?? b}${id.endsWith('_r') ? ', reversed' : ''}` }
  const out: LayerChoice[] = [{ value: '', label: `Default (${lab(defaultId)})` }]
  for (const kind of ['sequential', 'diverging', 'cyclic']) {
    for (const [id, r] of Object.entries(ramps)) {
      if (r.kind !== kind) continue
      out.push({ value: id, label: lab(id), group: KIND_GROUP[kind] })
      if (kind !== 'cyclic') out.push({ value: `${id}_r`, label: lab(`${id}_r`), group: KIND_GROUP[kind] })
    }
  }
  return out
}

/** the palette select is shown with a layer, and not under the difference, which keeps its own diverging ramp (`balance`) */
export const paletteShown = (layer: string | null | undefined, anom: boolean) => !!layer && !anom

// ---- the cell readout (hover or tap) ----

/** a number for the readout: one cell's value, so two decimals below 100 (the legend's ends round harder) */
const rnum = (v: number) => (Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2))
const val = (v: number | null, u: string) => (v === null || !Number.isFinite(v) ? 'no data' : `${rnum(v)}${u}`)
const signedVal = (v: number | null, u: string) => (v === null || !Number.isFinite(v) ? 'no data' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${rnum(Math.abs(v))}${u}`)

/** a cell centre as people read it: "34.13° N, 120.13° W" (a longitude past 180, the 0..360 frame, back into ±180) */
export function latLonText(lat: number, lon: number): string {
  const x = ((((lon + 180) % 360) + 360) % 360) - 180
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(x).toFixed(2)}° ${x >= 0 ? 'E' : 'W'}`
}

export interface ReadoutCell { lat: number; lon: number; weight: number }
export interface ReadoutValue { period: string; value: number | null }

/**
 * the readout of the cell under the pointer (erddap-places' cell popup and Then vs Now readout): its value with the unit and
 * the period; in the compare mode both periods and the difference `t2 - t` (the anomaly's sign); then the centre and, on a
 * place's boundary, the share of the cell inside it. lines, short enough for a small box near the pointer
 */
export function cellReadout(o: { cell: ReadoutCell; units: string | null; now: ReadoutValue; then?: ReadoutValue | null }): string[] {
  const u = o.units ? ` ${o.units}` : ''
  const lines: string[] = []
  if (o.then) {
    lines.push(`${o.then.period}: ${val(o.then.value, u)}`, `${o.now.period}: ${val(o.now.value, u)}`)
    const d = o.then.value !== null && o.now.value !== null ? o.then.value - o.now.value : null
    lines.push(`${o.then.period} − ${o.now.period}: ${signedVal(d, u)}`)
  } else lines.push(`${val(o.now.value, u)} in ${o.now.period}`)
  const share = o.cell.weight < 1 ? ` · ${Math.round(o.cell.weight * 100)} % inside` : ''
  lines.push(`${latLonText(o.cell.lat, o.cell.lon)}${share}`)
  return lines
}

/** where the readout box sits: beside the pointer, flipped to the other side near the frame's right or bottom edge */
export function readoutPlace(x: number, y: number, width: number, height: number): { left: number; top: number; flipX: boolean; flipY: boolean } {
  return { left: Math.round(x), top: Math.round(y), flipX: x > width * 0.6, flipY: y > height * 0.7 }
}

/**
 * a slice's failure as the legend says it after "no data: ": the host and the status, never the server's HTML page or the
 * whole request url ("erddap.oceanmetrics.io answered HTTP 404 Not Found")
 */
export function problemText(e: unknown, host: string): string {
  const m = String((e as Error)?.message ?? e)
  const erddap = /^(\d{3})\s*([^:]*?)\s*from ERDDAP/.exec(m)
  if (erddap) return `${host} answered HTTP ${erddap[1]}${erddap[2] ? ` ${erddap[2]}` : ''}`
  const url = /https?:\/\/([^/\s]+)\S*/.exec(m)
  // the status is read outside the url, whose constraints hold numbers of their own ("longitude[(-120.123):1:(...)]")
  const status = url ? /\b(\d{3})\b/.exec(m.replace(url[0], ''))?.[1] : undefined
  if (url) return `${url[1]} did not answer${status ? ` (HTTP ${status})` : ''}`
  return m.length > 160 ? `${m.slice(0, 157)}…` : m
}

/** the grid slice's fill opacity over the sea floor: 0.9 hid the relief under it on the GEBCO basemap; at 0.8 (the map
 * package's default) the shading and the isobaths read through the colours */
export const SLICE_OPACITY = 0.8
