import { describe, expect, it } from 'vitest'
import { absoluteBase, collTitle, layerTitles, loadCatalog, normalizeRow, resolveDataBase } from './data.ts'

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
  it('the short built-in name wins, then the gazetteer title, then the slug', () => {
    const g = layerTitles({ layers: [{ slug: 'mr_eez', title: 'Marine Regions EEZ' }, { slug: 'x', collection: 'noaa_sanctuaries', title: 'NOAA sanctuaries' }, { slug: 'no_title' }] })
    expect(g).toEqual({ mr_eez: 'Marine Regions EEZ', noaa_sanctuaries: 'NOAA sanctuaries' })
    expect(collTitle('mr_eez', g)).toBe('Exclusive Economic Zones')
    expect(collTitle('mr_high_seas')).toBe('High seas')
    expect(collTitle('noaa_sanctuaries', g)).toBe('NOAA sanctuaries')
    expect(collTitle('places', g)).toBe('Sanctuaries and other places')
    expect(collTitle('mystery', g)).toBe('mystery')
  })
  it('unreadable layers.json gives no titles', () => {
    expect(layerTitles(null)).toEqual({})
    expect(layerTitles({ layers: 'nope' })).toEqual({})
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
