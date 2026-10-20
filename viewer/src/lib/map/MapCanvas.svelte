<script lang="ts">
  // the map itself: Esri's keyless gray canvas under one collection of places. a vector collection is drawn from the
  // gazetteer's PMTiles (a fill per class, an outline for every place); a reference collection (Marine Regions) is drawn
  // by Marine Regions' own WMS, one request per tile, and no geometry of ours. this component only draws: the classes,
  // colours and credits come in as props, and a click goes out as a place id.
  import { onMount, untrack } from 'svelte'
  import maplibregl from 'maplibre-gl'
  import 'maplibre-gl/dist/maplibre-gl.css'
  import { Protocol } from 'pmtiles'
  import type { GazLayer } from './gazetteer.ts'
  import { ESRI_TILES } from './credit.ts'
  import { classedIds, fillColorExpr, lineColorExpr, lineWidthExpr, haloWidthExpr } from './paint.ts'
  import type { Expr } from './paint.ts'
  import { infoUrl, mrgidOf, wmsTileUrl } from './wms.ts'
  import type { WmsEntry } from './wms.ts'

  interface Props {
    layer: GazLayer
    /** place id -> class index, for the places that have a class */
    classOf: Map<string, number>
    /** the resolved colour of each class index */
    colors: string[]
    /** the outline between filled places, the outline of a place with no class, and the selected place's outline */
    line: string
    none: string
    focus: string
    dark: boolean
    selected: string | null
    /** where a reference collection's click landed (it has no geometry to outline) */
    marker: { lng: number; lat: number } | null
    onpick: (p: { placeId: string | null; lng: number; lat: number }) => void
    /** 'done' once the map is idle with the data layer on it */
    onstate?: (s: 'loading' | 'done') => void
    label: string
  }
  let { layer, classOf, colors, line, none, focus, dark, selected, marker, onpick, onstate, label }: Props = $props()

  let box: HTMLDivElement | undefined = $state()
  let phase = $state<'loading' | 'done'>('loading')
  let ready = $state(false)
  let map: maplibregl.Map | null = null
  // the layer on the map now (a collection change rebuilds it; a class change only repaints it)
  let shown: string | null = null

  // the pmtiles:// protocol, registered once per page
  const G = globalThis as unknown as { __omPmtiles?: Protocol }
  if (!G.__omPmtiles) {
    G.__omPmtiles = new Protocol()
    maplibregl.addProtocol('pmtiles', G.__omPmtiles.tile)
  }

  const setState = (s: 'loading' | 'done') => { phase = s; onstate?.(s) }

  // 'done' when the map is idle with its tiles in. idle fires only after a render, and a change that draws nothing new
  // renders nothing, so a slow poll catches what the event would have missed
  let poll: ReturnType<typeof setInterval> | undefined
  function settle(m: maplibregl.Map) {
    clearInterval(poll)
    m.once('idle', () => { clearInterval(poll); setState('done') })
    poll = setInterval(() => { if (m.isStyleLoaded() && m.areTilesLoaded()) { clearInterval(poll); setState('done') } }, 400)
  }

  onMount(() => {
    const m = new maplibregl.Map({
      container: box as HTMLDivElement,
      style: {
        version: 8,
        sources: {
          'base-light': { type: 'raster', tiles: [ESRI_TILES.light], tileSize: 256, maxzoom: 16 },
          'base-dark': { type: 'raster', tiles: [ESRI_TILES.dark], tileSize: 256, maxzoom: 16 },
        },
        layers: [
          { id: 'base-light', type: 'raster', source: 'base-light', layout: { visibility: 'visible' } },
          { id: 'base-dark', type: 'raster', source: 'base-dark', layout: { visibility: 'none' } },
        ],
      },
      // opened on the collection, so no tiles are fetched for a camera the first fit then replaces
      bounds: [[layer.bbox[0], layer.bbox[1]], [layer.bbox[2], layer.bbox[3]]], fitBoundsOptions: { padding: 24, maxZoom: 8 },
      attributionControl: false, dragRotate: false, pitchWithRotate: false,
    })
    m.touchZoomRotate.disableRotation()
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    // the stylesheet and the layout can arrive after the map is made: follow the box, not only the window
    const ro = new ResizeObserver(() => m.resize())
    ro.observe(box as HTMLDivElement)
    m.on('load', () => { m.resize(); map = m; ready = true })
    m.on('click', e => void click(m, e))
    m.on('mousemove', e => {
      const hit = layer.kind === 'vector' ? m.getLayer('fill') && m.queryRenderedFeatures(e.point, { layers: ['fill'] }).length > 0 : true
      m.getCanvas().style.cursor = hit ? 'pointer' : ''
    })
    return () => { clearInterval(poll); ro.disconnect(); m.remove(); map = null; ready = false; shown = null }
  })

  async function click(m: maplibregl.Map, e: maplibregl.MapMouseEvent) {
    const { lng, lat } = e.lngLat
    if (layer.kind === 'vector') {
      const f = m.getLayer('fill') ? m.queryRenderedFeatures(e.point, { layers: ['fill'] }) : []
      const id = f[0]?.properties?.place_id
      onpick({ placeId: id == null ? null : String(id), lng, lat })
      return
    }
    // a reference collection: ask Marine Regions which feature is under the click
    try {
      const r = await fetch(infoUrl(layer.raster!, lng, lat, m.getZoom()))
      const j = (await r.json()) as { features?: { properties?: Record<string, unknown> }[] }
      const v = j.features?.[0]?.properties?.[layer.raster!.info_id]
      onpick({ placeId: v == null ? null : `${layer.authority ?? 'MRGID'}:${v}`, lng, lat })
    } catch {
      onpick({ placeId: null, lng, lat })
    }
  }

  // ---- the basemap follows the theme ----
  $effect(() => {
    const d = dark
    if (!ready || !map) return
    map.setLayoutProperty('base-light', 'visibility', d ? 'none' : 'visible')
    map.setLayoutProperty('base-dark', 'visibility', d ? 'visible' : 'none')
  })

  // ---- the data layer ----
  function clear(m: maplibregl.Map) {
    for (const id of ['focus', 'line', 'fill', 'wms', 'pick-ring']) if (m.getLayer(id)) m.removeLayer(id)
    for (const id of ['places', 'wms', 'pick']) if (m.getSource(id)) m.removeSource(id)
  }

  function wmsEntries(): WmsEntry[] {
    const out: WmsEntry[] = []
    for (const [id, k] of classOf) { const mr = mrgidOf(id); if (mr) out.push({ id: mr, k }) }
    return out
  }

  function sync() {
    const m = map
    if (!m) return
    const ids = classedIds(classOf)
    if (shown !== layer.slug) {
      setState('loading')
      clear(m)
      if (layer.kind === 'vector' && layer.pmtiles && layer.source_layer) {
        m.addSource('places', { type: 'vector', url: `pmtiles://${layer.pmtiles}` })
        const sl = layer.source_layer
        m.addLayer({ id: 'fill', type: 'fill', source: 'places', 'source-layer': sl, paint: { 'fill-color': fillColorExpr(classOf, colors) as never, 'fill-opacity': 0.85 } })
        m.addLayer({ id: 'halo', type: 'line', source: 'places', 'source-layer': sl, paint: { 'line-color': none, 'line-width': haloWidthExpr(ids) as never } })
        m.addLayer({ id: 'line', type: 'line', source: 'places', 'source-layer': sl, paint: { 'line-color': lineColorExpr(classOf, colors, none) as never, 'line-width': lineWidthExpr(ids) as never } })
        m.addLayer({ id: 'focus', type: 'line', source: 'places', 'source-layer': sl, filter: ['==', ['get', 'place_id'], ''], paint: { 'line-color': focus, 'line-width': 3 } })
      } else if (layer.raster) {
        const url = wmsTileUrl(layer.raster, wmsEntries(), colors, none, line)
        m.addSource('wms', { type: 'raster', tiles: [url], tileSize: 256, maxzoom: layer.raster.maxzoom ?? 12 })
        m.addLayer({ id: 'wms', type: 'raster', source: 'wms', paint: { 'raster-fade-duration': 0 } })
        m.addSource('pick', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        m.addLayer({ id: 'pick-ring', type: 'circle', source: 'pick', paint: { 'circle-radius': 9, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 3, 'circle-stroke-color': focus } })
      }
      shown = layer.slug
      const [w, s, e, n] = layer.bbox
      m.fitBounds([[w, s], [e, n]], { padding: 24, duration: 0, maxZoom: 8 })
      settle(m)
      return
    }
    // same collection: repaint
    if (layer.kind === 'vector') {
      if (!m.getLayer('fill')) return
      m.setPaintProperty('fill', 'fill-color', fillColorExpr(classOf, colors) as never)
      m.setPaintProperty('line', 'line-color', lineColorExpr(classOf, colors, none) as never)
      m.setPaintProperty('line', 'line-width', lineWidthExpr(ids) as never)
      m.setPaintProperty('halo', 'line-color', none)
      m.setPaintProperty('halo', 'line-width', haloWidthExpr(ids) as never)
      m.setPaintProperty('focus', 'line-color', focus)
      m.setFilter('focus', ['==', ['get', 'place_id'], selected ?? ''])
    } else if (layer.raster) {
      const src = m.getSource('wms') as (maplibregl.RasterTileSource & { setTiles?: (t: string[]) => void }) | undefined
      src?.setTiles?.([wmsTileUrl(layer.raster, wmsEntries(), colors, none, line)])
      m.setPaintProperty('pick-ring', 'circle-stroke-color', focus)
      const pick = m.getSource('pick') as maplibregl.GeoJSONSource | undefined
      pick?.setData({ type: 'FeatureCollection', features: marker ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [marker.lng, marker.lat] } }] : [] })
    }
    setState('loading')
    settle(m)
  }

  $effect(() => {
    // every input the drawing reads, so a change redraws; the drawing itself reads no state
    void [layer, classOf, colors, line, none, focus, selected, marker, ready]
    if (ready) untrack(sync)
  })
</script>

<div class="map" bind:this={box} data-state={phase} role="application" aria-label={label}></div>

<style>
  .map { width: 100%; height: 100%; min-height: 20rem; background: var(--bg-tint); border-radius: var(--radius-md); overflow: hidden; }
  .map :global(.maplibregl-ctrl-group) { background: var(--pane-bg); border-radius: var(--radius-sm); }
  .map :global(.maplibregl-ctrl-group button) { background-color: var(--pane-bg); }
  :global([data-theme='dark']) .map :global(.maplibregl-ctrl-icon) { filter: invert(1); }
</style>
