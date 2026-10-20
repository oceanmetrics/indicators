// what the report's two maps need, in plain functions: the locator map (every chosen place outlined, one class) and the Map
// sheet (one indicator over the chosen places, the Map view's model). the drawing is MapCanvas and the classes are
// map/classes.ts; reference geometry (Marine Regions) is only ever drawn by its own WMS (map/parts.ts decides that).
import type { CoverageRow } from '../../../../../src/coverage/build.ts'
import type { Catalog, Indicator } from '../../data.ts'
import { valuesUrl } from '../../delivery.ts'
import type { Place } from '../../matrix.ts'
import type { MapItem } from '../../map/classes.ts'
import { groupOf, valuesCollsOfGroup } from '../../map/pick.ts'
import { loadValuesFile } from '../../valuesData.ts'
import type { PlaceRow } from '../../valuesData.ts'

/** the place groups of the chosen places, in the order they first appear */
export const placeGroups = (places: Pick<Place, 'coll'>[]): string[] => [...new Set(places.map(p => p.coll))]

/** the one class the locator draws every chosen place in: a map item per place, class 0 (the colour is the caller's) */
export function locatorItems(places: Place[]): MapItem[] {
  return places.map(p => ({
    placeId: p.id, name: p.name, group: p.coll, displayId: p.displayId ?? null, value: null, valueText: null, period: null, periodText: null,
    k: 0, label: 'Place in this report', status: null, trend: null,
  }))
}

/** the coverage rows of an indicator in the chosen places, which is all the Map sheet colours (other members of a group are not drawn in classes) */
export function sheetCoverage(coverage: CoverageRow[], places: Pick<Place, 'id'>[], ind: Pick<Indicator, 'id'>): CoverageRow[] {
  const ids = new Set(places.map(p => p.id))
  return coverage.filter(r => r.indicator === ind.id && ids.has(r.place_id))
}

/** the groups the sheet draws: those of the chosen places that have a value for the indicator */
export function sheetGroups(rows: CoverageRow[]): string[] {
  return [...new Set(rows.filter(r => r.last_value != null || r.last_class != null).map(groupOf))]
}

/** every row of the chosen places for the indicator, from the values files that hold them (read once each; the period slider walks them) */
export async function loadSheetValues(
  catalog: Pick<Catalog, 'base'>, ind: Indicator, rows: CoverageRow[], groups: string[], load: typeof loadValuesFile = loadValuesFile,
): Promise<Map<string, PlaceRow[]>> {
  const urls = valuesCollsOfGroup(ind, rows, groups).map(c => valuesUrl(catalog.base, ind, c)).filter((u): u is string => !!u)
  const maps = await Promise.all(urls.map(u => load(u)))
  const ids = new Set(rows.map(r => r.place_id))
  const all = new Map<string, PlaceRow[]>()
  for (const mp of maps) for (const [id, rs] of mp) if (ids.has(id)) all.set(id, [...(all.get(id) ?? []), ...rs])
  return all
}
