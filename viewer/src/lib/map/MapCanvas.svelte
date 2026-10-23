<script lang="ts">
  // the map itself: CARTO's positron or dark-matter basemap through `@oceanmetrics/map` `composeStyle` (the GEBCO sea floor
  // and the land mask once their tiers exist: `dem: false` until then, VITE_BASEMAP_DEM=1 turns them on) under the parts
  // of one place group or one place set. a vector part is drawn from the gazetteer's PMTiles (a fill per class, an outline
  // for every place, and below DOT_MAXZOOM a hollow circle at each member that is not computed); a derived part (the high
  // seas by FAO area) is the features of another layer, only those that are its pieces; a reference part (Marine Regions)
  // is drawn by Marine Regions' own WMS, one request per tile, and no geometry of ours. the parts arrive in drawing order
  // (parts.ts: vector and derived first, reference on top). under them all, the layer slot (layerSlot.ts: a grid slice at
  // the period `slotT`; its ids start `slot:`), under the first part's fill, else under the basemap's sea surface. what is
  // the basemap's is the layer ids of the style set (`basemapLayerIds`): clear() removes every other layer, a click tests
  // the others that are not the slot's, and a theme flip carries them into the next style (`carryLayers`). this component
  // only draws: the classes, colours and credits come in as props, and a click goes out as a place id. the compare mode
  // (compare.ts) adds a second slot of the same layer (`slot2`, ids `slot:grid@t2`) just above the first, clipped to the left of
  // the swipe handle by two custom layers around its fill that set and clear the WebGL scissor box: one map, two layer groups.
  // with the anomaly the second slot is drawn whole and the first is hidden. the cell under the pointer (or a tap) goes out as
  // `oncell`: each slot's cell there (`cellAt`, map 0.3.0, read from the slices themselves, so the hidden slot of the anomaly
  // and both halves of the swipe answer); the words are gridLayer.ts `cellReadout`.
  import { onMount, untrack } from 'svelte'
  import { Map as MlMap, NavigationControl, ScaleControl } from 'maplibre-gl'
  import type { CustomLayerInterface, GeoJSONSource, MapMouseEvent, RasterTileSource, StyleSpecification } from 'maplibre-gl'
  import 'maplibre-gl/dist/maplibre-gl.css'
  import { BASEMAP_URL, basemapLayerIds, baseStyle, composeStyle, DEFAULT_TILES, seaSurfaceId } from '@oceanmetrics/map'
  import { setupMap } from './setup.ts'
  import { tilesAt } from './basemapTiles.ts'
  import { styleCredit } from './credit.ts'
  import { crossesAntimeridian, crossingMinZoom, geometryBounds, unionBoxes, worldCopies } from './bounds.ts'
  import type { Box4 } from './bounds.ts'
  import { DOT_IMAGE, classedIds, fillColorExpr, fillOpacityExpr, focusFilter, haloWidthExpr, lineColorExpr, lineWidthExpr, memberDotsLayer, onlyFilter } from './paint.ts'
  import { featureOf, partsKey, placeOf } from './parts.ts'
  import type { MapPart } from './parts.ts'
  import { infoUrl, mrgidOf, onlyMrgids, wmsTileUrl } from './wms.ts'
  import { boxCentre, globeZoom, isWorldScale, projectionSpec } from './frame.ts'
  import type { Proj } from './frame.ts'
  import type { WmsEntry } from './wms.ts'
  import { carryLayers, isSlotLayer, slotBeforeId } from './layerSlot.ts'
  import type { LayerSlot } from './layerSlot.ts'
  import { GRID_LAYER } from '@oceanmetrics/map'
  import type { GridSlot } from '@oceanmetrics/map'
  import { isYearRange, scissorBox } from './compare.ts'
  import type { CellProps } from '@oceanmetrics/map'
  import { placeSwipePairs } from './swipeLayers.ts'

  interface Props {
    parts: MapPart[]
    /** [west, south, east, north] to frame */
    bbox: [number, number, number, number]
    /** the resolved colour of each class index */
    colors: string[]
    /** the outline between filled places, the outline of a place with no class, the fill of a place with no class under a layer of ours, the faint outline of a member that is not computed, and the selected place's outline */
    line: string
    none: string
    nofill: string
    faint: string
    focus: string
    dark: boolean
    selected: string | null
    /** the projection: the globe, or null for the flat map */
    proj?: Proj
    /** where a reference group's click landed (it has no geometry to outline) */
    marker: { lng: number; lat: number } | null
    onpick: (p: { placeId: string | null; lng: number; lat: number; name?: string | null; group?: string | null }) => void
    /** 'done' once the map is idle with the data layers on it */
    onstate?: (s: 'loading' | 'done') => void
    label: string
    /** a small map (the report's locator): no zoom buttons or scale, and the wheel scrolls the page instead of zooming */
    compact?: boolean
    /** place ids to frame once their tiles are in (a vector part's features; a reference part has no geometry to frame) */
    fitIds?: string[] | null
    /** the place under the pointer: its name from the tiles (null off a place) */
    onhover?: (name: string | null) => void
    /** the layer under the places, and the period start it draws (null = its latest) */
    slot?: LayerSlot | null
    slotT?: string | null
    /** the places the slot's slice covers (their fills give way to it); null = none */
    sliced?: string[] | null
    /** the basemap's credit line, from the attribution of the style in force (called each time a style is set) */
    oncredit?: (credit: string) => void
    /** the compare mode: a second slot of the slot's layer at `slot2T`, left of the swipe handle at `swipe` (0..1 of the width);
     * with `anom` it is the difference, drawn whole, and the first slot is hidden */
    slot2?: LayerSlot | null
    slot2T?: string | null
    swipe?: number
    anom?: boolean
    /** the cell of each slot under the pointer or a tap (x, y in CSS pixels of the map box); null off the slice or off the map */
    oncell?: (c: { x: number; y: number; first: CellProps | null; second: CellProps | null } | null) => void
  }
  let { parts, bbox, colors, line, none, nofill, faint, focus, dark, selected, proj = null, marker, onpick, onstate, label, compact = false, fitIds = null, onhover, slot = null, slotT = null, sliced = null, oncredit,
    slot2 = null, slot2T = null, swipe = 0.5, anom = false, oncell }: Props = $props()

  let box: HTMLDivElement | undefined = $state()
  let phase = $state<'loading' | 'done'>('loading')
  let ready = $state(false)
  let map: MlMap | null = null
  // the parts on the map now (a change of groups rebuilds the layers; a class change only repaints them)
  let shown: string | null = null

  // ---- the basemap: the composed style in force, and what of it is the basemap's ----
  // the GEBCO and OSM tiers are in the bucket, but storage.oceanmetrics.io/basemap/ (the package's DEFAULT_TILES) answers 404
  // until the storage host lets them through: the map boots and stays on CARTO's own style (`dem: false`), since MapLibre
  // schedules no frame while a source fails. VITE_BASEMAP_DEM=1 turns the tiers on, read from the bucket's path-style url
  const DEM = import.meta.env.VITE_BASEMAP_DEM === '1'
  const TILES = tilesAt(DEFAULT_TILES, BASEMAP_URL)
  let basemap = new Set<string>()
  let baseSources = new Set<string>()
  let sea: string | null = null
  let styledDark: boolean | null = null
  const themeOf = (d: boolean) => (d ? 'dark' : 'light') as 'dark' | 'light'
  /** the style of a theme: CARTO's composed (or as it is, dem false) in the projection asked for; a plain sea if CARTO does not answer */
  async function styleFor(d: boolean, dem: boolean): Promise<StyleSpecification> {
    const theme = themeOf(d)
    let base: StyleSpecification
    try { base = await baseStyle(theme) } catch {
      const sea = getComputedStyle(document.documentElement).getPropertyValue('--map-sea').trim() || 'transparent'
      base = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': sea } }] }
    }
    return { ...composeStyle(base, { theme, dem, tiles: TILES }), projection: projectionSpec(untrack(() => proj)) }
  }
  function setBasemap(style: StyleSpecification) {
    basemap = basemapLayerIds(style)
    baseSources = new Set(Object.keys(style.sources))
    sea = seaSurfaceId(style)
    oncredit?.(styleCredit(style))
  }
  // a part's layer: anything the basemap does not name; a click or the pointer tests those that are not the slot's
  const isOurs = (id: string) => !basemap.has(id)
  const hits = (id: string) => isOurs(id) && !isSlotLayer(id)
  /** the style as it is mid-change: a diff keeps it loaded, a full reload (a style the diff cannot reach) does not */
  const styleReady = (m: MlMap) => (m as unknown as { style?: { _loaded?: boolean } }).style?._loaded !== false
  // a theme flip (or the tiers coming on): the next style, with every layer of ours carried over under the one it sat under
  let restyleSeq = 0
  async function restyle(m: MlMap, d: boolean, dem: boolean) {
    const seq = ++restyleSeq
    const next = await styleFor(d, dem)
    if (seq !== restyleSeq || map !== m) return
    const old = basemap
    m.setStyle(next, { diff: true, transformStyle: carryLayers(id => !old.has(id)) })
    setBasemap(next)
    styledDark = d
    if (styleReady(m)) { setRing(m); placeSwipe(m) }
    else m.once('style.load', () => { setRing(m); untrack(sync) })
  }

  const setState = (s: 'loading' | 'done') => { phase = s; onstate?.(s) }
  const sid = (i: number) => `p${i}`
  // the features of a part the slice covers (none without a slot)
  const slicedOf = (part: MapPart) => (slot && sliced ? sliced.map(id => featureOf(part, id)) : null)
  const wid = (i: number) => `w${i}`

  // 'done' when the map is idle with its tiles in. idle fires only after a render, and a change that draws nothing new
  // renders nothing, so a slow poll catches what the event would have missed
  let poll: ReturnType<typeof setInterval> | undefined
  function settle(m: MlMap) {
    clearInterval(poll)
    m.once('idle', () => {
      clearInterval(poll)
      // a place selected from a link (not by a click on the map) is framed once its tiles are in; the new view loads more tiles
      if (frame(m) || fitAll(m)) return settle(m)
      setState('done')
    })
    poll = setInterval(() => { if (!slotWait && m.isStyleLoaded() && m.areTilesLoaded()) { clearInterval(poll); setState('done') } }, 400)
  }

  // the places a report asked to see: framed once their tiles are in, a few tries (a tile may not hold a small place yet)
  let fitted: string | null = null
  let fitTries = 0
  function fitAll(m: MlMap): boolean {
    const ids = fitIds
    if (!ids?.length) return false
    const key = partsKey(parts) + '|' + ids.join(',')
    if (key !== fitted) { fitted = key; fitTries = 0 }
    else if (fitTries < 0) return false
    const boxes: Box4[] = []
    for (const [i, part] of parts.entries()) {
      if (part.kind !== 'vector' || !part.layer.source_layer || !m.getSource(sid(i))) continue
      const want = ids.map(id => featureOf(part, id))
      for (const f of m.querySourceFeatures(sid(i), { sourceLayer: part.layer.source_layer, filter: ['in', ['get', 'place_id'], ['literal', want]] as never })) {
        // a place over the antimeridian is two features, one each side of 180: each is a box, and the union takes the short way round
        const g = geometryBounds([f.geometry as { coordinates?: unknown }])
        if (g) boxes.push([g[0][0], g[0][1], g[1][0], g[1][1]])
      }
    }
    const b = unionBoxes(boxes)
    if (!b) { fitTries = fitTries < 2 ? fitTries + 1 : -1; return false }
    fitTries = -1
    fitTo(m, b, { padding: 28, duration: 0, maxZoom: 9 })
    return true
  }

  // a camera for a box: on the globe a world-scale box shows the whole sphere in the frame (centred on the box), as the sphere is
  // what the reader came for; anything else is MapLibre's own fit. the box may run east past 180 (the short way round the world)
  function fitTo(m: MlMap, b: Box4, opts: { padding: number; duration: 0; maxZoom: number }) {
    if (untrack(() => proj) === 'globe' && isWorldScale(b) && box) {
      m.jumpTo({ center: boxCentre(b), zoom: globeZoom(box.clientWidth, box.clientHeight) })
      return
    }
    crossing = crossesAntimeridian(b)
    m.fitBounds([[b[0], b[1]], [b[2], b[3]]], opts)
  }
  // the last fit ran over the antimeridian (Pacific places, the high seas): its world copies stay and one world fills the frame
  let crossing = false

  // one world only: when the frame is wider than the world is at this zoom (a world-wide map in a wide frame) the world is not drawn
  // twice. zoomed in, copies stay on, which is what lets a place over the antimeridian (Hawaii, Samoa, the high seas) be drawn whole
  function copies(m: MlMap) {
    if (untrack(() => proj) === 'globe' || !box) return
    const want = worldCopies(m.getZoom(), box.clientWidth, crossing)
    if (m.getRenderWorldCopies() !== want) m.setRenderWorldCopies(want)
    m.setMinZoom(crossing ? crossingMinZoom(box.clientWidth) : 0)
  }

  /** the map as a PNG data URL, read in the frame it is drawn (the buffer is not kept), for a print that cannot hold a live map */
  export function snap(): Promise<string | null> {
    const m = map
    if (!m) return Promise.resolve(null)
    return new Promise(res => {
      const t = setTimeout(() => res(null), 4000)
      m.once('render', () => { clearTimeout(t); try { res(m.getCanvas().toDataURL('image/png')) } catch { res(null) } })
      m.triggerRepaint()
    })
  }

  // the selection already framed, and the one the reader clicked (which stays where the reader put the camera)
  let framed: string | null = null
  let clicked: string | null = null
  function frame(m: MlMap): boolean {
    const id = selected
    if (!id || id === framed || id === clicked) return false
    for (const [i, part] of parts.entries()) {
      if (part.kind !== 'vector' || !part.layer.source_layer || !m.getSource(sid(i))) continue
      const feats = m.querySourceFeatures(sid(i), { sourceLayer: part.layer.source_layer, filter: ['==', ['get', 'place_id'], featureOf(part, id)] })
      const b = geometryBounds(feats.map(f => f.geometry as { coordinates?: unknown }))
      if (!b) continue
      framed = id
      m.fitBounds(b, { padding: 80, duration: 0, maxZoom: 9 })
      return true
    }
    return false
  }

  // the hollow circle of a member that is not computed, in the faint colour of the outlines (drawn again when the colour changes)
  const RING = 18
  function ringImage(color: string): ImageData | null {
    const c = document.createElement('canvas')
    c.width = c.height = RING * 2
    const g = c.getContext('2d')
    if (!g) return null
    g.strokeStyle = color
    g.lineWidth = 4
    g.beginPath()
    g.arc(RING, RING, RING - 4, 0, Math.PI * 2)
    g.stroke()
    return g.getImageData(0, 0, RING * 2, RING * 2)
  }
  function setRing(m: MlMap) {
    const img = ringImage(faint)
    if (!img) return
    if (m.hasImage(DOT_IMAGE)) m.removeImage(DOT_IMAGE)
    m.addImage(DOT_IMAGE, img, { pixelRatio: 2 })
  }

  onMount(() => {
    let dead = false
    let ro: ResizeObserver | null = null
    let made: MlMap | null = null
    void (async () => {
      // the setup, once a page: MapLibre's worker module and the pmtiles:// protocol (setup.ts)
      await setupMap()
      const d = untrack(() => dark)
      const style = await styleFor(d, false)
      if (dead) return
      const m = (made = new MlMap({
        container: box as HTMLDivElement,
        style,
        // opened on the extent, so no tiles are fetched for a camera the first fit then replaces
        bounds: [[bbox[0], bbox[1]], [bbox[2], bbox[3]]], fitBoundsOptions: { padding: 24, maxZoom: 8 },
        attributionControl: false, dragRotate: false, pitchWithRotate: false, scrollZoom: !compact,
      }))
      setBasemap(style)
      styledDark = d
      m.touchZoomRotate.disableRotation()
      if (!compact) {
        m.addControl(new NavigationControl({ showCompass: false }), 'top-right')
        m.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
      }
      // the stylesheet and the layout can arrive after the map is made: follow the box, not only the window
      ro = new ResizeObserver(() => m.resize())
      ro.observe(box as HTMLDivElement)
      m.on('load', () => {
        m.resize(); copies(m); map = m; ready = true
        if (DEM) void restyle(m, untrack(() => dark), true)
      })
      m.on('moveend', () => copies(m))
      m.on('resize', () => copies(m))
      m.on('click', e => { readCell(e); void click(m, e) })
      m.on('mousemove', e => {
        const hit = parts.some((p, i) => (p.kind === 'raster' ? true : !!m.getLayer(`${sid(i)}:fill`) && m.queryRenderedFeatures(e.point, { layers: hitLayers(m, i) }).length > 0))
        m.getCanvas().style.cursor = hit ? 'pointer' : ''
        if (onhover) {
          let name: string | null = null
          parts.forEach((p, i) => {
            if (name != null || p.kind === 'raster' || !m.getLayer(`${sid(i)}:fill`)) return
            const n = m.queryRenderedFeatures(e.point, { layers: hitLayers(m, i) })[0]?.properties?.name
            if (n != null) name = String(n)
          })
          onhover(name)
        }
        readCell(e)
      })
      m.on('mouseout', () => { onhover?.(null); oncell?.(null) })
    })()
    return () => { dead = true; clearInterval(poll); ro?.disconnect(); made?.remove(); map = null; ready = false; shown = null; mounted = null; mounted2 = null }
  })

  // ---- the cell under the pointer: each slot's, from its last slice ----
  const cellOf = (sl: LayerSlot | null, lng: number, lat: number) => (sl as Partial<GridSlot> | null)?.cellAt?.(lng, lat) ?? null
  function readCell(e: MapMouseEvent) {
    if (!oncell) return
    const { lng, lat } = e.lngLat
    const first = cellOf(mounted, lng, lat), second = cellOf(mounted2, lng, lat)
    oncell(first || second ? { x: e.point.x, y: e.point.y, first, second } : null)
  }

  const hitLayers = (m: MlMap, i: number) => [`${sid(i)}:fill`, `${sid(i)}:dots`].filter(id => hits(id) && m.getLayer(id))

  // a click asks the parts from the top one down: a reference part (drawn last) answers by Marine Regions' GetFeatureInfo, a
  // vector part by the features under the point. so an EEZ over a high-seas piece is the EEZ, and open sea is the piece.
  async function click(m: MlMap, e: MapMouseEvent) {
    const { lng, lat } = e.lngLat
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i]
      if (part.kind === 'vector') {
        const f = m.getLayer(`${sid(i)}:fill`) ? m.queryRenderedFeatures(e.point, { layers: hitLayers(m, i) }) : []
        const fid = f[0]?.properties?.place_id
        const id = fid == null ? null : placeOf(part, String(fid))
        if (id == null) continue
        const name = part.derived ? null : f[0]?.properties?.name
        clicked = id
        onpick({ placeId: id, lng, lat, name: name == null ? null : String(name), group: part.group })
        return
      }
      try {
        const r = await fetch(infoUrl(part.layer.raster!, lng, lat, m.getZoom()))
        const j = (await r.json()) as { features?: { properties?: Record<string, unknown> }[] }
        const v = j.features?.[0]?.properties?.[part.layer.raster!.info_id]
        if (v != null) { onpick({ placeId: `${part.layer.authority ?? 'MRGID'}:${v}`, lng, lat, group: part.group }); return }
      } catch { /* this part has no answer: the next one below may */ }
    }
    clicked = null
    onpick({ placeId: null, lng, lat })
  }

  // ---- the basemap follows the theme: the other theme's style, our layers carried over ----
  $effect(() => {
    const d = dark
    if (!ready || !map || d === styledDark) return
    void restyle(map, d, DEM)
  })

  // ---- the projection: flat (mercator) or the globe; the layers stay as they are, MapLibre redraws them ----
  $effect(() => {
    const want = projectionSpec(proj)
    if (!ready || !map) return
    if (map.getProjection()?.type !== want.type) map.setProjection(want)
    copies(map)
  })

  // ---- the data layers ----
  // everything the basemap does not name goes, the slot's `slot:` layers with it
  function clear(m: MlMap) {
    // custom layers are not in getStyle(): the swipe's go by name
    for (const id of SWIPE_IDS) if (m.getLayer(id)) m.removeLayer(id)
    for (const l of m.getStyle().layers) if (isOurs(l.id)) m.removeLayer(l.id)
    for (const id of Object.keys(m.getStyle().sources)) if (!baseSources.has(id)) m.removeSource(id)
  }

  // the slot on the map now, mounted under the first part that draws (a vector part's fill, else the first layer of ours),
  // else under the basemap's sea surface (its land mask, once the tiers are on)
  let mounted: LayerSlot | null = null
  let mountedT: string | null = null
  function mountSlot(m: MlMap) {
    unmountSlot2(m)
    mounted?.unmount(m)
    mounted = slot
    mountedT = slotT
    const before = slotBeforeId(m.getStyle().layers.map(l => l.id).filter(isOurs), { fallback: sea })
    slot?.mount(m, before, slotT)
    mountSlot2(m, before)
    waitSlot(m)
  }

  // ---- the compare slot and the swipe ----
  let mounted2: LayerSlot | null = null
  let mounted2T: string | null = null
  // each slot is cut to its side of the handle: the second (t2) left of it, the first (t) right of it
  const SWIPE_IDS = ['slot:swipe:left', 'slot:swipe:left:off', 'slot:swipe:right', 'slot:swipe:right:off']
  // what the scissor reads each frame: the swipe fraction, or null to draw the second slot whole (the anomaly)
  let clipAt: number | null = null
  const clipOn = (id: string, side: 'left' | 'right'): CustomLayerInterface => ({
    id, type: 'custom', renderingMode: '2d',
    render(gl) {
      if (clipAt == null) return
      const [x, y, w, h] = scissorBox(clipAt, gl.drawingBufferWidth, gl.drawingBufferHeight, side)
      gl.enable(gl.SCISSOR_TEST)
      gl.scissor(x, y, w, h)
    },
  })
  const clipOff = (id: string): CustomLayerInterface => ({ id, type: 'custom', renderingMode: '2d', render(gl) { gl.disable(gl.SCISSOR_TEST) } })
  const swipeLayers = [clipOn(SWIPE_IDS[0], 'left'), clipOff(SWIPE_IDS[1]), clipOn(SWIPE_IDS[2], 'right'), clipOff(SWIPE_IDS[3])] as const
  const layerOf = (sl: LayerSlot | null) => (sl ? (sl as Partial<GridSlot>).ids?.layer ?? GRID_LAYER : null)
  function unmountSlot2(m: MlMap) {
    for (const id of SWIPE_IDS) if (m.getLayer(id)) m.removeLayer(id)
    mounted2?.unmount(m)
    mounted2 = null
  }
  /** the second slot just above the first (under `before`, else under the layer that follows the first) */
  function mountSlot2(m: MlMap, before?: string | null) {
    unmountSlot2(m)
    mounted2 = mounted && slot2 ? slot2 : null
    mounted2T = slot2T
    if (mounted2) {
      const ids = m.getStyle().layers.map(l => l.id)
      const first = layerOf(mounted)
      const at = before !== undefined ? before : (first && ids.includes(first) ? ids[ids.indexOf(first) + 1] ?? null : null)
      mounted2.mount(m, at, slot2T)
    }
    placeSwipe(m)
  }
  /** a scissor pair around each slot's fill (t2 left of the handle, t right of it), and the first slot hidden under the anomaly */
  function placeSwipe(m: MlMap) {
    for (const id of SWIPE_IDS) if (m.getLayer(id)) m.removeLayer(id)
    clipAt = anom ? null : swipe
    const first = layerOf(mounted)
    if (first && m.getLayer(first)) m.setLayoutProperty(first, 'visibility', mounted2 && anom ? 'none' : 'visible')
    placeSwipePairs(m, first, layerOf(mounted2), swipeLayers)
  }
  // a new slot source has asked for no tile yet, so "every tile is in" is true at once: until the map has been idle once since,
  // the slow poll in settle() does not call the map done (the slot's tiles are slow: a WMS draws each one)
  let slotWait = false
  function waitSlot(m: MlMap) {
    if (!slot) return
    slotWait = true
    m.once('idle', () => { slotWait = false })
  }

  function wmsEntries(part: MapPart): WmsEntry[] {
    const out: WmsEntry[] = []
    for (const [id, k] of part.classOf) { const mr = mrgidOf(id); if (mr) out.push({ id: mr, k }) }
    return out
  }
  const wmsUrl = (part: MapPart) => wmsTileUrl(part.layer.raster!, wmsEntries(part), colors, none, line, 'mrgid', part.opaque ? nofill : null, onlyMrgids(part.only))

  function sync() {
    const m = map
    if (!m) return
    // a style that is still loading (a theme flip the diff could not do) takes no layer: it syncs once it has loaded
    if (!styleReady(m)) return
    const key = partsKey(parts)
    if (shown !== key) {
      setState('loading')
      clear(m)
      setRing(m)
      parts.forEach((part, i) => {
        const ids = classedIds(part.classOf)
        if (part.kind === 'vector' && part.layer.pmtiles && part.layer.source_layer) {
          const sl = part.layer.source_layer
          const filter = onlyFilter(part.only)
          const f = filter ? { filter: filter as never } : {}
          m.addSource(sid(i), { type: 'vector', url: `pmtiles://${part.layer.pmtiles}` })
          m.addLayer({ id: `${sid(i)}:fill`, type: 'fill', source: sid(i), 'source-layer': sl, ...f, paint: { 'fill-color': fillColorExpr(part.classOf, colors) as never, 'fill-opacity': fillOpacityExpr(part.opaque, slicedOf(part)) as never } })
          m.addLayer({ id: `${sid(i)}:halo`, type: 'line', source: sid(i), 'source-layer': sl, ...f, paint: { 'line-color': none, 'line-width': haloWidthExpr(ids) as never } })
          m.addLayer({ id: `${sid(i)}:line`, type: 'line', source: sid(i), 'source-layer': sl, ...f, paint: { 'line-color': lineColorExpr(part.classOf, colors, none, part.known, faint) as never, 'line-width': lineWidthExpr(ids, part.known) as never } })
          m.addLayer({ id: `${sid(i)}:focus`, type: 'line', source: sid(i), 'source-layer': sl, filter: focusFilter(null) as never, paint: { 'line-color': focus, 'line-width': 3 } })
          m.addLayer(memberDotsLayer(sid(i), sl, part.known, part.only) as never)
        } else if (part.kind === 'raster' && part.layer.raster) {
          m.addSource(wid(i), { type: 'raster', tiles: [wmsUrl(part)], tileSize: 256, maxzoom: part.layer.raster.maxzoom ?? 12 })
          m.addLayer({ id: wid(i), type: 'raster', source: wid(i), paint: { 'raster-fade-duration': 0 } })
        }
      })
      // the slot goes in once the parts are there, so the layer it goes under exists
      mountSlot(m)
      m.addSource('pick', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({ id: 'pick-ring', type: 'circle', source: 'pick', paint: { 'circle-radius': 9, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 3, 'circle-stroke-color': focus } })
      shown = key
      framed = null
      fitted = null
      fitTo(m, bbox, { padding: 24, duration: 0, maxZoom: 8 })
      copies(m)
      settle(m)
      return
    }
    // same parts: repaint; a new slot is mounted, the same one draws the period asked for (and the anomaly, which reads it, too)
    if (mounted !== slot) mountSlot(m)
    else {
      const moved = !!slot && mountedT !== slotT
      if (moved) { mountedT = slotT; slot!.update(slotT); waitSlot(m) }
      if (mounted2 !== (mounted && slot2 ? slot2 : null)) { mountSlot2(m); waitSlot(m) }
      // the anomaly reads the slice at t, and a year range averages the month of t: both follow a new t
      else if (mounted2 && (mounted2T !== slot2T || ((anom || isYearRange(slot2T)) && moved))) { mounted2T = slot2T; mounted2.update(slot2T); waitSlot(m) }
      else placeSwipe(m)
    }
    setRing(m)
    parts.forEach((part, i) => {
      if (part.kind === 'vector') {
        if (!m.getLayer(`${sid(i)}:fill`)) return
        const ids = classedIds(part.classOf)
        m.setPaintProperty(`${sid(i)}:fill`, 'fill-color', fillColorExpr(part.classOf, colors) as never)
        m.setPaintProperty(`${sid(i)}:fill`, 'fill-opacity', fillOpacityExpr(part.opaque, slicedOf(part)) as never)
        m.setPaintProperty(`${sid(i)}:line`, 'line-color', lineColorExpr(part.classOf, colors, none, part.known, faint) as never)
        m.setPaintProperty(`${sid(i)}:line`, 'line-width', lineWidthExpr(ids, part.known) as never)
        m.setPaintProperty(`${sid(i)}:halo`, 'line-color', none)
        m.setPaintProperty(`${sid(i)}:halo`, 'line-width', haloWidthExpr(ids) as never)
        m.setPaintProperty(`${sid(i)}:focus`, 'line-color', focus)
        m.setFilter(`${sid(i)}:focus`, focusFilter(selected ? featureOf(part, selected) : null) as never)
        const dots = memberDotsLayer(sid(i), part.layer.source_layer ?? '', part.known, part.only)
        if (m.getLayer(`${sid(i)}:dots`)) m.setFilter(`${sid(i)}:dots`, (dots.filter ?? null) as never)
      } else if (part.layer.raster) {
        const src = m.getSource(wid(i)) as (RasterTileSource & { setTiles?: (t: string[]) => void }) | undefined
        src?.setTiles?.([wmsUrl(part)])
      }
    })
    m.setPaintProperty('pick-ring', 'circle-stroke-color', focus)
    const pick = m.getSource('pick') as GeoJSONSource | undefined
    pick?.setData({ type: 'FeatureCollection', features: marker ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [marker.lng, marker.lat] } }] : [] })
    setState('loading')
    settle(m)
  }

  $effect(() => {
    // every input the drawing reads, so a change redraws; the drawing itself reads no state
    void [parts, bbox, colors, line, none, nofill, faint, focus, selected, marker, ready, fitIds, slot, slotT, sliced, slot2, slot2T, anom]
    if (ready) untrack(sync)
  })

  // ---- the swipe moves: the scissor reads it on the next frame, nothing else is redrawn ----
  $effect(() => {
    const f = swipe
    if (!ready || !map) return
    clipAt = anom ? null : f
    map.triggerRepaint()
  })
</script>

<div class="map" bind:this={box} data-state={phase} role="application" aria-label={label}></div>

<style>
  .map { width: 100%; height: 100%; min-height: 20rem; background: var(--bg-tint); border-radius: var(--radius-md); overflow: hidden; }
  .map :global(.maplibregl-ctrl-group) { background: var(--pane-bg); border-radius: var(--radius-sm); }
  .map :global(.maplibregl-ctrl-group button) { background-color: var(--pane-bg); }
  :global([data-theme='dark']) .map :global(.maplibregl-ctrl-icon) { filter: invert(1); }
</style>
