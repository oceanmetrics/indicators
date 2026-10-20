// the map frame's two controls, as plain rules: the projection (flat or globe, the hash's `proj`) and full screen (the
// Fullscreen API on a wrapper that holds the map AND its legend, with a fixed full-viewport "expanded" mode where the
// element API is missing: iPhone Safari). the components only wire these.

export type Proj = 'globe' | null
/** off; native (the browser's full screen on the wrapper); expanded (a fixed, full-viewport wrapper) */
export type FullMode = 'off' | 'native' | 'expanded'

export const PROJ_CHOICES: { proj: Proj; label: string }[] = [
  { proj: null, label: 'Flat' },
  { proj: 'globe', label: 'Globe' },
]

/** the MapLibre projection of the hash's `proj` */
export function projectionSpec(proj: Proj): { type: 'mercator' | 'globe' } {
  return { type: proj === 'globe' ? 'globe' : 'mercator' }
}

/** the face of the full-screen button: what it does, never what state it is in */
export function fullLabel(mode: FullMode): string {
  return mode === 'off' ? 'Full screen' : 'Exit full screen'
}

// ---- the Fullscreen API, with its prefixed forms and a way out where there is none ----

interface FsElement { requestFullscreen?: () => Promise<void>; webkitRequestFullscreen?: () => void | Promise<void> }
interface FsDocument {
  fullscreenEnabled?: boolean
  webkitFullscreenEnabled?: boolean
  fullscreenElement?: Element | null
  webkitFullscreenElement?: Element | null
  exitFullscreen?: () => Promise<void>
  webkitExitFullscreen?: () => void | Promise<void>
}

/** can this element go full screen natively? (iPhone Safari has the API on video only) */
export function canNative(el: object, doc: object): boolean {
  const e = el as FsElement, d = doc as FsDocument
  if (!(typeof e.requestFullscreen === 'function' || typeof e.webkitRequestFullscreen === 'function')) return false
  return d.fullscreenEnabled !== false && d.webkitFullscreenEnabled !== false
}

/** the element the browser shows full screen now, if any */
export function nativeElement(doc: object): Element | null {
  const d = doc as FsDocument
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null
}

/** go full screen: natively where it can, else (or when the browser refuses) expanded */
export async function enterFull(el: object, doc: object): Promise<FullMode> {
  if (!canNative(el, doc)) return 'expanded'
  const e = el as FsElement
  try {
    await (e.requestFullscreen ? e.requestFullscreen() : e.webkitRequestFullscreen?.())
    return 'native'
  } catch {
    return 'expanded'
  }
}

/** leave full screen; the caller sets its mode to 'off' */
export async function exitFull(doc: object, mode: FullMode): Promise<void> {
  if (mode !== 'native') return
  const d = doc as FsDocument
  if (!nativeElement(doc)) return
  try { await (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.()) } catch { /* already out */ }
}

/** the mode after the browser's `fullscreenchange`: native ends when the wrapper is no longer the full-screen element */
export function afterChange(mode: FullMode, el: object, doc: object): FullMode {
  if (mode === 'native' && nativeElement(doc) !== el) return 'off'
  return mode
}

/** Esc leaves the expanded mode (the browser's own full screen handles Esc itself) */
export function escLeaves(mode: FullMode, key: string): boolean {
  return mode === 'expanded' && key === 'Escape'
}

// ---- the whole sphere in the frame ----

/** is a box world-scale: wider than 90 degrees of longitude or taller than 90 of latitude? (a smaller one keeps the normal fit) */
export function isWorldScale(b: [number, number, number, number]): boolean {
  return b[2] - b[0] > 90 || b[3] - b[1] > 90
}

/** MapLibre's camera: a vertical field of view of 0.6435 rad (tan(fov / 2) = 1/3), so its focal length is 1.5 x the frame's height in pixels */
const FOCAL_PER_HEIGHT = 1.5

/**
 * the zoom at which the globe fits its frame. at zoom z the sphere's radius is R = 512 x 2^z / (2 pi) pixels, and the camera
 * (focal length f = 1.5 x the frame's height, at distance f + R, which is what keeps the scale at the centre that of the flat
 * map) draws its outline 2 R f / sqrt(f^2 + 2 f R) pixels across. this solves that for the outline `fill` (0.9: a small margin)
 * of the frame's shorter side, so the whole sphere is seen on a wide desktop frame and on a phone alike.
 */
export function globeZoom(width: number, height: number, fill = 0.9): number {
  const a = Math.max(1, Math.min(width, height)) * fill
  const f = FOCAL_PER_HEIGHT * Math.max(1, height)
  const r = (a * a + a * Math.sqrt(a * a + 4 * f * f)) / (4 * f)
  return Math.max(0, Math.log2((2 * Math.PI * r) / 512))
}

/** the apparent diameter of the globe's outline at a zoom in a frame of this height (the inverse of globeZoom) */
export function globeDiameter(zoom: number, height: number): number {
  const r = (512 * 2 ** zoom) / (2 * Math.PI)
  const f = FOCAL_PER_HEIGHT * Math.max(1, height)
  return (2 * r * f) / Math.sqrt(f * f + 2 * f * r)
}

/** the centre of a box [west, south, east, north] as a longitude in [-180, 180] and a latitude (east may exceed 180) */
export function boxCentre(b: [number, number, number, number]): { lng: number; lat: number } {
  const lng = (b[0] + b[2]) / 2
  return { lng: ((((lng + 180) % 360) + 360) % 360) - 180, lat: (b[1] + b[3]) / 2 }
}
