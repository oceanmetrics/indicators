import { describe, expect, it } from 'vitest'
import { collectionUrl, erddapTileUrl, erddapTitle, erddapWmsUrl, isoInstant, layerChoices, parseErddapCollection, slotLegendLine, sourceRow, tileRequest } from './erddapWms.ts'
import type { ErddapCollection } from './erddapWms.ts'
import type { Indicator } from '../data.ts'

// a trimmed copy of the gazetteer's erddap/dhw_5km/collection.json
const DHW = {
  type: 'Collection', id: 'erddap/dhw_5km', title: 'NOAA Coral Reef Watch — Daily Global 5km SST + DHW', license: 'CC0-1.0',
  providers: [
    { name: 'NOAA Coral Reef Watch (CRW)', roles: ['producer', 'licensor'] },
    { name: 'Ocean Metrics LLC', roles: ['processor'] },
    { name: 'PacIOOS (Pacific Islands Ocean Observing System)', roles: ['host'] },
  ],
  'cube:variables': {
    CRW_SST: { dimensions: ['time', 'latitude', 'longitude'], type: 'data', unit: 'Celsius', description: 'sea surface temperature' },
    CRW_BAA: { type: 'data', unit: '1', description: 'bleaching alert area (categorical, 0-4)' },
    crs: { type: 'auxiliary' },
  },
  'erddap:base_url': 'https://pae-paha.pacioos.hawaii.edu/erddap/',
  'erddap:dataset_id': 'dhw_5km',
}
const coll = parseErddapCollection(DHW) as ErddapCollection

describe('the gazetteer collection of an ERDDAP dataset', () => {
  it('is read for its server, dataset, data variables, producers and licence', () => {
    expect(coll).toEqual({
      id: 'erddap/dhw_5km', title: 'NOAA Coral Reef Watch — Daily Global 5km SST + DHW', baseUrl: 'https://pae-paha.pacioos.hawaii.edu/erddap', datasetId: 'dhw_5km',
      variables: [{ name: 'CRW_SST', description: 'sea surface temperature', unit: 'Celsius' }, { name: 'CRW_BAA', description: 'bleaching alert area (categorical, 0-4)', unit: '1' }],
      producers: ['NOAA Coral Reef Watch (CRW)'], license: 'CC0-1.0',
    })
    expect(collectionUrl('jplMURSST41mday')).toBe('https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/erddap/jplMURSST41mday/collection.json')
  })
  it('is nothing without an ERDDAP server', () => {
    expect(parseErddapCollection({ id: 'places', title: 'Places' })).toBeNull()
    expect(parseErddapCollection(null)).toBeNull()
  })
})

describe('the WMS tile URL', () => {
  it('is the dataset\'s own GetMap at the period start of t, as an ISO instant', () => {
    expect(erddapWmsUrl(coll, 'CRW_SST', '2024-07-01')).toBe(
      'https://pae-paha.pacioos.hawaii.edu/erddap/wms/dhw_5km/request?service=WMS&version=1.3.0&request=GetMap&layers=dhw_5km:CRW_SST' +
      '&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png&transparent=true&time=2024-07-01T00:00:00Z')
  })
  it('asks for no time when there is no period (ERDDAP draws its latest)', () => {
    expect(erddapWmsUrl(coll, 'CRW_SST', null)).toBe(
      'https://pae-paha.pacioos.hawaii.edu/erddap/wms/dhw_5km/request?service=WMS&version=1.3.0&request=GetMap&layers=dhw_5km:CRW_SST' +
      '&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png&transparent=true')
  })
  it('goes to MapLibre through the erddapwms:// protocol', () => {
    expect(erddapTileUrl(coll, 'CRW_SST', null)).toBe('erddapwms://' + erddapWmsUrl(coll, 'CRW_SST', null))
  })
  it('a period start is an ISO instant at midnight UTC', () => {
    expect(isoInstant('2024-07-01')).toBe('2024-07-01T00:00:00Z')
    expect(isoInstant('2024')).toBe('2024-01-01T00:00:00Z')
    expect(isoInstant('2010-01-01')).toBe('2010-01-01T00:00:00Z')
  })
})

describe('the request a tile becomes (ERDDAP draws CRS:84 only)', () => {
  it('swaps the Mercator box for the tile\'s lon/lat box, the rest of the URL as it was', () => {
    // tile z1 x0 y0: the north-west quarter of the world
    const t = tileRequest(erddapTileUrl(coll, 'CRW_SST', '2024-07-01').replace('{bbox-epsg-3857}', '-20037508.342789244,0,0,20037508.342789244'))
    expect(t).toEqual({
      url: 'https://pae-paha.pacioos.hawaii.edu/erddap/wms/dhw_5km/request?service=WMS&version=1.3.0&request=GetMap&layers=dhw_5km:CRW_SST' +
        '&crs=CRS:84&bbox=-180,0,0,85.051129&width=256&height=256&format=image/png&transparent=true&time=2024-07-01T00:00:00Z',
      west: -180, south: 0, east: 0, north: 85.051129, width: 256, height: 256,
    })
  })
  it('is nothing for another URL or a box that is not four numbers', () => {
    expect(tileRequest('https://example.org/wms?bbox=0,0,1,1')).toBeNull()
    expect(tileRequest('erddapwms://https://example.org/wms?bbox={bbox-epsg-3857}')).toBeNull()
  })
})

describe('the rows of a tile', () => {
  it('a Mercator row shows the lon/lat row of its own latitude', () => {
    // over 0..85.05 N the middle of a Mercator tile is 66.6 N: row 55 of 256 of an even-latitude picture ((85.05 - 66.6) / 85.05 * 256)
    expect(sourceRow(127, 256, 85.051129, 0, 256)).toBe(55)
    expect(sourceRow(0, 256, 85.051129, 0, 256)).toBe(0)
    expect(sourceRow(255, 256, 85.051129, 0, 256)).toBe(254)
  })
  it('over a small box Mercator and lon/lat rows nearly agree', () => {
    for (const y of [0, 64, 128, 192, 255]) expect(Math.abs(sourceRow(y, 256, 35.1, 34.9, 256) - y)).toBeLessThanOrEqual(1)
  })
})

describe('the picker\'s choices (Layer under the map)', () => {
  const ind = (id: string, short: string, ds: string, title: string) => ({ id, short, dataset: { id: ds, title, providers: [] } }) as unknown as Pick<Indicator, 'id' | 'short' | 'dataset'>
  const inds = [
    ind('erddap:moda_npp_mo_glob:npp:mean', 'NPP', 'moda_npp_mo_glob', 'MODIS-Aqua net primary productivity'),
    ind('erddap:dhw_5km:CRW_SST:mean', 'SST', 'dhw_5km', 'NOAA Coral Reef Watch'),
    ind('erddap:dhw_5km:CRW_BAA:share', 'Bleaching alert', 'dhw_5km', 'NOAA Coral Reef Watch'),
    ind('erddap:cmems_salinity:so:mean', 'Salinity', 'cmems_salinity', 'CMEMS salinity'),
    ind('obis:species', 'Species', 'obis', 'OBIS'),
  ]
  it('none, then the dataset of the indicator shown, then the others by title, one entry per variable', () => {
    expect(layerChoices(inds, inds[0], null)).toEqual([
      { value: '', label: 'None' },
      { value: 'erddap:moda_npp_mo_glob:npp', label: 'NPP (npp)', group: 'MODIS-Aqua net primary productivity' },
      { value: 'erddap:cmems_salinity:so', label: 'Salinity (so)', group: 'CMEMS salinity' },
      { value: 'erddap:dhw_5km:CRW_SST', label: 'SST (CRW_SST)', group: 'NOAA Coral Reef Watch' },
      { value: 'erddap:dhw_5km:CRW_BAA', label: 'Bleaching alert (CRW_BAA)', group: 'NOAA Coral Reef Watch' },
    ])
  })
  it('an indicator that is not from ERDDAP puts no dataset first', () => {
    expect(layerChoices(inds, inds[4], null).map(c => c.value)).toEqual(['', 'erddap:cmems_salinity:so', 'erddap:moda_npp_mo_glob:npp', 'erddap:dhw_5km:CRW_SST', 'erddap:dhw_5km:CRW_BAA'])
  })
  it('a layer the link names that is not listed comes after none', () => {
    expect(layerChoices(inds, inds[1], 'erddap:jplMURSST41mday:sst').slice(0, 3)).toEqual([
      { value: '', label: 'None' },
      { value: 'erddap:jplMURSST41mday:sst', label: 'jplMURSST41mday (sst)', group: 'From the link' },
      { value: 'erddap:dhw_5km:CRW_SST', label: 'SST (CRW_SST)', group: 'NOAA Coral Reef Watch' },
    ])
    expect(layerChoices(inds, inds[1], 'erddap:dhw_5km:CRW_SST')).toHaveLength(5)
  })
})

describe('the legend line', () => {
  const period = (t: string) => `period ${t}`
  it('names the layer, the period and how it is drawn', () => {
    expect(erddapTitle(coll, 'CRW_SST')).toBe('Sea surface temperature from NOAA Coral Reef Watch — Daily Global 5km SST + DHW')
    expect(erddapTitle(coll, 'CRW_HOTSPOT')).toBe('CRW_HOTSPOT from NOAA Coral Reef Watch — Daily Global 5km SST + DHW')
    expect(slotLegendLine({ title: 'Sea surface temperature from CRW', t: '2024-07-01', via: 'ERDDAP WMS, provisional until the renderer of build week 2 (2026-11-06 to 11-12)', problem: null }, period))
      .toBe('Layer: Sea surface temperature from CRW at period 2024-07-01 · ERDDAP WMS, provisional until the renderer of build week 2 (2026-11-06 to 11-12)')
  })
  it('says when no tiles came back, and the latest time when there is no period', () => {
    expect(slotLegendLine({ title: 'X', t: null, via: 'ERDDAP WMS', problem: 'no tiles from example.org' }, period)).toBe('Layer: X at the latest time · ERDDAP WMS · no tiles from example.org')
  })
})
