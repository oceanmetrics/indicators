// the Dossier layout's rules, in plain functions: the sections (one per place, each starting a page in print), the figure
// numbers, and what "Reproduce" says for a figure: the configuration that pins the number, the values file, the DuckDB query
// that reads the place's rows, and the place view that draws the same card. nothing here computes a status.
import type { Indicator } from '../../data.ts'
import { configHash, configLines, duckdbSnippet } from '@oceanmetrics/catalog/cards'
import type { Reproduce } from '@oceanmetrics/catalog/cards'
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

export type { Reproduce }

/** a figure's Reproduce block (@oceanmetrics/catalog's shape, as the places page shows it) for the values file the report read */
export function reproduceOf(ind: Indicator, place: Place, manifestVersion: string, valuesUrl: string | null): Reproduce {
  const config = configLines(ind, place.id, manifestVersion)
  return { valuesUrl, snippet: valuesUrl ? duckdbSnippet(valuesUrl, place.id) : null, config, hash: configHash(config) }
}

/** the caption of a figure: "Figure 3. <the status sentence>" (the sentence as @oceanmetrics/status words it) */
export const figureCaption = (n: number, sentence: string): string => `Figure ${n}. ${sentence}`
