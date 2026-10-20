// what the Map draws, as parts: one per place group. a place set is several parts layered (the vector and derived groups
// first, the reference/WMS groups on top). a derived group (the high seas by FAO area) has no tiles of its own: each place is
// the feature of another layer (`display.via`, the FAO major areas), found by the place's `display_id`; only those features are
// drawn, coloured by the value of their place, and a click on one selects the place, not the FAO area. plain functions, so the
// rules are tested without a map.
import type { Place } from '../matrix.ts'
import { unionBoxes } from './bounds.ts'
import type { MapItem } from './classes.ts'
import type { GazLayer } from './gazetteer.ts'

export interface MapPart {
  group: string
  /** how it is drawn: PMTiles features, or the publisher's WMS */
  kind: 'vector' | 'raster'
  /** the layer whose tiles draw it: the group's own, or for a derived group the layer `via` */
  layer: GazLayer
  /** the group's own gazetteer layer (its extent and credit) */
  home: GazLayer
  derived: boolean
  /** feature id -> class index (vector, derived: the id of the feature, `place_id` of the tiles; raster: the place id) */
  classOf: Map<string, number>
  /** the computed features of a vector part; its other members are drawn faint (a reference part draws them in the "no data" class) */
  known: string[]
  /** derived: the only features drawn (the pieces of the group); null = every feature of the layer */
  only: string[] | null
  /** derived: feature id <-> place id */
  toPlace: Map<string, string> | null
  toFeature: Map<string, string> | null
  /** fills fully opaque, and a reference part fills the places with no class too, so a part drawn under it never shows through */
  opaque: boolean
}

/** the layer whose tiles draw a group's layer: itself, or its `via` for a derived layer (a vector layer with PMTiles); null when it cannot be drawn */
export function drawLayer(group: GazLayer, all: Record<string, GazLayer>): GazLayer | null {
  if (group.kind === 'raster') return group.raster ? group : null
  if (group.kind === 'derived') {
    const via = group.display ? all[group.display.via] : undefined
    return via && via.kind === 'vector' && via.pmtiles && via.source_layer ? via : null
  }
  return group.pmtiles && group.source_layer ? group : null
}

export interface PartsResult {
  parts: MapPart[]
  /** the groups that cannot be drawn (no layer, or a derived layer whose `via` cannot be drawn) */
  missing: string[]
}

/** vector and derived parts first, reference (WMS) parts on top; stable within each */
export function orderParts<T extends Pick<MapPart, 'kind'>>(parts: T[]): T[] {
  return [...parts.filter(p => p.kind !== 'raster'), ...parts.filter(p => p.kind === 'raster')]
}

/**
 * the parts of the groups, from the model's items (a class per place) and the places of the index (a derived group draws all
 * its pieces, with or without a class for this indicator). `opaque` when a set is drawn.
 */
export function buildParts(groups: readonly string[], all: Record<string, GazLayer>, items: readonly MapItem[], places: readonly Place[], opaque = false): PartsResult {
  const parts: MapPart[] = []
  const missing: string[] = []
  for (const group of groups) {
    const home = all[group]
    const layer = home ? drawLayer(home, all) : null
    if (!home || !layer) { missing.push(group); continue }
    const mine = items.filter(i => i.group === group)
    const derived = home.kind === 'derived'
    const kind = layer.kind === 'raster' ? 'raster' : 'vector'
    if (derived) {
      // the pieces of the group: its places in the index (those with no value for this indicator are drawn faint) and, with no index
      // (the embed), the places that have one
      const pieces = [
        ...places.filter(p => p.coll === group && p.displayId).map(p => ({ id: p.id, displayId: p.displayId as string })),
        ...mine.filter(i => i.displayId).map(i => ({ id: i.placeId, displayId: i.displayId as string })),
      ]
      const toPlace = new Map(pieces.map(p => [p.displayId, p.id]))
      const toFeature = new Map(pieces.map(p => [p.id, p.displayId]))
      const classOf = new Map<string, number>()
      for (const i of mine) { const f = toFeature.get(i.placeId); if (f && i.k != null) classOf.set(f, i.k) }
      parts.push({ group, kind, layer, home, derived, classOf, known: mine.map(i => toFeature.get(i.placeId)).filter((f): f is string => !!f), only: [...toPlace.keys()].sort(), toPlace, toFeature, opaque })
      continue
    }
    parts.push({
      group, kind, layer, home, derived, classOf: new Map(mine.filter(i => i.k != null).map(i => [i.placeId, i.k as number])),
      known: kind === 'vector' ? mine.map(i => i.placeId) : [], only: null, toPlace: null, toFeature: null, opaque,
    })
  }
  return { parts: orderParts(parts), missing }
}

/** what makes the map rebuild its layers (the same key only repaints) */
export const partsKey = (parts: readonly Pick<MapPart, 'group' | 'kind' | 'layer'>[]): string => parts.map(p => `${p.group}:${p.kind}:${p.layer.slug}`).join('|')

/** the id of the feature of the tiles that draws a place of the part, or the place's own id */
export const featureOf = (part: Pick<MapPart, 'toFeature'>, placeId: string): string => part.toFeature?.get(placeId) ?? placeId
/** the place a feature of the part is: its own id, or for a derived part the place it draws (null for a feature that is no piece) */
export const placeOf = (part: Pick<MapPart, 'toPlace' | 'derived'>, featureId: string): string | null => (part.derived ? part.toPlace?.get(featureId) ?? null : featureId)

/**
 * the extent to frame: the union of the groups' own extents (a derived group's, not that of the FAO areas it borrows), with
 * latitudes held inside Web Mercator's range so a world extent frames instead of running to the poles
 */
export function partsBbox(parts: readonly Pick<MapPart, 'home'>[]): [number, number, number, number] {
  const M = 85
  const u = unionBoxes(parts.map(p => p.home.bbox)) ?? [-180, -M, 180, M]
  return [u[0], Math.max(-M, u[1]), u[2], Math.min(M, u[3])]
}
