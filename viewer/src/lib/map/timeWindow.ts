// the Map's time window: the period `t` (the hash's, shared by every view) is the window's right edge, and the window
// reaches back `w` steps: [t - w, t], in the indices of the indicator's periods. the slice under the map always draws the
// step at `t`; the window is what the scrubber shows around it (the brush), and what the live series reads once it is on
// the Map (build week 3, 2026-11-13 to 11-19). the window is the view's own and not in the hash (its grammar is unchanged).
// the interactions are CalCOFI explore's YearStrip's: brush to set the window, drag the window to pan it, wheel to zoom it,
// double-click to reset it. plain functions over indices, so the scrubber only wires pointer and key events to them.
import type { Grain } from '@oceanmetrics/status'

/** the window a grain opens with, in steps: a year of months, a decade of years, three decades, a month of days */
export const WINDOW_BY_GRAIN: Readonly<Record<Grain, number>> = { day: 30, month: 12, year: 10, decade: 3, all: 1 }

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** the default window over `n` periods: the grain's, never more than the record (n - 1 steps) and never under one */
export function defaultWindow(grain: Grain, n: number): number {
  return clamp(WINDOW_BY_GRAIN[grain] ?? 1, 1, Math.max(1, n - 1))
}

/** a window clamped to the record: at least one step, at most n - 1 */
export const clampWindow = (w: number, n: number) => clamp(Math.round(w), 1, Math.max(1, n - 1))

/** the window's first index: t - w, not before the first period */
export const windowStart = (t: number, w: number) => Math.max(0, t - w)

/** the index under a fraction of the track (0 = the first period, 1 = the last) */
export const indexAt = (f: number, n: number) => (n <= 1 ? 0 : clamp(Math.round(f * (n - 1)), 0, n - 1))

/** a fraction of the track for an index (the inverse of indexAt) */
export const fractionOf = (i: number, n: number) => (n <= 1 ? 1 : clamp(i / (n - 1), 0, 1))

/** pan: the window moves by `d` steps with its width kept; t stays inside the record, and the window's start at 0 at least */
export function panWindow(t: number, w: number, d: number, n: number): number {
  return clamp(Math.round(t + d), Math.min(n - 1, w), n - 1)
}

/** brush: dragging from index a to b sets the window [min, max]: t is the later end, w the steps between (one at least) */
export function brushWindow(a: number, b: number, n: number): { t: number; w: number } {
  const lo = clamp(Math.min(a, b), 0, n - 1), hi = clamp(Math.max(a, b), 0, n - 1)
  return { t: hi, w: clampWindow(Math.max(1, hi - lo), n) }
}

/** wheel zoom: a wheel's deltaY widens (down) or narrows (up) the window by a factor, anchored at t; one step at least either way */
export function zoomWindow(w: number, deltaY: number, n: number): number {
  if (!deltaY) return clampWindow(w, n)
  const next = w * Math.exp(deltaY * 0.0015)
  const stepped = deltaY > 0 ? Math.max(next, w + 1) : Math.min(next, w - 1)
  return clampWindow(stepped, n)
}

/** the keyboard: arrows move t, Shift+arrows resize the window, Home/End jump, PageUp/PageDown move t by a window */
export function keyWindow(key: string, shift: boolean, t: number, w: number, n: number): { t: number; w: number } | null {
  switch (key) {
    case 'ArrowLeft': case 'ArrowDown': return shift ? { t, w: clampWindow(w - 1, n) } : { t: clamp(t - 1, 0, n - 1), w }
    case 'ArrowRight': case 'ArrowUp': return shift ? { t, w: clampWindow(w + 1, n) } : { t: clamp(t + 1, 0, n - 1), w }
    case 'Home': return { t: 0, w }
    case 'End': return { t: n - 1, w }
    case 'PageDown': return { t: clamp(t - w, 0, n - 1), w }
    case 'PageUp': return { t: clamp(t + w, 0, n - 1), w }
    default: return null
  }
}
