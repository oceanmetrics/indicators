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
