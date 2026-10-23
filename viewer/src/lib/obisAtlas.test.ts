// "On the map" on an OBIS card (parity row 75): the atlas URL of the same EOV, indicator and period with the place selected.
// the CINMS case is the places Place page's, byte for byte (places web/src/lib/obisLink.test.ts), less its box camera.
import { describe, expect, it } from 'vitest'
import { ATLAS_INDICATOR, ATLAS_ITEM, OBIS_COLLECTION_HREF, obisAtlasUrl, placeToken } from './obisAtlas.ts'
import { store } from '../../../src/storage.ts'

const cinms = { id: 'NMS:CINMS', name: 'Channel Islands', lat: 33.725, lon: -119.75 }

describe('the atlas link of an OBIS card', () => {
  it('all taxa: the layer, the indicator, all years, the place by its token, the camera on its centre', () => {
    expect(obisAtlasUrl('obis:es50', cinms, { collection: '' })).toBe(
      'https://oceanmetrics.io/atlas/?c=obis_h3&i=all&dim.indicator=es&dim.period=all&res=auto&map=-119.75,33.725,6#pl=p.NMS%253ACINMS.Channel%2520Islands')
  })

  it('an EOV: the slug becomes the atlas item, the five metrics become dim.indicator', () => {
    const u = (id: string) => obisAtlasUrl(id, cinms, { collection: '' })!
    expect(u('obis:records:fish')).toContain('&i=fish&dim.indicator=n&')
    expect(u('obis:species:hard-corals')).toContain('&i=hardCorals&dim.indicator=sp&')
    expect(u('obis:shannon:marine-mammals')).toContain('&i=marineMammals&dim.indicator=shannon&')
    expect(u('obis:simpson:sea-turtles')).toContain('&i=seaTurtles&dim.indicator=simpson&')
    expect(u('obis:es50:seagrasses')).toContain('&i=seagrasses&dim.indicator=es&')
    expect(Object.keys(ATLAS_ITEM).length).toBe(7)
    expect(Object.keys(ATLAS_INDICATOR)).toEqual(['records', 'species', 'shannon', 'simpson', 'es50'])
  })

  it('a period is carried: a decade or a year', () => {
    expect(obisAtlasUrl('obis:species', cinms, { period: '1990s', collection: '' })).toContain('&dim.period=1990s&')
    expect(obisAtlasUrl('obis:species', cinms, { period: '2015', collection: '' })).toContain('&dim.period=2015&')
  })

  it('the metrics the atlas layer lacks, an unknown EOV and any other family have no link', () => {
    for (const id of ['obis:hill1', 'obis:hill2:fish', 'obis:bp', 'obis:density:seabirds', 'obis:species:corals', 'obis:records:fish:x', 'obis', 'sst', 'erddap:x:y']) {
      expect(obisAtlasUrl(id, cinms), id).toBeNull()
    }
  })

  it('carries the OBIS collection href, before the hash, until the atlas catalog lists obis_h3', () => {
    expect(OBIS_COLLECTION_HREF).toBe(store('obis-h3/collection.json'))
    expect(obisAtlasUrl('obis:records', cinms)!.split('#')[0]).toContain(`&collection=${OBIS_COLLECTION_HREF}`)
  })

  it('no centre, no camera; a centre off the globe, no camera; another app', () => {
    expect(obisAtlasUrl('obis:records', { id: 'NMS:CINMS' }, { collection: '' })).not.toContain('map=')
    expect(obisAtlasUrl('obis:records', { ...cinms, lat: 95 }, { collection: '' })).not.toContain('map=')
    expect(obisAtlasUrl('obis:records', cinms, { app: 'https://staging.example/atlas', collection: '' })!.startsWith('https://staging.example/atlas/?c=obis_h3&')).toBe(true)
  })

  it('a place across 180 keeps its centre longitude; a name with a space and a colon is encoded as the atlas does', () => {
    expect(obisAtlasUrl('obis:records', { id: 'NMS:PMNM', name: 'A B', lat: 25, lon: -175.5 }, { collection: '' })).toContain('map=-175.5,25,6#pl=p.NMS%253APMNM.A%2520B')
  })
})

describe('the place token', () => {
  it('is p.<id>.<name>, the id at most 120 encoded characters, the name at most 60, never half a character', () => {
    expect(placeToken('NMS:CINMS', ' Channel Islands ')).toBe('p.NMS%3ACINMS.Channel%20Islands')
    expect(placeToken('x'.repeat(121))).toBeNull()
    expect(placeToken('')).toBeNull()
    expect(placeToken('A', 'é'.repeat(40))!.split('.')[2].length).toBeLessThanOrEqual(60)
    expect(placeToken('A', 'é'.repeat(40))!.split('.')[2]).toBe('%C3%A9'.repeat(10))
  })
})
