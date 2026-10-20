// the gazetteer's layers.json, read once: which PMTiles draw a collection (vector layers), or which Marine Regions
// WMS does (reference layers, whose geometry we never host), the bounds to fit and the credit to show.
import { LAYERS_URL } from '../data.ts'

export interface RasterRef {
  /** the layer's WMTS tile URL; its LAYER= names the GeoServer layer, and the WMS endpoint sits beside it */
  tiles: string[]
  tile_size?: number
  minzoom?: number
  maxzoom?: number
  /** a GetFeatureInfo URL with a `{bbox}` placeholder */
  info_url: string
  /** the property of a feature that is the id after `MRGID:` */
  info_id: string
  link?: string
}

export interface GazLayer {
  slug: string
  title: string
  kind: 'vector' | 'raster'
  pmtiles: string | null
  source_layer: string | null
  geom_type?: string
  /** the place_id prefix of the layer's places (`MRGID` for Marine Regions) */
  authority?: string | null
  /** [west, south, east, north]; east may exceed 180 for a layer that crosses the antimeridian */
  bbox: [number, number, number, number]
  attribution: string
  source_link?: { href: string; title: string } | null
  raster: RasterRef | null
}

interface LayersJson {
  base?: string
  base_direct?: string
  layers?: (Partial<GazLayer> & { collection?: string })[]
}

/** the storage host answers with a 302 that has no CORS headers, so a published URL is read from its bucket host */
export function directUrl(url: string, base?: string, direct?: string): string {
  return base && direct && url.startsWith(base) ? direct + url.slice(base.length) : url
}

/** layers.json -> { slug: layer }, PMTiles URLs rewritten to the bucket host; anything unreadable gives {} */
export function parseLayers(json: unknown): Record<string, GazLayer> {
  const j = json as LayersJson | null
  const out: Record<string, GazLayer> = {}
  if (!j || !Array.isArray(j.layers)) return out
  for (const l of j.layers) {
    const slug = l.collection ?? l.slug
    if (!slug || !l.bbox) continue
    out[slug] = {
      slug, title: l.title ?? slug, kind: l.kind === 'raster' ? 'raster' : 'vector',
      pmtiles: l.pmtiles ? directUrl(l.pmtiles, j.base, j.base_direct) : null,
      source_layer: l.source_layer ?? null, geom_type: l.geom_type, authority: l.authority ?? null, bbox: l.bbox as GazLayer['bbox'],
      attribution: l.attribution ?? '', source_link: l.source_link ?? null, raster: (l.raster as RasterRef | null) ?? null,
    }
  }
  return out
}

let cache: Promise<Record<string, GazLayer>> | null = null

/** the layers, fetched once per page; a failure is not cached */
export function loadGazetteer(fetchFn: typeof fetch = fetch): Promise<Record<string, GazLayer>> {
  if (!cache) {
    cache = (async () => {
      const r = await fetchFn(LAYERS_URL)
      if (!r.ok) throw new Error(`layers.json: HTTP ${r.status}`)
      return parseLayers(await r.json())
    })()
    cache.catch(() => { cache = null })
  }
  return cache
}

/** the gazetteer layer that draws a collection */
export async function layerFor(slug: string, fetchFn: typeof fetch = fetch): Promise<GazLayer | null> {
  return (await loadGazetteer(fetchFn))[slug] ?? null
}

export const clearGazetteerCache = () => { cache = null }
