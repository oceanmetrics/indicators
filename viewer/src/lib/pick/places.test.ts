import { describe, expect, it } from 'vitest'
import type { CoverageRow } from '../../../../src/coverage/build.ts'
import type { Layers } from '../data.ts'
import { indexCoverage } from '../matrix.ts'
import { groupLabel, matrixChosen, multiLabel, placeGroups, placeLabel, placeSetInfos } from './places.ts'
import { groupPickNodes, placePickTree, toggleMatrixPlaces, uncomputedCollections } from './placesTree.ts'

// a small synthetic coverage: two sanctuaries, Wells (a NERRS reserve), Pitcairn's EEZ (values in places and mr_eez)
const row = (o: Partial<CoverageRow>): CoverageRow => ({
  place_id: 'NMS:A', place_name: 'Alpha National Marine Sanctuary', coll: 'places', place_coll: 'places', indicator: 'sst', time_grain: 'year',
  t0: '2000-01-01', t1: '2020-01-01', n_periods: 21, last_time: '2020-01-01', last_value: 1, last_class: null, status_method: 'iea-sd',
  status: null, trend: null, recent_mean: null, recent_from: null, recent_to: null, lt_mean: null, lt_sd: null, why: null, sentence: 's', spark: '[]', ...o,
})
const idx = indexCoverage([
  row({}),
  row({ place_id: 'NMS:B', place_name: 'Beta National Marine Sanctuary' }),
  row({ place_id: 'NERRS:WEL', place_name: 'Wells National Estuarine Research Reserve', coll: 'noaa_nerrs', place_coll: 'noaa_nerrs' }),
  row({ place_id: 'MRGID:8439', place_name: 'British Exclusive Economic Zone (Pitcairn)', coll: 'places', place_coll: 'mr_eez' }),
  row({ place_id: 'MRGID:8439', place_name: 'British Exclusive Economic Zone (Pitcairn)', coll: 'mr_eez', place_coll: 'mr_eez', indicator: 'obis' }),
])
const layers: Layers = {
  places: { title: 'erddap-places statistics places', n: 20, geom: 'MultiPolygon' },
  noaa_nerrs: { title: 'NOAA National Estuarine Research Reserves', n: 30, geom: 'MultiPolygon' },
  mr_eez: { title: 'Marine Regions EEZ', n: 285, geom: 'MultiPolygon' },
  boem_wind_leases: { title: 'BOEM offshore wind lease outlines', n: 52, geom: 'MultiPolygon' },
  noaa_marine_monuments: { title: 'Marine National Monuments', n: 32, geom: 'MultiPolygon' },
  calcofi_stations: { title: 'CalCOFI stations', n: 113, geom: 'Point' },
  noaa_maritime_limits: { title: 'U.S. maritime limits (lines)', n: 246, geom: 'MultiLineString' },
  nogeom: { title: 'No geometry type', n: 1, geom: null },
}

describe('the groups the place picker lists', () => {
  const groups = placeGroups(idx, layers)
  it('every group with computed places, in the Matrix order, with "n of N" and its places by name', () => {
    expect(groups.map(g => [g.coll, g.title, g.computed, g.total])).toEqual([
      ['places', 'Sanctuaries and Tortugas reserve', 2, 20], ['noaa_nerrs', 'National Estuarine Research Reserves', 1, 30], ['mr_eez', 'Exclusive Economic Zones', 1, 285],
    ])
    expect(groups[0].places.map(p => p.id)).toEqual(['NMS:A', 'NMS:B'])
  })
  it('the total is null while layers.json has not loaded', () => {
    expect(placeGroups(idx).map(g => g.total)).toEqual([null, null, null])
  })
})

describe('the tri-state place tree', () => {
  const groups = placeGroups(idx, layers)
  it('a group is checked, mixed or unchecked by its chosen places and carries "n of N" and a gazetteer link', () => {
    const t = placePickTree(groups, new Set(['NMS:A', 'NERRS:WEL']))
    expect(t.map(n => [n.key, n.state, n.hint])).toEqual([['places', 'mixed', '2 of 20'], ['noaa_nerrs', 'checked', '1 of 30'], ['mr_eez', 'unchecked', '1 of 285']])
    expect(t[1].link).toEqual({ href: 'https://oceanmetrics.io/places/?layers=noaa_nerrs', label: 'in the gazetteer' })
    expect(t[0].children.map(c => [c.key, c.state, c.hint])).toEqual([['NMS:A', 'checked', 'NMS:A'], ['NMS:B', 'unchecked', 'NMS:B']])
  })
  it('a search narrows the places listed and drops the groups with none, never the state of a group', () => {
    const t = placePickTree(groups, new Set(['NMS:A', 'NMS:B']), 'beta')
    expect(t.map(n => [n.key, n.state, n.children.map(c => c.key)])).toEqual([['places', 'checked', ['NMS:B']]])
  })
  it('a search matches the name or the id, in any case, and finds nothing for an unknown word', () => {
    const find = (q: string) => placePickTree(groups, new Set(), q).map(n => [n.key, n.children.map(c => c.key)])
    expect(find('WELLS')).toEqual([['noaa_nerrs', ['NERRS:WEL']]])
    expect(find('nms:')).toEqual([['places', ['NMS:A', 'NMS:B']]])
    expect(find('marine')).toEqual([['places', ['NMS:A', 'NMS:B']]])   // "Marine Sanctuary", not the id of the EEZ
    expect(find('zzz')).toEqual([])
    expect(find('  ').length).toBe(3)
  })
})

describe('the Matrix selection as the picker ticks it', () => {
  it('the chosen places are those of the groups on display that were not removed', () => {
    expect([...matrixChosen(idx, ['places', 'noaa_nerrs'], ['NMS:B'])].sort()).toEqual(['NERRS:WEL', 'NMS:A'])
  })
  it('a group on shows it whole (its removed places come back); a group off hides it; the last group stays', () => {
    expect(toggleMatrixPlaces(idx, { colls: ['places'], hidePlaces: ['NMS:B'] }, { kind: 'collection', key: 'places' }, true)).toEqual({ colls: ['places'], hidePlaces: [] })
    expect(toggleMatrixPlaces(idx, { colls: ['places'], hidePlaces: [] }, { kind: 'collection', key: 'noaa_nerrs' }, true)).toEqual({ colls: ['places', 'noaa_nerrs'], hidePlaces: [] })
    expect(toggleMatrixPlaces(idx, { colls: ['places', 'noaa_nerrs'], hidePlaces: ['NMS:B'] }, { kind: 'collection', key: 'places' }, false)).toEqual({ colls: ['noaa_nerrs'], hidePlaces: [] })
    const last = { colls: ['places'], hidePlaces: [] }
    expect(toggleMatrixPlaces(idx, last, { kind: 'collection', key: 'places' }, false)).toBe(last)
  })
  it('a place off is removed; a place on in a shown group comes back', () => {
    expect(toggleMatrixPlaces(idx, { colls: ['places'], hidePlaces: [] }, { kind: 'place', key: 'NMS:A' }, false)).toEqual({ colls: ['places'], hidePlaces: ['NMS:A'] })
    expect(toggleMatrixPlaces(idx, { colls: ['places'], hidePlaces: ['NMS:A'] }, { kind: 'place', key: 'NMS:A' }, true)).toEqual({ colls: ['places'], hidePlaces: [] })
  })
  it('a place on in a group that is not shown shows the group with every other place of it removed', () => {
    expect(toggleMatrixPlaces(idx, { colls: ['noaa_nerrs'], hidePlaces: [] }, { kind: 'place', key: 'NMS:A' }, true)).toEqual({ colls: ['noaa_nerrs', 'places'], hidePlaces: ['NMS:B'] })
  })
  it('an id that is not a place changes nothing', () => {
    const s = { colls: ['places'], hidePlaces: [] }
    expect(toggleMatrixPlaces(idx, s, { kind: 'place', key: 'NOPE' }, true)).toBe(s)
  })
})

describe('the collections nothing is computed for yet', () => {
  const list = uncomputedCollections(layers, idx)
  it('lists every polygon collection with no computed place, none that has one (in any values file) and no point or line layer', () => {
    expect(list.map(u => u.coll)).toEqual(['noaa_marine_monuments', 'boem_wind_leases'])
    expect(list.map(u => u.n)).toEqual([32, 52])
  })
  it('each has its gazetteer link and the issue form pre-filled with the collection only', () => {
    expect(list[1].gazetteer).toBe('https://oceanmetrics.io/places/?layers=boem_wind_leases')
    expect(list[1].request).toBe('https://github.com/oceanmetrics/indicators/issues/new?template=indicator-request.yml&title=Request:%20indicators%20for%20BOEM%20offshore%20wind%20lease%20outlines&collection=boem_wind_leases')
  })
  it('a collection whose places are computed only through another collection (Pitcairn in places and mr_eez) is not listed', () => {
    expect(uncomputedCollections({ mr_eez: layers.mr_eez, places: layers.places }, idx)).toEqual([])
  })
  it('without layers.json there is nothing to list', () => {
    expect(uncomputedCollections({}, idx)).toEqual([])
  })
})

describe('what the picker buttons say', () => {
  const groups = placeGroups(idx, layers)
  it('multi: a group whole, part of a group, one place, several groups, nothing', () => {
    expect(multiLabel(groups, new Set(['NMS:A', 'NMS:B']))).toBe('Sanctuaries and Tortugas reserve · 2 places')
    expect(multiLabel(groups, new Set(['NMS:A']))).toBe('Alpha')
    expect(multiLabel(groups, new Set(['NMS:A', 'NERRS:WEL']))).toBe('2 groups · 2 places')
    expect(multiLabel(groups, new Set())).toBe('No places')
    const big = indexCoverage([row({}), row({ place_id: 'NMS:B' }), row({ place_id: 'NMS:C' })])
    expect(multiLabel(placeGroups(big, layers), new Set(['NMS:A', 'NMS:B']))).toBe('Sanctuaries and Tortugas reserve · 2 of 3 places')
  })
  it('group and place', () => {
    expect(groupLabel(groups[2])).toBe('Exclusive Economic Zones · 1 place')
    expect(groupLabel(null)).toBe('Choose a place group')
    expect(placeLabel({ name: 'Channel Islands National Marine Sanctuary' })).toBe('Channel Islands')
    expect(placeLabel(null)).toBe('Choose a place')
  })
})

describe('the Map\u2019s group list', () => {
  const groups = placeGroups(idx, layers)
  const note = (c: string) => (c === 'places' ? { text: 'no values for SST', has: false } : { text: '1 with SST', has: true })
  it('lists the groups with values first, each with "n of N computed" and its note; the current one is checked', () => {
    const t = groupPickNodes(groups, 'mr_eez', note)
    expect(t.map(n => [n.key, n.state, n.hint])).toEqual([
      ['noaa_nerrs', 'unchecked', '1 of 30 computed \u00b7 1 with SST'], ['mr_eez', 'checked', '1 of 285 computed \u00b7 1 with SST'],
      ['places', 'unchecked', '2 of 20 computed \u00b7 no values for SST'],
    ])
    expect(t[0].link?.href).toBe('https://oceanmetrics.io/places/?layers=noaa_nerrs')
  })
  it('keeps the groups\u2019 order when no note is given', () => {
    expect(groupPickNodes(groups, null, () => null).map(n => [n.key, n.hint])).toEqual([['places', '2 of 20 computed'], ['noaa_nerrs', '1 of 30 computed'], ['mr_eez', '1 of 285 computed']])
  })
})

describe('place sets in the pickers', () => {
  // the political set: EEZs and the high seas by FAO area; a second set with no computed group is not offered
  const sets = [
    { id: 'political', title: 'Ocean by jurisdiction', groups: ['mr_eez', 'fao_high_seas'], note: 'together they cover the ocean' },
    { id: 'ecological', title: 'Ocean by ecoregion', groups: ['meow'] },
  ]
  const idx2 = indexCoverage([
    row({}),
    row({ place_id: 'MRGID:8439', place_name: 'British Exclusive Economic Zone (Pitcairn)', coll: 'mr_eez', place_coll: 'mr_eez' }),
    row({ place_id: 'MRGID:5668', place_name: 'Dutch Exclusive Economic Zone', coll: 'mr_eez', place_coll: 'mr_eez' }),
    row({ place_id: 'FAOHS:21', place_name: 'High seas, Atlantic, Northwest (FAO 21)', coll: 'fao_high_seas', place_coll: 'fao_high_seas', display_id: 'FAO:21' }),
  ])
  const layers2: Layers = { ...layers, mr_eez: { title: 'x', n: 285, geom: 'MultiPolygon' }, fao_high_seas: { title: 'y', n: 18, geom: 'MultiPolygon' } }
  const groups = placeGroups(idx2, layers2)
  const infos = placeSetInfos(sets, groups, layers2)

  it('a set with a computed group is listed with its groups, its computed places and the gazetteer total; one with none is not', () => {
    expect(infos.map(i => [i.ref, i.title, i.groups.map(g => g.coll), i.computed, i.total, i.note])).toEqual([['set:political', 'Ocean by jurisdiction', ['mr_eez', 'fao_high_seas'], 3, 303, 'together they cover the ocean']])
  })
  it('the total is null while layers.json has not loaded', () => {
    expect(placeSetInfos(sets, placeGroups(idx2), {})[0].total).toBeNull()
  })
  it('multi: the set is a tick above the groups, ticked when all its places are, mixed when some are; a search lists none', () => {
    const all = new Set(['MRGID:8439', 'MRGID:5668', 'FAOHS:21'])
    const t = placePickTree(groups, all, '', infos)
    expect(t.map(n => [n.kind, n.key, n.state, n.hint])).toEqual([
      ['collection', 'set:political', 'checked', '3 of 303 \u00b7 2 groups'], ['collection', 'places', 'unchecked', '1 of 20'],
      ['collection', 'mr_eez', 'checked', '2 of 285'], ['collection', 'fao_high_seas', 'checked', '1 of 18'],
    ])
    expect(t[0].children).toEqual([])
    expect(placePickTree(groups, new Set(['FAOHS:21']), '', infos)[0].state).toBe('mixed')
    expect(placePickTree(groups, new Set(), '', infos)[0].state).toBe('unchecked')
    expect(placePickTree(groups, all, 'dutch', infos).map(n => n.key)).toEqual(['mr_eez'])
  })
  it('ticking a set ticks all its groups (the removed places of them come back); unticking removes the groups, the last stays', () => {
    const state = { colls: ['places'], hidePlaces: ['MRGID:5668'] }
    expect(toggleMatrixPlaces(idx2, state, { kind: 'collection', key: 'set:political' }, true, sets)).toEqual({ colls: ['places', 'mr_eez', 'fao_high_seas'], hidePlaces: [] })
    expect(toggleMatrixPlaces(idx2, { colls: ['places', 'mr_eez', 'fao_high_seas'], hidePlaces: [] }, { kind: 'collection', key: 'set:political' }, false, sets)).toEqual({ colls: ['places'], hidePlaces: [] })
    const only = { colls: ['mr_eez', 'fao_high_seas'], hidePlaces: [] }
    expect(toggleMatrixPlaces(idx2, only, { kind: 'collection', key: 'set:political' }, false, sets).colls).toEqual(['fao_high_seas'])
  })
  it('an unknown set changes nothing', () => {
    const state = { colls: ['places'], hidePlaces: [] }
    expect(toggleMatrixPlaces(idx2, state, { kind: 'collection', key: 'set:nope' }, true, sets)).toEqual(state)
  })
  it('group: a set is one choice above the groups, its key is the reference, its hint names the groups', () => {
    const note = (c: string) => (c === 'places' ? { text: 'no values for SST', has: false } : { text: '1 with SST', has: true })
    const t = groupPickNodes(groups, 'set:political', note, infos)
    expect(t.map(n => [n.kind, n.key, n.state])).toEqual([['place', 'set:political', 'checked'], ['place', 'mr_eez', 'unchecked'], ['place', 'fao_high_seas', 'unchecked'], ['place', 'places', 'unchecked']])
    expect(t[0].hint).toBe('3 of 303 computed \u00b7 Exclusive Economic Zones + High seas by FAO area \u00b7 1 with SST')
    expect(t[0].title).toBe('together they cover the ocean')
  })
  it('the button names a set that is chosen whole, a group otherwise', () => {
    const all = new Set(['MRGID:8439', 'MRGID:5668', 'FAOHS:21'])
    expect(multiLabel(groups, all, infos)).toBe('Ocean by jurisdiction \u00b7 3 places')
    expect(multiLabel(groups, new Set(['MRGID:8439', 'FAOHS:21']), infos)).toBe('2 groups \u00b7 2 places')
    expect(multiLabel(groups, all)).toBe('2 groups \u00b7 3 places')
    expect(groupLabel({ title: infos[0].title, computed: infos[0].computed })).toBe('Ocean by jurisdiction \u00b7 3 places')
  })
})
