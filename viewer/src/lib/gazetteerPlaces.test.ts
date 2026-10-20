import { afterEach, describe, expect, it } from 'vitest'
import type { CoverageRow } from '../../../src/coverage/build.ts'
import { clearGazetteerPlaces, INDEX_COLUMNS, isPolygonLayer, loadGazetteerPlaces, placesByCollection, placeUniverse, selectionNeedsGazetteer } from './gazetteerPlaces.ts'
import { indexCoverage } from './matrix.ts'
import type { Layers } from './data.ts'

const cov = (place_id: string, place_name: string, place_coll: string): CoverageRow => ({
  place_id, place_name, coll: place_coll, place_coll, indicator: 'sst', time_grain: 'year', t0: '2000-01-01', t1: '2020-01-01', n_periods: 21,
  last_time: '2020-01-01', last_value: 1, last_class: null, status_method: 'iea-sd', status: 'above', trend: 'flat', recent_mean: null, recent_from: null,
  recent_to: null, lt_mean: null, lt_sd: null, why: null, sentence: 's', spark: '[]',
}) as CoverageRow
const idx = indexCoverage([cov('NMS:A', 'Alpha', 'places'), cov('NMS:B', 'Bravo', 'places'), cov('MRGID:1', 'Zed EEZ', 'mr_eez')])
const layers: Layers = {
  places: { title: 'Sanctuaries', n: 2, geom: 'MultiPolygon' }, mr_eez: { title: 'EEZs', n: 3, geom: 'MultiPolygon' },
  noaa_nerrs: { title: 'NERRs', n: 2, geom: 'MultiPolygon' }, calcofi_stations: { title: 'Stations', n: 2, geom: 'Point' },
}
const ROWS = [
  { place_id: 'NERRS:WEL', name: 'Wells', collection: 'noaa_nerrs' }, { place_id: 'NERRS:ACE', name: 'ACE Basin', collection: 'noaa_nerrs' },
  { place_id: 'MRGID:1', name: 'Zed EEZ (index name)', collection: 'mr_eez' }, { place_id: 'MRGID:2', name: 'Other EEZ', collection: 'mr_eez' },
  { place_id: 'CALCOFI:1', name: 'Station 1', collection: 'calcofi_stations' }, { place_id: '', name: 'no id', collection: 'mr_eez' }, { place_id: 'X:1', name: 'no coll', collection: '' },
]

afterEach(() => clearGazetteerPlaces())

describe('the gazetteer index as places', () => {
  it('reads the three columns the viewer needs and nothing else', () => {
    expect(INDEX_COLUMNS).toEqual(['place_id', 'name', 'collection'])
  })
  it('groups rows by collection, by name; a row without an id or a collection is skipped; a missing name is the id', () => {
    const g = placesByCollection([...ROWS, { place_id: 'NERRS:X', name: null, collection: 'noaa_nerrs' }])
    expect([...g.keys()]).toEqual(['noaa_nerrs', 'mr_eez', 'calcofi_stations'])
    expect(g.get('noaa_nerrs')!.map(p => [p.id, p.name])).toEqual([['NERRS:ACE', 'ACE Basin'], ['NERRS:X', 'NERRS:X'], ['NERRS:WEL', 'Wells']])
    expect(g.get('mr_eez')!.map(p => p.id)).toEqual(['MRGID:2', 'MRGID:1'])
  })
  it('loads once and caches the answer; a failure is not cached', async () => {
    let n = 0
    const read = async () => { n++; return ROWS }
    const a = await loadGazetteerPlaces(read)
    const b = await loadGazetteerPlaces(read)
    expect(a).toBe(b)
    expect(n).toBe(1)
    clearGazetteerPlaces()
    await expect(loadGazetteerPlaces(async () => { throw new Error('offline') })).rejects.toThrow('offline')
    await expect(loadGazetteerPlaces(async () => ROWS)).resolves.toBeInstanceOf(Map)
  })
})

describe('the universe of places a selection can name', () => {
  it('is the computed places before the gazetteer is read', () => {
    expect(placeUniverse(idx, null, layers)).toBe(idx.places)
  })
  it('adds the gazetteer\'s places of polygon collections that the coverage lacks; a computed place keeps its coverage name', () => {
    const u = placeUniverse(idx, placesByCollection(ROWS), layers)
    expect(u.map(p => p.id)).toEqual(['NMS:A', 'NMS:B', 'MRGID:1', 'NERRS:ACE', 'NERRS:WEL', 'MRGID:2'])
    expect(u.find(p => p.id === 'MRGID:1')!.name).toBe('Zed EEZ')
  })
  it('leaves out the line and point layers', () => {
    expect(isPolygonLayer('MultiPolygon')).toBe(true)
    expect(isPolygonLayer('Point')).toBe(false)
    expect(isPolygonLayer(null)).toBe(false)
    expect(placeUniverse(idx, placesByCollection(ROWS), layers).some(p => p.coll === 'calcofi_stations')).toBe(false)
  })
})

describe('when the selection needs the gazetteer', () => {
  const sets = [{ id: 'political', title: 'Ocean by jurisdiction', groups: ['mr_eez', 'fao_high_seas'] }]
  const sel = (...include: string[]) => ({ include, exclude: [], context: false })
  it('not for a group whose places are all computed (the default sanctuaries)', () => {
    expect(selectionNeedsGazetteer(sel('coll:places'), idx, layers, sets)).toBe(false)
    expect(selectionNeedsGazetteer(sel('*'), idx, layers, sets)).toBe(false)
    expect(selectionNeedsGazetteer(sel('none'), idx, layers, sets)).toBe(false)
  })
  it('for a group nothing of which is computed', () => {
    expect(selectionNeedsGazetteer(sel('coll:noaa_nerrs'), idx, layers, sets)).toBe(true)
  })
  it('for a group with more places in the gazetteer than computed (EEZs: 1 of 3)', () => {
    expect(selectionNeedsGazetteer(sel('coll:mr_eez'), idx, layers, sets)).toBe(true)
    expect(selectionNeedsGazetteer(sel('set:political'), idx, layers, sets)).toBe(true)
  })
  it('for a place id the coverage does not know, not for one it knows', () => {
    expect(selectionNeedsGazetteer(sel('NERRS:WEL'), idx, layers, sets)).toBe(true)
    expect(selectionNeedsGazetteer(sel('NMS:A'), idx, layers, sets)).toBe(false)
  })
  it('not while layers.json has not loaded and the group has computed places (the count is not known yet)', () => {
    expect(selectionNeedsGazetteer(sel('coll:mr_eez'), idx, {}, sets)).toBe(false)
  })
})
