// the Dossier layout's rules, in plain functions: the sections (one per place, each starting a page in print), the figure
// numbers, and what "Reproduce" says for a figure: the configuration that pins the number, the values file, the DuckDB query
// that reads the place's rows, and the place view that draws the same card. nothing here computes a status.
import type { Indicator } from '../../data.ts'
import { configHash, configLines, duckdbSnippet } from '../../delivery.ts'
import type { Place } from '../../matrix.ts'

export interface DossierEntry { place: Place; ind: Indicator; figure: number }
export interface DossierSection { place: Place; entries: DossierEntry[] }

/** a section per place, in the order given, each figure numbered across the whole dossier; a pair with no value has no entry */
export function dossierSections(places: Place[], inds: Indicator[], has: (p: Place, i: Indicator) => boolean = () => true): DossierSection[] {
  let n = 0
  return places
    .map(place => ({ place, entries: inds.filter(i => has(place, i)).map(ind => ({ place, ind, figure: ++n })) }))
    .filter(s => s.entries.length > 0)
}

export interface Reproduce {
  /** the configuration lines the hash is taken over (place, indicator, status method and options, manifest) */
  config: string[]
  hash: string
  /** the values file, null when the manifest lists none for the place's collection */
  valuesUrl: string | null
  /** the DuckDB one-liner that reads the place's rows from it */
  sql: string | null
}

export function reproduceOf(ind: Indicator, place: Place, manifestVersion: string, valuesUrl: string | null): Reproduce {
  const config = configLines(ind, place, manifestVersion)
  return { config, hash: configHash(config), valuesUrl, sql: valuesUrl ? duckdbSnippet(valuesUrl, place.id) : null }
}

/** the caption of a figure: "Figure 3. <the status sentence>" (the sentence as src/status words it) */
export const figureCaption = (n: number, sentence: string): string => `Figure ${n}. ${sentence}`
