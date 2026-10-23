// the viewer's own delivery rules: the per-producer data credits of the footer, the dataset link, the licence line and the
// GOOS badge path. plain functions. the values url, the DuckDB one-liner and the configuration lines and hash are
// @oceanmetrics/catalog's (`valuesUrl`, `duckdbSnippet`, `configLines`, `configHash`), shared with the places page.
import type { Indicator, Manifest } from './data.ts'

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
