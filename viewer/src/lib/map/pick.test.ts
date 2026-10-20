// what the Map opens on, and the gazetteer layers it draws with
import { describe, expect, it } from 'vitest'
import type { CoverageRow } from '../../../../src/coverage/build.ts'
import type { Indicator } from '../data.ts'
import { DEFAULT_MAP_INDICATOR, drawnGroups, groupOf, leadForGroup, mapColls, mapGroups, mappable, pickMap, resolveGroup, switchNotice, valuesCollsOfGroup } from './pick.ts'
import { directUrl, parseLayers } from './gazetteer.ts'

const ind = (id: string, colls: string[], lead = false): Indicator => ({ id, lead, collections: colls.map(coll => ({ coll })) }) as unknown as Indicator
const cov = (indicator: string, coll: string, last_value: number | null = 1, place_coll?: string, place_id = 'P'): CoverageRow => ({ indicator, coll, place_coll, place_id, last_value, last_class: null }) as unknown as CoverageRow

describe('which indicators can be mapped', () => {
  const inds = [ind('a', ['c1']), ind(DEFAULT_MAP_INDICATOR, ['c1', 'c2'], true), ind('z', ['c1'], true)]
  const rows = [cov('a', 'c1'), cov(DEFAULT_MAP_INDICATOR, 'c2'), cov('z', 'c1', null)]
  it('only those with a value in coverage', () => {
    expect(mappable(inds, rows).map(i => i.id)).toEqual(['a', DEFAULT_MAP_INDICATOR])
  })
  it('an indicator’s collections are those of the manifest that have a value in coverage', () => {
    expect(mapColls(inds[1], rows)).toEqual(['c2'])
    // c1 has a coverage row but no value: it is not offered
    expect(mapColls(inds[1], [...rows, cov(DEFAULT_MAP_INDICATOR, 'c1', null)])).toEqual(['c2'])
  })
  it('the hash’s indicator and collection win when they can be mapped', () => {
    expect(pickMap(inds, rows, { ind: 'a', coll: 'c1' })).toMatchObject({ coll: 'c1' })
    expect(pickMap(inds, rows, { ind: 'a', coll: 'c1' }).ind?.id).toBe('a')
  })
  it('otherwise SST, then the first lead, then the first indicator; the first collection stands in for a missing one', () => {
    expect(pickMap(inds, rows, { ind: null, coll: null }).ind?.id).toBe(DEFAULT_MAP_INDICATOR)
    expect(pickMap(inds, rows, { ind: 'nope', coll: 'c1' })).toMatchObject({ coll: 'c2', colls: ['c2'] })
    expect(pickMap([ind('a', ['c1']), ind('b', ['c1'], true)], [cov('a', 'c1'), cov('b', 'c1')], { ind: null, coll: null }).ind?.id).toBe('b')
    expect(pickMap([ind('a', ['c1'])], [cov('a', 'c1')], { ind: null, coll: null }).ind?.id).toBe('a')
  })
  it('nothing to map gives nothing', () => {
    expect(pickMap([], [], { ind: null, coll: null })).toEqual({ ind: null, coll: null, colls: [] })
  })
})

describe('place groups on the Map', () => {
  // SST: Pitcairn (home group mr_eez) is in the `places` values file with 2 sanctuaries; OBIS is in the mr_eez file; Wells has precipitation only
  const sst = ind(DEFAULT_MAP_INDICATOR, ['places'], true)
  const obis = ind('obis:species', ['mr_eez', 'places'], true)
  const pcp = ind('pcp', ['noaa_nerrs'], true)
  const rows = [
    cov(DEFAULT_MAP_INDICATOR, 'places', 1, 'places', 'NMS:A'), cov(DEFAULT_MAP_INDICATOR, 'places', 1, 'places', 'NMS:B'), cov(DEFAULT_MAP_INDICATOR, 'places', 1, 'mr_eez', 'MRGID:1'),
    cov('obis:species', 'mr_eez', 5, 'mr_eez', 'MRGID:1'), cov('obis:species', 'mr_eez', 5, 'mr_eez', 'MRGID:2'), cov('obis:species', 'places', 5, 'mr_eez', 'MRGID:1'),
    cov('pcp', 'noaa_nerrs', 3, 'noaa_nerrs', 'NERRS:WEL'),
  ]
  it('a place’s group is its home collection, the values collection for a coverage table built before place_coll', () => {
    expect(groupOf({ coll: 'places', place_coll: 'mr_eez' })).toBe('mr_eez')
    expect(groupOf({ coll: 'places' })).toBe('places')
    expect(groupOf({ coll: 'places', place_coll: null })).toBe('places')
  })
  it('an indicator’s groups are those with a value, in the Matrix order', () => {
    expect(mapGroups(sst, rows)).toEqual(['places', 'mr_eez'])
    expect(mapGroups(pcp, rows)).toEqual(['noaa_nerrs'])
    expect(mapGroups(sst, [cov(DEFAULT_MAP_INDICATOR, 'places', null, 'places')])).toEqual([])
  })
  it('the EEZ group reads every values file that holds its places: SST from `places` (Pitcairn), OBIS from `mr_eez` and `places`', () => {
    expect(valuesCollsOfGroup(sst, rows, 'mr_eez')).toEqual(['places'])
    expect(valuesCollsOfGroup(obis, rows, 'mr_eez')).toEqual(['mr_eez', 'places'])
    expect(valuesCollsOfGroup(sst, rows, 'places')).toEqual(['places'])
    expect(valuesCollsOfGroup(sst, rows, 'noaa_nerrs')).toEqual([])
  })
  it('the hash’s coll names a group; an old link’s values collection resolves to the group holding most of its places', () => {
    expect(resolveGroup(obis, rows, 'mr_eez')).toBe('mr_eez')
    expect(resolveGroup(sst, rows, 'places')).toBe('places')
    // old link: coll=places was the values collection; for OBIS it holds one place, of the group mr_eez
    expect(resolveGroup(obis, rows, 'places')).toBe('mr_eez')
    // a group the indicator has no values in falls to its first group
    expect(resolveGroup(sst, rows, 'noaa_nerrs')).toBe('places')
    expect(resolveGroup(sst, rows, null)).toBe('places')
    expect(resolveGroup(pcp, [], 'x')).toBeNull()
  })
  it('pickMap names the group, and the groups of the indicator', () => {
    const p = pickMap([sst, obis, pcp], rows, { ind: DEFAULT_MAP_INDICATOR, coll: 'mr_eez' })
    expect([p.ind?.id, p.coll, p.colls]).toEqual([DEFAULT_MAP_INDICATOR, 'mr_eez', ['places', 'mr_eez']])
  })
  it('a group with no value for the indicator shown switches to its sea surface temperature, else its first lead, else its first indicator', () => {
    expect(leadForGroup([sst, obis, pcp], rows, 'noaa_nerrs')?.id).toBe('pcp')
    expect(leadForGroup([obis, sst, pcp], rows, 'mr_eez')?.id).toBe(DEFAULT_MAP_INDICATOR)
    expect(leadForGroup([ind('a', ['places']), ind('b', ['places'], true)], [cov('a', 'places', 1, 'places'), cov('b', 'places', 1, 'places')], 'places')?.id).toBe('b')
    expect(leadForGroup([ind('a', ['places'])], [cov('a', 'places', 1, 'places')], 'places')?.id).toBe('a')
    expect(leadForGroup([sst], rows, 'noaa_nerrs')).toBeNull()
  })
  it('the sentence above the map after a switch says what was not computed and what is shown', () => {
    expect(switchNotice({ short: 'SST' }, { title: 'OBIS species richness, all taxa.' }, 'Exclusive Economic Zones'))
      .toBe('SST is not computed for Exclusive Economic Zones; showing OBIS species richness, all taxa.')
    expect(switchNotice({ short: 'SST' }, { title: 'Precipitation' }, 'National Estuarine Research Reserves'))
      .toBe('SST is not computed for National Estuarine Research Reserves; showing Precipitation.')
  })
})

describe('place sets on the Map', () => {
  const sets = [{ id: 'political', title: 'Ocean by jurisdiction', groups: ['mr_eez', 'fao_high_seas'] }]
  const obis = ind('obis:species', ['mr_eez', 'fao_high_seas'], true)
  const sst = ind(DEFAULT_MAP_INDICATOR, ['places'], true)
  const rows = [
    cov('obis:species', 'mr_eez', 5, 'mr_eez', 'MRGID:1'), cov('obis:species', 'fao_high_seas', 5, 'fao_high_seas', 'FAOHS:21'),
    cov(DEFAULT_MAP_INDICATOR, 'places', 1, 'places', 'NMS:A'),
  ]
  it('set:<id> stands when the indicator has values in a group of the set, else the first group of the indicator', () => {
    expect(resolveGroup(obis, rows, 'set:political', sets)).toBe('set:political')
    expect(resolveGroup(sst, rows, 'set:political', sets)).toBe('places')
    expect(resolveGroup(obis, rows, 'set:nope', sets)).toBe('mr_eez')
    expect(resolveGroup(obis, rows, 'set:political')).toBe('mr_eez')
  })
  it('pickMap keeps the set the hash names', () => {
    const p = pickMap([sst, obis], rows, { ind: 'obis:species', coll: 'set:political' }, sets)
    expect([p.ind?.id, p.coll, p.colls]).toEqual(['obis:species', 'set:political', ['mr_eez', 'fao_high_seas']])
  })
  it('a set draws its groups that have values, in the set order; a group draws itself', () => {
    expect(drawnGroups('set:political', obis, rows, sets)).toEqual(['mr_eez', 'fao_high_seas'])
    expect(drawnGroups('set:political', obis, rows.slice(0, 1), sets)).toEqual(['mr_eez'])
    expect(drawnGroups('set:political', sst, rows, sets)).toEqual([])
    expect(drawnGroups('mr_eez', obis, rows, sets)).toEqual(['mr_eez'])
  })
  it('the values files are those of every group of the set', () => {
    expect(valuesCollsOfGroup(obis, rows, ['mr_eez', 'fao_high_seas'])).toEqual(['mr_eez', 'fao_high_seas'])
    expect(valuesCollsOfGroup(obis, rows, ['fao_high_seas'])).toEqual(['fao_high_seas'])
  })
  it('a set with no value for the indicator shown leads with its own lead; none when nothing is computed there', () => {
    expect(leadForGroup([obis, sst], rows, ['mr_eez', 'fao_high_seas'])?.id).toBe('obis:species')
    expect(leadForGroup([sst], rows, ['mr_eez', 'fao_high_seas'])).toBeNull()
  })
})

describe('the gazetteer layers', () => {
  const json = {
    base: 'https://storage.oceanmetrics.io/gazetteer/',
    base_direct: 'https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/',
    layers: [
      { slug: 'places', collection: 'places', title: 'P', kind: 'vector', pmtiles: 'https://storage.oceanmetrics.io/gazetteer/places/places.pmtiles', source_layer: 'places', bbox: [177.8, -28.4, 290, 48.5], attribution: 'NOAA' },
      { slug: 'mr_eez', title: 'E', kind: 'raster', pmtiles: null, bbox: [-180, -62, 180, 87], raster: { tiles: ['t'], info_url: 'i', info_id: 'mrgid' }, attribution: 'VLIZ' },
      { slug: 'nobbox', title: 'x' },
    ],
  }
  it('are keyed by collection, with the PMTiles read from the bucket host', () => {
    const l = parseLayers(json)
    expect(Object.keys(l)).toEqual(['places', 'mr_eez'])
    expect(l.places.pmtiles).toBe('https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/places/places.pmtiles')
    expect(l.places.bbox).toEqual([177.8, -28.4, 290, 48.5])
    expect(l.mr_eez.kind).toBe('raster')
    expect(l.mr_eez.pmtiles).toBeNull()
    expect(l.mr_eez.attribution).toBe('VLIZ')
  })
  it('anything unreadable gives none', () => {
    expect(parseLayers(null)).toEqual({})
    expect(parseLayers({ layers: 3 })).toEqual({})
  })
  it('directUrl leaves a URL of another host alone', () => {
    expect(directUrl('https://example.org/a', 'https://storage.oceanmetrics.io/gazetteer/', 'https://s3/x/')).toBe('https://example.org/a')
  })
})
