// the cell drawer's delivery element and the credits: URLs, the DuckDB one-liner, the hashed configuration and the
// per-producer data credits. plain functions.
import type { Indicator, Manifest } from './data.ts'
import type { Place } from './matrix.ts'

/** the values parquet of an indicator in a collection, under the catalog base */
export function valuesUrl(base: string, ind: Indicator, coll: string): string | null {
  const c = ind.collections.find(x => x.coll === coll)
  return c ? base + c.path : null
}

const sqlQuote = (s: string) => `'${s.replaceAll("'", "''")}'`

/** a DuckDB one-liner that reads the place's rows straight from storage */
export function duckdbSnippet(url: string, placeId: string): string {
  return `SELECT time_grain, time, value, n FROM read_parquet(${sqlQuote(url)}) WHERE place_id = ${sqlQuote(placeId)} ORDER BY time_grain, time;`
}

/** the configuration of a cell, canonical: what pins the number (place, indicator, status method and its options, manifest) */
export function configLines(ind: Indicator, place: Place, manifestVersion: string): string[] {
  return [
    `place_id: ${place.id}`,
    `indicator: ${ind.id}`,
    `status_method: ${ind.status_method}`,
    `status_grain: ${ind.status_grain}`,
    `recent: ${ind.recent}`,
    `min_periods: ${ind.min_periods}`,
    `manifest: ${manifestVersion}`,
  ]
}

/**
 * a short hash of the configuration (FNV-1a over the canonical lines, 48 bits as 12 hex digits). a stand-in for the
 * paper's sha256 job id: stable and deterministic, but not cryptographic.
 */
export function configHash(lines: string[]): string {
  const s = lines.join('\n')
  let h1 = 0x811c9dc5, h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0
    h2 = Math.imul(h2 ^ h1, 2246822519) >>> 0
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 12)
}

export interface Credit {
  producer: string
  url?: string
  /** unique provider names (producer, licensor or host of the datasets), without our own name and placeholders */
  providers: string[]
}

const CREDIT_ROLES = new Set(['producer', 'licensor', 'host'])
const NOT_A_CREDIT = (name: string) => /^(na|n\/a|none|)$/i.test(name.trim()) || /^Ocean Metrics/i.test(name)

/** data credits per producer, from the manifest's dataset providers */
export function producerCredits(m: Pick<Manifest, 'indicators'>): Credit[] {
  const by = new Map<string, Credit>()
  for (const ind of m.indicators) {
    const c = by.get(ind.producer.name) ?? { producer: ind.producer.name, url: ind.producer.url, providers: [] }
    by.set(ind.producer.name, c)
    for (const p of ind.dataset.providers) {
      if (p.roles.some(r => CREDIT_ROLES.has(r)) && !NOT_A_CREDIT(p.name) && !c.providers.includes(p.name)) c.providers.push(p.name)
    }
  }
  return [...by.values()]
}

/** the dataset's source link: its landing page, else the producer STAC */
export const datasetLink = (ind: Indicator) => ind.dataset.via ?? ind.dataset.stac ?? ind.producer.url ?? null

/**
 * the licence line: the values' licence and the dataset's own, when they differ. a dataset licence of "other"
 * (Copernicus Marine's own terms) or "various" (OBIS: one per source dataset) names none, so the source's terms are
 * pointed to instead of printed as a word
 */
export function licenceText(ind: Indicator): string {
  const values = ind.license ?? ''
  const raw = ind.dataset.license ?? ''
  const unnamed = ['other', 'various'].includes(raw.toLowerCase())
  const own = unnamed ? '' : raw
  if (values && unnamed) return `values ${values}; source data under the provider's own terms`
  if (values && own && values !== own) return `values ${values}; source data ${own}`
  return values || own || 'not stated'
}

/** the GOOS badge file of an EOV term (64 or 128 px WebP, unmodified) under a path prefix */
export const badgeUrl = (prefix: string, eovId: string, px: 64 | 128 = 64) => `${prefix}goos-eov/webp/${px}/${eovId}.webp`
