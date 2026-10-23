// chart geometry for the Place view's time series, in plain functions: scales, ticks, the long-term band, the shaded
// recent window and stacked class shares. the SVG components only draw what these return. nothing here computes a
// status or a number's words: the band and the window come from a StatusResult (@oceanmetrics/status), the labels from fmt().
import { fmt, nextPeriod, periodX } from '@oceanmetrics/status'
import type { Grain, Point, StatusResult } from '@oceanmetrics/status'

export interface Tick { v: number; label: string }

/** a 1-2-5 step that gives about `target` intervals over `span` */
export function niceStep(span: number, target = 4): number {
  if (!(span > 0)) return 1
  const raw = span / Math.max(1, target)
  const pow = 10 ** Math.floor(Math.log10(raw))
  const f = raw / pow
  return (f <= 1.5 ? 1 : f <= 3 ? 2 : f <= 7 ? 5 : 10) * pow
}

/** nice value ticks covering [lo, hi]; the first and last tick are the new bounds. a flat range is opened up */
export function niceTicks(lo: number, hi: number, target = 4): { ticks: number[]; lo: number; hi: number; step: number; decimals: number } {
  if (!(hi > lo)) {
    const d = lo === 0 ? 1 : Math.abs(lo) * 0.1
    lo -= d
    hi += d
  }
  const step = niceStep(hi - lo, target)
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
  const first = Math.floor(lo / step + 1e-9)
  const last = Math.ceil(hi / step - 1e-9)
  const ticks: number[] = []
  for (let i = first; i <= last; i++) ticks.push(Number((i * step).toFixed(decimals + 2)))
  return { ticks, lo: ticks[0], hi: ticks[ticks.length - 1], step, decimals }
}

export const scaleLinear = (d0: number, d1: number, r0: number, r1: number) => (v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0))

/** the year ticks of a time domain (seconds since 1970): every year, 2, 5, 10 ... apart, as many as fit */
export function yearTicks(d0: number, d1: number, maxTicks: number): { x: number; label: string }[] {
  const y0 = new Date(d0 * 1000).getUTCFullYear()
  const y1 = new Date(d1 * 1000).getUTCFullYear()
  const step = [1, 2, 5, 10, 20, 25, 50, 100].find(s => Math.floor((y1 - y0) / s) + 1 <= Math.max(2, maxTicks)) ?? 100
  const out: { x: number; label: string }[] = []
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    const x = periodX(`${String(y).padStart(4, '0')}-01-01`)
    if (x >= d0 && x <= d1) out.push({ x, label: String(y) })
  }
  return out
}

// ---- the overlay a status method draws ----

export interface Overlay {
  /** the long-term mean (iea-sd) or median (names-pct) */
  center: number
  /** the band: mean ± 1 SD (iea-sd), the 10th to 90th percentiles (names-pct) */
  lo: number
  hi: number
  kind: 'sd' | 'pct'
  /** the recent window, first and last period */
  recentFrom: string | null
  recentTo: string | null
}

/** what a StatusResult draws behind the series; null when it has no long-term statistics (values, or too short a record) */
export function overlayOf(r: StatusResult | null): Overlay | null {
  if (!r || r.ltMean == null) return null
  if (r.method === 'iea-sd' && r.ltSd != null) {
    return { center: r.ltMean, lo: r.ltMean - r.ltSd, hi: r.ltMean + r.ltSd, kind: 'sd', recentFrom: r.recentFrom, recentTo: r.recentTo }
  }
  if (r.method === 'names-pct' && r.p10 != null && r.p90 != null) {
    return { center: r.ltMean, lo: r.p10, hi: r.p90, kind: 'pct', recentFrom: r.recentFrom, recentTo: r.recentTo }
  }
  return null
}

// ---- the line chart ----

export interface Plot { x0: number; y0: number; x1: number; y1: number }

export interface LineSpec {
  width: number
  height: number
  /** the series; nulls break the line (give it a completed grid to see gaps) */
  series: Point[]
  grain: Grain
  overlay?: Overlay | null
  /** 'points' draws no line (values) */
  mode?: 'line' | 'points'
  /** width of the y labels, in px; derived from the labels when omitted */
  left?: number
  /** a y range the axis must cover as well as the data and the band: Small multiples' shared axis is the range of every panel */
  yDomain?: [number, number] | null
  /** a small panel: tighter padding, two y ticks (the unit label and the window label are the caller's to leave out) */
  compact?: boolean
}

export interface LineGeometry {
  plot: Plot
  points: { x: number; y: number; t: string; v: number }[]
  /** SVG path data of the line, one subpath per run of values */
  d: string
  center: number | null
  band: { y0: number; y1: number } | null
  window: { x0: number; x1: number } | null
  xTicks: { x: number; label: string }[]
  yTicks: { y: number; label: string }[]
  /** where the unit label sits */
  unitAt: { x: number; y: number }
  markers: boolean
  mode: 'line' | 'points'
  empty: boolean
}

const r1 = (v: number) => Math.round(v * 10) / 10
const CHAR_W = 6.6

/** the half width of a period in seconds, for placing a point in the middle of its slot */
function half(t: string, grain: Grain): number {
  if (grain === 'all') return 0
  return (periodX(nextPeriod(t, grain)) - periodX(t)) / 2
}

export function lineChart(spec: LineSpec): LineGeometry {
  const { width, height, grain } = spec
  const mode = spec.mode ?? 'line'
  const vals = spec.series.filter(p => p.v != null) as { t: string; v: number }[]
  const ov = spec.overlay ?? null
  const topPad = spec.compact ? 6 : 20, bottomPad = spec.compact ? 18 : 24, rightPad = spec.compact ? 6 : 12
  // the y range: every value and the band (and the shared domain), then nice bounds
  const ys = vals.map(p => p.v)
  if (ov) ys.push(ov.lo, ov.hi)
  if (spec.yDomain) ys.push(...spec.yDomain)
  // a series of no negative value (counts, species, records, percents ...) never gets an axis below 0: the padding and
  // the nice-ticks step would otherwise open it to -100 under a series of 0..300. a negative value keeps its padding
  const nonNeg = vals.length > 0 && vals.every(p => p.v >= 0)
  const lo = ys.length ? Math.min(...ys) : 0
  const hi = ys.length ? Math.max(...ys) : 1
  const padY = (hi - lo) * 0.04
  // an all-zero series is opened upward only (0..1), never to -1
  const yt = nonNeg ? niceTicks(Math.max(0, lo - padY), hi > 0 ? hi + padY : 1, spec.compact ? 2 : 3) : niceTicks(lo - padY, hi + padY, spec.compact ? 2 : 3)
  const labels = yt.ticks.map(v => fmt(v, yt.decimals))
  const left = spec.left ?? Math.ceil(Math.max(...labels.map(l => l.length)) * CHAR_W) + 14
  const plot: Plot = { x0: left, y0: topPad, x1: Math.max(left + 40, width - rightPad), y1: Math.max(topPad + (spec.compact ? 30 : 40), height - bottomPad) }
  const sy = scaleLinear(yt.lo, yt.hi, plot.y1, plot.y0)
  const empty = vals.length === 0
  const base: LineGeometry = {
    plot, points: [], d: '', center: null, band: null, window: null, xTicks: [], yTicks: yt.ticks.map((v, i) => ({ y: r1(sy(v)), label: labels[i] })),
    unitAt: { x: 0, y: 11 }, markers: false, mode, empty,
  }
  if (empty) return base
  // the x range: the first period's slot to the last period's slot
  const tFirst = vals[0].t, tLast = vals[vals.length - 1].t
  const d0 = periodX(tFirst) - half(tFirst, grain)
  const d1 = periodX(tLast) + half(tLast, grain)
  const sx = scaleLinear(d0, d1, plot.x0, plot.x1)
  const points = vals.map(p => ({ x: r1(sx(periodX(p.t))), y: r1(sy(p.v)), t: p.t, v: p.v }))
  let d = ''
  let joined = false
  for (const p of spec.series) {
    if (p.v == null) { joined = false; continue }
    d += `${joined ? 'L' : 'M'}${r1(sx(periodX(p.t)))} ${r1(sy(p.v))}`
    joined = true
  }
  let win: LineGeometry['window'] = null
  if (ov?.recentFrom && ov.recentTo) {
    const a = periodX(ov.recentFrom) - half(ov.recentFrom, grain)
    const b = periodX(ov.recentTo) + half(ov.recentTo, grain)
    win = { x0: r1(Math.max(plot.x0, sx(a))), x1: r1(Math.min(plot.x1, sx(b))) }
  }
  return {
    ...base,
    points,
    d: mode === 'line' ? d : '',
    center: ov ? r1(sy(ov.center)) : null,
    // a band edge below the floor of a non-negative axis stops at the plot
    band: ov ? { y0: r1(Math.max(plot.y0, sy(ov.hi))), y1: r1(Math.min(plot.y1, sy(ov.lo))) } : null,
    window: win,
    xTicks: yearTicks(d0, d1, Math.floor((plot.x1 - plot.x0) / 54)).map(t => ({ x: r1(sx(t.x)), label: t.label })),
    unitAt: { x: 0, y: 11 },
    // a dot per value while they are few enough to tell apart
    markers: mode === 'points' || vals.length <= 80,
  }
}

// ---- stacked class shares ----

export interface ShareRow { t: string; cls: string; v: number | null }

export interface StackModel {
  grain: Grain
  /** classes in stacking order (largest mean share first), at most `top`, then "other" when anything is left */
  classes: { key: string; label: string; mean: number }[]
  /** periods in time order; `parts[i]` is the share of `classes[i]` */
  periods: { t: string; parts: number[] }[]
}

export const OTHER_KEY = '__other'

/** the top classes by mean share, the rest summed into "other", per period */
export function stackShares(rows: ShareRow[], labels: Record<string, string> = {}, grain: Grain = 'year', top = 6): StackModel {
  const ts = [...new Set(rows.filter(r => r.v != null).map(r => r.t))].sort()
  const byT = new Map<string, Map<string, number>>()
  const total = new Map<string, number>()
  for (const r of rows) {
    if (r.v == null) continue
    if (!byT.has(r.t)) byT.set(r.t, new Map())
    byT.get(r.t)!.set(r.cls, (byT.get(r.t)!.get(r.cls) ?? 0) + r.v)
    total.set(r.cls, (total.get(r.cls) ?? 0) + r.v)
  }
  const ranked = [...total.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const keep = ranked.slice(0, top).map(([k]) => k)
  const hasOther = ranked.length > top
  const n = Math.max(1, ts.length)
  const classes = keep.map(k => ({ key: k, label: labels[k] ?? k, mean: (total.get(k) as number) / n }))
  if (hasOther) {
    const rest = ranked.slice(top).reduce((s, [, v]) => s + v, 0)
    classes.push({ key: OTHER_KEY, label: 'Other', mean: rest / n })
  }
  const periods = ts.map(t => {
    const m = byT.get(t) as Map<string, number>
    const parts = keep.map(k => m.get(k) ?? 0)
    if (hasOther) parts.push([...m.entries()].filter(([k]) => !keep.includes(k)).reduce((s, [, v]) => s + v, 0))
    return { t, parts }
  })
  return { grain, classes, periods }
}

export interface StackGeometry {
  plot: Plot
  bars: { t: string; x: number; w: number; segs: { cls: number; y: number; h: number }[] }[]
  xTicks: { x: number; label: string }[]
  yTicks: { y: number; label: string }[]
}

export function stackChart(model: StackModel, width: number, height: number): StackGeometry {
  const topPad = 20, bottomPad = 24, rightPad = 12, left = 40
  const plot: Plot = { x0: left, y0: topPad, x1: Math.max(left + 40, width - rightPad), y1: Math.max(topPad + 40, height - bottomPad) }
  const sums = model.periods.map(p => p.parts.reduce((s, v) => s + v, 0))
  const top = Math.max(1, ...sums)
  const sy = scaleLinear(0, top, plot.y1, plot.y0)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(v => ({ y: r1(sy(v)), label: `${fmt(v * 100, 0)}%` }))
  if (model.periods.length === 0) return { plot, bars: [], xTicks: [], yTicks }
  const g = model.grain
  const tFirst = model.periods[0].t, tLast = model.periods[model.periods.length - 1].t
  const d0 = periodX(tFirst), d1 = periodX(nextPeriod(tLast, g))
  const sx = scaleLinear(d0, d1, plot.x0, plot.x1)
  const bars = model.periods.map(p => {
    const xa = sx(periodX(p.t)), xb = sx(periodX(nextPeriod(p.t, g)))
    const slot = xb - xa
    const gap = slot > 6 ? slot * 0.14 : 0
    let acc = 0
    const segs = p.parts.map((v, i) => {
      const y1 = sy(acc), y0 = sy(acc + v)
      acc += v
      return { cls: i, y: r1(y0), h: Math.max(0, r1(y1 - y0)) }
    })
    return { t: p.t, x: r1(xa + gap / 2), w: Math.max(0.6, r1(slot - gap)), segs }
  })
  // a year tick sits under the middle of its bar when a bar is a year or more, at the start of the month otherwise
  const off = g === 'year' || g === 'decade' ? (bars[0].w) / 2 : 0
  const xTicks = yearTicks(d0, d1, Math.floor((plot.x1 - plot.x0) / 54)).map(t => ({ x: r1(sx(t.x) + off), label: t.label }))
  return { plot, bars, xTicks, yTicks }
}
