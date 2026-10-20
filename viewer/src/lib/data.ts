// loading: the manifest (indicators.json) and the coverage table (coverage.parquet). nothing else is needed for the
// Matrix: coverage carries each place's name, so no gazetteer file is read. plain functions, tested without a browser.
import { parquetReadObjects } from 'hyparquet'
import type { CoverageRow } from '../../../src/coverage/build.ts'
import type { Grain, MethodId } from '../../../src/status/index.ts'

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
  category: Partial<Record<VocabId, string>>
  series: string
  series_title?: string
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

export interface Manifest {
  version: string
  contract?: string
  created?: string
  vocabularies: Record<VocabId, Vocab>
  indicators: Indicator[]
}

export interface Catalog {
  /** absolute base URL, with a trailing slash */
  base: string
  manifest: Manifest
  coverage: CoverageRow[]
}

/** the production default, until the catalog is published */
export const PUBLISHED_BASE = 'https://storage.oceanmetrics.io/indicators/'
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

/** short built-in names for the collections the matrix knows; the gazetteer's layer titles are long ("... (200 NM)") and fill in the rest */
export const COLL_FALLBACK: Record<string, string> = {
  places: 'Sanctuaries and other places',
  mr_eez: 'Exclusive Economic Zones',
}
export const LAYERS_URL = 'https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/index/layers.json'

/** gazetteer layers.json -> { slug: title }; anything unreadable gives {} */
export function layerTitles(json: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  const layers = (json as { layers?: { slug?: string; collection?: string; title?: string }[] } | null)?.layers
  if (!Array.isArray(layers)) return out
  for (const l of layers) {
    const slug = l.collection ?? l.slug
    if (slug && l.title) out[slug] = l.title
  }
  return out
}

export function collTitle(coll: string, gazetteer: Record<string, string> = {}): string {
  return COLL_FALLBACK[coll] ?? gazetteer[coll] ?? coll
}

/** optional: the gazetteer's layer titles; a network failure is not an error */
export async function loadLayerTitles(fetchFn: typeof fetch = fetch): Promise<Record<string, string>> {
  try {
    const r = await fetchFn(LAYERS_URL)
    return r.ok ? layerTitles(await r.json()) : {}
  } catch {
    return {}
  }
}
