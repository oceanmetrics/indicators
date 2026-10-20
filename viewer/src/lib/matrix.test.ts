import { describe, expect, it } from 'vitest'
import type { CoverageRow } from '../../../src/coverage/build.ts'
import type { Indicator, Vocab, VocabId } from './data.ts'
import {
  addableIndicators, cellAria, computedOf, cellModel, classText, groupColumns, groupRows, hiddenPlaces, indexCoverage, matrixStats, orderGroups, pickRow,
  shortPlaceName, shownGroups, valueText, valuesCollOf, withValues,
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
    expect([m.kind, m.stateIcon]).toEqual(['na', null])
  })
  it('a place held by two values collections has no data when either has values for the indicator, else on the fly', () => {
    // Pitcairn: grouped under mr_eez, rows in both places and mr_eez
    const pitcairn = { id: 'MRGID:8439', name: 'Pitcairn', coll: 'mr_eez', valuesColls: ['mr_eez', 'places'] }
    expect(cellModel(sst, pitcairn, null).kind).toBe('nodata')   // sst has values in `places`, which holds Pitcairn
    const sdg = ind({ id: 'sdg', producer: { name: 'other' }, collections: [{ coll: 'mr_eez', places: 1, rows: 1, path: 'p' }] })
    expect(cellModel(sdg, pitcairn, null).kind).toBe('nodata')
    expect(cellModel(sdg, { ...pitcairn, valuesColls: ['places'] }, null).kind).toBe('na')
  })
  it('the group is not the values collection: a reserve grouped under its gazetteer collection has no values in `places`', () => {
    const nerrs = { id: 'NERRS:WEL', name: 'Wells', coll: 'noaa_nerrs', valuesColls: ['noaa_nerrs'] }
    expect(cellModel(sst, nerrs, null).kind).toBe('live')   // sst has values in `places`, not in noaa_nerrs
  })
})

describe('valuesCollOf: the values file comes from the coverage row, never from the group', () => {
  const sst = ind({ id: 'sst', collections: [{ coll: 'places', places: 2, rows: 4, path: 'a' }, { coll: 'noaa_nerrs', places: 1, rows: 2, path: 'b' }] })
  const pitcairn = { id: 'MRGID:8439', name: 'Pitcairn', coll: 'mr_eez', valuesColls: ['mr_eez', 'places'] }
  it("the row's coll wins", () => {
    expect(valuesCollOf(sst, pitcairn, row({ coll: 'places' }))).toBe('places')
  })
  it('without a row, the first collection holding the place that has values for the indicator', () => {
    expect(valuesCollOf(sst, pitcairn, null)).toBe('places')
  })
  it('a place without valuesColls reads its group', () => {
    expect(valuesCollOf(sst, { id: 'x', name: 'x', coll: 'noaa_nerrs' }, null)).toBe('noaa_nerrs')
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
    expect(cellAria(sst, place, cellModel(sst, place, null))).toBe('Alpha, SST: no data here.')
    expect(cellAria(sst, place, cellModel(sst, place, row({ last_value: null, why: 'gap' })))).toBe('Alpha, SST: no data here (gap).')
    const eez = { ...place, coll: 'mr_eez', valuesColls: ['mr_eez'] }
    expect(cellAria(sst, eez, cellModel(sst, eez, null))).toBe('Alpha, SST: not computed yet; open it to compute it or ask for it.')
    const sdg = ind({ id: 'sdg', short: 'SDG', producer: { name: 'other' }, collections: [] })
    expect(cellAria(sdg, place, cellModel(sdg, place, null), 'National Marine Sanctuaries')).toBe('Alpha: SDG is not offered for National Marine Sanctuaries.')
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

describe('groupColumns with add and hide', () => {
  const inds = [
    ind({ id: 'a', series: 's1', lead: false }),
    ind({ id: 'b', series: 's1', lead: true }),
    ind({ id: 'c', series: 's2', lead: true, category: { onms: 'drivers' } }),
    ind({ id: 'd', series: 's2', lead: false, category: { onms: 'drivers' } }),
  ]
  const ids = (g: ReturnType<typeof groupColumns>) => g.map(x => [x.term.id, x.indicators.map(i => i.id)])
  it('leads-only plus add keeps the added non-lead beside its lead', () => {
    expect(ids(groupColumns(inds, vocabs(), 'onms', true, { add: ['a'] }))).toEqual([['drivers', ['c']], ['water-quality', ['b', 'a']]])
  })
  it('add is ignored when every indicator is shown anyway', () => {
    expect(ids(groupColumns(inds, vocabs(), 'onms', false, { add: ['a'] }))).toEqual(ids(groupColumns(inds, vocabs(), 'onms', false)))
  })
  it('hide drops an indicator, a lead included, with or without leads-only', () => {
    expect(ids(groupColumns(inds, vocabs(), 'onms', true, { hide: ['b'] }))).toEqual([['drivers', ['c']]])
    expect(ids(groupColumns(inds, vocabs(), 'onms', false, { hide: ['a', 'c'] }))).toEqual([['drivers', ['d']], ['water-quality', ['b']]])
  })
  it('hide wins over add; a group left empty is dropped', () => {
    expect(ids(groupColumns(inds, vocabs(), 'onms', true, { add: ['a'], hide: ['a', 'c'] }))).toEqual([['water-quality', ['b']]])
  })
  it('no options behaves as before', () => {
    expect(ids(groupColumns(inds, vocabs(), 'onms', true, {}))).toEqual([['drivers', ['c']], ['water-quality', ['b']]])
  })
})

describe('addableIndicators', () => {
  const inds = [
    ind({ id: 'a', series: 's1', series_title: 'Series one', lead: false }),
    ind({ id: 'b', series: 's1', series_title: 'Series one', lead: true }),
    ind({ id: 'c', series: 's2', lead: true }),
    ind({ id: 'd', series: 's1', series_title: 'Series one', lead: false }),
  ]
  it('lists what is not shown, grouped by series, the lead first, titled series_title else series', () => {
    expect(addableIndicators(inds, new Set(['c'])).map(g => [g.series, g.title, g.indicators.map(i => i.id)])).toEqual([['s1', 'Series one', ['b', 'a', 'd']]])
    expect(addableIndicators(inds, new Set(['a', 'b', 'd'])).map(g => [g.series, g.title, g.indicators.map(i => i.id)])).toEqual([['s2', 's2', ['c']]])
  })
  it('is empty when everything is shown', () => {
    expect(addableIndicators(inds, new Set(inds.map(i => i.id)))).toEqual([])
  })
})

describe('groupRows with hide', () => {
  const idx = indexCoverage([
    row({ place_id: 'NMS:B', place_name: 'Bravo' }), row({ place_id: 'NMS:A', place_name: 'Alpha' }),
    row({ place_id: 'MRGID:9', place_name: 'Zed EEZ', coll: 'mr_eez' }),
  ])
  it('drops hidden places and a collection left empty', () => {
    expect(groupRows(idx, [], '', ['NMS:A']).map(g => [g.coll, g.places.map(p => p.id)])).toEqual([['places', ['NMS:B']], ['mr_eez', ['MRGID:9']]])
    expect(groupRows(idx, [], '', ['MRGID:9']).map(g => g.coll)).toEqual(['places'])
  })
})

describe('hiddenPlaces', () => {
  const idx = indexCoverage([
    row({ place_id: 'NMS:B', place_name: 'Bravo' }), row({ place_id: 'NMS:A', place_name: 'Alpha' }),
    row({ place_id: 'MRGID:9', place_name: 'Zed EEZ', coll: 'mr_eez' }),
  ])
  it('returns the removed places in name order and skips unknown ids', () => {
    expect(hiddenPlaces(idx, ['MRGID:9', 'NMS:B', 'NMS:A', 'NMS:NOPE']).map(p => p.name)).toEqual(['Alpha', 'Bravo', 'Zed EEZ'])
    expect(hiddenPlaces(idx, [])).toEqual([])
  })
})

describe('groupRows', () => {
  const rows = [
    row({ place_id: 'NMS:B', place_name: 'Bravo' }), row({ place_id: 'NMS:A', place_name: 'Alpha' }),
    row({ place_id: 'MRGID:9', place_name: 'Zed EEZ', coll: 'mr_eez' }),
  ]
  const idx = indexCoverage(rows)
  it('groups follow the group order (sanctuaries first) and places sort by name', () => {
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
  it('orderGroups: the group order first, unknown groups after, alphabetically', () => {
    expect(orderGroups(['b_unknown', 'mr_eez', 'places', 'noaa_nerrs', 'a_unknown', 'noaa_sanctuaries'])).toEqual(['noaa_sanctuaries', 'places', 'noaa_nerrs', 'mr_eez', 'a_unknown', 'b_unknown'])
  })
})

describe('place groups: place_coll, not the values collection', () => {
  // Pitcairn has rows in two values collections and one home; a coverage table without place_coll groups by coll
  const rows = [
    row({ place_id: 'MRGID:8439', place_name: 'Pitcairn', coll: 'places', place_coll: 'mr_eez', indicator: 'sst', last_value: 25 }),
    row({ place_id: 'MRGID:8439', place_name: 'Pitcairn', coll: 'mr_eez', place_coll: 'mr_eez', indicator: 'obis', last_value: 9 }),
    row({ place_id: 'NERRS:WEL', place_name: 'Wells', coll: 'noaa_nerrs', place_coll: 'noaa_nerrs', indicator: 'sst', last_value: 11 }),
    row({ place_id: 'NMS:A', place_name: 'Alpha', coll: 'places', place_coll: 'places', indicator: 'sst', last_value: 26 }),
  ]
  const idx = indexCoverage(rows)
  it('one place per id, in its home group, with every values collection that holds it', () => {
    expect(idx.places.map(p => [p.id, p.coll, p.valuesColls])).toEqual([
      ['MRGID:8439', 'mr_eez', ['mr_eez', 'places']], ['NERRS:WEL', 'noaa_nerrs', ['noaa_nerrs']], ['NMS:A', 'places', ['places']],
    ])
    expect(idx.colls).toEqual(['places', 'noaa_nerrs', 'mr_eez'])
  })
  it('a cell reads the row of whichever values collection has it (the index is keyed by place and indicator)', () => {
    const sst = ind({ id: 'sst' }), obis = ind({ id: 'obis', collections: [{ coll: 'mr_eez', places: 1, rows: 1, path: 'p' }] })
    expect(pickRow(idx, 'MRGID:8439', sst)?.coll).toBe('places')
    expect(pickRow(idx, 'MRGID:8439', obis)?.coll).toBe('mr_eez')
  })
  it('a coverage table built before place_coll groups by coll', () => {
    const old = indexCoverage([row({ place_id: 'NMS:A', coll: 'places' }), row({ place_id: 'MRGID:9', coll: 'mr_eez' })])
    expect(old.places.map(p => [p.id, p.coll])).toEqual([['NMS:A', 'places'], ['MRGID:9', 'mr_eez']])
  })
  it('groupRows lists a place once, in its home group', () => {
    expect(groupRows(idx, [], '').map(g => [g.coll, g.places.map(p => p.id)])).toEqual([['places', ['NMS:A']], ['noaa_nerrs', ['NERRS:WEL']], ['mr_eez', ['MRGID:8439']]])
  })
})

describe('shownGroups: the sanctuaries by default', () => {
  const avail = ['places', 'noaa_nerrs', 'mr_eez']
  it('none asked: the default groups that have places', () => {
    expect(shownGroups(avail, [], '')).toEqual(['places'])
    expect(shownGroups(['noaa_sanctuaries', 'places', 'mr_eez'], [], '')).toEqual(['noaa_sanctuaries', 'places'])
  })
  it('none asked and no default group in the catalog: every group', () => {
    expect(shownGroups(['noaa_nerrs', 'mr_eez'], [], '')).toEqual(['noaa_nerrs', 'mr_eez'])
  })
  it('a search with none asked looks in every group', () => {
    expect(shownGroups(avail, [], 'wel')).toEqual(avail)
    expect(shownGroups(avail, [], '  ')).toEqual(['places'])
  })
  it('the groups asked for win', () => {
    expect(shownGroups(avail, ['mr_eez', 'places'], 'wel')).toEqual(['mr_eez', 'places'])
  })
  it('a place set stands for its groups that have computed places; a group asked for by name stays even without any', () => {
    const sets = [{ id: 'political', title: 'Ocean by jurisdiction', groups: ['mr_eez', 'fao_high_seas'] }]
    expect(shownGroups(['places', 'mr_eez', 'fao_high_seas'], ['set:political'], '', sets)).toEqual(['mr_eez', 'fao_high_seas'])
    expect(shownGroups(['places', 'mr_eez'], ['set:political'], '', sets)).toEqual(['mr_eez'])
    expect(shownGroups(['places', 'mr_eez'], ['set:political', 'noaa_nerrs'], '', sets)).toEqual(['mr_eez', 'noaa_nerrs'])
  })
  it('an unknown set (or a set with no computed group) asks for nothing: the default groups', () => {
    const sets = [{ id: 'political', title: 'Ocean by jurisdiction', groups: ['mr_eez', 'fao_high_seas'] }]
    expect(shownGroups(avail, ['set:nope'], '', sets)).toEqual(['places'])
    expect(shownGroups(['places'], ['set:political'], '', sets)).toEqual(['places'])
    expect(shownGroups(avail, ['set:political'], '')).toEqual(['places'])
  })
})

describe('withValues: an indicator with no value for any place on display is hidden', () => {
  const a = ind({ id: 'a' }), b = ind({ id: 'b', category: { onms: 'drivers' } }), c = ind({ id: 'c', category: { onms: 'drivers' } })
  const idx = indexCoverage([
    row({ place_id: 'NMS:A', indicator: 'a' }), row({ place_id: 'NMS:A', indicator: 'b', last_value: null, why: 'gap' }),
    row({ place_id: 'NMS:B', place_name: 'B', indicator: 'c', coll: 'mr_eez' }),
  ])
  const cols = groupColumns([a, b, c], vocabs(), 'onms', false)
  const ids = (g: ReturnType<typeof withValues>) => g.map(x => [x.term.id, x.indicators.map(i => i.id)])
  it('keeps only the indicators some displayed place has a value for; a group left empty goes', () => {
    expect(ids(withValues(cols, groupRows(idx, ['places'], ''), idx))).toEqual([['water-quality', ['a']]])
    expect(ids(withValues(cols, groupRows(idx, [], ''), idx))).toEqual([['drivers', ['c']], ['water-quality', ['a']]])
  })
  it('keep holds what the reader added by hand', () => {
    expect(ids(withValues(cols, groupRows(idx, ['places'], ''), idx, ['b']))).toEqual([['drivers', ['b']], ['water-quality', ['a']]])
  })
  it('no place on display: nothing has a value', () => {
    expect(withValues(cols, [], idx)).toEqual([])
  })
})

describe('computedOf', () => {
  it('says computed of the gazetteer total, or the count alone before layers.json has loaded', () => {
    expect(computedOf(1, 30)).toBe('1 of 30')
    expect(computedOf(19, null)).toBe('19')
  })
})

describe('shortPlaceName', () => {
  it.each([
    ['Florida Keys National Marine Sanctuary', 'Florida Keys'],
    ["Gray's Reef National Marine Sanctuary", "Gray's Reef"],
    ['Mallows Bay-Potomac River National Marine Sanctuary', 'Mallows Bay-Potomac River'],
    ['National Marine Sanctuary of American Samoa', 'American Samoa'],
    ['Papahānaumokuākea Marine National Monument', 'Papahānaumokuākea MNM'],
    ['British Exclusive Economic Zone (Pitcairn)', 'British EEZ (Pitcairn)'],
    ['Monégasque Exclusive Economic Zone', 'Monégasque EEZ'],
    ['Wells National Estuarine Research Reserve', 'Wells'],
    ['Channel Islands National Marine Sanctuary - Santa Barbara Section', 'Channel Islands - Santa Barbara Section'],
    ['Tortugas Ecological Reserve', 'Tortugas Ecological Reserve'],
    ['Wells', 'Wells'],
    ['High Seas', 'High Seas'],
  ])('%s is %s', (name, short) => { expect(shortPlaceName(name)).toBe(short) })
  it('a name that would come out empty is kept whole', () => {
    expect(shortPlaceName(' National Marine Sanctuary')).toBe(' National Marine Sanctuary')
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
