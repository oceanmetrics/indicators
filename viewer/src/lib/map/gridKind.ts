// the `grid` kind of the layer slot: `@oceanmetrics/map`'s `gridSlot` (one square per cell of the dataset's own lattice,
// a ramp fill, holes where the step has no data) over a slice the engine computes in the browser. the factory reads the
// gazetteer's `erddap/<id>/collection.json` (small, here); the engine, DuckDB-WASM and the place polygons arrive with the
// first slice (gridSource.ts, a lazy chunk). the places are the ones the map draws, given by the Map view when it
// registers the kind; the rules (which places, the budget, the legend line, the credit) are gridLayer.ts. the compare mode
// (compare.ts) asks the slot for a `companion`: a second grid slot of the same layer at `t2` (ids `slot:grid@t2`), or the
// anomaly `t2 - t` per cell, over the same source, the same engine and the same slices (sliceCache.ts); the slot at `t` and
// the slice at `t2` share one colour scale, the union of their ranges.
import { defaultRampFor, gridSlot } from '@oceanmetrics/map'
import type { GridSlot, SliceCell } from '@oceanmetrics/map'
import { anomalyDomain, isYearRange, parseYearRange, rangeMonth, unionRange, yearRangePeriods } from './compare.ts'
import type { MeanInfo } from './compare.ts'
import { sharedSlices } from './sliceCache.ts'
import type { LayerSlot, SlotFactory } from './layerSlot.ts'
import { clampStep, collectionUrl, gridCredit, gridTitle, gridVia, hostOf, problemText, producersOf, unitLabel } from './gridLayer.ts'
import type { PlaceCells, SlicePlaces } from './gridLayer.ts'
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
  /** the cells of the mask per place (null until the source is ready) */
  perPlace(): PlaceCells[] | null
  /** with a year range at `t2`: what its mean was made of (null otherwise, and until its slices are in) */
  meanInfo(): MeanInfo | null
  /** the ramp the slot draws with when the hash names none (`defaultRampFor`) */
  defaultRamp: string
  /** the step drawn for a period outside the dataset's record (its last or first step, `clampStep`); null inside it, and until its slice */
  stepOf(t: string | null): { day: string; clamped: 'end' | 'start' } | null
  /** a second slot of this layer for the compare mode: the slice at its own `t` (`t2`) under the same scale as this one, or
   * with `anom` the difference `t2 - t` per cell (this slot's `t`, read at each slice) on a diverging ramp */
  companion(o: { anom: boolean; onchange?: () => void }): GridLayerSlot
}

/** the pause before the slice's axes and polygons are asked for a second time */
export const RETRY_MS = 1500

/** the instance name of the compare slot's ids (`slot:grid@t2`) */
export const COMPARE_INSTANCE = 't2'
/** the year range's slices asked at once (the mirror drops requests under parallel load) */
export const MEAN_CONCURRENCY = 3

/** `fn` over `items`, at most `n` at once, every result kept (a failure does not stop the others) */
export async function settledPool<T, R>(items: readonly T[], n: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      try { out[i] = { status: 'fulfilled', value: await fn(items[i]) } } catch (e) { out[i] = { status: 'rejected', reason: e } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  return out
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
    const prepare = () => {
      prepared ??= import('./gridSource.ts').then(m => m.prepareGridSource(coll, name, sel.places))
      prepared.catch(() => { prepared = null })
      return prepared
    }
    // the axes and polygons are read once a slot; a server that drops one of those requests (the mirror answered 404 to a
    // lobe's longitude axis on 2026-10-23, then the same request again) is asked once more after a pause before the slot says so
    const source = async () => { try { return await prepare() } catch { await new Promise(r => setTimeout(r, RETRY_MS)); return prepare() } }
    let left: string[] = []
    let perPlace: PlaceCells[] | null = null
    // a period outside the dataset's record asks for its last (or first) step: the day drawn, by the period asked
    const moved = new Map<string, { day: string; clamped: 'end' | 'start' }>()
    // one slice per period for both slots: the anomaly reads the slice at t the first slot drew
    const slices = sharedSlices({
      async slice(t, signal) {
        const g = await source()
        left = g.left
        perPlace = g.perPlace
        const c = clampStep(t, g.extent)
        if (t && c.clamped && c.day) moved.set(t, { day: c.day, clamped: c.clamped })
        return g.source.slice(c.day, signal)
      },
    })
    // a failure in the host's words; an abort passes as it is
    const plain = <T>(p: Promise<T>, signal?: AbortSignal) => p.catch((e: unknown) => { throw signal?.aborted ? e : new Error(problemText(e, host)) })
    // the mean of a year range at a month, the last two kept (the anomaly asks for the one the swipe drew)
    const means = new Map<string, Promise<{ rows: SliceCell[]; info: MeanInfo }>>()
    async function meanOf(range: { y0: number; y1: number }, month: string, signal?: AbortSignal): Promise<{ rows: SliceCell[]; info: MeanInfo }> {
      const g = await source()
      const plan = yearRangePeriods(range, month, g.extent)
      const key = `${range.y0}-${range.y1}@${month}`
      let p = means.get(key)
      if (!p) {
        p = (async () => {
          const got = await settledPool(plan.periods, MEAN_CONCURRENCY, d => slices.slice(d, signal))
          if (signal?.aborted) throw signal.reason ?? new DOMException('aborted', 'AbortError')
          const failed = plan.periods.filter((_, i) => got[i].status === 'rejected')
          const ok = got.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []))
          if (plan.periods.length && !ok.length) throw (got[0] as PromiseRejectedResult).reason
          return { rows: await g.mean(ok), info: { ...plan, failed } }
        })()
        means.set(key, p)
        while (means.size > 2) means.delete(means.keys().next().value!)
        // a failure (or an abort) is not kept: a retry asks again
        p.catch(() => { if (means.get(key) === p) means.delete(key) })
      }
      return p
    }
    // the slots drawn on one scale (the first, and the companion's slice at t2; never the anomaly)
    const scale = new Set<GridSlot>()
    const shared = () => unionRange([...scale].map(s => s.cellRange()))
    const unit = v.unit
    const base = { title, credit: gridCredit(title, producersOf(coll), host), units: unitLabel(unit), via: gridVia(host), opacity: 0.9, ramp: defaultRampFor(name, { units: unit }) }

    function make(o: { instance?: string; anomOf?: () => string | null; firstT?: () => string | null; onchange?: () => void }): GridLayerSlot {
      let t0 = 0
      let first: number | null = null
      let mean: MeanInfo | null = null
      let slot: GridSlot
      // the rows of a period, or of a year range's mean at the month of the first slot's t
      const rowsAt = async (t: string | null, signal?: AbortSignal): Promise<SliceCell[]> => {
        const range = parseYearRange(t)
        if (!range) return slices.slice(t, signal)
        const g = await source()
        const r = await meanOf(range, rangeMonth(o.firstT?.() ?? null, g.extent?.end ?? null), signal)
        mean = r.info
        return r.rows
      }
      const label = o.instance ? `${spec.id}:${name}@${o.instance}` : `${spec.id}:${name}`
      const anomOf = o.anomOf
      slot = gridSlot({ ...spec, variable: name }, {
        async slice(t, signal) {
          const s0 = performance.now()
          let rows
          if (!isYearRange(t)) mean = null
          if (anomOf) {
            const t1 = anomOf()
            const [then, now] = await plain(Promise.all([slices.slice(t1, signal), rowsAt(t, signal)]), signal)
            if (signal?.aborted) return now
            rows = await (await source()).anomaly(then, now)
          } else rows = await plain(rowsAt(t, signal), signal)
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
        ramp: anomOf ? defaultRampFor(name, { units: unit, anomaly: true }) : base.ramp,
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
        perPlace: () => perPlace,
        meanInfo: () => mean,
        defaultRamp: base.ramp,
        stepOf: t => (t ? moved.get(t) ?? null : null),
        companion: c => make({ instance: COMPARE_INSTANCE, anomOf: c.anom ? () => out.legend()?.t ?? null : undefined, firstT: () => out.legend()?.t ?? null, onchange: c.onchange }),
      }
      return out
    }
    return make({ onchange: opts.onchange })
  }
}
