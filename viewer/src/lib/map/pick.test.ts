// what the Map opens on, and the gazetteer layers it draws with
import { describe, expect, it } from 'vitest'
import type { CoverageRow } from '../../../../src/coverage/build.ts'
import type { Indicator } from '../data.ts'
import { DEFAULT_MAP_INDICATOR, groupOf, mapColls, mapGroups, mappable, pickMapIndicator, valuesCollsOfGroup } from './pick.ts'
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
})

describe('the indicator the Map shows', () => {
  const a = ind('a', ['c1']), b = ind('b', ['c1'], true), sst = ind(DEFAULT_MAP_INDICATOR, ['c1'], true), z = ind('z', ['c1'], true)
  const have = (...ids: string[]) => new Map(ids.map(id => [id, new Set(['P'])]))
  it('the hash\'s indicator wins when it is in the selection and has values in the selected places', () => {
    expect(pickMapIndicator([a, b], have('a', 'b'), 'a')?.id).toBe('a')
  })
  it('regression: an indicator outside the selection is never shown, whatever the hash says (the first selected one is)', () => {
    expect(pickMapIndicator([b, sst], have('a', 'b', DEFAULT_MAP_INDICATOR), 'a')?.id).toBe(DEFAULT_MAP_INDICATOR)
    expect(pickMapIndicator([b], have('a', 'b'), 'a')?.id).toBe('b')
  })
  it('otherwise sea surface temperature, then the first lead, then the first selected indicator with values', () => {
    expect(pickMapIndicator([a, b, sst], have('a', 'b', DEFAULT_MAP_INDICATOR), null)?.id).toBe(DEFAULT_MAP_INDICATOR)
    expect(pickMapIndicator([a, b], have('a', 'b'), null)?.id).toBe('b')
    expect(pickMapIndicator([a], have('a'), 'nope')?.id).toBe('a')
  })
  it('an indicator with no value in the selected places is passed over', () => {
    expect(pickMapIndicator([z, a], have('a'), 'z')?.id).toBe('a')
    expect(pickMapIndicator([z, a], new Map([['z', new Set<string>()], ['a', new Set(['P'])]]), null)?.id).toBe('a')
  })
  it('nothing selected, or no selected indicator with values, gives nothing', () => {
    expect(pickMapIndicator([], have('a'), null)).toBeNull()
    expect(pickMapIndicator([a], have(), 'a')).toBeNull()
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
})

describe('place sets on the Map', () => {
  const sets = [{ id: 'political', title: 'Ocean by jurisdiction', groups: ['mr_eez', 'fao_high_seas'] }]
  const obis = ind('obis:species', ['mr_eez', 'fao_high_seas'], true)
  const sst = ind(DEFAULT_MAP_INDICATOR, ['places'], true)
  const rows = [
    cov('obis:species', 'mr_eez', 5, 'mr_eez', 'MRGID:1'), cov('obis:species', 'fao_high_seas', 5, 'fao_high_seas', 'FAOHS:21'),
    cov(DEFAULT_MAP_INDICATOR, 'places', 1, 'places', 'NMS:A'),
  ]
  it('the values files are those of every group of the set', () => {
    expect(valuesCollsOfGroup(obis, rows, ['mr_eez', 'fao_high_seas'])).toEqual(['mr_eez', 'fao_high_seas'])
    expect(valuesCollsOfGroup(obis, rows, ['fao_high_seas'])).toEqual(['fao_high_seas'])
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
