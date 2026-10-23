// where the basemap's GEBCO and OpenStreetMap tiers are read from when they are on (`VITE_BASEMAP_DEM=1`). the package's
// DEFAULT_TILES name storage.oceanmetrics.io/basemap/, which answers 404 until `basemap` joins the storage host's allow-list
// (platform packages/map README, "Open"); the same objects answer range reads at the bucket's path-style url, so the tiers
// are read from there. plain data, tested; MapCanvas passes the result as composeStyle's `tiles`.
import type { BasemapTiles } from '@oceanmetrics/map'
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
