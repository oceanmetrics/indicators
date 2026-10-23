import { describe, expect, it, vi } from 'vitest'
import { interpolateColors } from '@oceanmetrics/map'
import type { SliceCell } from '@oceanmetrics/map'
import { gridKind, settledPool } from './gridKind.ts'
import type { GridLayerSlot } from './gridKind.ts'

// the engine chunk without DuckDB: a slice of two cells whose values say the period, and the anomaly as the engine's SQL
// gives it (t2 - t per cell; gridAnomaly.test.ts runs the real one)
const VALUES: Record<string, [number, number]> = { '2024-07-01': [18, 22], '2016-07-01': [15, 19] }
// July of 2003..2020 (but 2016, above): the value is the year less 2000 (so a mean is the mean of the years), a period in `broken` fails
for (let y = 2003; y <= 2020; y++) VALUES[`${y}-07-01`] ??= [y - 2000, y - 2000 + 1]
const fail = { next: 0 }
const broken = new Set<string>()
const asked: (string | null)[] = []
vi.mock('./gridSource.ts', () => ({
  prepareGridSource: async () => fail.next-- > 0 ? Promise.reject(new Error('jplMURSST41mday.json?longitude[...]: 404')) : ({
    left: [], cells: 2, lobes: 1, perPlace: [{ id: 'NMS:CINMS', cells: 2, boundary: 0 }], extent: { start: '2002-06-16T00:00:00Z', end: '2026-09-16T00:00:00Z' },
    source: {
      slice: async (t: string | null) => {
        asked.push(t)
        if (broken.has(t ?? '')) throw new Error('404 Not Found from ERDDAP: <html>Not Found</html>')
        return VALUES[t ?? '2024-07-01'].map((v, i) => ({ lat: 34, lon: -120 + i * 0.25, value: v, weight: 1 }))
      },
    },
    anomaly: async (then: SliceCell[], now: SliceCell[]) => now.map((c, i) => ({ ...c, value: c.value! - then[i].value! })),
    // the mean as the engine's SQL gives it (gridAnomaly.test.ts runs the real one)
    mean: async (slices: SliceCell[][]) => slices[0].map((c, i) => ({ ...c, value: slices.reduce((a, s) => a + s[i].value!, 0) / slices.length })),
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

describe('the year range Then (row 32), the counts, the palette and the retry', () => {
  it('t2 = 2003-2012 draws the mean of July 2003..2012 (the month of t), each slice asked once, one scale with t', async () => {
    const m = strictMap()
    asked.length = 0
    const first = await make()
    first.mount(m as never, null, '2024-07-01')
    await settle()
    const then = first.companion({ anom: false })
    then.mount(m as never, null, '2003-2012')
    await settle()
    // the mean of 3..12 is 7.5 and of 4..13 is 8.5
    expect(then.cellRange()).toEqual([7.5, 8.5])
    expect(then.meanInfo()).toMatchObject({ periods: ['2003-07-01', '2004-07-01', '2005-07-01', '2006-07-01', '2007-07-01', '2008-07-01', '2009-07-01', '2010-07-01', '2011-07-01', '2012-07-01'], capped: false, failed: [] })
    expect(asked.filter(t => t?.endsWith('-07-01')).sort()).toEqual(['2003-07-01', '2004-07-01', '2005-07-01', '2006-07-01', '2007-07-01', '2008-07-01', '2009-07-01', '2010-07-01', '2011-07-01', '2012-07-01', '2024-07-01'])
    expect(first.legend()!.ramp).toMatchObject({ min: 7.5, max: 22 })
  })
  it('a range past 12 periods averages the first 12 and says it was capped; the anomaly reads the same mean', async () => {
    const m = strictMap()
    const first = await make()
    first.mount(m as never, null, '2024-07-01')
    await settle()
    const anom = first.companion({ anom: true })
    anom.mount(m as never, null, '2003-2020')
    await settle()
    expect(anom.meanInfo()).toMatchObject({ capped: true, inside: 18 })
    expect(anom.meanInfo()!.periods).toHaveLength(12)
    // mean of 3..14 = 8.5, of 4..15 = 9.5: minus 18 and 22
    expect(anom.cellRange()).toEqual([-12.5, -9.5])
  })
  it('a period that fails is left out of the mean and named; every period failing is the slot\'s problem, in the host\'s words', async () => {
    const m = strictMap()
    broken.add('2005-07-01')
    const first = await make()
    first.mount(m as never, null, '2024-07-01')
    await settle()
    const then = first.companion({ anom: false })
    then.mount(m as never, null, '2003-2005')
    await settle()
    expect(then.meanInfo()).toMatchObject({ failed: ['2005-07-01'] })
    expect(then.cellRange()).toEqual([3.5, 4.5])
    broken.clear()
    for (let y = 2006; y <= 2007; y++) broken.add(`${y}-07-01`)
    then.update('2006-2007')
    await settle()
    expect(then.legend()!.problem).toBe('no data: erddap.example.org answered HTTP 404 Not Found')
    // Retry asks again (the failed slices are not kept), and the slot draws once the server answers
    broken.clear()
    then.retry()
    await settle()
    expect(then.legend()!.problem).toBeNull()
    expect(then.cellRange()).toEqual([6.5, 7.5])
  })
  it('the cells per place come from the source; the palette repaints the slot and its default stays named', async () => {
    const m = strictMap()
    const first = await make()
    expect(first.perPlace()).toBeNull()
    first.mount(m as never, null, '2024-07-01')
    await settle()
    expect(first.perPlace()).toEqual([{ id: 'NMS:CINMS', cells: 2, boundary: 0 }])
    expect(first.counts()).toEqual({ cells: 2, withValue: 2, boundary: 0 })
    expect(first.defaultRamp).toBe('thermal')
    first.setRamp('viridis')
    expect(first.legend()!.ramp!.colors).toEqual(interpolateColors(7, 'viridis'))
    first.setRamp(null)
    expect(first.legend()!.ramp!.colors).toEqual(interpolateColors(7, 'thermal'))
    expect(first.cellAt(-119.76, 34.1)).toEqual({ lon: -119.75, lat: 34, weight: 1, value: 22 })
  })
  it('settledPool: every item, at most n at once, a failure kept beside the others', async () => {
    let running = 0, most = 0
    const r = await settledPool([1, 2, 3, 4, 5], 2, async x => { running++; most = Math.max(most, running); await new Promise(q => setTimeout(q, 5)); running--; if (x === 3) throw new Error('three'); return x * 10 })
    expect(most).toBe(2)
    expect(r.map(x => (x.status === 'fulfilled' ? x.value : (x.reason as Error).message))).toEqual([10, 20, 'three', 40, 50])
  })
})

describe('a period outside the dataset\'s record (rows 18, 33: t clamped to the dataset\'s last step)', () => {
  it('a period past the record asks for its last step, says which, and draws it; one inside is asked as it is', async () => {
    const m = strictMap()
    asked.length = 0
    VALUES['2026-09-16'] = [20, 24]
    const first = await make()
    first.mount(m as never, null, '2026-11-01')
    await settle()
    expect(asked).toEqual(['2026-09-16'])
    expect(first.stepOf('2026-11-01')).toEqual({ day: '2026-09-16', clamped: 'end' })
    expect(first.legend()!.ramp).toMatchObject({ min: 20, max: 24 })
    expect(first.legend()!.problem ?? null).toBeNull()
    first.update('2024-07-01')
    await settle()
    expect(asked).toEqual(['2026-09-16', '2024-07-01'])
    expect(first.stepOf('2024-07-01')).toBeNull()
    first.unmount(m as never)
  })
  it('a period before the record asks for its first step', async () => {
    const m = strictMap()
    asked.length = 0
    VALUES['2002-06-16'] = [10, 12]
    const first = await make()
    first.mount(m as never, null, '1999-01-01')
    await settle()
    expect(asked).toEqual(['2002-06-16'])
    expect(first.stepOf('1999-01-01')).toEqual({ day: '2002-06-16', clamped: 'start' })
    first.unmount(m as never)
  })
})
