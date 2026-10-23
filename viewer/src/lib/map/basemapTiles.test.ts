import { describe, expect, it } from 'vitest'
import { BASEMAP_URL, basemapLayerIds, DEFAULT_TILES, LAND_LAYER, seaSurfaceId } from '@oceanmetrics/map'
import type { StyleSpecification } from 'maplibre-gl'
import { BASEMAP_BUCKET, basemapStyle, demOn, slotBefore, TILES, tilesAt } from './basemapTiles.ts'
import { store } from '../../../../src/storage.ts'
import { styleCredit } from './credit.ts'

// a small CARTO-shaped style (the protomaps schema since 2026): a background, the sea, a land layer, a road and two labels
const CARTO: StyleSpecification = {
  version: 8,
  sources: { carto: { type: 'vector', url: 'https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json', attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' } },
  glyphs: 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': 'rgb(250,250,248)' } },
    { id: 'landcover', type: 'fill', source: 'carto', 'source-layer': 'landcover', paint: { 'fill-color': 'rgb(238,238,238)' } },
    { id: 'park_national_park', type: 'fill', source: 'carto', 'source-layer': 'park', paint: { 'fill-color': 'rgb(224,238,221)' } },
    { id: 'water', type: 'fill', source: 'carto', 'source-layer': 'water', paint: { 'fill-color': 'rgb(212,218,220)' } },
    { id: 'water_shadow', type: 'fill', source: 'carto', 'source-layer': 'water', paint: { 'fill-color': 'rgb(212,218,220)' } },
    { id: 'road_major', type: 'line', source: 'carto', 'source-layer': 'transportation', paint: { 'line-color': 'white' } },
    { id: 'place_town', type: 'symbol', source: 'carto', 'source-layer': 'place', layout: { 'text-field': '{name}', 'text-font': ['Montserrat Medium'] } },
    { id: 'watername_ocean', type: 'symbol', source: 'carto', 'source-layer': 'water_name', layout: { 'text-field': '{name}', 'text-font': ['Montserrat Medium Italic'] } },
  ],
}
const ids = (s: StyleSpecification) => s.layers.map(l => l.id)

describe('the basemap tiers', () => {
  it('are read through the storage rule (store("basemap/")), every tier and the regional list', () => {
    expect(BASEMAP_BUCKET).toBe(store('basemap/'))
    const t = tilesAt(DEFAULT_TILES, BASEMAP_URL)
    expect(t).toEqual(TILES)
    expect(t.far).toBe(`${BASEMAP_BUCKET}gebco/far.pmtiles`)
    expect(t.core).toBe(`${BASEMAP_BUCKET}gebco/core.pmtiles`)
    expect(t.regional).toEqual([`${BASEMAP_BUCKET}gebco/core-sanctuaries.pmtiles`])
    expect(t.contours).toBe(`${BASEMAP_BUCKET}gebco/contours.pmtiles`)
    expect(t.names).toBe(`${BASEMAP_BUCKET}gebco/names.pmtiles`)
    expect(t.land).toBe(`${BASEMAP_BUCKET}osm/land.pmtiles`)
    expect(Object.values(t).flat().every(u => u == null || String(u).startsWith(BASEMAP_BUCKET))).toBe(true)
  })
  it('keeps a url from elsewhere and a null tier as they are', () => {
    expect(tilesAt({ core: 'https://x/c.pmtiles', far: `${BASEMAP_URL}f.pmtiles`, contours: null, names: null, land: null }, BASEMAP_URL))
      .toEqual({ core: 'https://x/c.pmtiles', far: `${BASEMAP_BUCKET}f.pmtiles`, regional: undefined, contours: null, names: null, land: null })
  })
})

describe('the tiers are on by default (Ben 2026-10-22: GEBCO goes everywhere)', () => {
  it('on unless the build says VITE_BASEMAP_DEM=0 or the hash bm=carto', () => {
    expect(demOn(undefined, null)).toBe(true)
    expect(demOn('', null)).toBe(true)
    expect(demOn('1', null)).toBe(true)
    expect(demOn(undefined, 'gebco')).toBe(true)
    expect(demOn('0', null)).toBe(false)
    expect(demOn('false', null)).toBe(false)
    expect(demOn(' OFF ', null)).toBe(false)
    expect(demOn(undefined, 'carto')).toBe(false)
    expect(demOn('1', 'carto')).toBe(false)
  })
})

describe('the composed style, both themes', () => {
  for (const theme of ['light', 'dark'] as const) {
    const s = basemapStyle(CARTO, theme, true)
    const src = s.sources as Record<string, { type: string; url?: string; attribution?: string }>
    it(`${theme}: every tier is a source, read as pmtiles:// on the storage host`, () => {
      expect(src['gebco-far']).toMatchObject({ type: 'raster-dem', url: `pmtiles://${BASEMAP_BUCKET}gebco/far.pmtiles` })
      expect(src['gebco']).toMatchObject({ type: 'raster-dem', url: `pmtiles://${BASEMAP_BUCKET}gebco/core.pmtiles` })
      expect(src['gebco-regional']).toMatchObject({ type: 'raster-dem', url: `pmtiles://${BASEMAP_BUCKET}gebco/core-sanctuaries.pmtiles` })
      expect(src['gebco-contours']).toMatchObject({ type: 'vector', url: `pmtiles://${BASEMAP_BUCKET}gebco/contours.pmtiles` })
      expect(src['gebco-names']).toMatchObject({ type: 'vector', url: `pmtiles://${BASEMAP_BUCKET}gebco/names.pmtiles` })
      expect(src['osm-land']).toMatchObject({ type: 'vector', url: `pmtiles://${BASEMAP_BUCKET}osm/land.pmtiles` })
    })
    it(`${theme}: the order: the sea, far under core under the regional tier, the isobaths, the land mask, then CARTO's land and its labels`, () => {
      const o = ids(s)
      const at = (id: string) => { const i = o.indexOf(id); expect(i, id).toBeGreaterThanOrEqual(0); return i }
      expect(at('background')).toBe(0)
      expect(at('water')).toBeLessThan(at('gebco-far-relief'))
      expect(at('gebco-far-relief')).toBeLessThan(at('gebco-far-shade'))
      expect(at('gebco-far-shade')).toBeLessThan(at('gebco-relief'))
      expect(at('gebco-relief')).toBeLessThan(at('gebco-regional-relief'))
      expect(at('gebco-regional-shade')).toBeLessThan(at('gebco-contour-0'))
      expect(at('gebco-contour-label')).toBeLessThan(at(LAND_LAYER))
      expect(at(LAND_LAYER)).toBeLessThan(at('water-inland'))
      expect(at('water-inland')).toBeLessThan(at('landcover'))
      expect(at('landcover')).toBeLessThan(at('road_major'))
      expect(at('road_major')).toBeLessThan(at('place_town'))
      expect(o.filter(id => id.startsWith('gebco-names')).every(id => at(id) > at(LAND_LAYER))).toBe(true)
      // the data's sea surface is the mask: a slot under it draws over the relief and under the coast
      expect(seaSurfaceId(s)).toBe(LAND_LAYER)
    })
    it(`${theme}: the credit line names GEBCO, OpenStreetMap and the IHO-IOC gazetteer (and CARTO)`, () => {
      const c = styleCredit(s)
      expect(c).toMatch(/^Basemap: /)
      expect(c).toContain('GEBCO Compilation Group (2025) GEBCO 2025 Grid')
      expect(c).toContain('© OpenStreetMap contributors')
      expect(c).toContain('IHO-IOC GEBCO Gazetteer of Undersea Feature Names')
      expect(c).toContain('CARTO')
      // each source's line once: three GEBCO terrain tiers and the contours share one line, and the land mask's OSM line is
      // inside CARTO's own
      expect(c.split('GEBCO 2025 Grid').length).toBe(2)
      expect(c.split('OpenStreetMap').length).toBe(2)
      expect(c).toBe('Basemap: © CARTO © OpenStreetMap contributors; GEBCO Compilation Group (2025) GEBCO 2025 Grid; IHO-IOC GEBCO Gazetteer of Undersea Feature Names')
    })
  }
  it('both themes have the same layer ids, so the clear() rule and a theme flip hold', () => {
    expect([...basemapLayerIds(basemapStyle(CARTO, 'light', true))]).toEqual([...basemapLayerIds(basemapStyle(CARTO, 'dark', true))])
  })
  it('dem false is CARTO as it is (the boot style and bm=carto): no tier, the credit is CARTO\'s alone', () => {
    const s = basemapStyle(CARTO, 'light', false)
    expect(ids(s)).toEqual(ids(CARTO))
    expect(Object.keys(s.sources)).toEqual(['carto'])
    expect(styleCredit(s)).toBe('Basemap: © CARTO © OpenStreetMap contributors')
  })
})

describe('where the grid slot goes (slotBefore)', () => {
  const ours = (s: StyleSpecification, extra: string[]) => ({ all: [...ids(s), ...extra], isOurs: (id: string) => !basemapLayerIds(s).has(id) })
  it('with the tiers: under the land mask, over the relief, whatever the parts drawn on top', () => {
    const s = basemapStyle(CARTO, 'dark', true)
    const { all, isOurs } = ours(s, ['p0:fill', 'p0:halo', 'p0:line', 'pick-ring'])
    expect(slotBefore(all, isOurs, seaSurfaceId(s))).toBe(LAND_LAYER)
    expect(all.indexOf(LAND_LAYER)).toBeGreaterThan(all.indexOf('gebco-contour-label'))
  })
  it('on CARTO\'s own style: under the first part\'s fill, else the first layer of ours, else the sea surface', () => {
    const s = basemapStyle(CARTO, 'light', false)
    const sea = seaSurfaceId(s)
    expect(slotBefore(ours(s, ['w0', 'p1:fill', 'p1:line']).all, ours(s, []).isOurs, sea)).toBe('p1:fill')
    expect(slotBefore(ours(s, ['w0']).all, ours(s, []).isOurs, sea)).toBe('w0')
    expect(slotBefore(ids(s), ours(s, []).isOurs, sea)).toBe(sea)
  })
  it('a stale land id (the mask named but not in the style) falls back to the parts', () => {
    const s = basemapStyle(CARTO, 'light', false)
    expect(slotBefore([...ids(s), 'p0:fill'], ours(s, []).isOurs, LAND_LAYER)).toBe('p0:fill')
  })
})
