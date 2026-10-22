// what the data-drawing layouts (Small multiples, Quad plot, Dossier) and the SanctuaryWatch export need of one
// place x indicator: its values file read, and the card model (status, trend, sentence, alt text, series) under the
// report's style. the status itself is cardModel()'s, which is assess() in @oceanmetrics/status: the same model the Place view's
// card draws, so a panel here and a card there cannot disagree.
import type { ReportSpec } from '../../../../src/report/spec.ts'
import type { Catalog, Indicator } from '../data.ts'
import { valuesUrl } from '../delivery.ts'
import { pickRow, valuesCollOf } from '../matrix.ts'
import type { CoverageIndex, Place } from '../matrix.ts'
import { cardModel } from '../place.ts'
import type { CardModel, CardOptions } from '../place.ts'
import { loadPlaceRows } from '../valuesData.ts'
import type { PlaceRow } from '../valuesData.ts'
import { methodFor, recentFor } from './scorecard.ts'

/** the options a report's style gives a card: the spec's method and window for this indicator, its baseline and years */
export function cardOptsFor(ind: Indicator, spec: ReportSpec): CardOptions {
  return { method: methodFor(ind, spec), recent: recentFor(ind, spec), baseline: spec.style.baseline, from: spec.time.from, to: spec.time.to }
}

export const cellKey = (p: Pick<Place, 'id'>, i: Pick<Indicator, 'id'>) => `${p.id}\u0000${i.id}`

/** the card model of a place's rows under the report's style */
export const modelFor = (ind: Indicator, place: Place, rows: PlaceRow[], spec: ReportSpec): CardModel => cardModel(ind, place.name, rows, cardOptsFor(ind, spec))

export type CellResult = { s: 'ok'; rows: PlaceRow[]; model: CardModel } | { s: 'error'; msg: string }

export type RowLoader = (url: string, placeId: string) => Promise<PlaceRow[]>

/** the values file of a place x indicator, or null when the manifest lists none for the place's collection */
export function cellUrl(catalog: Pick<Catalog, 'base'>, idx: CoverageIndex, place: Place, ind: Indicator): string | null {
  return valuesUrl(catalog.base, ind, valuesCollOf(ind, place, pickRow(idx, place.id, ind)))
}

/**
 * reads every pair's values (one file per indicator and collection, cached by loadValuesFile) and calls `onupdate` with
 * the results so far after each pair; returns the function that stops it. a failed pair is an error result, not a thrown one.
 */
export function loadCells(
  catalog: Pick<Catalog, 'base'>, idx: CoverageIndex, spec: ReportSpec, pairs: { place: Place; ind: Indicator }[],
  onupdate: (results: Map<string, CellResult>) => void, load: RowLoader = loadPlaceRows,
): () => void {
  let live = true
  const acc = new Map<string, CellResult>()
  Promise.all(pairs.map(async ({ place, ind }) => {
    const url = cellUrl(catalog, idx, place, ind)
    try {
      if (!url) throw new Error('the manifest lists no values file for this place’s collection')
      const rows = await load(url, place.id)
      acc.set(cellKey(place, ind), { s: 'ok', rows, model: modelFor(ind, place, rows, spec) })
    } catch (e) {
      acc.set(cellKey(place, ind), { s: 'error', msg: e instanceof Error ? e.message : String(e) })
    }
    if (live) onupdate(new Map(acc))
  }))
  return () => { live = false }
}
