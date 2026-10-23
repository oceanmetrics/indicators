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
import { formatLayerKey, parseLayerKey } from './layerSlot.ts'
import type { LegendSpec } from './layerSlot.ts'
import type { MapPart } from './parts.ts'

/** the gazetteer's STAC root; an ERDDAP dataset is `erddap/<dataset id>/collection.json` under it, its places `<coll>/places.parquet` */
export const GAZETTEER_STAC = 'https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/'
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

/**
 * one row per cell of a slice over several places: the engine's `sliceSource` reads every lobe's slab as one
 * `read_parquet([...])` without DISTINCT (runPreview has it), so where two places' boxes overlap (the Channel Islands and
 * Chumash) each masked cell joins two identical slab rows and is drawn twice, darker; a cell on the shared edge of two
 * places is in both masks. the first row of a cell is kept, in the order given
 */
export function uniqueCells<C extends { lat: number; lon: number }>(rows: readonly C[]): C[] {
  const seen = new Set<string>()
  const out: C[] = []
  for (const r of rows) {
    const k = `${Math.round(r.lat * 1e5)},${Math.round(r.lon * 1e5)}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

// ---- the time asked for ----

/** the step's date of a period (`t` of the hash: "2024-07" -> "2024-07-01", "2024" -> "2024-01-01"); null stays null (the latest) */
export function stepDate(t: string | null | undefined): string | null {
  if (!t) return null
  const [y, m = '01', d = '01'] = t.slice(0, 10).split('-')
  return /^\d{4}$/.test(y) ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : null
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
