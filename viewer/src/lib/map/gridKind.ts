// the `grid` kind of the layer slot: `@oceanmetrics/map`'s `gridSlot` (one square per cell of the dataset's own lattice,
// a ramp fill, holes where the step has no data) over a slice the engine computes in the browser. the factory reads the
// gazetteer's `erddap/<id>/collection.json` (small, here); the engine, DuckDB-WASM and the place polygons arrive with the
// first slice (gridSource.ts, a lazy chunk). the places are the ones the map draws, given by the Map view when it
// registers the kind; the rules (which places, the budget, the legend line, the credit) are gridLayer.ts.
import { defaultRampFor, GRID_LAYER, gridSlot } from '@oceanmetrics/map'
import type { LayerSlot, SlotFactory } from './layerSlot.ts'
import { collectionUrl, gridCredit, gridTitle, gridVia, hostOf, producersOf, uniqueCells, unitLabel } from './gridLayer.ts'
import type { SlicePlaces } from './gridLayer.ts'
import type { GridSource } from './gridSource.ts'

interface StacCollection {
  title?: string
  providers?: { name?: string; roles?: string[] }[]
  'cube:variables'?: Record<string, { type?: string; description?: string; unit?: string }>
  'erddap:base_url'?: string
  'erddap:dataset_id'?: string
}

const collections = new Map<string, Promise<StacCollection>>()
function loadCollection(id: string, fetchFn: typeof fetch): Promise<StacCollection> {
  let p = collections.get(id)
  if (!p) {
    p = (async () => {
      const r = await fetchFn(collectionUrl(id))
      if (!r.ok) throw new Error(`erddap/${id}: HTTP ${r.status}`)
      const c = (await r.json()) as StacCollection
      if (!c['erddap:base_url'] || !c['erddap:dataset_id']) throw new Error(`erddap/${id} names no ERDDAP server`)
      return c
    })()
    collections.set(id, p)
    p.catch(() => collections.delete(id))
  }
  return p
}

/** a grid slot with what its legend adds: the places left out of the slice, and the time the first slice took */
export interface GridLayerSlot extends LayerSlot {
  /** the places over the cell budget or without a polygon in the gazetteer */
  leftOut(): string[]
  /** the groups of the map with no polygon to mask (reference and derived groups) */
  without(): string[]
  /** ms from mount to the first slice drawn (null until then) */
  firstMs(): number | null
}

/** the factory of the `grid` kind over the places `places()` names when the slot is made */
export function gridKind(places: () => SlicePlaces): SlotFactory {
  return async (spec, opts) => {
    const coll = await loadCollection(spec.id, opts.fetch ?? fetch)
    const vars = Object.entries(coll['cube:variables'] ?? {}).filter(([, v]) => (v.type ?? 'data') === 'data')
    const name = spec.variable ?? vars[0]?.[0]
    const v = vars.find(([k]) => k === name)?.[1]
    if (!name || !v) throw new Error(`erddap/${spec.id} has no variable ${spec.variable ?? 'to draw'}`)
    const host = hostOf(coll['erddap:base_url']!)
    const title = gridTitle({ title: coll.title ?? spec.id }, { name, description: v.description })
    const sel = places()
    let prepared: Promise<GridSource> | null = null
    let left: string[] = []
    let t0 = 0
    let first: number | null = null
    const slot = gridSlot({ ...spec, variable: name }, {
      async slice(t, signal) {
        prepared ??= import('./gridSource.ts').then(m => m.prepareGridSource(coll, name, sel.places))
        prepared.catch(() => { prepared = null })
        const g = await prepared
        left = g.left
        const rows = uniqueCells(await g.source.slice(t, signal))
        if (first === null && !signal?.aborted) {
          first = Math.round(performance.now() - t0)
          console.info(`[om] grid slice ${spec.id}:${name} at ${t ?? 'latest'}: ${rows.length} cells, ${g.lobes} lobes, first slice in ${first} ms`)
        }
        return rows
      },
    }, { title, credit: gridCredit(title, producersOf(coll), host), units: unitLabel(v.unit), ramp: defaultRampFor(name, { units: v.unit }), via: gridVia(host), opacity: 0.9, onchange: opts.onchange })
    const mount = slot.mount
    return {
      ...slot,
      mount(m, beforeId, t) {
        t0 = performance.now()
        mount(m, beforeId, t)
        // the package outlines each square in 12 % black; at a 0.01° grid that is a mesh, darker in some tiles than others
        // (seen over the Channel Islands as a straight seam where the SST is smooth), so the outline takes the fill's colour
        m.setPaintProperty(GRID_LAYER, 'fill-outline-color', undefined)
      },
      leftOut: () => left,
      without: () => sel.without,
      firstMs: () => first,
    } satisfies GridLayerSlot
  }
}
