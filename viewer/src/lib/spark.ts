// sparkline geometry from a coverage row's `spark` JSON: `{"t0", "g", "v": [...]}` (consecutive periods from t0 at
// grain g, null for a gap; src/coverage/build.ts encodeSpark) or the older [[period start, value], ...]. axis-free, so
// only the line and its last point are drawn. periods are placed by calendar position (a gap shows as a gap).
import { nextPeriod, periodX } from '../../../src/status/index.ts'
import type { Grain } from '../../../src/status/index.ts'

export type SparkPoint = [string, number | null]

const GRAINS: Grain[] = ['decade', 'year', 'month', 'day']

/** parse the spark column, either form; anything else gives [] */
export function parseSpark(s: string | null | undefined): SparkPoint[] {
  if (!s) return []
  try {
    const a = JSON.parse(s)
    if (a && !Array.isArray(a) && typeof a.t0 === 'string' && GRAINS.includes(a.g) && Array.isArray(a.v)) {
      const out: SparkPoint[] = []
      let t: string = a.t0
      for (const v of a.v) {
        out.push([t, typeof v === 'number' ? v : null])
        t = nextPeriod(t, a.g)
      }
      return out
    }
    if (!Array.isArray(a)) return []
    return a.filter((p): p is SparkPoint => Array.isArray(p) && typeof p[0] === 'string' && (p[1] === null || typeof p[1] === 'number'))
  } catch {
    return []
  }
}

export interface SparkGeometry {
  /** SVG path data; empty for a single point */
  d: string
  /** the last point with a value, or null for an empty series */
  last: { x: number; y: number } | null
  n: number
}

const r1 = (v: number) => Math.round(v * 10) / 10

/** path and last-point position in a w x h box with `pad` px inside it; a flat series runs along the middle */
export function sparkGeometry(points: SparkPoint[], w = 96, h = 24, pad = 3): SparkGeometry {
  const vals = points.filter(p => p[1] != null) as [string, number][]
  if (vals.length === 0) return { d: '', last: null, n: 0 }
  const xs = vals.map(p => periodX(p[0]))
  const ys = vals.map(p => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const lo = Math.min(...ys), hi = Math.max(...ys)
  const sx = (x: number) => (x1 === x0 ? w / 2 : pad + ((x - x0) / (x1 - x0)) * (w - 2 * pad))
  const sy = (y: number) => (hi === lo ? h / 2 : h - pad - ((y - lo) / (hi - lo)) * (h - 2 * pad))
  // a null breaks the line: a point joins the previous one only when that one has a value too
  let d = '', joined = false, last = { x: 0, y: 0 }
  for (const [t, v] of points) {
    if (v == null) { joined = false; continue }
    const x = r1(sx(periodX(t))), y = r1(sy(v))
    d += `${joined ? 'L' : 'M'}${x} ${y}`
    joined = true
    last = { x, y }
  }
  return { d: vals.length === 1 ? '' : d, last, n: vals.length }
}
