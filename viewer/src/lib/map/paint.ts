// the MapLibre paint expressions for a vector collection: a fill per class, no fill for a place with no class, and an
// outline that tells the two apart. plain data, so the exact expressions are tested without a map.
export type Expr = string | number | boolean | Expr[]

export const TRANSPARENT = 'rgba(0,0,0,0)'

/** the ids that have a class, sorted */
export function classedIds(classOf: Map<string, number>): string[] {
  return [...classOf.keys()].sort()
}

/** fill-color: a `match` on place_id grouping the places of a class; everything else is transparent */
export function fillColorExpr(classOf: Map<string, number>, colors: string[], fallback = TRANSPARENT): Expr {
  const byK = new Map<number, string[]>()
  for (const [id, k] of [...classOf.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (colors[k] == null) continue
    byK.set(k, [...(byK.get(k) ?? []), id])
  }
  if (byK.size === 0) return fallback
  const out: Expr[] = ['match', ['get', 'place_id']]
  for (const k of [...byK.keys()].sort((a, b) => a - b)) out.push(byK.get(k) as string[], colors[k])
  out.push(fallback)
  return out
}

/**
 * line-color: a classed place is outlined in its class colour, so one too small to show a fill at this zoom still
 * shows its class; any other place gets the `none` outline
 */
export function lineColorExpr(classOf: Map<string, number>, colors: string[], none: string): Expr {
  return fillColorExpr(classOf, colors, none)
}

/** line-width: a classed place is outlined heavier (it carries the class when it is too small to fill), the rest thin */
export function lineWidthExpr(ids: string[]): Expr {
  return ids.length ? ['case', ['in', ['get', 'place_id'], ['literal', ids]], 2.5, 1.2] : 1.2
}

/**
 * the halo under a classed place's outline: a darker ring, so a fill close to the basemap's water (the grey of
 * "within" or "flat" on the light canvas) still reads as a shape; unclassed places get none
 */
export function haloWidthExpr(ids: string[]): Expr {
  return ids.length ? ['case', ['in', ['get', 'place_id'], ['literal', ids]], 4.5, 0] : 0
}
