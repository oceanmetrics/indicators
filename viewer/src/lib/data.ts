// loading: the manifest (indicators.json) and the coverage table (coverage.parquet). nothing else is needed for the
// Matrix: coverage carries each place's name, so no gazetteer file is read. plain functions, tested without a browser.
import { parquetReadObjects } from 'hyparquet'
import type { CoverageRow } from '../../../src/coverage/build.ts'
import type { Grain, MethodId } from '@oceanmetrics/status'

export type VocabId = 'onms' | 'names' | 'eov'
export const VOCAB_IDS: VocabId[] = ['onms', 'names', 'eov']

export interface Term {
  id: string
  label: string
  group?: string
  /** an icon name from src/icons (onms-*, eov-*); the NaMES themes have none */
  glyph?: string
}

export interface Vocab {
  title: string
  source?: string
  credit?: string
  note?: string
  terms: Term[]
}

export interface Provider {
  name: string
  roles: string[]
  url?: string
}

export interface Indicator {
  id: string
  title: string
  short: string
  description?: string
  unit?: string
  unit_label?: string
  decimals?: number
  kind: 'continuous' | 'categorical'
  classes?: Record<string, string>
  /** categorical: the classes are ordered (alert levels), so the map ramps them instead of giving each a hue */
  ordinal?: boolean
  category: Partial<Record<VocabId, string>>
  series: string
  series_title?: string
  /** the quantity measured, shared across producers (`sst`, `ph`); not the ERDDAP variable, which is in the id */
  variable?: string
  lead: boolean
  preferred?: boolean
  min_periods: number
  status_grain: Grain
  status_method: MethodId | 'anomaly' | 'stacked'
  recent: number
  time_grains: Grain[]
  time_range?: [string, string]
  method: { kind: string; summary: string; code?: string }
  producer: { name: string; url?: string; catalog?: string }
  dataset: {
    id: string
    /** the STAC collection id in the gazetteer (`erddap/<id>`), the name erddap-places gives the dataset in a link */
    collection?: string
    title: string
    stac?: string
    via?: string
    providers: Provider[]
    license?: string
    citation?: string | null
    doi?: string | null
  }
  license?: string
  citation?: string
  collections: { coll: string; places: number; rows: number; path: string; time_range?: [string, string] }[]
}

/** a named list of place groups (gazetteer collections) offered as one choice (config/place_sets.yml; `set:<id>` in a link) */
export interface PlaceSet {
  id: string
  title: string
  /** the gazetteer collections, in the order the pickers list them */
  groups: string[]
  note?: string
}

export interface Manifest {
  version: string
  contract?: string
  created?: string
  vocabularies: Record<VocabId, Vocab>
  indicators: Indicator[]
  /** absent in a manifest built before 2026-10-20 */
  place_sets?: PlaceSet[]
}

export interface Catalog {
  /** absolute base URL, with a trailing slash */
  base: string
  manifest: Manifest
  coverage: CoverageRow[]
}

/** the production default: the bucket host, path-style (storage.oceanmetrics.io answers with a 302, one redirect per request) */
export const PUBLISHED_BASE = 'https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/indicators/'
/** the dev default: the repo's catalog/, served by the dev middleware in vite.config.ts */
export const DEV_BASE = './catalog/'

/** `?data=<base URL>` wins; otherwise the dev folder in dev and the published bucket in a build. Trailing slash always. */
export function resolveDataBase(search: string, dev: boolean): string {
  const q = new URLSearchParams(search).get('data')?.trim()
  const base = q || (dev ? DEV_BASE : PUBLISHED_BASE)
  return base.endsWith('/') ? base : base + '/'
}

/** a (possibly relative) base made absolute against the page */
export function absoluteBase(base: string, page = typeof location !== 'undefined' ? location.href : 'http://localhost/'): string {
  return new URL(base, page).href
}

const NUMERIC: (keyof CoverageRow)[] = ['n_periods', 'last_value', 'recent_mean', 'lt_mean', 'lt_sd']

/** hyparquet returns int64 as bigint: coverage rows carry plain numbers */
export function normalizeRow(r: Record<string, unknown>): CoverageRow {
  const out: Record<string, unknown> = { ...r }
  for (const k of NUMERIC) if (typeof out[k] === 'bigint') out[k] = Number(out[k])
  return out as unknown as CoverageRow
}

export async function loadCatalog(base: string, fetchFn: typeof fetch = fetch): Promise<Catalog> {
  const abs = absoluteBase(base)
  const [mres, cres] = await Promise.all([fetchFn(abs + 'indicators.json'), fetchFn(abs + 'coverage.parquet')])
  if (!mres.ok) throw new Error(`indicators.json: HTTP ${mres.status} at ${abs}`)
  if (!cres.ok) throw new Error(`coverage.parquet: HTTP ${cres.status} at ${abs}`)
  const [manifest, buf] = await Promise.all([mres.json() as Promise<Manifest>, cres.arrayBuffer()])
  const rows = await parquetReadObjects({ file: buf })
  return { base: abs, manifest, coverage: rows.map(normalizeRow) }
}

/**
 * short titles for the gazetteer collections places are grouped by (a place's `place_coll`); the gazetteer's own layer
 * titles are long ("... (200 NM)") and fill in the rest. `places` is the gazetteer's collection of the places
 * erddap-places precomputes: the 18 `NMS:*` sanctuaries (`noaa_sanctuaries` holds the ONMS section ids, a different id space).
 */
export const GROUP_TITLES: Record<string, string> = {
  noaa_sanctuaries: 'National Marine Sanctuaries',
  places: 'National Marine Sanctuaries',
  noaa_nerrs: 'National Estuarine Research Reserves',
  noaa_marine_monuments: 'Marine National Monuments',
  mr_eez: 'Exclusive Economic Zones',
  fao_high_seas: 'High seas by FAO area',
  fao_major_areas: 'FAO major fishing areas',
  mr_high_seas: 'High seas',
  mpa_inventory: 'Marine protected areas (NOAA inventory)',
  protectedseas_mpa: 'Marine protected areas (ProtectedSeas)',
}
/** the groups in the order the Matrix lists them: sanctuaries first, then the other protected areas, then the Marine Regions ones */
export const GROUP_ORDER = ['noaa_sanctuaries', 'places', 'noaa_nerrs', 'noaa_marine_monuments', 'mpa_inventory', 'protectedseas_mpa', 'mr_eez', 'fao_high_seas', 'mr_high_seas']

export const LAYERS_URL = 'https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/index/layers.json'
export const GAZETTEER_URL = 'https://oceanmetrics.io/places/'

/** a gazetteer collection: its title and its number of places */
export interface Layer {
  title: string
  n: number | null
  /** the geometry type of the layer's places ("MultiPolygon", "Point"); null when layers.json does not say */
  geom: string | null
}
export type Layers = Record<string, Layer>

/** gazetteer layers.json -> { slug: { title, n } }; anything unreadable gives {} */
export function parseLayers(json: unknown): Layers {
  const out: Layers = {}
  const layers = (json as { layers?: { slug?: string; collection?: string; title?: string; n?: number; geom_type?: string }[] } | null)?.layers
  if (!Array.isArray(layers)) return out
  for (const l of layers) {
    const slug = l.collection ?? l.slug
    if (slug) out[slug] = { title: l.title ?? slug, n: typeof l.n === 'number' ? l.n : null, geom: typeof l.geom_type === 'string' ? l.geom_type : null }
  }
  return out
}

/** a group's short title, else the gazetteer's title, else the slug; a place set (`set:<id>`) has its own title */
export function collTitle(coll: string, layers: Layers = {}, sets: readonly PlaceSet[] = []): string {
  return sets.find(s => `set:${s.id}` === coll)?.title ?? GROUP_TITLES[coll] ?? layers[coll]?.title ?? coll
}

/** a collection in the gazetteer's places browser */
export const gazetteerHref = (coll: string) => `${GAZETTEER_URL}?layers=${encodeURIComponent(coll)}`
/** a place's record page on the places site, the front door of a place: https://oceanmetrics.io/places/p/<id> (colons kept) */
export const placesPageHref = (placeId: string) => `${GAZETTEER_URL}p/${encodeURIComponent(placeId).replace(/%3A/gi, ':')}`
/** a place in the gazetteer's places browser (the ids keep their colons, as the browser writes them) */
export const gazetteerPlaceHref = (coll: string, placeId: string) =>
  `${gazetteerHref(coll)}&place=${encodeURIComponent(placeId).replace(/%3A/gi, ':')}`

/** optional: the gazetteer's layers (titles and counts); a network failure is not an error */
export async function loadLayers(fetchFn: typeof fetch = fetch): Promise<Layers> {
  try {
    const r = await fetchFn(LAYERS_URL)
    return r.ok ? parseLayers(await r.json()) : {}
  } catch {
    return {}
  }
}
