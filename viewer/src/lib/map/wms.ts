// drawing a reference collection (Marine Regions EEZs) without hosting its geometry: Marine Regions' own WMS draws each
// tile, and a styled-layer-descriptor (SLD_BODY) colours each place by its class, read from the request's ENV
// variables (`m<mrgid>:<class>`). a place with no class has no ENV entry, matches the first rule and is outlined with
// no fill. pure functions, tested for the exact URL.
import type { RasterRef } from './gazetteer.ts'

/** the GeoServer layer a gazetteer raster row names: the LAYER= of its tile URL ("eez") */
export function layerName(raster: Pick<RasterRef, 'tiles'>): string {
  const m = /[?&]LAYER=([^&]+)/i.exec(raster.tiles[0] ?? '')
  if (!m) throw new Error('the raster layer names no LAYER=')
  return decodeURIComponent(m[1])
}

/** the WMS endpoint beside the layer's WMTS endpoint (…/geoserver/MarineRegions/gwc/service/wmts → …/wms) */
export function wmsEndpoint(raster: Pick<RasterRef, 'tiles'>): string {
  const u = (raster.tiles[0] ?? '').split('?')[0]
  if (!u.includes('/gwc/service/wmts')) throw new Error('the raster layer is not a GeoServer WMTS layer')
  return u.replace('/gwc/service/wmts', '/wms')
}

/** the id of a place on the Marine Regions layer: "MRGID:8456" -> "8456"; null for any other authority */
export function mrgidOf(placeId: string): string | null {
  const m = /^MRGID:(\d+)$/.exec(placeId)
  return m ? m[1] : null
}

export interface WmsEntry {
  /** the layer's id for the place (the mrgid, as digits) */
  id: string
  /** the class index into the colours, null = no class */
  k: number | null
}

/** `m8456:0;m8493:1`: the classes of the places that have one */
export function envString(entries: WmsEntry[]): string {
  return entries.filter(e => e.k != null).map(e => `m${e.id}:${e.k}`).join(';')
}

const OGC_ENV =
  (idField: string) =>
    `<ogc:Function name="env"><ogc:Function name="strConcat"><ogc:Literal>m</ogc:Literal><ogc:PropertyName>${idField}</ogc:PropertyName></ogc:Function><ogc:Literal>x</ogc:Literal></ogc:Function>`

/**
 * the SLD: rule one outlines the places with no ENV entry (no fill, so the basemap shows); the else rule fills the
 * rest with the colour of their class, a Recode over the ENV value, 85 % opaque, with a thin line round it.
 */
export function sldBody(layer: string, idField: string, colors: string[], noneStroke: string, lineStroke: string, noneFill: string | null = null): string {
  const env = OGC_ENV(idField)
  // under a layer of ours (a place set draws the FAO areas below the EEZs): every fill is opaque and the places with no class are
  // filled too, with the colour `noneFill`, so nothing below shows through them
  const opacity = noneFill ? '1' : '0.85'
  const noneRule = noneFill ? `<Fill><CssParameter name="fill">${noneFill}</CssParameter><CssParameter name="fill-opacity">1</CssParameter></Fill>` : ''
  const recode = `<ogc:Function name="Recode">${env}${colors.map((c, k) => `<ogc:Literal>${k}</ogc:Literal><ogc:Literal>${c}</ogc:Literal>`).join('')}</ogc:Function>`
  return `<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"><NamedLayer><Name>${layer}</Name><UserStyle><FeatureTypeStyle>` +
    `<Rule><ogc:Filter><ogc:PropertyIsEqualTo>${env}<ogc:Literal>x</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>` +
    `<PolygonSymbolizer>${noneRule}<Stroke><CssParameter name="stroke">${noneStroke}</CssParameter><CssParameter name="stroke-width">0.8</CssParameter></Stroke></PolygonSymbolizer></Rule>` +
    `<Rule><ElseFilter/><PolygonSymbolizer><Fill><CssParameter name="fill">${recode}</CssParameter><CssParameter name="fill-opacity">${opacity}</CssParameter></Fill>` +
    `<Stroke><CssParameter name="stroke">${lineStroke}</CssParameter><CssParameter name="stroke-width">0.5</CssParameter></Stroke></PolygonSymbolizer></Rule>` +
    `</FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>`
}

/** the characters of a `;`-and-`:` separated ENV value stay readable: they are legal in a query string */
const encEnv = (s: string) => encodeURIComponent(s).replace(/%3A/gi, ':').replace(/%3B/gi, ';')

/**
 * a MapLibre raster tile URL: one WMS GetMap per 256-px tile (`{bbox-epsg-3857}` is MapLibre's), the places coloured by
 * their class. colours are resolved CSS colours read from the theme's tokens, in class order.
 */
export function wmsTileUrl(
  raster: Pick<RasterRef, 'tiles'>, entries: WmsEntry[], colors: string[], noneStroke: string, lineStroke: string, idField = 'mrgid', noneFill: string | null = null,
): string {
  const layer = layerName(raster)
  const q = [
    'SERVICE=WMS', 'VERSION=1.1.1', 'REQUEST=GetMap', `LAYERS=${layer}`, 'STYLES=', 'SRS=EPSG:3857', 'BBOX={bbox-epsg-3857}',
    'WIDTH=256', 'HEIGHT=256', 'FORMAT=image/png', 'TRANSPARENT=true',
    `SLD_BODY=${encodeURIComponent(sldBody(layer, idField, colors, noneStroke, lineStroke, noneFill))}`,
    `ENV=${encEnv(envString(entries))}`,
  ]
  return `${wmsEndpoint(raster)}?${q.join('&')}`
}

/** a click as a GetFeatureInfo URL: the layer's template with a box of about 101 px round the point at this zoom */
export function infoUrl(raster: Pick<RasterRef, 'info_url'>, lng: number, lat: number, zoom = 4): string {
  const d = (50.5 * 360) / (256 * 2 ** zoom)
  const w = ((lng + 540) % 360) - 180
  const r = (x: number) => Number(x.toFixed(6))
  const box = [r(w - d), r(Math.max(-90, lat - d)), r(w + d), r(Math.min(90, lat + d))].join(',')
  return raster.info_url.replace('{bbox}', box)
}
