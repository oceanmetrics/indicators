// the bounding box of GeoJSON geometries (the features of a place the vector tiles hold), so the map can frame a place that is
// selected from a link. coordinates are lng/lat; a geometry with no coordinates gives nothing.
export type Bounds = [[number, number], [number, number]]

type Coords = number | Coords[]

function walk(c: Coords, b: { w: number; s: number; e: number; n: number }): void {
  if (typeof c === 'number') return
  if (c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
    b.w = Math.min(b.w, c[0]); b.e = Math.max(b.e, c[0]); b.s = Math.min(b.s, c[1]); b.n = Math.max(b.n, c[1])
    return
  }
  for (const x of c) walk(x, b)
}

/** [[west, south], [east, north]] of the geometries, or null when they hold no point */
export function geometryBounds(geoms: { coordinates?: unknown }[]): Bounds | null {
  const b = { w: Infinity, s: Infinity, e: -Infinity, n: -Infinity }
  for (const g of geoms) walk((g.coordinates ?? []) as Coords, b)
  return Number.isFinite(b.w) ? [[b.w, b.s], [b.e, b.n]] : null
}

/** [west, south, east, north]; east may exceed 180 for a box over the antimeridian (the gazetteer's own form) */
export type Box4 = [number, number, number, number]

/**
 * the union of boxes that takes the shortest way round the globe: the boxes are intervals of longitude on a circle, and the
 * cover is the circle less its widest empty gap. so the Pacific sanctuaries (Hawaii and Samoa at -170, Papahanaumokuakea on
 * both sides of 180, the west coast at -125) are one box of about 140 degrees, [160, 300], not the world; a cover with no
 * gap is the world [-180, 180]. west is in [-180, 180) and east is west plus the span (so it may exceed 180). latitude is the
 * plain min and max. null for no box.
 */
export function unionBoxes(boxes: Box4[]): Box4 | null {
  if (!boxes.length) return null
  const s = Math.min(...boxes.map(b => b[1])), n = Math.max(...boxes.map(b => b[3]))
  if (boxes.some(b => b[2] - b[0] >= 360)) return [-180, s, 180, n]
  // intervals on [0, 360): u = longitude + 180; one that runs past 360 is cut in two
  const iv: [number, number][] = []
  for (const b of boxes) {
    const a = ((((b[0] + 180) % 360) + 360) % 360), len = Math.max(0, b[2] - b[0])
    if (a + len > 360) { iv.push([a, 360], [0, a + len - 360]) } else iv.push([a, a + len])
  }
  iv.sort((x, y) => x[0] - y[0])
  const merged: [number, number][] = []
  for (const x of iv) {
    const last = merged[merged.length - 1]
    if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1])
    else merged.push([x[0], x[1]])
  }
  // the gap across the antimeridian first, so a tie keeps the plain cover
  let best = { gap: merged[0][0] + 360 - merged[merged.length - 1][1], start: merged[0][0] }
  for (let i = 1; i < merged.length; i++) {
    const gap = merged[i][0] - merged[i - 1][1]
    if (gap > best.gap) best = { gap, start: merged[i][0] }
  }
  if (!(best.gap > 0)) return [-180, s, 180, n]
  // the modulo arithmetic leaves dust in the last digits (177.79999999999995): round it off
  const r = (v: number) => Math.round(v * 1e9) / 1e9
  const w = best.start - 180
  return [r(w), s, r(w + (360 - best.gap)), n]
}

/** does a box run over the antimeridian (east beyond 180, or west below -180)? then the map must be able to draw the world's far side beside it */
export const crossesAntimeridian = (b: Box4): boolean => b[2] > 180 || b[0] < -180

/**
 * whether MapLibre draws copies of the world: not when the world is narrower than the frame at this zoom (it would show the
 * world twice), unless the view is over the antimeridian, where the copy is the other side of the same place (tile size 512)
 */
export function worldCopies(zoom: number, framePx: number, crossing = false): boolean {
  return crossing || 512 * 2 ** zoom >= framePx
}

/** the least zoom of a view over the antimeridian: one world fills the frame's width, so it is never shown twice side by side */
export function crossingMinZoom(framePx: number): number {
  return Math.max(0, Math.log2(Math.max(1, framePx) / 512))
}
