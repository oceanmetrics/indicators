import { describe, expect, it } from 'vitest'
import type { CoverageRow } from '../../../../src/coverage/build.ts'
import type { Layers } from '../data.ts'
import { placesByCollection, placeUniverse } from '../gazetteerPlaces.ts'
import { indexCoverage } from '../matrix.ts'
import { DEFAULT_SPEC } from '../../../../src/report/spec.ts'
import { multiLabel, placeGroups, placeLabel, placeSetInfos, selectionLine } from './places.ts'
import { capNote, placePickTree, toggleSelectedPlaces } from './placesTree.ts'

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
// the gazetteer's own places of the collections that are only partly or not at all computed
const gaz = placesByCollection([
  { place_id: 'NERRS:WEL', name: 'Wells', collection: 'noaa_nerrs' }, { place_id: 'NERRS:ACE', name: 'ACE Basin', collection: 'noaa_nerrs' },
  { place_id: 'BOEM:1', name: 'Lease 1', collection: 'boem_wind_leases' }, { place_id: 'BOEM:2', name: 'Lease 2', collection: 'boem_wind_leases' },
])

describe('the groups the place picker lists', () => {
  const groups = placeGroups(idx.places, idx, layers)
  it('the groups with computed places, in the Matrix order, with "n of N" and their places by name', () => {
    expect(groups.map(g => [g.coll, g.title, g.computed, g.total])).toEqual([
      ['places', 'National Marine Sanctuaries', 2, 20], ['noaa_nerrs', 'National Estuarine Research Reserves', 1, 30], ['mr_eez', 'Exclusive Economic Zones', 1, 285],
    ])
    expect(groups[0].places.map(p => p.id)).toEqual(['NMS:A', 'NMS:B'])
  })
  it('a group lists its places in the order of the Select section, the computed ones first', () => {
    const at = [{ ...idx.places[0], lat: 10, lon: 5 }, { ...idx.places[1], lat: 30, lon: -5 }]
    const g = (order: Parameters<typeof placeGroups>[3]) => placeGroups(at, idx, layers, order)[0].places.map(p => p.id)
    expect(g({ order: { sort: 'ns', group: true, custom: [] } })).toEqual(['NMS:B', 'NMS:A'])
    expect(g({ order: { sort: 'we', group: true, custom: [] } })).toEqual(['NMS:B', 'NMS:A'])
    expect(g({ order: { sort: 'custom', group: true, custom: ['NMS:B'] } })).toEqual(['NMS:B', 'NMS:A'])
    expect(g({})).toEqual(['NMS:A', 'NMS:B'])
  })
  it('the total is null while layers.json has not loaded', () => {
    expect(placeGroups(idx.places, idx).map(g => g.total)).toEqual([null, null, null])
  })
  it('regression: every polygon collection of the gazetteer is a group, computed or not (not only the computed ones)', () => {
    const all = placeGroups(idx.places, idx, layers, { all: true })
    expect(all.map(g => g.coll)).toEqual(['places', 'noaa_nerrs', 'mr_eez', 'noaa_marine_monuments', 'boem_wind_leases'])
    expect(all.slice(3).map(g => [g.coll, g.computed, g.total, g.places.length, g.loaded])).toEqual([['noaa_marine_monuments', 0, 32, 0, false], ['boem_wind_leases', 0, 52, 0, false]])
  })
  it('lines and points are not offered, nor a layer with no geometry type', () => {
    const all = placeGroups(idx.places, idx, layers, { all: true }).map(g => g.coll)
    for (const c of ['calcofi_stations', 'noaa_maritime_limits', 'nogeom']) expect(all).not.toContain(c)
  })
  it('a group is loaded when all its places are computed, or once the gazetteer\'s places are read', () => {
    expect(groups.map(g => g.loaded)).toEqual([false, false, false])   // 2 of 20, 1 of 30, 1 of 285
    expect(placeGroups(idx.places, indexCoverage([row({}), row({ place_id: 'NMS:B' })]), { places: { title: 'p', n: 2, geom: 'MultiPolygon' } })[0].loaded).toBe(true)
    expect(placeGroups(placeUniverse(idx, gaz, layers), idx, layers, { all: true, gazetteer: true }).every(g => g.loaded)).toBe(true)
  })
  it('with the gazetteer read, an uncomputed place is listed after the computed ones of its group', () => {
    const g = placeGroups(placeUniverse(idx, gaz, layers), idx, layers, { all: true, gazetteer: true })
    expect(g.find(x => x.coll === 'noaa_nerrs')!.places.map(p => p.id)).toEqual(['NERRS:WEL', 'NERRS:ACE'])
    expect(g.find(x => x.coll === 'noaa_nerrs')!.computed).toBe(1)
    expect(g.find(x => x.coll === 'boem_wind_leases')!.places.map(p => p.id)).toEqual(['BOEM:1', 'BOEM:2'])
  })
})

describe('the tri-state place tree', () => {
  const groups = placeGroups(idx.places, idx, layers)
  it('a group is checked, mixed or unchecked by its chosen places and carries "n of N computed" and a gazetteer link', () => {
    const t = placePickTree(groups, new Set(['NMS:A', 'NERRS:WEL']))
    expect(t.map(n => [n.key, n.state, n.hint])).toEqual([['places', 'mixed', '2 of 20 computed'], ['noaa_nerrs', 'checked', '1 of 30 computed'], ['mr_eez', 'unchecked', '1 of 285 computed']])
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
  it('a group the gazetteer\'s places are not read for is lazy (it opens, and the panel asks); once read it is not', () => {
    const all = placeGroups(idx.places, idx, layers, { all: true })
    const wind = placePickTree(all, new Set()).find(n => n.key === 'boem_wind_leases')!
    expect(wind).toMatchObject({ lazy: true, hint: '0 of 52 computed', children: [], state: 'unchecked' })
    expect(placePickTree(all, new Set(), '', [], { loading: true }).find(n => n.key === 'boem_wind_leases')!.note).toBe('Loading the places…')
    const read = placeGroups(placeUniverse(idx, gaz, layers), idx, layers, { all: true, gazetteer: true })
    const t = placePickTree(read, new Set(['BOEM:1'])).find(n => n.key === 'boem_wind_leases')!
    expect(t.lazy).toBeUndefined()
    expect(t.children.map(c => [c.key, c.label, c.state])).toEqual([['BOEM:1', 'Lease 1', 'checked'], ['BOEM:2', 'Lease 2', 'unchecked']])
    expect(t.state).toBe('mixed')
  })
  it('a group longer than the cap lists its first places and says how to narrow it', () => {
    const many = Array.from({ length: 500 }, (_, n) => ({ id: `PSGID:${n}`, name: `MPA ${String(n).padStart(4, '0')}`, coll: 'protectedseas_mpa' }))
    const big = indexCoverage([row({})])
    const g = placeGroups([...big.places, ...many], big, { places: layers.places, protectedseas_mpa: { title: 'ProtectedSeas MPAs', n: 500, geom: 'MultiPolygon' } }, { all: true, gazetteer: true })
    const node = placePickTree(g, new Set(), '', [], { cap: 300 }).find(n => n.key === 'protectedseas_mpa')!
    expect(node.children).toHaveLength(300)
    expect(node.children[0].key).toBe('PSGID:0')
    expect(node.note).toBe(capNote(300, 500))
    expect(node.note).toMatch(/first 300 of 500 places/)
    // a search past the cap finds the place; the note counts the hits
    const hit = placePickTree(g, new Set(), 'MPA 0450', [], { cap: 300 }).find(n => n.key === 'protectedseas_mpa')!
    expect(hit.children.map(c => c.key)).toEqual(['PSGID:450'])
    expect(hit.note).toBeUndefined()
  })
})

describe('a tick is a change of the selection\'s rules', () => {
  const universe = placeUniverse(idx, gaz, layers)
  const sel = DEFAULT_SPEC.places
  it('a group on adds coll:<slug>; off with it the only rule leaves nothing chosen (none)', () => {
    expect(toggleSelectedPlaces(sel, universe, { kind: 'collection', key: 'noaa_nerrs' }, true)).toEqual({ include: ['coll:places', 'coll:noaa_nerrs'], exclude: [], context: false })
    expect(toggleSelectedPlaces(sel, universe, { kind: 'collection', key: 'places' }, false)).toEqual({ include: ['none'], exclude: [], context: false })
  })
  it('a place off is excluded (px); on again it comes back; a place in a group not chosen joins by id', () => {
    const off = toggleSelectedPlaces(sel, universe, { kind: 'place', key: 'NMS:A' }, false)
    expect(off).toEqual({ include: ['coll:places'], exclude: ['NMS:A'], context: false })
    expect(toggleSelectedPlaces(off, universe, { kind: 'place', key: 'NMS:A' }, true)).toEqual(sel)
    expect(toggleSelectedPlaces(sel, universe, { kind: 'place', key: 'NERRS:ACE' }, true).include).toEqual(['coll:places', 'NERRS:ACE'])
  })
  it('a place that is not computed at all can be chosen', () => {
    expect(toggleSelectedPlaces({ include: ['none'], exclude: [], context: false }, universe, { kind: 'place', key: 'BOEM:2' }, true).include).toEqual(['BOEM:2'])
  })
  it('a place set is one rule (set:<id>); an unknown set changes nothing', () => {
    const sets = [{ id: 'political', title: 'Ocean by jurisdiction', groups: ['mr_eez', 'fao_high_seas'] }]
    expect(toggleSelectedPlaces(sel, universe, { kind: 'collection', key: 'set:political' }, true, sets).include).toEqual(['coll:places', 'set:political'])
    expect(toggleSelectedPlaces(sel, universe, { kind: 'collection', key: 'set:nope' }, true, sets)).toBe(sel)
  })
})

describe('what the picker buttons say', () => {
  const groups = placeGroups(idx.places, idx, layers)
  it('multi: a group whole, part of a group, one place, several groups, nothing', () => {
    expect(multiLabel(groups, new Set(['NMS:A', 'NMS:B']))).toBe('National Marine Sanctuaries · 2 places')
    expect(multiLabel(groups, new Set(['NMS:A']))).toBe('Alpha')
    expect(multiLabel(groups, new Set(['NMS:A', 'NERRS:WEL']))).toBe('2 groups · 2 places')
    expect(multiLabel(groups, new Set())).toBe('No places')
    const big = indexCoverage([row({}), row({ place_id: 'NMS:B' }), row({ place_id: 'NMS:C' })])
    expect(multiLabel(placeGroups(big.places, big, layers), new Set(['NMS:A', 'NMS:B']))).toBe('National Marine Sanctuaries · 2 of 3 places')
  })
  it('the Place view: the place\'s short name', () => {
    expect(placeLabel({ name: 'Channel Islands National Marine Sanctuary' })).toBe('Channel Islands')
    expect(placeLabel(null)).toBe('Choose a place')
  })
  it('the line of the Select section says the places and the indicators chosen', () => {
    expect(selectionLine('National Marine Sanctuaries · 18 places', 24)).toBe('National Marine Sanctuaries · 18 places × 24 indicators')
    expect(selectionLine('No places', 1)).toBe('No places × 1 indicator')
  })
})

describe('place sets in the picker', () => {
  // the political set: EEZs and the high seas by FAO area; a set none of whose groups is in the gazetteer is not offered
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
  const groups = placeGroups(idx2.places, idx2, layers2)
  const infos = placeSetInfos(sets, groups)

  it('a set with a group listed is offered with its groups, its computed places, the gazetteer total and a line of what it combines', () => {
    expect(infos.map(i => [i.ref, i.title, i.groups.map(g => g.coll), i.computed, i.total, i.note, i.desc])).toEqual([
      ['set:political', 'Ocean by jurisdiction', ['mr_eez', 'fao_high_seas'], 3, 303, 'together they cover the ocean', 'Exclusive Economic Zones + High seas by FAO area'],
    ])
  })
  it('the total is null while layers.json has not loaded', () => {
    expect(placeSetInfos(sets, placeGroups(idx2.places, idx2))[0].total).toBeNull()
  })
  it('the set is a tick above the groups, ticked when all its places are, mixed when some are; it shows what it combines; a search lists none', () => {
    const all = new Set(['MRGID:8439', 'MRGID:5668', 'FAOHS:21'])
    const t = placePickTree(groups, all, '', infos)
    expect(t.map(n => [n.kind, n.key, n.state, n.hint])).toEqual([
      ['collection', 'set:political', 'checked', '3 of 303 computed · 2 groups'], ['collection', 'places', 'unchecked', '1 of 20 computed'],
      ['collection', 'mr_eez', 'checked', '2 of 285 computed'], ['collection', 'fao_high_seas', 'checked', '1 of 18 computed'],
    ])
    expect(t[0].desc).toBe('Exclusive Economic Zones + High seas by FAO area')
    expect(t[0].children).toEqual([])
    expect(placePickTree(groups, new Set(['FAOHS:21']), '', infos)[0].state).toBe('mixed')
    expect(placePickTree(groups, new Set(), '', infos)[0].state).toBe('unchecked')
    expect(placePickTree(groups, all, 'dutch', infos).map(n => n.key)).toEqual(['mr_eez'])
  })
  it('the button names a set that is chosen whole, a group otherwise', () => {
    const all = new Set(['MRGID:8439', 'MRGID:5668', 'FAOHS:21'])
    expect(multiLabel(groups, all, infos)).toBe('Ocean by jurisdiction · 3 places')
    expect(multiLabel(groups, new Set(['MRGID:8439', 'FAOHS:21']), infos)).toBe('2 groups · 2 places')
    expect(multiLabel(groups, all)).toBe('2 groups · 3 places')
  })
})
