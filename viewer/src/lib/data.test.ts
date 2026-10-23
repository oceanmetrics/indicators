import { describe, expect, it } from 'vitest'
import { absoluteBase, collTitle, gazetteerHref, gazetteerPlaceHref, loadCatalog, placesPageHref, normalizeRow, parseLayers, resolveDataBase } from './data.ts'

describe('resolveDataBase', () => {
  it('?data= wins and always ends in a slash', () => {
    expect(resolveDataBase('?data=https://example.org/ind', false)).toBe('https://example.org/ind/')
    expect(resolveDataBase('?data=./other/', true)).toBe('./other/')
  })
  it('defaults to the repo catalog in dev and the published bucket in a build', () => {
    expect(resolveDataBase('', true)).toBe('./catalog/')
    expect(resolveDataBase('?brand=mbon', false)).toBe('https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/indicators/')
    expect(resolveDataBase('?data=', false)).toBe('https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/indicators/')
  })
  it('a relative base is made absolute against the page', () => {
    expect(absoluteBase('./catalog/', 'http://localhost:5181/index.html')).toBe('http://localhost:5181/catalog/')
  })
})

describe('collection titles', () => {
  const g = parseLayers({ layers: [
    { slug: 'mr_eez', title: 'Marine Regions EEZ', n: 285 }, { slug: 'x', collection: 'noaa_nerrs', title: 'NOAA National Estuarine Research Reserves', n: 30, geom_type: 'MultiPolygon' },
    { slug: 'no_title' }, { slug: 'boem_wind_leases', title: 'BOEM offshore wind lease outlines', n: 52 },
  ] })
  it('the short group title wins, then the gazetteer title, then the slug', () => {
    expect(collTitle('mr_eez', g)).toBe('Exclusive Economic Zones')
    expect(collTitle('mr_high_seas')).toBe('High seas')
    expect(collTitle('noaa_nerrs', g)).toBe('National Estuarine Research Reserves')
    expect(collTitle('noaa_sanctuaries')).toBe('National Marine Sanctuaries')
    expect(collTitle('places')).toBe('National Marine Sanctuaries')
    expect(collTitle('boem_wind_leases', g)).toBe('BOEM offshore wind lease outlines')
    expect(collTitle('mystery', g)).toBe('mystery')
  })
  it('layers.json gives the title and the number of places of each collection', () => {
    expect(g.noaa_nerrs).toEqual({ title: 'NOAA National Estuarine Research Reserves', n: 30, geom: 'MultiPolygon' })
    expect(g.no_title).toEqual({ title: 'no_title', n: null, geom: null })
  })
  it('unreadable layers.json gives no layers', () => {
    expect(parseLayers(null)).toEqual({})
    expect(parseLayers({ layers: 'nope' })).toEqual({})
  })
  it('links to the gazetteer: a collection, and a place in it with its colons kept', () => {
    expect(gazetteerHref('noaa_nerrs')).toBe('https://oceanmetrics.io/places/?layers=noaa_nerrs')
    expect(gazetteerPlaceHref('noaa_nerrs', 'NERRS:WEL')).toBe('https://oceanmetrics.io/places/?layers=noaa_nerrs&place=NERRS:WEL')
    expect(gazetteerPlaceHref('boem_wind_leases', 'BOEM:OCS-A 0506')).toBe('https://oceanmetrics.io/places/?layers=boem_wind_leases&place=BOEM:OCS-A%200506')
  })
  it('a place name in the Matrix links to its record page on the places site, the colons kept', () => {
    expect(placesPageHref('NMS:CINMS')).toBe('https://oceanmetrics.io/places/p/NMS:CINMS')
    expect(placesPageHref('MR:8439/a')).toBe('https://oceanmetrics.io/places/p/MR:8439%2Fa')
  })
})

describe('loading', () => {
  it('bigint counts become numbers', () => {
    expect(normalizeRow({ n_periods: 12n, last_value: 1.5, place_id: 'x' }).n_periods).toBe(12)
  })
  it('a missing file names the file and the base in the error', async () => {
    const fake = (async (u: string) => ({ ok: !u.endsWith('coverage.parquet'), status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) })) as unknown as typeof fetch
    await expect(loadCatalog('http://localhost/c/', fake)).rejects.toThrow('coverage.parquet: HTTP 404 at http://localhost/c/')
  })
})
