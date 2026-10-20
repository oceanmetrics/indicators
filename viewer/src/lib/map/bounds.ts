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
