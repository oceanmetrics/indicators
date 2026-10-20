// the Map's table in the shared order of the places (src/report/order.ts), plain functions. the table's own order (by class, then
// value: classes.ts `tableOrder`) is what a reader who has not chosen an order gets, because it is the accessible version of the map's
// colours; an order the reader chose (a sort key, grouping off, their own) in the Select section orders the table too, as one list.
import { orderPlaces } from '../../../../src/report/order.ts'
import type { AxisOrder, OrderPlace, PlaceSort } from '../../../../src/report/order.ts'
import type { MapItem } from './classes.ts'

/**
 * the items in the order given: each is a place (its centre and name from `places` when known, else its own name and group), ordered
 * as the Matrix orders its places and listed as one flat list
 */
export function tableInOrder(items: MapItem[], places: readonly OrderPlace[], order: AxisOrder<PlaceSort>, groupLabel: (coll: string) => string = c => c): MapItem[] {
  const known = new Map(places.map(p => [p.id, p]))
  const byId = new Map(items.map(i => [i.placeId, i]))
  const asPlaces: OrderPlace[] = items.map(i => {
    const p = known.get(i.placeId)
    return { id: i.placeId, name: i.name, coll: i.group, lat: p?.lat ?? null, lon: p?.lon ?? null }
  })
  return orderPlaces(asPlaces, order, groupLabel).flatMap(g => g.items.map(p => byId.get(p.id) as MapItem))
}

/** the items in the order of a list of place ids (a report's places); an item not in the list goes last, in the order it had */
export function byIdOrder(items: MapItem[], ids: readonly string[]): MapItem[] {
  const at = new Map(ids.map((id, n) => [id, n]))
  return items.map((i, n) => ({ i, n })).sort((a, b) => (at.get(a.i.placeId) ?? 1e9) - (at.get(b.i.placeId) ?? 1e9) || a.n - b.n).map(x => x.i)
}
