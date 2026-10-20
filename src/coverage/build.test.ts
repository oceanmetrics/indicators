// the coverage builder: exact rows from small synthetic values, one test per rule.
import { describe, expect, it } from 'vitest'
import { coverageOf, SPARK_PERIODS } from './build.ts'
import type { ManifestIndicator, ValueRow } from './build.ts'
import { coverageParquet } from './cli.ts'
import { parquetReadObjects } from 'hyparquet'

const SST: ManifestIndicator = {
  id: 'erddap:dhw_5km:CRW_SST:mean', short: 'SST', title: 'Sea surface temperature (CRW, 5 km)', kind: 'continuous',
  status_method: 'iea-sd', status_grain: 'year', min_periods: 10, recent: 5, unit_label: '°C', decimals: 2,
  collections: [{ coll: 'places', path: 'x' }],
}
const BAA: ManifestIndicator = {
  ...SST, id: 'erddap:dhw_5km:CRW_BAA:share', short: 'Bleaching alert', kind: 'categorical', status_method: 'values',
  classes: { '0': 'No Stress', '1': 'Bleaching Watch' },
}
const row = (o: Partial<ValueRow>): ValueRow => ({
  place_id: 'NMS:A', coll: 'places', indicator: SST.id, time_grain: 'year', time: '2020-01-01', class: null,
  value: 1, n: 12, unit: 'Celsius', ...o,
})
const years = (y0: number, vs: number[], o: Partial<ValueRow> = {}) =>
  vs.map((v, i) => row({ time: `${y0 + i}-01-01`, value: v, ...o }))
const names = new Map([['NMS:A', 'Alpha Bank']])

describe('continuous', () => {
  it('the status_grain row carries the iea-sd status, trend and sentence', () => {
    const rows = coverageOf(years(2006, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 6, 7, 8, 9]), SST, names)
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r).toMatchObject({
      place_id: 'NMS:A', place_name: 'Alpha Bank', coll: 'places', indicator: SST.id, time_grain: 'year', t0: '2006-01-01', t1: '2020-01-01',
      n_periods: 15, last_time: '2020-01-01', last_value: 9, last_class: null, status_method: 'iea-sd',
      status: 'above', trend: 'up', recent_mean: 7, recent_from: '2016-01-01', recent_to: '2020-01-01', why: null,
      sentence: 'SST in Alpha Bank over the last 5 years (2016–2020) was more than 1 SD above its 2006–2020 mean, and rose by more than 1 SD.',
    })
    expect(r.lt_mean).toBeCloseTo(35 / 15, 12)
    expect(JSON.parse(r.spark)).toEqual([2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020]
      .map((y, i) => [`${y}-01-01`, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 6, 7, 8, 9][i]]))
  })
  it('a grain other than the status grain has values but no status', () => {
    const rows = coverageOf([row({ time_grain: 'month', time: '2020-01-01' }), row({ time_grain: 'month', time: '2020-02-01', value: 2 })], SST, names)
    expect(rows[0]).toMatchObject({ time_grain: 'month', n_periods: 2, last_value: 2, status_method: null, status: null, sentence: null, why: null })
  })
  it('a short record: no status, and why', () => {
    const r = coverageOf(years(2022, [1, 2, 3]), SST, names)[0]
    expect([r.status, r.trend, r.why]).toEqual([null, null, '3 years of record, fewer than the 10 a status needs'])
    expect(r.sentence).toBe('SST in Alpha Bank: 3.00 °C in 2024; no status relative to its own record (3 years of record, fewer than the 10 a status needs).')
  })
  it('the sparkline keeps the last 40 periods', () => {
    const r = coverageOf(years(1951, Array.from({ length: 60 }, (_, i) => i)), SST, names)[0]
    const spark = JSON.parse(r.spark)
    expect(spark).toHaveLength(SPARK_PERIODS)
    expect(spark[0]).toEqual(['1971-01-01', 20])
  })
  it('a method not yet implemented falls back to values, and says so', () => {
    const r = coverageOf(years(2006, Array(15).fill(1)), { ...SST, status_method: 'anomaly' }, names)[0]
    expect([r.status_method, r.status, r.why]).toEqual(['anomaly', null, 'anomaly is not implemented yet; shown as values'])
  })
  it('an unknown place keeps its id as its name', () => {
    expect(coverageOf(years(2022, [1]), SST, new Map())[0].sentence)
      .toBe('SST in NMS:A: 1.00 °C in 2022; no status relative to its own record (1 year of record, fewer than the 10 a status needs).')
  })
})

describe('categorical', () => {
  it('the last period\'s largest class, and a share sentence', () => {
    const rows = [
      row({ indicator: BAA.id, time: '2024-01-01', class: '0', value: 0.6 }),
      row({ indicator: BAA.id, time: '2024-01-01', class: '1', value: 0.4 }),
      row({ indicator: BAA.id, time: '2025-01-01', class: '0', value: 0.25 }),
      row({ indicator: BAA.id, time: '2025-01-01', class: '1', value: 0.75 }),
    ]
    const r = coverageOf(rows, BAA, names)[0]
    expect(r).toMatchObject({
      t0: '2024-01-01', t1: '2025-01-01', n_periods: 2, last_time: '2025-01-01', last_value: 0.75, last_class: '1',
      status_method: 'values', status: null, trend: null, why: 'categorical: shown as class shares, with no status',
      sentence: 'Bleaching alert in Alpha Bank: Bleaching Watch over 75% of the area in 2025.', spark: '[]',
    })
  })
})

describe('parquet', () => {
  it('round-trips every column, nulls included', async () => {
    const rows = coverageOf(years(2022, [1, 2, 3]), SST, names)
    const buf = coverageParquet(rows, { 'om:manifest_version': '2026.10.20' })
    const back = await parquetReadObjects({ file: buf })
    expect(back).toEqual(rows)
  })
})
