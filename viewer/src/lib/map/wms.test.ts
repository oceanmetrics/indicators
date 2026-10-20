// the Marine Regions WMS requests: exact pieces, and the length of the biggest request (all 285 EEZs, five classes)
import { describe, expect, it } from 'vitest'
import { MAX_ONLY, envString, infoUrl, layerName, mrgidOf, onlyMrgids, sldBody, wmsEndpoint, wmsTileUrl } from './wms.ts'

const RASTER = {
  tiles: ['https://geo.vliz.be/geoserver/MarineRegions/gwc/service/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=eez&STYLE=&TILEMATRIXSET=EPSG:900913&TILEMATRIX=EPSG:900913:{z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png'],
  info_url: 'https://geo.vliz.be/geoserver/MarineRegions/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&LAYERS=MarineRegions:eez&QUERY_LAYERS=MarineRegions:eez&STYLES=&SRS=EPSG:4326&BBOX={bbox}&WIDTH=101&HEIGHT=101&X=50&Y=50&INFO_FORMAT=application/json&FEATURE_COUNT=5&PROPERTYNAME=mrgid,geoname',
  info_id: 'mrgid',
}
const COLORS = ['rgb-1', 'rgb-2', 'rgb-3', 'rgb-4', 'rgb-5']
const LINE = 'line-colour'

describe('the layer', () => {
  it('is named by the LAYER= of the WMTS URL, and drawn by the WMS beside it', () => {
    expect(layerName(RASTER)).toBe('eez')
    expect(wmsEndpoint(RASTER)).toBe('https://geo.vliz.be/geoserver/MarineRegions/wms')
  })
  it('a raster without a LAYER= is an error, not a guess', () => {
    expect(() => layerName({ tiles: ['https://x/y?A=1'] })).toThrow(/LAYER/)
    expect(() => wmsEndpoint({ tiles: ['https://x/wms?LAYER=a'] })).toThrow(/WMTS/)
  })
  it('a place id carries the mrgid only on the MRGID authority', () => {
    expect(mrgidOf('MRGID:8456')).toBe('8456')
    expect(mrgidOf('NMS:FKNMS')).toBeNull()
    expect(mrgidOf('MRGID:abc')).toBeNull()
  })
})

describe('ENV', () => {
  it('lists the places that have a class, as m<mrgid>:<class>', () => {
    expect(envString([{ id: '8456', k: 0 }, { id: '8493', k: 1 }, { id: '5680', k: null }])).toBe('m8456:0;m8493:1')
    expect(envString([])).toBe('')
  })
})

describe('the SLD', () => {
  const sld = sldBody('eez', 'mrgid', ['red', 'blue'], 'grey', LINE)
  it('names the layer it styles', () => {
    expect(sld).toContain('<NamedLayer><Name>eez</Name>')
  })
  it('outlines the places with no class and gives them no fill', () => {
    const none = sld.split('<Rule>')[1]
    expect(none).toContain('<ogc:Literal>x</ogc:Literal></ogc:PropertyIsEqualTo>')
    expect(none).toContain('<CssParameter name="stroke">grey</CssParameter>')
    expect(none).not.toContain('name="fill"')
  })
  it('fills the others by a Recode of their ENV value, in class order, at 85 % opacity', () => {
    const fill = sld.split('<Rule>')[2]
    expect(fill).toContain('<ElseFilter/>')
    expect(fill).toContain('<ogc:Literal>0</ogc:Literal><ogc:Literal>red</ogc:Literal><ogc:Literal>1</ogc:Literal><ogc:Literal>blue</ogc:Literal></ogc:Function>')
    expect(fill).toContain('<ogc:Function name="env"><ogc:Function name="strConcat"><ogc:Literal>m</ogc:Literal><ogc:PropertyName>mrgid</ogc:PropertyName>')
    expect(fill).toContain('<CssParameter name="fill-opacity">0.85</CssParameter>')
  })
})

describe('the tile URL', () => {
  const url = wmsTileUrl(RASTER, [{ id: '8456', k: 0 }, { id: '8493', k: 1 }], COLORS.slice(0, 2), 'grey', LINE)
  it('is a GetMap in web mercator with MapLibre’s bbox placeholder and the classes in ENV', () => {
    expect(url.startsWith('https://geo.vliz.be/geoserver/MarineRegions/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=eez&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true&SLD_BODY=')).toBe(true)
    expect(url.endsWith('&ENV=m8456:0;m8493:1')).toBe(true)
  })
  it('the SLD is URL-encoded: the only braces left are the placeholder’s', () => {
    expect(url.match(/[{}]/g)).toEqual(['{', '}'])
    expect(url).not.toContain('<')
    expect(url).toContain('rgb-1')
  })
  it('all 285 EEZs in five classes fit a request under 7,500 characters', () => {
    const entries = Array.from({ length: 285 }, (_, i) => ({ id: String(5000 + i * 7), k: i % 5 }))
    const big = wmsTileUrl(RASTER, entries, COLORS, 'grey', LINE)
    expect(big.length).toBeLessThan(7500)
  })
})

describe('GetFeatureInfo', () => {
  it('puts a box of about 101 px round the click in the template', () => {
    const u = infoUrl(RASTER, -122.5, 37.5, 4)
    const bbox = /BBOX=([^&]+)/.exec(u)![1].split(',').map(Number)
    const d = (50.5 * 360) / (256 * 16)
    expect(bbox).toEqual([-122.5 - d, 37.5 - d, -122.5 + d, 37.5 + d].map(x => Number(x.toFixed(6))))
    expect(u).toContain('INFO_FORMAT=application/json')
  })
  it('wraps a longitude beyond 180 and clamps the latitude', () => {
    const bbox = /BBOX=([^&]+)/.exec(infoUrl(RASTER, 190, 89.99, 6))![1].split(',').map(Number)
    // 190 wraps to -170, and the box is 50.5 px (about 1.11 degrees) wide each way at zoom 6
    expect(bbox[0]).toBeCloseTo(-170 - (50.5 * 360) / (256 * 64), 5)
    expect(bbox[3]).toBe(90)
  })
})

describe('the SLD under a layer of ours (a place set)', () => {
  const sld = sldBody('eez', 'mrgid', ['red', 'blue'], 'grey', LINE, 'tint')
  it('fills the places with no class with the no-data colour, opaque, before their outline', () => {
    const none = sld.split('<Rule>')[1]
    expect(none).toContain('<PolygonSymbolizer><Fill><CssParameter name="fill">tint</CssParameter><CssParameter name="fill-opacity">1</CssParameter></Fill><Stroke>')
  })
  it('fills the classes fully opaque, so what is drawn below does not show through', () => {
    const fill = sld.split('<Rule>')[2]
    expect(fill).toContain('<CssParameter name="fill-opacity">1</CssParameter>')
    expect(fill).not.toContain('0.85')
  })
  it('without the no-data colour the SLD is the single-group one, byte for byte', () => {
    expect(sldBody('eez', 'mrgid', ['red', 'blue'], 'grey', LINE, null)).toBe(sldBody('eez', 'mrgid', ['red', 'blue'], 'grey', LINE))
  })
  it('the tile URL carries it', () => {
    const url = wmsTileUrl(RASTER, [{ id: '8456', k: 0 }], COLORS.slice(0, 1), 'grey', LINE, 'mrgid', 'tint')
    expect(decodeURIComponent(url.split('SLD_BODY=')[1].split('&ENV=')[0])).toContain('<CssParameter name="fill">tint</CssParameter>')
  })
})

describe('the SLD restricted to the places of the selection', () => {
  const base = sldBody('eez', 'mrgid', ['red', 'blue'], 'grey', LINE)
  const one = sldBody('eez', 'mrgid', ['red', 'blue'], 'grey', LINE, null, ['8456'])
  const two = sldBody('eez', 'mrgid', ['red', 'blue'], 'grey', LINE, null, ['8456', '8493'])
  it('without `only` the SLD is the whole-layer one, byte for byte', () => {
    expect(sldBody('eez', 'mrgid', ['red', 'blue'], 'grey', LINE, null, null)).toBe(base)
    expect(sldBody('eez', 'mrgid', ['red', 'blue'], 'grey', LINE, null, [])).toBe(base)
    expect(base).toContain('<ElseFilter/>')
  })
  it('both rules are filtered to the ids; the else rule becomes an explicit "has an entry" rule', () => {
    const eq = (id: string) => `<ogc:PropertyIsEqualTo><ogc:PropertyName>mrgid</ogc:PropertyName><ogc:Literal>${id}</ogc:Literal></ogc:PropertyIsEqualTo>`
    expect(one).not.toContain('<ElseFilter/>')
    const [, none, fill] = one.split('<Rule>')
    expect(none).toContain(`<ogc:And><ogc:PropertyIsEqualTo><ogc:Function name="env">`)
    expect(none).toContain(eq('8456') + '</ogc:And></ogc:Filter>')
    expect(fill).toContain('<ogc:And><ogc:Not>')
    expect(fill).toContain(eq('8456') + '</ogc:And></ogc:Filter>')
    expect(two.split('<Rule>')[1]).toContain(`<ogc:Or>${eq('8456')}${eq('8493')}</ogc:Or>`)
  })
  it('onlyMrgids: the digits of the MRGID place ids; none when there are none, or too many for the request', () => {
    expect(onlyMrgids(['MRGID:8456', 'NMS:A', 'MRGID:8493'])).toEqual(['8456', '8493'])
    expect(onlyMrgids(['NMS:A'])).toBeNull()
    expect(onlyMrgids(null)).toBeNull()
    expect(onlyMrgids(Array.from({ length: MAX_ONLY }, (_, n) => `MRGID:${n}`))).toHaveLength(MAX_ONLY)
    expect(onlyMrgids(Array.from({ length: MAX_ONLY + 1 }, (_, n) => `MRGID:${n}`))).toBeNull()
  })
  it('the tile URL carries it', () => {
    const url = wmsTileUrl(RASTER, [{ id: '8456', k: 0 }], COLORS.slice(0, 1), 'grey', LINE, 'mrgid', null, ['8456'])
    expect(decodeURIComponent(url.split('SLD_BODY=')[1].split('&ENV=')[0])).toContain('<ogc:Literal>8456</ogc:Literal></ogc:PropertyIsEqualTo></ogc:And>')
  })
})
