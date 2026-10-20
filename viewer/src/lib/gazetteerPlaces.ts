// the whole gazetteer's places by name, for the place picker and the Matrix rows of a place no one has computed yet. read from
// the gazetteer's index (index/places_index.parquet, 5 MB) with hyparquet range requests on the three columns the viewer needs
// (place_id, name, collection, bbox), the first time a group with places that are not computed is opened or chosen: never in the
// entry chunk. plain functions, tested with a synthetic reader.
import { bboxCentre } from '../../../src/coverage/centre.ts'
import type { CoverageIndex, Place } from './matrix.ts'
import type { Layers, PlaceSet } from './data.ts'
import type { PlaceSel } from './selection.ts'

/** the bucket host, not the storage host: that one answers with a 302 that has no CORS headers (as map/gazetteer.ts directUrl) */
export const PLACES_INDEX_URL = 'https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/index/places_index.parquet'
export const INDEX_COLUMNS = ['place_id', 'name', 'collection', 'bbox']

export type GazetteerPlaces = Map<string, Place[]>

/**
 * the index's rows as places by collection (by name; a row with no id or collection is skipped, a missing name is the id). the
 * centre of a place's bbox (`lat`, `lon`) is the coverage builder's own function, so a place has the same position here as in coverage.
 */
export function placesByCollection(rows: readonly Record<string, unknown>[]): GazetteerPlaces {
  const out: GazetteerPlaces = new Map()
  for (const r of rows) {
    const id = typeof r.place_id === 'string' ? r.place_id : ''
    const coll = typeof r.collection === 'string' ? r.collection : ''
    if (!id || !coll) continue
    const name = typeof r.name === 'string' && r.name ? r.name : id
    if (!out.has(coll)) out.set(coll, [])
    const at = bboxCentre(r.bbox as Parameters<typeof bboxCentre>[0])
    out.get(coll)!.push({ id, name, coll, ...(at ?? {}) })
  }
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  return out
}

/** reads the three columns: range requests on the parquet file, else (a host without them) the whole file */
export async function readIndexRows(url = PLACES_INDEX_URL, fetchFn: typeof fetch = fetch): Promise<Record<string, unknown>[]> {
  const { asyncBufferFromUrl, parquetReadObjects } = await import('hyparquet')
  try {
    const file = await asyncBufferFromUrl({ url })
    return await parquetReadObjects({ file, columns: INDEX_COLUMNS })
  } catch {
    const r = await fetchFn(url)
    if (!r.ok) throw new Error(`places_index.parquet: HTTP ${r.status}`)
    return await parquetReadObjects({ file: await r.arrayBuffer(), columns: INDEX_COLUMNS })
  }
}

let cache: Promise<GazetteerPlaces> | null = null

/** the gazetteer's places, fetched once per page (a failure is not cached); `read` is the seam the tests use */
export function loadGazetteerPlaces(read: () => Promise<Record<string, unknown>[]> = () => readIndexRows()): Promise<GazetteerPlaces> {
  if (!cache) {
    cache = read().then(placesByCollection)
    cache.catch(() => { cache = null })
  }
  return cache
}
export const clearGazetteerPlaces = () => { cache = null }

/** is this a collection of areas (a polygon layer)? lines and points have no extent to compute over */
export const isPolygonLayer = (geom: string | null | undefined) => !!geom && /polygon/i.test(geom)

/**
 * every place the selection can name: the computed places (the coverage), and the gazetteer's places of the polygon
 * collections that the coverage does not hold. a computed place keeps its coverage name and values collections.
 */
export function placeUniverse(idx: CoverageIndex, gaz: GazetteerPlaces | null, layers: Layers): Place[] {
  if (!gaz) return idx.places
  const have = new Set(idx.places.map(p => p.id))
  const extra: Place[] = []
  for (const [coll, list] of gaz) {
    if (layers[coll] && !isPolygonLayer(layers[coll].geom)) continue
    for (const p of list) if (!have.has(p.id)) extra.push(p)
  }
  return extra.length ? [...idx.places, ...extra] : idx.places
}

/**
 * does the selection need the gazetteer's places? yes when it names a group that has places the coverage lacks (the
 * gazetteer's count is larger, or nothing of it is computed) or a place the coverage does not know
 */
export function selectionNeedsGazetteer(sel: PlaceSel, idx: CoverageIndex, layers: Layers, sets: readonly PlaceSet[] = []): boolean {
  const groups = new Set<string>()
  for (const r of sel.include) {
    if (r.startsWith('coll:')) groups.add(r.slice(5))
    else if (r.startsWith('set:')) for (const g of sets.find(s => `set:${s.id}` === r)?.groups ?? []) groups.add(g)
    else if (r !== '*' && r !== 'none' && !idx.places.some(p => p.id === r)) return true
  }
  for (const g of groups) {
    const computed = idx.places.filter(p => p.coll === g).length
    const total = layers[g]?.n
    if (layers[g] && (computed === 0 || (total != null && total > computed))) return true
  }
  return false
}
