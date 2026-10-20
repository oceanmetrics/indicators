import { describe, expect, it } from 'vitest'
import type { CoverageRow } from '../../../src/coverage/build.ts'
import type { Indicator, Vocab, VocabId } from './data.ts'
import {
  cellAria, computedOf, cellModel, classText, groupColumns, indexCoverage, matrixStats, orderGroups, pickRow,
  ROW_CAP, selectionRows, shortPlaceName, valueText, valuesCollOf, withValues,
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
  it('a row without a value: no data, with the reason', () => {
    const m = cellModel(sst, place, row({ last_value: null, why: 'gap' }))
    expect([m.kind, m.stateIcon, m.reason]).toEqual(['nodata', 'cell-na', 'gap'])
  })
  it('no row for an erddap-places indicator is not computed yet, even when its collection has values for other places', () => {
    // regression (2026-10-20): with the whole gazetteer in the picker, 29 reserves beside the one requested (Wells) said
    // "no data here" because the noaa_nerrs values file exists; erddap-places computes place by place
    expect(cellModel(sst, place, null).kind).toBe('live')
    const ace = { id: 'NERRS:ACE', name: 'Ace Basin', coll: 'noaa_nerrs', valuesColls: ['noaa_nerrs'] }
    const precip = ind({ id: 'precip', collections: [{ coll: 'noaa_nerrs', places: 1, rows: 2, path: 'p' }] })
    expect(cellModel(precip, ace, null).kind).toBe('live')
  })
  it('no row from a producer that computes whole collections, which has values in this one: no data here', () => {
    const obis = ind({ id: 'obis', producer: { name: 'obisindicators' }, collections: [{ coll: 'places', places: 1, rows: 1, path: 'p' }] })
    expect([cellModel(obis, place, null).kind, cellModel(obis, place, null).reason]).toEqual(['nodata', null])
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
    expect(cellModel(sst, pitcairn, null).kind).toBe('live')     // erddap-places: no row of its own is not computed
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
    const whole = ind({ id: 'obis', short: 'SST', producer: { name: 'obisindicators' }, collections: [{ coll: 'places', places: 1, rows: 1, path: 'p' }] })
    expect(cellAria(whole, place, cellModel(whole, place, null))).toBe('Alpha, SST: no data here.')
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
    expect(groupColumns(inds, vocabs(), 'onms').map(g => g.term.id)).toEqual(['drivers', 'water-quality', 'other'])
  })
  it('the columns are the indicators given (the selection): a lead only list gives one column per series', () => {
    const g = groupColumns(inds.filter(i => i.lead), vocabs(), 'onms')
    expect(g.flatMap(x => x.indicators.map(i => i.id))).toEqual(['c', 'b', 'd'])
  })
  it('all columns keep a series together with its lead first', () => {
    const g = groupColumns(inds, vocabs(), 'onms').find(x => x.term.id === 'water-quality')!
    expect(g.indicators.map(i => i.id)).toEqual(['b', 'a'])
  })
  it('empty groups are hidden', () => {
    const lead = inds.filter(i => i.lead)
    expect(groupColumns(lead, vocabs(), 'names').map(g => g.term.id)).toEqual(['other'])   // none carries a names tag in this fixture
    expect(groupColumns(lead, vocabs(), 'eov').map(g => g.term.id)).toEqual(['oxygen', 'nutrients'])
  })
  it('an indicator whose tag is not a term goes to a last group, Other', () => {
    const g = groupColumns(inds, vocabs(), 'onms')
    expect(g[g.length - 1].term.id).toBe('other')
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
  it('selectionRows lists a place once, in its home group', () => {
    expect(selectionRows(idx.places, idx, '').map(g => [g.coll, g.places.map(p => p.id)])).toEqual([['places', ['NMS:A']], ['noaa_nerrs', ['NERRS:WEL']], ['mr_eez', ['MRGID:8439']]])
  })
})

describe('selectionRows: the rows of the chosen places', () => {
  const idx = indexCoverage([
    row({ place_id: 'NMS:B', place_name: 'Bravo' }), row({ place_id: 'NMS:A', place_name: 'Alpha' }),
    row({ place_id: 'MRGID:9', place_name: 'Zed EEZ', coll: 'mr_eez' }),
  ])
  it('groups follow the group order (sanctuaries first) and places sort by name', () => {
    expect(selectionRows(idx.places, idx, '').map(g => [g.coll, g.places.map(p => p.name)])).toEqual([['places', ['Alpha', 'Bravo']], ['mr_eez', ['Zed EEZ']]])
  })
  it('only the places given are rows', () => {
    expect(selectionRows(idx.places.filter(p => p.coll === 'mr_eez'), idx, '').map(g => g.coll)).toEqual(['mr_eez'])
    expect(selectionRows([], idx, '')).toEqual([])
  })
  it('the search matches names and ids, ignoring case, and drops empty groups', () => {
    expect(selectionRows(idx.places, idx, 'alp').flatMap(g => g.places.map(p => p.id))).toEqual(['NMS:A'])
    expect(selectionRows(idx.places, idx, 'mrgid:9').map(g => g.coll)).toEqual(['mr_eez'])
    expect(selectionRows(idx.places, idx, 'nothing')).toEqual([])
  })
  it('orderGroups: the group order first, unknown groups after, alphabetically', () => {
    expect(orderGroups(['b_unknown', 'mr_eez', 'places', 'noaa_nerrs', 'a_unknown', 'noaa_sanctuaries'])).toEqual(['noaa_sanctuaries', 'places', 'noaa_nerrs', 'mr_eez', 'a_unknown', 'b_unknown'])
  })
  it('a place that is not in the coverage at all is a row, after the computed places of its group', () => {
    const gaz = [{ id: 'NMS:A', name: 'Alpha', coll: 'places' }, { id: 'NMS:0', name: 'Aardvark (not computed)', coll: 'places' }, { id: 'NMS:B', name: 'Bravo', coll: 'places' }]
    expect(selectionRows(gaz, idx, '').map(g => g.places.map(p => p.id))).toEqual([['NMS:A', 'NMS:B', 'NMS:0']])
  })
  it('a group of more than the cap shows the first of them and says how many there are', () => {
    const many = Array.from({ length: ROW_CAP + 40 }, (_, n) => ({ id: `PSGID:${String(n).padStart(5, '0')}`, name: `MPA ${String(n).padStart(5, '0')}`, coll: 'protectedseas_mpa' }))
    const g = selectionRows([...many, { id: 'NMS:A', name: 'Alpha', coll: 'places' }], idx, '').find(x => x.coll === 'protectedseas_mpa')!
    expect(g.places).toHaveLength(ROW_CAP)
    expect(g.total).toBe(ROW_CAP + 40)
    expect(g.places[0].id).toBe('PSGID:00000')
    expect(selectionRows(many.slice(0, 5), idx, '')[0].total).toBeUndefined()
  })
  it('a search finds a place past the cap', () => {
    const many = Array.from({ length: ROW_CAP + 40 }, (_, n) => ({ id: `PSGID:${n}`, name: `MPA ${String(n).padStart(5, '0')}`, coll: 'protectedseas_mpa' }))
    expect(selectionRows(many, idx, 'MPA 00339')[0].places.map(p => p.id)).toEqual(['PSGID:339'])
  })
})

describe('withValues: an indicator with no value for any place on display is hidden', () => {
  const a = ind({ id: 'a' }), b = ind({ id: 'b', category: { onms: 'drivers' } }), c = ind({ id: 'c', category: { onms: 'drivers' } })
  const idx = indexCoverage([
    row({ place_id: 'NMS:A', indicator: 'a' }), row({ place_id: 'NMS:A', indicator: 'b', last_value: null, why: 'gap' }),
    row({ place_id: 'NMS:B', place_name: 'B', indicator: 'c', coll: 'mr_eez' }),
  ])
  const cols = groupColumns([a, b, c], vocabs(), 'onms')
  const ids = (g: ReturnType<typeof withValues>) => g.map(x => [x.term.id, x.indicators.map(i => i.id)])
  it('keeps only the indicators some displayed place has a value for; a group left empty goes', () => {
    expect(ids(withValues(cols, selectionRows(idx.places.filter(p => p.coll === 'places'), idx, ''), idx))).toEqual([['water-quality', ['a']]])
    expect(ids(withValues(cols, selectionRows(idx.places, idx, ''), idx))).toEqual([['drivers', ['c']], ['water-quality', ['a']]])
  })
  it('keep holds what the reader added by hand', () => {
    expect(ids(withValues(cols, selectionRows(idx.places.filter(p => p.coll === 'places'), idx, ''), idx, ['b']))).toEqual([['drivers', ['b']], ['water-quality', ['a']]])
  })
  it('no place on display: nothing has a value', () => {
    expect(withValues(cols, [], idx)).toEqual([])
  })
  it('places on display and none has a value for any indicator: all stay, so each empty cell can be asked for', () => {
    const none = [{ coll: 'noaa_nerrs', places: [{ id: 'NERRS:WEL', name: 'Wells', coll: 'noaa_nerrs' }] }]
    expect(ids(withValues(cols, none, idx))).toEqual([['drivers', ['b', 'c']], ['water-quality', ['a']]])
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
    const cols = groupColumns([sst], vocabs(), 'onms')
    const s = matrixStats(selectionRows(idx.places, idx, ''), cols, idx)
    expect(s).toEqual({ places: 3, indicators: 1, cells: 3, withValue: 2, withStatus: 1 })
  })
})
