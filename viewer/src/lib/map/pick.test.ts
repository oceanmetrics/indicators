// what the Map opens on, and the gazetteer layers it draws with
import { describe, expect, it } from 'vitest'
import type { CoverageRow } from '../../../../src/coverage/build.ts'
import type { Indicator } from '../data.ts'
import { DEFAULT_MAP_INDICATOR, mapColls, mappable, pickMap } from './pick.ts'
import { directUrl, parseLayers } from './gazetteer.ts'

const ind = (id: string, colls: string[], lead = false): Indicator => ({ id, lead, collections: colls.map(coll => ({ coll })) }) as unknown as Indicator
const cov = (indicator: string, coll: string, last_value: number | null = 1): CoverageRow => ({ indicator, coll, last_value, last_class: null }) as unknown as CoverageRow

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
