import { describe, expect, it } from 'vitest'
import { BASEMAP_URL, DEFAULT_TILES } from '@oceanmetrics/map'
import { BASEMAP_BUCKET, tilesAt } from './basemapTiles.ts'

describe('the basemap tiers when they are on', () => {
  it('are read from the bucket\'s path-style url, every tier and the regional list', () => {
    const t = tilesAt(DEFAULT_TILES, BASEMAP_URL)
    expect(t.far).toBe(`${BASEMAP_BUCKET}gebco/far.pmtiles`)
    expect(t.core).toBe(`${BASEMAP_BUCKET}gebco/core.pmtiles`)
    expect(t.regional).toEqual([`${BASEMAP_BUCKET}gebco/core-sanctuaries.pmtiles`])
    expect(t.land).toBe(`${BASEMAP_BUCKET}osm/land.pmtiles`)
    expect(Object.values(t).flat().every(u => u == null || String(u).startsWith(BASEMAP_BUCKET))).toBe(true)
  })
  it('keeps a url from elsewhere and a null tier as they are', () => {
    expect(tilesAt({ core: 'https://x/c.pmtiles', far: `${BASEMAP_URL}f.pmtiles`, contours: null, names: null, land: null }, BASEMAP_URL))
      .toEqual({ core: 'https://x/c.pmtiles', far: `${BASEMAP_BUCKET}f.pmtiles`, regional: undefined, contours: null, names: null, land: null })
  })
})
