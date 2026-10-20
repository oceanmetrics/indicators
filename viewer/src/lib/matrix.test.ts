import { describe, expect, it } from 'vitest'
import type { CoverageRow } from '../../../src/coverage/build.ts'
import type { Indicator, Vocab, VocabId } from './data.ts'
import {
  cellAria, cellModel, classText, groupColumns, groupRows, indexCoverage, matrixStats, orderColls, pickRow, valueText,
} from './matrix.ts'

// small synthetic manifest and coverage: one rule per test, exact outputs
const ind = (o: Partial<Indicator> & { id: string }): Indicator => ({
  title: o.id, short: o.id, kind: 'continuous', category: { onms: 'water-quality', names: 'physical-chemical', eov: 'oxygen' },
  series: o.id, lead: true, min_periods: 10, status_grain: 'year', status_method: 'iea-sd', recent: 5, time_grains: ['year'],
  method: { kind: 'precomputed-exact', summary: '' }, producer: { name: 'erddap-places' },
  dataset: { id: 'd', title: 'D', providers: [] }, collections: [{ coll: 'places', places: 2, rows: 4, path: 'values/x/data.parquet' }],
  unit_label: '°C', decimals: 1, ...o,
}) as Indicator

const row = (o: Partial<CoverageRow>): CoverageRow => ({
  place_id: 'NMS:A', place_name: 'Alpha', coll: 'places', indicator: 'sst', time_grain: 'year', t0: '2000-01-01', t1: '2020-01-01',
  n_periods: 21, last_time: '2020-01-01', last_value: 26.04, last_class: null, status_method: 'iea-sd', status: 'above', trend: 'flat',
  recent_mean: null, recent_from: null, recent_to: null, lt_mean: null, lt_sd: null, why: null, sentence: 's', spark: '[]', ...o,
})

const vocabs = (): Record<VocabId, Vocab> => ({
  onms: { title: 'ONMS', terms: [{ id: 'drivers', label: 'Drivers' }, { id: 'water-quality', label: 'Water quality' }, { id: 'habitat', label: 'Habitat' }] },
  names: { title: 'NaMES', terms: [{ id: 'physical-chemical', label: 'Physical-chemical' }, { id: 'biological', label: 'Biological' }] },
  eov: { title: 'EOV', terms: [{ id: 'oxygen', label: 'Oxygen' }, { id: 'nutrients', label: 'Nutrients' }] },
})

describe('pickRow', () => {
  const sst = ind({ id: 'sst', status_grain: 'year' })
  const place = { id: 'NMS:A', name: 'Alpha', coll: 'places' }

  it('takes the row at the indicator status_grain', () => {
    const idx = indexCoverage([row({ time_grain: 'month', last_value: 1 }), row({ time_grain: 'year', last_value: 2 })])
    expect(pickRow(idx, place.id, sst)?.last_value).toBe(2)
  })
  it('falls back to the year row, then month, when the status_grain row is absent', () => {
    const m = ind({ id: 'sst', status_grain: 'month' })
    const idx = indexCoverage([row({ time_grain: 'year', last_value: 2 })])
    expect(pickRow(idx, place.id, m)?.time_grain).toBe('year')
    const idx2 = indexCoverage([row({ time_grain: 'month', last_value: 3 })])
    expect(pickRow(idx2, place.id, sst)?.time_grain).toBe('month')
  })
  it('skips a row without a value for one with a value, and returns the empty row when none has one', () => {
    const idx = indexCoverage([row({ time_grain: 'year', last_value: null, why: 'nothing' }), row({ time_grain: 'month', last_value: 5 })])
    expect(pickRow(idx, place.id, sst)?.time_grain).toBe('month')
    const only = indexCoverage([row({ time_grain: 'year', last_value: null, why: 'nothing' })])
    expect(pickRow(only, place.id, sst)?.why).toBe('nothing')
  })
  it('returns null for a place and indicator with no rows', () => {
    expect(pickRow(indexCoverage([row({})]), 'NMS:B', sst)).toBeNull()
  })
})

describe('cellModel', () => {
  const sst = ind({ id: 'sst' })
  const place = { id: 'NMS:A', name: 'Alpha', coll: 'places' }

  it('a value with a status and a trend carries st- and tr- glyphs', () => {
    const m = cellModel(sst, place, row({ status: 'below', trend: 'down' }))
    expect([m.kind, m.statusIcon, m.trendIcon]).toEqual(['value', 'st-below', 'tr-down'])
  })
  it('a status_method without a status is st-none, never a blank', () => {
    const m = cellModel(sst, place, row({ status: null, trend: null, why: 'short' }))
    expect([m.statusIcon, m.trendIcon]).toEqual(['st-none', null])
  })
  it('a row at another grain (no status_method) shows no status glyph at all', () => {
    expect(cellModel(sst, place, row({ status: null, trend: null, status_method: null })).statusIcon).toBeNull()
  })
  it('a categorical indicator is a class cell with no status glyph', () => {
    const c = ind({ id: 'seascapes', kind: 'categorical', classes: { '15': 'Tropical Seas' }, unit_label: 'share' })
    const r = row({ indicator: 'seascapes', last_class: '15', last_value: 0.4876, status_method: 'values', status: null })
    const m = cellModel(c, place, r)
    expect([m.kind, m.statusIcon]).toEqual(['class', null])
    expect(classText(c, r)).toBe('Tropical Seas 49%')
  })
  it('no value but values exist for the collection: no data, with the reason', () => {
    const m = cellModel(sst, place, row({ last_value: null, why: 'gap' }))
    expect([m.kind, m.stateIcon, m.reason]).toEqual(['nodata', 'cell-na', 'gap'])
    expect(cellModel(sst, place, null).kind).toBe('nodata')
  })
  it('no values for the collection and the producer is erddap-places: on the fly', () => {
    const m = cellModel(sst, { id: 'MRGID:1', name: 'EEZ', coll: 'mr_eez' }, null)
    expect([m.kind, m.stateIcon]).toEqual(['live', 'cell-live'])
  })
  it('no values for the collection and another producer: not applicable', () => {
    const sdg = ind({ id: 'sdg', producer: { name: 'places/proto/eez_indicators' }, collections: [{ coll: 'mr_eez', places: 1, rows: 1, path: 'p' }] })
    const m = cellModel(sdg, place, null)
    expect([m.kind, m.stateIcon]).toEqual(['na', 'cell-na'])
  })
})

describe('words', () => {
  const sst = ind({ id: 'sst', short: 'SST' })
  const place = { id: 'NMS:A', name: 'Alpha', coll: 'places' }
  it('formats a value with src/status fmt, the manifest decimals and the unit label', () => {
    expect(valueText(sst, row({ last_value: 26.04 }))).toBe('26.0 °C')
    expect(valueText(ind({ id: 'ph', unit_label: '', decimals: 3 }), row({ last_value: 8.1234 }))).toBe('8.123')
    expect(valueText(sst, row({ last_value: -1.25 }))).toBe('−1.3 °C')
  })
  it('the aria label says place, indicator, value, period, status and trend in words', () => {
    const m = cellModel(sst, place, row({ status: 'above', trend: 'up' }))
    expect(cellAria(sst, place, m)).toBe('Alpha, SST: 26.0 °C in 2020; above its own record; trend up.')
  })
  it('the aria label of every empty state names the state', () => {
    expect(cellAria(sst, place, cellModel(sst, place, null))).toBe('Alpha, SST: no data.')
    expect(cellAria(sst, { ...place, coll: 'mr_eez' }, cellModel(sst, { ...place, coll: 'mr_eez' }, null))).toBe('Alpha, SST: not computed yet; can be computed on the fly.')
    const sdg = ind({ id: 'sdg', short: 'SDG', producer: { name: 'other' }, collections: [] })
    expect(cellAria(sdg, place, cellModel(sdg, place, null))).toBe('Alpha, SDG: not applicable.')
  })
})

describe('groupColumns', () => {
  const inds = [
    ind({ id: 'a', series: 's1', lead: false, category: { onms: 'water-quality', eov: 'oxygen' } }),
    ind({ id: 'b', series: 's1', lead: true, category: { onms: 'water-quality', eov: 'oxygen' } }),
    ind({ id: 'c', series: 's2', lead: true, category: { onms: 'drivers', eov: 'nutrients' } }),
    ind({ id: 'd', series: 's3', lead: true, category: { onms: 'mystery', eov: 'nutrients' } }),
  ]
  it('groups follow the vocabulary term order, not the manifest order', () => {
    expect(groupColumns(inds, vocabs(), 'onms', false).map(g => g.term.id)).toEqual(['drivers', 'water-quality', 'other'])
  })
  it('leads-only keeps one column per series, the lead', () => {
    const g = groupColumns(inds, vocabs(), 'onms', true)
    expect(g.flatMap(x => x.indicators.map(i => i.id))).toEqual(['c', 'b', 'd'])
  })
  it('all columns keep a series together with its lead first', () => {
    const g = groupColumns(inds, vocabs(), 'onms', false).find(x => x.term.id === 'water-quality')!
    expect(g.indicators.map(i => i.id)).toEqual(['b', 'a'])
  })
  it('empty groups are hidden', () => {
    const names = groupColumns(inds, vocabs(), 'names', true)
    expect(names.map(g => g.term.id)).toEqual(['other'])   // none carries a names tag in this fixture
    expect(groupColumns(inds, vocabs(), 'eov', true).map(g => g.term.id)).toEqual(['oxygen', 'nutrients'])
  })
  it('an indicator whose tag is not a term goes to a last group, Other', () => {
    const g = groupColumns(inds, vocabs(), 'onms', true)
    expect(g[g.length - 1].term.id).toBe('other')
  })
})

describe('groupRows', () => {
  const rows = [
    row({ place_id: 'NMS:B', place_name: 'Bravo' }), row({ place_id: 'NMS:A', place_name: 'Alpha' }),
    row({ place_id: 'MRGID:9', place_name: 'Zed EEZ', coll: 'mr_eez' }),
  ]
  const idx = indexCoverage(rows, [ind({ id: 'x' }), ind({ id: 'y', collections: [{ coll: 'mr_eez', places: 1, rows: 1, path: 'p' }] })])
  it('collections follow the manifest order and places sort by name', () => {
    expect(groupRows(idx, [], '').map(g => [g.coll, g.places.map(p => p.name)])).toEqual([['places', ['Alpha', 'Bravo']], ['mr_eez', ['Zed EEZ']]])
  })
  it('chips filter to the chosen collections; none chosen means all', () => {
    expect(groupRows(idx, ['mr_eez'], '').map(g => g.coll)).toEqual(['mr_eez'])
  })
  it('the search matches names and ids, ignoring case, and drops empty groups', () => {
    expect(groupRows(idx, [], 'alp').flatMap(g => g.places.map(p => p.id))).toEqual(['NMS:A'])
    expect(groupRows(idx, [], 'mrgid:9').map(g => g.coll)).toEqual(['mr_eez'])
    expect(groupRows(idx, [], 'nothing')).toEqual([])
  })
  it('orderColls: manifest order first, unknown collections after, alphabetically', () => {
    expect(orderColls(['b_unknown', 'mr_eez', 'places', 'a_unknown'], [ind({ id: 'x' }), ind({ id: 'y', collections: [{ coll: 'mr_eez', places: 1, rows: 1, path: 'p' }] })]))
      .toEqual(['places', 'mr_eez', 'a_unknown', 'b_unknown'])
  })
})

describe('matrixStats', () => {
  it('counts places, indicators, cells with a value and with a status', () => {
    const sst = ind({ id: 'sst' })
    const idx = indexCoverage([row({ place_id: 'NMS:A' }), row({ place_id: 'NMS:B', place_name: 'B', status: null, status_method: 'iea-sd' }), row({ place_id: 'NMS:C', place_name: 'C', last_value: null, status: null })])
    const cols = groupColumns([sst], vocabs(), 'onms', true)
    const s = matrixStats(groupRows(idx, [], ''), cols, idx)
    expect(s).toEqual({ places: 3, indicators: 1, cells: 3, withValue: 2, withStatus: 1 })
  })
})
