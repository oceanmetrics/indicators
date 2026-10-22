// the polygons of the places a slice masks, read from the gazetteer's GeoParquet (`<coll>/places.parquet`, the WKB
// geometry of every place of a collection) with range requests: only the row groups whose place_id statistics admit an id
// are read (the gazetteer writes a few places a group), then only those rows. the sanctuaries' file is one group of 18
// rows, 4.4 MB, read once a page. loaded with the slot (gridSource.ts), never in the entry or the map chunk. the parts of a
// polygon stay as the gazetteer split them at ±180, which is what the engine's `placeLobes` expects.
import type { Geometry } from 'geojson'

/** what the slice reads of a place: its id, its bbox and its (Multi)Polygon */
export interface GeoPlace { place_id: string; bbox: [number, number, number, number]; geometry: Geometry }

/** the slice of hyparquet's FileMetaData the row-group rule reads */
export interface MetaLike {
  row_groups: { num_rows: bigint | number; columns: { meta_data?: { path_in_schema: string[]; statistics?: Record<string, unknown> } }[] }[]
}

const decoder = new TextDecoder()
const text = (v: unknown) => (v == null ? undefined : v instanceof Uint8Array ? decoder.decode(v) : String(v))

/** the row ranges of the groups whose place_id min/max admit any of `ids` (a group without statistics always does) */
export function groupsFor(metadata: MetaLike, ids: readonly string[]): { rowStart: number; rowEnd: number }[] {
  const out: { rowStart: number; rowEnd: number }[] = []
  let start = 0
  for (const rg of metadata.row_groups) {
    const n = Number(rg.num_rows)
    const st = rg.columns.find(c => c.meta_data?.path_in_schema.join('.') === 'place_id')?.meta_data?.statistics
    const lo = text(st?.min_value ?? st?.min), hi = text(st?.max_value ?? st?.max)
    if (lo === undefined || hi === undefined || ids.some(id => lo <= id && id <= hi)) out.push({ rowStart: start, rowEnd: start + n })
    start += n
  }
  return out
}

/** a bbox as the gazetteer writes it (a struct xmin..ymax, or a 4-array) -> [west, south, east, north]; null when unreadable */
export function bboxOf(b: unknown): [number, number, number, number] | null {
  const v = Array.isArray(b) ? b.map(Number)
    : b && typeof b === 'object' ? ['xmin', 'ymin', 'xmax', 'ymax'].map(k => Number((b as Record<string, unknown>)[k])) : []
  return v.length === 4 && v.every(Number.isFinite) ? (v as [number, number, number, number]) : null
}

/** the rows of the ids asked for, in the order asked, each once; a row with no polygon or no bbox is skipped */
export function rowsToPlaces(rows: readonly Record<string, unknown>[], ids: readonly string[], decode: (b: Uint8Array) => Geometry): GeoPlace[] {
  const byId = new Map<string, GeoPlace>()
  for (const r of rows) {
    const id = String(r.place_id ?? '')
    if (!ids.includes(id) || byId.has(id)) continue
    const g = r.geometry instanceof Uint8Array ? decode(r.geometry) : (r.geometry as Geometry | null)
    const bbox = bboxOf(r.bbox)
    if (!g || !bbox || !/Polygon$/.test(g.type)) continue
    byId.set(id, { place_id: id, bbox, geometry: g })
  }
  return ids.map(id => byId.get(id)).filter((p): p is GeoPlace => !!p)
}
