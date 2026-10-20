import { describe, expect, it } from 'vitest'
import { DEFAULT_SPEC } from '../../../../src/report/spec.ts'
import type { ReportSpec } from '../../../../src/report/spec.ts'
import type { CoverageRow } from '../../../../src/coverage/build.ts'
import type { Indicator } from '../data.ts'
import { indexCoverage } from '../matrix.ts'
import type { PlaceRow } from '../valuesData.ts'
import { cardOptsFor, cellKey, cellUrl, loadCells, modelFor } from './cells.ts'
import type { CellResult } from './cells.ts'

const IND = {
  id: 'sst', title: 'Sea surface temperature', short: 'SST', kind: 'continuous', category: {}, series: 'sst', lead: true, min_periods: 10,
  status_grain: 'year', status_method: 'iea-sd', recent: 5, time_grains: ['year'], method: { kind: 'x', summary: '' }, producer: { name: 'p' },
  dataset: { id: 'd', title: 'D', providers: [] }, collections: [{ coll: 'places', places: 2, rows: 30, path: 'values/sst/data.parquet' }], unit_label: '°C', decimals: 1,
} as unknown as Indicator
const COV = (id: string, name: string): CoverageRow => ({
  place_id: id, place_name: name, coll: 'places', indicator: 'sst', time_grain: 'year', t0: '2000-01-01', t1: '2019-01-01', n_periods: 20, last_time: '2019-01-01',
  last_value: 1, last_class: null, status_method: 'iea-sd', status: 'within', trend: 'flat', recent_mean: null, recent_from: null, recent_to: null, lt_mean: null,
  lt_sd: null, why: null, sentence: 's', spark: '[]',
} as CoverageRow)
const idx = indexCoverage([COV('NMS:A', 'Alpha'), COV('NMS:B', 'Bravo')])
const [A, B] = idx.places
const row = (id: string, y: number, v: number): PlaceRow => ({ place_id: id, coll: 'places', indicator: 'sst', time_grain: 'year', time: `${y}-01-01`, class: null, value: v, n: 1, unit: '°C' }) as PlaceRow
const alt = (id: string) => Array.from({ length: 20 }, (_, i) => row(id, 2000 + i, i % 2))
const spec = (o: Partial<ReportSpec> = {}): ReportSpec => ({ ...DEFAULT_SPEC, ...o })

describe('a cell under the report style', () => {
  it('the options are the indicator\'s own unless the spec changes them', () => {
    expect(cardOptsFor(IND, spec())).toEqual({ method: 'iea-sd', recent: 5, baseline: null, from: null, to: null })
    expect(cardOptsFor(IND, spec({ style: { status: 'names-pct', recent: 8, baseline: [2000, 2010] }, time: { grain: 'year', from: 2001, to: 2018 } })))
      .toEqual({ method: 'names-pct', recent: 8, baseline: [2000, 2010], from: 2001, to: 2018 })
  })
  it('the model is the Place view\'s: a status from the place\'s own record, worded with the indicator\'s short name', () => {
    const m = modelFor(IND, A, alt('NMS:A'), spec())
    expect(m.kind).toBe('continuous')
    expect(m.method).toBe('iea-sd')
    expect(m.status).toBe('within')
    expect(m.result!.n).toBe(20)
    expect(m.sentence).toContain('SST in Alpha')
  })
  it('the spec\'s years clip the record the status is computed on', () => {
    expect(modelFor(IND, A, alt('NMS:A'), spec({ time: { grain: 'year', from: 2010, to: null } })).result!.n).toBe(10)
  })
  it('the values file is the one of the place\'s collection, or null', () => {
    expect(cellUrl({ base: 'https://x/' }, idx, A, IND)).toBe('https://x/values/sst/data.parquet')
    expect(cellUrl({ base: 'https://x/' }, idx, { ...A, coll: 'nowhere', valuesColls: ['nowhere'] }, { ...IND, collections: [] })).toBeNull()
  })
  it('the cell key joins place and indicator ids so it cannot collide', () => {
    expect(cellKey(A, IND)).toBe('NMS:A\u0000sst')
  })
})

describe('loadCells', () => {
  it('reads each pair once and reports the results so far; a failed read is an error result, the others still arrive', async () => {
    const seen: Map<string, CellResult>[] = []
    const load = async (_url: string, id: string) => { if (id === 'NMS:B') throw new Error('HTTP 404'); return alt(id) }
    await new Promise<void>(done => {
      loadCells({ base: 'https://x/' }, idx, spec(), [{ place: A, ind: IND }, { place: B, ind: IND }], r => { seen.push(r); if (r.size === 2) done() }, load)
    })
    const last = seen[seen.length - 1]
    expect(last.get(cellKey(A, IND))).toMatchObject({ s: 'ok' })
    expect(last.get(cellKey(B, IND))).toEqual({ s: 'error', msg: 'HTTP 404' })
  })
  it('stopping it silences later updates', async () => {
    let calls = 0
    const stop = loadCells({ base: 'https://x/' }, idx, spec(), [{ place: A, ind: IND }], () => calls++, async (_u, id) => alt(id))
    stop()
    await new Promise(r => setTimeout(r, 10))
    expect(calls).toBe(0)
  })
  it('a pair whose collection has no values file is an error result naming it', async () => {
    const seen: Map<string, CellResult>[] = []
    await new Promise<void>(done => {
      loadCells({ base: 'https://x/' }, idx, spec(), [{ place: A, ind: { ...IND, collections: [] } }], r => { seen.push(r); done() }, async () => [])
    })
    expect((seen[0].get(cellKey(A, IND)) as { msg: string }).msg).toMatch(/no values file/)
  })
})
