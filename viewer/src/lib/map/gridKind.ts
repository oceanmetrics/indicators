// the `grid` kind of the layer slot: `@oceanmetrics/map`'s `gridSlot` (one square per cell of the dataset's own lattice,
// a ramp fill, holes where the step has no data) over a slice the engine computes in the browser. the factory reads the
// gazetteer's `erddap/<id>/collection.json` (small, here); the engine, DuckDB-WASM and the place polygons arrive with the
// first slice (gridSource.ts, a lazy chunk). the places are the ones the map draws, given by the Map view when it
// registers the kind; the rules (which places, the budget, the legend line, the credit) are gridLayer.ts. the compare mode
// (compare.ts) asks the slot for a `companion`: a second grid slot of the same layer at `t2` (ids `slot:grid@t2`), or the
// anomaly `t2 - t` per cell, over the same source, the same engine and the same slices (sliceCache.ts); the slot at `t` and
// the slice at `t2` share one colour scale, the union of their ranges.
import { defaultRampFor, gridSlot } from '@oceanmetrics/map'
import type { GridSlot } from '@oceanmetrics/map'
import { anomalyDomain, unionRange } from './compare.ts'
import { sharedSlices } from './sliceCache.ts'
import type { LayerSlot, SlotFactory } from './layerSlot.ts'
import { collectionUrl, gridCredit, gridTitle, gridVia, hostOf, producersOf, unitLabel } from './gridLayer.ts'
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
export interface GridLayerSlot extends GridSlot {
  /** the places over the cell budget or without a polygon in the gazetteer */
  leftOut(): string[]
  /** the groups of the map with no polygon to mask (reference and derived groups) */
  without(): string[]
  /** ms from mount to the first slice drawn (null until then) */
  firstMs(): number | null
  /** a second slot of this layer for the compare mode: the slice at its own `t` (`t2`) under the same scale as this one, or
   * with `anom` the difference `t2 - t` per cell (this slot's `t`, read at each slice) on a diverging ramp */
  companion(o: { anom: boolean; onchange?: () => void }): GridLayerSlot
}

/** the pause before the slice's axes and polygons are asked for a second time */
export const RETRY_MS = 1500

/** the instance name of the compare slot's ids (`slot:grid@t2`) */
export const COMPARE_INSTANCE = 't2'

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
    const prepare = () => {
      prepared ??= import('./gridSource.ts').then(m => m.prepareGridSource(coll, name, sel.places))
      prepared.catch(() => { prepared = null })
      return prepared
    }
    // the axes and polygons are read once a slot; a server that drops one of those requests (the mirror answered 404 to a
    // lobe's longitude axis on 2026-10-23, then the same request again) is asked once more after a pause before the slot says so
    const source = async () => { try { return await prepare() } catch { await new Promise(r => setTimeout(r, RETRY_MS)); return prepare() } }
    let left: string[] = []
    // one slice per period for both slots: the anomaly reads the slice at t the first slot drew
    const slices = sharedSlices({ async slice(t, signal) { const g = await source(); left = g.left; return g.source.slice(t, signal) } })
    // the slots drawn on one scale (the first, and the companion's slice at t2; never the anomaly)
    const scale = new Set<GridSlot>()
    const shared = () => unionRange([...scale].map(s => s.cellRange()))
    const unit = v.unit
    const base = { title, credit: gridCredit(title, producersOf(coll), host), units: unitLabel(unit), via: gridVia(host), opacity: 0.9 }

    function make(o: { instance?: string; anomOf?: () => string | null; onchange?: () => void }): GridLayerSlot {
      let t0 = 0
      let first: number | null = null
      let slot: GridSlot
      const label = o.instance ? `${spec.id}:${name}@${o.instance}` : `${spec.id}:${name}`
      const anomOf = o.anomOf
      slot = gridSlot({ ...spec, variable: name }, {
        async slice(t, signal) {
          const s0 = performance.now()
          let rows
          if (anomOf) {
            const t1 = anomOf()
            const [then, now] = await Promise.all([slices.slice(t1, signal), slices.slice(t, signal)])
            if (signal?.aborted) return now
            rows = await (await source()).anomaly(then, now)
          } else rows = await slices.slice(t, signal)
          if (signal?.aborted) return rows
          const ms = Math.round(performance.now() - s0)
          const isFirst = first === null
          if (isFirst) first = Math.round(performance.now() - t0)
          const g = await source()
          console.info(`[om] grid slice ${label} at ${t ?? 'latest'}${anomOf ? ` minus ${anomOf() ?? 'latest'}` : ''}: ${rows.length} cells, ${g.lobes} lobes, ${isFirst ? `first slice in ${first} ms from mount` : `step in ${ms} ms`}`)
          return rows
        },
      }, {
        ...base,
        ramp: defaultRampFor(name, { units: unit, anomaly: !!anomOf }),
        instance: o.instance,
        domain: anomOf ? () => anomalyDomain(slot.cellRange()) : shared,
        onchange: () => {
          o.onchange?.()
          // the other slot of the scale paints again under the union (a no-op when it did not move)
          if (!anomOf) for (const s of scale) if (s !== slot) s.repaint()
        },
      })
      const mount = slot.mount
      const unmount = slot.unmount
      // no outline override: since map 0.2.2 the squares of a grid at 0.05° or finer have none (the 12 % black mesh it drew
      // over MUR's 0.01° grid was a package default, now `gridOutline`)
      const out: GridLayerSlot = {
        ...slot,
        mount(m, beforeId, t) {
          t0 = performance.now()
          if (!anomOf) scale.add(slot)
          mount(m, beforeId, t)
        },
        unmount(m) {
          unmount(m)
          scale.delete(slot)
          for (const s of scale) s.repaint()
        },
        leftOut: () => left,
        without: () => sel.without,
        firstMs: () => first,
        companion: c => make({ instance: COMPARE_INSTANCE, anomOf: c.anom ? () => out.legend()?.t ?? null : undefined, onchange: c.onchange }),
      }
      return out
    }
    return make({ onchange: opts.onchange })
  }
}
