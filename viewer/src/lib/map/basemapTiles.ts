// the basemap's rules, plain and tested; MapCanvas only calls them. the GEBCO 2025 sea floor (colour relief and hillshade),
// the isobaths, the OSM land mask and the GEBCO undersea names go on every map by default (Ben 2026-10-22: the bathymetric
// basemap is global and goes everywhere), in both themes, composed into CARTO's style by `@oceanmetrics/map` `composeStyle`.
// the tiers are read through the storage rule (`store('basemap/')`), so they follow `DEFAULT_STORAGE_HOST` (and
// VITE_OM_STORAGE / data-om-storage) like every other bucket url of the app. `VITE_BASEMAP_DEM=0` at build time turns
// them off; the Map's `bm=carto` hash key draws CARTO's own style.
import { BASEMAP_URL, composeStyle, DEFAULT_TILES, LAND_LAYER, slotBeforeId } from '@oceanmetrics/map'
import type { BasemapTiles, Theme } from '@oceanmetrics/map'
import type { StyleSpecification } from 'maplibre-gl'
import { store } from '../../../../src/storage.ts'

export const BASEMAP_BUCKET = store('basemap/')

/** every tier url under `from` moved under `to` (the regional list too); a null tier stays null */
export function tilesAt(tiles: Readonly<BasemapTiles>, from: string, to: string = BASEMAP_BUCKET): BasemapTiles {
  const move = (u: string) => (u.startsWith(from) ? to + u.slice(from.length) : u)
  const opt = (u: string | null) => (u == null ? null : move(u))
  return {
    core: move(tiles.core), far: move(tiles.far), regional: tiles.regional?.map(move),
    contours: opt(tiles.contours), names: opt(tiles.names), land: opt(tiles.land),
  }
}

/** the package's tiers on this build's storage host */
export const TILES: BasemapTiles = tilesAt(DEFAULT_TILES, BASEMAP_URL)

/** the basemap a map draws: `gebco` (CARTO with the GEBCO tiers, the default) or `carto` (CARTO's own style) */
export type BasemapKind = 'gebco' | 'carto'

/** the tiers are on unless the build says `VITE_BASEMAP_DEM=0` (or `false`, `off`) or the hash asks for `bm=carto` */
export function demOn(env: string | undefined, bm: BasemapKind | null | undefined): boolean {
  if (bm === 'carto') return false
  return !['0', 'false', 'off'].includes(String(env ?? '').trim().toLowerCase())
}

/** CARTO's style of a theme, composed with the tiers (dem true) or as it is (dem false, the boot style: MapLibre schedules
 * no frame while a source fails, so the first paint never waits on the terrain tiers) */
export const basemapStyle = (base: StyleSpecification, theme: Theme, dem: boolean, tiles: BasemapTiles = TILES): StyleSpecification =>
  composeStyle(base, { theme, dem, tiles })

/**
 * where the grid slot (and the compare slot, mounted at the same id just above it) goes: under the land mask when the
 * style has one, so the slice draws over the relief and the isobaths and under the coast, which is the mask's at every
 * zoom (as the Place page does); else (CARTO's own style) under the first part's fill, else under the first layer of
 * ours, else under the sea surface (`slotBeforeId`)
 */
export function slotBefore(styleIds: readonly string[], isOurs: (id: string) => boolean, sea: string | null): string | null {
  if (sea === LAND_LAYER && styleIds.includes(LAND_LAYER)) return LAND_LAYER
  return slotBeforeId(styleIds.filter(isOurs), { fallback: sea })
}
