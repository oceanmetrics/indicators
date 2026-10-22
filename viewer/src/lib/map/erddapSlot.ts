// the `erddap` kind of the layer slot: the dataset's own ERDDAP WMS as a raster source under the places, at 0.7 opacity.
// the rules (URLs, rows, legend) are in erddapWms.ts; this file only wires them to MapLibre: the `erddapwms://` protocol
// (ERDDAP's WMS draws lon/lat pictures only, so each tile is asked for in CRS:84 and its rows are stretched onto Mercator in a
// canvas) and the slot object. a server with no WMS answers with an error, which MapLibre reports as an `error` event for the
// source, and the legend then says "no tiles from <host>".
import maplibregl from 'maplibre-gl'
import type { Map as MlMap, RasterTileSource } from 'maplibre-gl'
import { formatLayerKey } from './layerSlot.ts'
import type { LayerSlot, SlotFactory } from './layerSlot.ts'
import { collectionUrl, ERDDAP_VIA, erddapTileUrl, erddapTitle, hostOf, parseErddapCollection, sourceRow, tileRequest, WMS_SCHEME } from './erddapWms.ts'
import type { ErddapCollection } from './erddapWms.ts'

const SRC = 'slot:erddap'
const LYR = 'slot:erddap:raster'

// ---- the protocol: one CRS:84 picture per tile, its rows put where Mercator wants them ----

async function wmsTile(params: { url: string }, abort: AbortController): Promise<{ data: ArrayBuffer }> {
  const req = tileRequest(params.url)
  if (!req) throw new Error(`not an ERDDAP WMS tile: ${params.url}`)
  const r = await fetch(req.url, { signal: abort.signal })
  // ERDDAP answers a request it cannot draw with a 200 and an XML ServiceException: no picture is an error too
  if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) throw new Error(`ERDDAP WMS ${hostOf(req.url)}: HTTP ${r.status}`)
  const img = await createImageBitmap(await r.blob())
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(req.width, req.height) : Object.assign(document.createElement('canvas'), { width: req.width, height: req.height })
  const g = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!g) throw new Error('no 2d canvas')
  for (let y = 0; y < req.height; y++) g.drawImage(img, 0, sourceRow(y, req.height, req.north, req.south, img.height), img.width, 1, 0, y, req.width, 1)
  img.close()
  const blob = c instanceof HTMLCanvasElement
    ? await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('no tile'))), 'image/png'))
    : await (c as OffscreenCanvas).convertToBlob({ type: 'image/png' })
  return { data: await blob.arrayBuffer() }
}

let registered = false
function ensureProtocol() {
  if (registered) return
  registered = true
  maplibregl.addProtocol(WMS_SCHEME.replace('://', ''), wmsTile)
}

// ---- the collections, read once each ----

const collections = new Map<string, Promise<ErddapCollection>>()
function loadCollection(id: string, fetchFn: typeof fetch): Promise<ErddapCollection> {
  let p = collections.get(id)
  if (!p) {
    p = (async () => {
      const r = await fetchFn(collectionUrl(id))
      if (!r.ok) throw new Error(`erddap/${id}: HTTP ${r.status}`)
      const c = parseErddapCollection(await r.json())
      if (!c) throw new Error(`erddap/${id} names no ERDDAP server`)
      return c
    })()
    collections.set(id, p)
    p.catch(() => collections.delete(id))
  }
  return p
}

// ---- the slot ----

export const erddapSlot: SlotFactory = async (spec, opts) => {
  const coll = await loadCollection(spec.id, opts.fetch ?? fetch)
  const variable = spec.variable ?? coll.variables[0]?.name
  if (!variable) throw new Error(`erddap/${spec.id} has no variable to draw`)
  ensureProtocol()
  const host = hostOf(coll.baseUrl)
  const title = erddapTitle(coll, variable)
  let map: MlMap | null = null
  let t: string | null = null
  let problem: string | null = null
  const changed = () => opts.onchange?.()
  const onError = (e: { sourceId?: string }) => {
    if (e.sourceId !== SRC || problem) return
    problem = `no tiles from ${host}`
    changed()
  }
  const slot: LayerSlot = {
    id: formatLayerKey({ kind: 'erddap', id: spec.id, variable }),
    kind: 'erddap',
    title,
    credit: `${title}${coll.producers.length ? ` (${coll.producers.join('; ')})` : ''}, drawn by ERDDAP WMS at ${host}`,
    mount(m, beforeId, at) {
      map = m
      t = at
      problem = null
      m.off('error', onError)
      m.on('error', onError)
      m.addSource(SRC, { type: 'raster', tiles: [erddapTileUrl(coll, variable, t)], tileSize: 256, maxzoom: 8 })
      m.addLayer({ id: LYR, type: 'raster', source: SRC, paint: { 'raster-opacity': 0.7, 'raster-fade-duration': 0 } }, beforeId && m.getLayer(beforeId) ? beforeId : undefined)
      changed()
    },
    update(at) {
      if (at === t || !map) return
      t = at
      problem = null
      ;(map.getSource(SRC) as RasterTileSource | undefined)?.setTiles([erddapTileUrl(coll, variable, t)])
      changed()
    },
    unmount(m) {
      m.off('error', onError)
      if (m.getLayer(LYR)) m.removeLayer(LYR)
      if (m.getSource(SRC)) m.removeSource(SRC)
      map = null
    },
    legend: () => ({ title, t, via: ERDDAP_VIA, problem }),
  }
  return slot
}
