// the scissor pairs of the compare swipe, placed among the map's layers: each slot's fill is bracketed by a custom layer
// that sets the scissor box just under it and one that clears it just above it (compare.ts `scissorBox`). custom layers are
// not in `getStyle().layers`, so the order is worked out from the style's own layers and MapLibre's "insert before" rule.
import type { CustomLayerInterface } from 'maplibre-gl'

/** the slice of a MapLibre map the placement uses */
export interface LayerHost {
  getStyle(): { layers: { id: string }[] }
  getLayer(id: string): unknown
  addLayer(layer: CustomLayerInterface, before?: string): unknown
  removeLayer(id: string): unknown
}

/** the four layers: [t2 on, t2 off, t on, t off] */
export type SwipePairs = readonly [CustomLayerInterface, CustomLayerInterface, CustomLayerInterface, CustomLayerInterface]

function bracket(m: LayerHost, layer: string, on: CustomLayerInterface, off: CustomLayerInterface) {
  const ids = m.getStyle().layers.map(l => l.id)
  const next = ids[ids.indexOf(layer) + 1]
  m.addLayer(on, layer)
  m.addLayer(off, next)
}

/**
 * remove the pairs, then (with both slots on the map) put them back: t on, t's fill, t off, t2 on, t2's fill, t2 off. the
 * first slot's pair goes in first: its off lands under the second slot, and the second's on then goes between them; the
 * other order would put t's off between t2's on and t2's fill, and t2 would be drawn unclipped
 */
export function placeSwipePairs(m: LayerHost, first: string | null, second: string | null, pairs: SwipePairs): boolean {
  for (const l of pairs) if (m.getLayer(l.id)) m.removeLayer(l.id)
  if (!first || !second || !m.getLayer(first) || !m.getLayer(second)) return false
  bracket(m, first, pairs[2], pairs[3])
  bracket(m, second, pairs[0], pairs[1])
  return true
}
