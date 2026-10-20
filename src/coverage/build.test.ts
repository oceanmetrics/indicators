// the coverage builder: exact rows from small synthetic values, one test per rule.
import { describe, expect, it } from 'vitest'
import { coverageOf, encodeSpark, homeColl, placeHomes, SPARK_PERIODS } from './build.ts'
import type { ManifestIndicator, ValueRow } from './build.ts'
import { coverageParquet, layerOrder } from './cli.ts'
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
    expect(JSON.parse(r.spark)).toEqual({ t0: '2006-01-01', g: 'year', v: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 6, 7, 8, 9] })
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
  it('the sparkline keeps the last 40 calendar periods', () => {
    const r = coverageOf(years(1951, Array.from({ length: 60 }, (_, i) => i)), SST, names)[0]
    const spark = JSON.parse(r.spark)
    expect(spark.v).toHaveLength(SPARK_PERIODS)
    expect([spark.t0, spark.v[0]]).toEqual(['1971-01-01', 20])
  })
  it('a gap in the record is a null in the sparkline, not a skipped period', () => {
    expect(JSON.parse(encodeSpark([{ t: '2020-01-01', v: 1 }, { t: '2022-01-01', v: 3 }], 'year'))).toEqual({ t0: '2020-01-01', g: 'year', v: [1, null, 3] })
    expect(encodeSpark([], 'year')).toBe('[]')
  })
  it('spark values keep 4 significant digits; the full-precision value stays in last_value', () => {
    const r = coverageOf(years(2020, [15.233456789, 0.000123456, 12345.678]), SST, names)[0]
    expect(JSON.parse(r.spark).v).toEqual([15.23, 0.0001235, 12350])
    expect(r.last_value).toBe(12345.678)
  })
  it('only the row a cell shows keeps its sparkline: the status grain, else the next grain with a value', () => {
    const rs = coverageOf([
      ...years(2020, [1, 2]),
      row({ time_grain: 'month', time: '2020-01-01', value: 1 }), row({ time_grain: 'month', time: '2020-02-01', value: 2 }),
      row({ time_grain: 'decade', time: '2020-01-01', value: 1.5 }),
      row({ place_id: 'NMS:B', time_grain: 'month', time: '2020-01-01', value: 4 }), row({ place_id: 'NMS:B', time_grain: 'month', time: '2020-02-01', value: 5 }),
    ], SST, names)
    expect(rs.map(r => `${r.place_id} ${r.time_grain} ${(JSON.parse(r.spark).v ?? []).length}`)).toEqual([
      'NMS:A decade 0', 'NMS:A month 0', 'NMS:A year 2', 'NMS:B month 2',
    ])
  })
  it('regression: the all-years grain (time null) keeps its value, with no sparkline and no status', () => {
    const r = coverageOf([row({ time_grain: 'all', time: null, value: 3 })], SST, names)[0]
    expect([r.last_value, r.n_periods, r.t0, r.spark, r.status]).toEqual([3, 1, null, '[]', null])
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

describe('place_coll: the home gazetteer collection', () => {
  // a synthetic index: Pitcairn is in two collections, a sanctuary in one, and one id the index does not list
  const index = [
    { place_id: 'MRGID:8439', collection: 'places' },
    { place_id: 'MRGID:8439', collection: 'mr_eez' },
    { place_id: 'NERRS:WEL', collection: 'noaa_nerrs' },
    { place_id: 'NMS:A', collection: 'places' },
  ]
  const order = ['mr_eez', 'noaa_nerrs', 'places']

  it("takes the first of a place's collections in layers.json order", () => {
    const homes = placeHomes(index, order)
    expect(Object.fromEntries(homes)).toEqual({ 'MRGID:8439': 'mr_eez', 'NERRS:WEL': 'noaa_nerrs', 'NMS:A': 'places' })
    // the order decides, not the order of the index rows
    expect(placeHomes(index, ['places', 'mr_eez']).get('MRGID:8439')).toBe('places')
  })
  it('a collection missing from layers.json comes after the listed ones, then alphabetically', () => {
    const rows = [{ place_id: 'X:1', collection: 'zz_new' }, { place_id: 'X:1', collection: 'aa_new' }, { place_id: 'X:2', collection: 'zz_new' }, { place_id: 'X:2', collection: 'places' }]
    const homes = placeHomes(rows, ['places'])
    expect([homes.get('X:1'), homes.get('X:2')]).toEqual(['aa_new', 'places'])
  })
  it('a place the index does not list, or no index, falls back to the values collection', () => {
    const homes = placeHomes(index, order)
    expect(homeColl('NMS:ZZ', 'places', homes)).toBe('places')
    expect(homeColl('NMS:A', 'places', null)).toBe('places')
    expect(homeColl('NMS:A', 'places', undefined)).toBe('places')
  })
  it('coverageOf writes it on every row: the home collection, with coll still the values collection', () => {
    const homes = placeHomes(index, order)
    const rows = coverageOf([...years(2020, [1, 2], { place_id: 'MRGID:8439', coll: 'places' }), row({ place_id: 'NERRS:WEL', coll: 'noaa_nerrs' })], SST, new Map(), homes)
    expect(rows.map(r => [r.place_id, r.coll, r.place_coll])).toEqual([['NERRS:WEL', 'noaa_nerrs', 'noaa_nerrs'], ['MRGID:8439', 'places', 'mr_eez']])
    expect(coverageOf(years(2020, [1]), SST, names)[0].place_coll).toBe('places')
  })
  it('layerOrder reads collection, else slug, in file order; anything unreadable is empty', () => {
    expect(layerOrder({ layers: [{ slug: 'a', collection: 'b' }, { slug: 'c' }, {}] })).toEqual(['b', 'c'])
    expect(layerOrder(null)).toEqual([])
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
