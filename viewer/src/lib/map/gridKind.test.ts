import { describe, expect, it, vi } from 'vitest'
import { interpolateColors } from '@oceanmetrics/map'
import type { SliceCell } from '@oceanmetrics/map'
import { gridKind } from './gridKind.ts'
import type { GridLayerSlot } from './gridKind.ts'

// the engine chunk without DuckDB: a slice of two cells whose values say the period, and the anomaly as the engine's SQL
// gives it (t2 - t per cell; gridAnomaly.test.ts runs the real one)
const VALUES: Record<string, [number, number]> = { '2024-07-01': [18, 22], '2016-07-01': [15, 19] }
const fail = { next: 0 }
vi.mock('./gridSource.ts', () => ({
  prepareGridSource: async () => fail.next-- > 0 ? Promise.reject(new Error('jplMURSST41mday.json?longitude[...]: 404')) : ({
    left: [], cells: 2, lobes: 1,
    source: { slice: async (t: string | null) => VALUES[t ?? '2024-07-01'].map((v, i) => ({ lat: 34, lon: -120 + i * 0.25, value: v, weight: 1 })) },
    anomaly: async (then: SliceCell[], now: SliceCell[]) => now.map((c, i) => ({ ...c, value: c.value! - then[i].value! })),
  }),
}))

const COLLECTION = { title: 'MUR monthly', 'erddap:base_url': 'https://erddap.example.org/erddap', 'erddap:dataset_id': 'mur', 'cube:variables': { sst: { type: 'data', description: 'sea surface temperature', unit: 'degree_C' } } }
const fetchJson = (async () => ({ ok: true, json: async () => COLLECTION })) as unknown as typeof fetch

// a map that keeps sources and layers by id and refuses a duplicate, as MapLibre does
function strictMap() {
  const sources = new Set<string>()
  const layers = new Map<string, Record<string, unknown>>()
  return {
    sources, layers,
    addSource(id: string) { if (sources.has(id)) throw new Error(`There is already a source with ID "${id}".`); sources.add(id) },
    addLayer(l: { id: string; paint: Record<string, unknown> }) { if (layers.has(l.id)) throw new Error(`Layer "${l.id}" already exists`); layers.set(l.id, { ...l.paint }) },
    getSource: (id: string) => (sources.has(id) ? { setData() {} } : undefined),
    getLayer: (id: string) => layers.get(id),
    removeLayer(id: string) { layers.delete(id) },
    removeSource(id: string) { sources.delete(id) },
    setPaintProperty(id: string, k: string, v: unknown) { layers.get(id)![k] = v },
  }
}
const settle = () => new Promise(r => setTimeout(r, 20))
const make = async () => (await gridKind(() => ({ places: [{ coll: 'places', id: 'NMS:CINMS' }], without: [] }))({ kind: 'grid', id: 'mur', variable: 'sst' }, { fetch: fetchJson })) as GridLayerSlot

describe('the compare slot of the grid kind', () => {
  it('mounts beside the first with its own ids, and both draw on one scale: the union of the two periods', async () => {
    const m = strictMap()
    const first = await make()
    first.mount(m as never, null, '2024-07-01')
    await settle()
    expect(first.legend()!.ramp).toMatchObject({ min: 18, max: 22 })
    const second = first.companion({ anom: false })
    second.mount(m as never, null, '2016-07-01')
    await settle()
    expect([...m.sources]).toEqual(['slot:grid', 'slot:grid@t2'])
    expect(second.legend()!.ramp).toMatchObject({ min: 15, max: 22 })
    expect(first.legend()!.ramp).toMatchObject({ min: 15, max: 22 })
    // compare off: the first goes back to its own range
    second.unmount(m as never)
    expect([...m.layers.keys()]).toEqual(['slot:grid:fill'])
    expect(first.legend()!.ramp).toMatchObject({ min: 18, max: 22 })
  })
  it('the anomaly is t2 - t per cell on a domain symmetric about 0, on the diverging ramp, and leaves the first slot\'s scale alone', async () => {
    const m = strictMap()
    const first = await make()
    first.mount(m as never, null, '2024-07-01')
    await settle()
    const anom = first.companion({ anom: true })
    anom.mount(m as never, null, '2016-07-01')
    await settle()
    expect(anom.cellRange()).toEqual([-3, -3])
    expect(anom.legend()!.ramp).toMatchObject({ min: -3, max: 3 })
    expect(anom.legend()!.ramp!.colors).toEqual(interpolateColors(7, 'balance'))
    expect(first.legend()!.ramp).toMatchObject({ min: 18, max: 22 })
  })
  it('regression: a source that fails once (the mirror 404 on a lobe\'s axis) is asked once more before the slot says so', async () => {
    const m = strictMap()
    fail.next = 1
    const first = await make()
    first.mount(m as never, null, '2024-07-01')
    await new Promise(r => setTimeout(r, 1700))
    expect(first.legend()!.problem).toBeNull()
    expect(first.legend()!.ramp).toMatchObject({ min: 18, max: 22 })
  })
  it('a source that fails twice says so in the legend', async () => {
    const m = strictMap()
    fail.next = 2
    const first = await make()
    first.mount(m as never, null, '2024-07-01')
    await new Promise(r => setTimeout(r, 1700))
    expect(first.legend()!.problem).toBe('no data: jplMURSST41mday.json?longitude[...]: 404')
    fail.next = 0
  })
})
