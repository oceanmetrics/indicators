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
 * fill-opacity of a vector part: 0.85, fully opaque for a part a reference group is drawn over (`opaque`), and none over
 * the layer slot for the places the slice covers (`sliced`: their feature ids; null = no slot): the slice is masked to the
 * places themselves, so a fill would hide it. their class stays on the outline (lineColorExpr, 2.5 px with its halo), in
 * the legend and in the table; a place the slice leaves out (over its cell budget) keeps its fill
 */
export function fillOpacityExpr(opaque: boolean, sliced: readonly string[] | null): Expr {
  if (opaque) return 1
  if (!sliced) return 0.85
  return sliced.length ? ['match', ['get', 'place_id'], [...sliced].sort(), 0, 0.85] : 0.85
}

/**
 * line-color: a classed place is outlined in its class colour, so one too small to show a fill at this zoom still
 * shows its class; a place that is computed but has no class gets the `none` outline; any other member of the collection
 * (`known` lists the computed ones) gets the faint one. with no `known` list every unclassed place gets `none`.
 */
export function lineColorExpr(classOf: Map<string, number>, colors: string[], none: string, known: string[] = [], faint: string = none): Expr {
  const base = fillColorExpr(classOf, colors, faint)
  const rest = known.filter(id => !classOf.has(id)).sort()
  if (!rest.length) return base
  if (typeof base === 'string') return ['match', ['get', 'place_id'], rest, none, faint]
  return [...(base as Expr[]).slice(0, -1), rest, none, faint]
}

/**
 * line-width: a classed place is outlined heavier (it carries the class when it is too small to fill), a computed one without
 * a class thin, and a member that is not computed (when `known` is given) thinner still
 */
export function lineWidthExpr(ids: string[], known: string[] = []): Expr {
  const lit = (xs: string[]) => ['in', ['get', 'place_id'], ['literal', xs]]
  if (known.length) return ['case', lit(ids), 2.5, lit([...new Set([...known].sort())]), 1.2, 0.8]
  return ids.length ? ['case', lit(ids), 2.5, 1.2] : 1.2
}

/**
 * the halo under a classed place's outline: a darker ring, so a fill close to the basemap's water (the grey of
 * "within" or "flat" on the light canvas) still reads as a shape; unclassed places get none
 */
export function haloWidthExpr(ids: string[]): Expr {
  return ids.length ? ['case', ['in', ['get', 'place_id'], ['literal', ids]], 4.5, 0] : 0
}

// ---- derived parts: only the features that are pieces of the group ----

/** the filter that keeps only the features of the layer that are pieces of a derived group (`only` = their ids); no filter for a whole layer */
export function onlyFilter(only: string[] | null): Expr | undefined {
  return only ? ['in', ['get', 'place_id'], ['literal', [...only].sort()]] : undefined
}

/** the filter of the selected place's outline: the feature with this id */
export const focusFilter = (featureId: string | null): Expr => ['==', ['get', 'place_id'], featureId ?? '']

// ---- members that are not computed, seen from far away ----

/** below this zoom a member's outline is too small to see, so it is also drawn as a small hollow circle */
export const DOT_MAXZOOM = 7
/** the image of the hollow circle (drawn by the canvas in the faint colour) */
export const DOT_IMAGE = 'om-member-ring'

/**
 * the symbol layer of the hollow circles: one at the label point of each member of the collection that is not computed (`known`
 * lists the computed ones), only below DOT_MAXZOOM, and only among the pieces of a derived part (`only`). the circle takes
 * its colour from the image, which the canvas draws in the same faint token as the outlines.
 */
export function memberDotsLayer(source: string, sourceLayer: string, known: string[], only: string[] | null = null): Record<string, unknown> {
  const notKnown: Expr | undefined = known.length ? ['!', ['in', ['get', 'place_id'], ['literal', [...known].sort()]]] : undefined
  const keep = onlyFilter(only)
  const filter = notKnown && keep ? ['all', keep, notKnown] : notKnown ?? keep
  return {
    id: `${source}:dots`, type: 'symbol', source, 'source-layer': sourceLayer, maxzoom: DOT_MAXZOOM,
    layout: { 'icon-image': DOT_IMAGE, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
    ...(filter ? { filter } : {}),
  }
}
