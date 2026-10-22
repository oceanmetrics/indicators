// the `erddap` layer slot's rules, in plain functions: the gazetteer's collection of an ERDDAP dataset, the WMS tile URL at a
// period, the request a tile becomes, the rows of its picture, the picker's choices and the legend line. ERDDAP's WMS answers in
// EPSG:4326 / CRS:84 only (its GetCapabilities lists no EPSG:3857, and a 3857 request is refused), while MapLibre fills in a
// tile's box only as `{bbox-epsg-3857}`: so the source's tile URL goes through the `erddapwms://` protocol (erddapSlot.ts),
// which asks for the tile's lon/lat box and stretches the rows of the picture onto the Mercator tile. provisional: the
// renderer of build week 2 (2026-11-06 to 11-12) replaces the WMS with the grid itself.
import type { Indicator } from '../data.ts'
import { formatLayerKey, parseLayerKey } from './layerSlot.ts'
import type { LegendSpec } from './layerSlot.ts'

/** the gazetteer's STAC root; an ERDDAP dataset is `erddap/<dataset id>/collection.json` under it */
export const GAZETTEER_STAC = 'https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/'
export const collectionUrl = (datasetId: string) => `${GAZETTEER_STAC}erddap/${datasetId}/collection.json`

export interface ErddapVariable {
  name: string
  description: string | null
  unit: string | null
}

/** what the slot reads of a gazetteer `erddap/<id>` collection */
export interface ErddapCollection {
  id: string
  title: string
  /** `erddap:base_url`, no trailing slash */
  baseUrl: string
  datasetId: string
  variables: ErddapVariable[]
  /** the providers that produce or license it */
  producers: string[]
  license: string | null
}

interface StacJson {
  id?: string
  title?: string
  license?: string
  providers?: { name?: string; roles?: string[] }[]
  'cube:variables'?: Record<string, { type?: string; description?: string; unit?: string }>
  'erddap:base_url'?: string
  'erddap:dataset_id'?: string
}

/** a collection.json -> what the slot needs; null when it has no ERDDAP base URL or dataset id */
export function parseErddapCollection(json: unknown): ErddapCollection | null {
  const j = json as StacJson | null
  const base = j?.['erddap:base_url']
  const ds = j?.['erddap:dataset_id']
  if (!j || !base || !ds) return null
  const vars = Object.entries(j['cube:variables'] ?? {})
    .filter(([, v]) => (v.type ?? 'data') === 'data')
    .map(([name, v]) => ({ name, description: v.description ?? null, unit: v.unit ?? null }))
  return {
    id: j.id ?? `erddap/${ds}`, title: j.title ?? ds, baseUrl: base.replace(/\/+$/, ''), datasetId: ds, variables: vars,
    producers: (j.providers ?? []).filter(p => p.name && p.roles?.some(r => r === 'producer' || r === 'licensor')).map(p => p.name as string),
    license: j.license ?? null,
  }
}

export const hostOf = (url: string) => { try { return new URL(url).host } catch { return url } }

/** a period start ("2024-07-01", "2024") as an ISO instant ("2024-07-01T00:00:00Z") */
export function isoInstant(t: string): string {
  const [y, m = '01', d = '01'] = t.slice(0, 10).split('-')
  return `${y}-${m}-${d}T00:00:00Z`
}

// ---- the tile URL and the request it becomes ----

/** the scheme MapLibre hands to the slot's protocol: `erddapwms://` + the WMS URL */
export const WMS_SCHEME = 'erddapwms://'

/**
 * the dataset's own WMS GetMap URL for a variable at a period start (null: no time, ERDDAP's default, the latest), with
 * MapLibre's `{bbox-epsg-3857}` for the tile's box
 */
export function erddapWmsUrl(coll: Pick<ErddapCollection, 'baseUrl' | 'datasetId'>, variable: string, t: string | null): string {
  const ds = coll.datasetId
  return `${coll.baseUrl}/wms/${ds}/request?service=WMS&version=1.3.0&request=GetMap&layers=${ds}:${variable}` +
    `&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png&transparent=true${t ? `&time=${isoInstant(t)}` : ''}`
}

/** the source's tile URL: the WMS URL through the slot's protocol */
export const erddapTileUrl = (coll: Pick<ErddapCollection, 'baseUrl' | 'datasetId'>, variable: string, t: string | null) => WMS_SCHEME + erddapWmsUrl(coll, variable, t)

const R = 6378137
const lonOf = (x: number) => (x / R) * (180 / Math.PI)
const latOf = (y: number) => (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI)
const mercY = (lat: number) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
const r6 = (n: number) => Math.round(n * 1e6) / 1e6

export interface TileRequest {
  /** the WMS URL ERDDAP answers: `crs=CRS:84` and the tile's box in degrees (west, south, east, north) */
  url: string
  west: number
  south: number
  east: number
  north: number
  width: number
  height: number
}

/** a tile URL as MapLibre filled it in (`erddapwms://...&crs=EPSG:3857&bbox=x0,y0,x1,y1...`) -> the CRS:84 request; null for anything else */
export function tileRequest(tileUrl: string): TileRequest | null {
  if (!tileUrl.startsWith(WMS_SCHEME)) return null
  const url = tileUrl.slice(WMS_SCHEME.length)
  const m = /[?&]bbox=([^&]+)/.exec(url)
  const b = m ? m[1].split(',').map(Number) : []
  if (b.length !== 4 || b.some(n => !Number.isFinite(n))) return null
  const [west, east] = [lonOf(b[0]), lonOf(b[2])].map(r6)
  const [south, north] = [latOf(b[1]), latOf(b[3])].map(r6)
  const size = (k: string) => Number(new RegExp(`[?&]${k}=(\\d+)`).exec(url)?.[1] ?? 256)
  return {
    url: url.replace(/([?&])crs=[^&]*/, '$1crs=CRS:84').replace(/([?&])bbox=[^&]*/, `$1bbox=${west},${south},${east},${north}`),
    west, south, east, north, width: size('width'), height: size('height'),
  }
}

/**
 * the row of the lon/lat picture (rows even in latitude, `srcH` of them from `north` to `south`) that row `y` of a Mercator
 * tile of `size` rows over the same box shows: the latitude at the middle of the row, clamped to the picture
 */
export function sourceRow(y: number, size: number, north: number, south: number, srcH: number): number {
  const top = mercY(north), bottom = mercY(south)
  const lat = latOf(top + ((y + 0.5) / size) * (bottom - top))
  const row = Math.floor(((north - lat) / (north - south)) * srcH)
  return Math.min(srcH - 1, Math.max(0, row))
}

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
  const out: LayerChoice[] = [{ value: '', label: 'None' }]
  const listed = order.flatMap(ds => [...byDataset.get(ds)!.vars.keys()].map(v => formatLayerKey({ kind: 'erddap', id: ds, variable: v })))
  const spec = parseLayerKey(layer)
  if (spec && !listed.includes(formatLayerKey(spec))) out.push({ value: formatLayerKey(spec), label: `${spec.id}${spec.variable ? ` (${spec.variable})` : ''}`, group: 'From the link' })
  for (const ds of order) {
    const d = byDataset.get(ds)!
    for (const [v, label] of d.vars) out.push({ value: formatLayerKey({ kind: 'erddap', id: ds, variable: v }), label, group: d.title })
  }
  return out
}

// ---- the legend ----

export const ERDDAP_VIA = 'ERDDAP WMS, provisional until the renderer of build week 2 (2026-11-06 to 11-12)'

/** the layer's title: its variable as the dataset describes it, from the dataset */
export function erddapTitle(coll: Pick<ErddapCollection, 'title' | 'variables'>, variable: string): string {
  const d = coll.variables.find(v => v.name === variable)?.description || variable
  return `${d.charAt(0).toUpperCase()}${d.slice(1)} from ${coll.title}`
}

/** "Layer: <title> at <period> · <via>", and "· no tiles from <host>" when none came back */
export function slotLegendLine(l: LegendSpec, period: (t: string) => string): string {
  return `Layer: ${l.title} at ${l.t ? period(l.t) : 'the latest time'} · ${l.via}${l.problem ? ` · ${l.problem}` : ''}`
}
