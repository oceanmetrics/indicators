// the `grid` slot's data: a `SliceSource` (`@oceanmetrics/engine` `sliceSource`) over the polygons of the places the map
// draws. this module is the lazy engine chunk: gridKind.ts `import()`s it the first time a grid slot asks for a slice, so
// DuckDB-WASM, Apache Arrow, the mask (turf), the GeoParquet reader and its codecs never reach the entry or the map chunk.
// DuckDB runs in its own Web Worker on self-hosted bundles (`?url`, as obis-hex `src/lib/engine/bundles.ts`: the mvp and eh
// wasm and worker files from this origin, no CDN, never a blob worker), booted once a page, on the first slice.
import * as duckdb from '@duckdb/duckdb-wasm'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import { Engine, connectBrowser, fetchTimeExtent, lobeAxes, lobeMasks, patientFetch, placeLobes, sliceSource, toDataset, wkbToGeoJSON } from '@oceanmetrics/engine'
import type { Lobe, SliceSource } from '@oceanmetrics/engine'
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import type { Geometry } from 'geojson'
import { axisSteps, budgetLobes, placesParquetUrl } from './gridLayer.ts'
import type { PlaceCells, SlicePlace } from './gridLayer.ts'
import { groupsFor, rowsToPlaces } from './placeGeometry.ts'
import { anomalyRows, meanRows } from './gridAnomaly.ts'
import type { SliceCell } from '@oceanmetrics/map'
import type { GeoPlace, MetaLike } from './placeGeometry.ts'

// every ERDDAP request of the slice asks again when the mirror drops it (@oceanmetrics/engine `patientFetch`:
// a network error, a 404 "unknown datasetID", a 429 or a 5xx is asked again, six tries). the engine's requests pass a url string
const erddapFetch = ((input, init) => patientFetch(String(input), init)) as typeof fetch

// ---- the engine: one DuckDB-WASM a page, in its worker ----

let engine: Engine | null = null
const theEngine = () => (engine ??= new Engine(() => connectBrowser(duckdb, {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
})))

// ---- the polygons, read once a place ----

const decode = (b: Uint8Array) => wkbToGeoJSON(b) as Geometry
const placeCache = new Map<string, Promise<GeoPlace | null>>()

/** the polygons of `ids` in one gazetteer collection: the row groups that may hold them, then their rows */
async function readCollection(coll: string, ids: string[]): Promise<GeoPlace[]> {
  const file = await asyncBufferFromUrl({ url: placesParquetUrl(coll) })
  const metadata = await parquetMetadataAsync(file)
  const parsers = { geometryFromBytes: decode, geographyFromBytes: decode }
  const rows: Record<string, unknown>[] = []
  for (const g of groupsFor(metadata as unknown as MetaLike, ids)) {
    rows.push(...await parquetReadObjects({ file, metadata, compressors, parsers, columns: ['place_id', 'bbox', 'geometry'], rowStart: g.rowStart, rowEnd: g.rowEnd }))
  }
  return rowsToPlaces(rows, ids, decode)
}

async function readPlaces(places: readonly SlicePlace[]): Promise<GeoPlace[]> {
  const byColl = new Map<string, string[]>()
  for (const p of places) if (!placeCache.has(`${p.coll}/${p.id}`)) byColl.set(p.coll, [...(byColl.get(p.coll) ?? []), p.id])
  for (const [coll, ids] of byColl) {
    const read = readCollection(coll, ids)
    for (const id of ids) {
      const one = read.then(ps => ps.find(p => p.place_id === id) ?? null)
      placeCache.set(`${coll}/${id}`, one)
      one.catch(() => placeCache.delete(`${coll}/${id}`))
    }
  }
  const got = await Promise.all(places.map(p => placeCache.get(`${p.coll}/${p.id}`)!.catch(() => null)))
  return got.filter((p): p is GeoPlace => !!p)
}

// ---- the source ----

export interface GridSource {
  source: SliceSource
  /** places left out of the slice: over the cell budget, or with no polygon in the gazetteer */
  left: string[]
  /** cells per step the slice holds, and how many lobes ask ERDDAP for them */
  cells: number
  lobes: number
  /** the mask's cells per place, in the order the places were sliced */
  perPlace: PlaceCells[]
  /** the dataset's live time extent (null when the server did not say) */
  extent: { start: string; end: string } | null
  /** `now - then` per cell of `now`, in the engine's SQL (the compare mode's anomaly) */
  anomaly(then: readonly SliceCell[], now: readonly SliceCell[]): Promise<SliceCell[]>
  /** the mean per cell of several slices, in the engine's SQL (a year range's Then) */
  mean(slices: readonly (readonly SliceCell[])[]): Promise<SliceCell[]>
}

/**
 * the slice over the places: their polygons, one lobe each side of ±180 where a place spans it (`placeLobes`), the lobes
 * within the cell budget, each lobe's axes from the server, the mask of every lobe by its own place (`lobeMasks`), and
 * the dataset's live time extent (a null `t` is its last step)
 */
export async function prepareGridSource(collection: unknown, variableName: string, places: readonly SlicePlace[]): Promise<GridSource> {
  const ds = toDataset(collection)
  const variable = ds.variables.find(v => v.name === variableName)
  if (!variable) throw new Error(`${ds.id} has no variable ${variableName}`)
  const geo = await readPlaces(places)
  const missing = places.filter(p => !geo.some(g => g.place_id === p.id)).map(p => p.id)
  const byPlace = geo.map(g => ({ place: g.place_id, lobes: placeLobes({ place_id: g.place_id, geometry: g.geometry }) }))
  const { kept, left } = budgetLobes<Lobe>(byPlace, axisSteps(collection as Parameters<typeof axisSteps>[0]))
  const [axes, extent] = await Promise.all([lobeAxes(ds, kept, { fetch: erddapFetch }), fetchTimeExtent(ds.baseUrl, ds.datasetId, undefined, { fetchFn: erddapFetch }).catch(() => null)])
  // the mask lobe by lobe (the same cells as all at once), so each place's share is counted: the legend's cells per place
  const cells: ReturnType<typeof lobeMasks>['cells'] = []
  const perPlace: PlaceCells[] = []
  let k = 0
  for (const { place, lobes } of byPlace) {
    if (left.includes(place)) continue
    const pc: PlaceCells = { id: place, cells: 0, boundary: 0 }
    for (let i = 0; i < lobes.length; i++, k++) {
      const m = lobeMasks(ds, [kept[k]], [axes[k]]).cells
      for (const c of m) { cells.push(c); if (c.weight < 1) pc.boundary++ }
      pc.cells += m.length
    }
    perPlace.push(pc)
  }
  return {
    source: sliceSource({ dataset: ds, variable, axes, mask: cells, engine: theEngine(), extent, fetch: erddapFetch }),
    left: [...left, ...missing], cells: cells.length, lobes: kept.length, perPlace, extent,
    anomaly: (then, now) => anomalyRows(theEngine(), then, now),
    mean: slices => meanRows(theEngine(), slices),
  }
}
