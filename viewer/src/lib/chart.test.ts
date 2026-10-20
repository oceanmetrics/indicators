import { describe, expect, it } from 'vitest'
import { lineChart, niceStep, niceTicks, overlayOf, scaleLinear, stackChart, stackShares, yearTicks, OTHER_KEY } from './chart.ts'
import { periodX } from '../../../src/status/index.ts'
import type { StatusResult } from '../../../src/status/index.ts'

const result = (o: Partial<StatusResult>): StatusResult => ({
  method: 'iea-sd', status: 'above', trend: 'flat', n: 15, t0: '2005-01-01', t1: '2019-01-01', recentMean: 20, recentFrom: '2015-01-01',
  recentTo: '2019-01-01', ltMean: 14, ltSd: 4, p10: null, p90: null, delta: 0, why: null, ...o,
})
const yearly = (vals: (number | null)[], from = 2005) => vals.map((v, i) => ({ t: `${from + i}-01-01`, v }))

describe('scales and ticks', () => {
  it('niceStep picks a 1-2-5 step', () => {
    expect(niceStep(10, 4)).toBe(2)
    expect(niceStep(1, 4)).toBe(0.2)
    expect(niceStep(0.09, 4)).toBe(0.02)
    expect(niceStep(430, 4)).toBe(100)
    expect(niceStep(0)).toBe(1)
  })
  it('niceTicks covers the range with round ticks and no float noise', () => {
    expect(niceTicks(0.13, 0.52, 4)).toMatchObject({ ticks: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], lo: 0.1, hi: 0.6, decimals: 1 })
    expect(niceTicks(24.3, 29.7, 3).ticks).toEqual([24, 26, 28, 30])
    expect(niceTicks(-3, 3, 3).ticks).toEqual([-4, -2, 0, 2, 4])
  })
  it('a flat range is opened up so it can be drawn', () => {
    const t = niceTicks(5, 5, 4)
    expect(t.lo).toBeLessThan(5)
    expect(t.hi).toBeGreaterThan(5)
    const z = niceTicks(0, 0, 4)
    expect(z.lo).toBeLessThan(0)
    expect(z.hi).toBeGreaterThan(0)
  })
  it('scaleLinear maps the domain onto the range, a flat domain to the middle', () => {
    const s = scaleLinear(0, 10, 100, 200)
    expect([s(0), s(5), s(10)]).toEqual([100, 150, 200])
    expect(scaleLinear(3, 3, 0, 10)(3)).toBe(5)
    expect(scaleLinear(0, 10, 100, 0)(10)).toBe(0)
  })
  it('year ticks thin out as the span grows and sit on 1 January', () => {
    const t = yearTicks(periodX('1984-07-01'), periodX('2026-07-01'), 6)
    expect(t.map(x => x.label)).toEqual(['1990', '2000', '2010', '2020'])
    expect(t[0].x).toBe(periodX('1990-01-01'))
    expect(yearTicks(periodX('2020-01-01'), periodX('2024-01-01'), 6).map(x => x.label)).toEqual(['2020', '2021', '2022', '2023', '2024'])
  })
})

describe('overlayOf', () => {
  it('iea-sd draws the mean ± 1 SD and the recent window', () => {
    expect(overlayOf(result({}))).toEqual({ center: 14, lo: 10, hi: 18, kind: 'sd', recentFrom: '2015-01-01', recentTo: '2019-01-01' })
  })
  it('names-pct draws the median with the 10th and 90th percentiles', () => {
    expect(overlayOf(result({ method: 'names-pct', ltMean: 12, p10: 9, p90: 19 }))).toMatchObject({ center: 12, lo: 9, hi: 19, kind: 'pct' })
  })
  it('values, a record too short for a status, and no result draw nothing', () => {
    expect(overlayOf(result({ method: 'values', ltMean: null, ltSd: null }))).toBeNull()
    expect(overlayOf(result({ ltMean: null, ltSd: null, status: null }))).toBeNull()
    expect(overlayOf(null)).toBeNull()
  })
})

describe('lineChart', () => {
  const series = yearly([10, 12, 10, 12, 10, 12, 10, 12, 10, 12, 20, 20, 20, 20, 20])
  const g = lineChart({ width: 640, height: 240, series, grain: 'year', overlay: overlayOf(result({})) })
  it('one point per value, left to right, higher values higher up', () => {
    expect(g.points).toHaveLength(15)
    expect(g.points.every((p, i) => i === 0 || p.x > g.points[i - 1].x)).toBe(true)
    expect(g.points[14].y).toBeLessThan(g.points[0].y)
    expect(g.points[0].x).toBeGreaterThan(g.plot.x0)
    expect(g.points[14].x).toBeLessThan(g.plot.x1)
  })
  it('the band spans mean ± 1 SD and the mean line sits inside it', () => {
    expect(g.band!.y0).toBeLessThan(g.center!)
    expect(g.band!.y1).toBeGreaterThan(g.center!)
    // 18 and 10 on the same scale as the values 20 and 10
    const y10 = g.points[0].y, y20 = g.points[14].y
    expect(g.band!.y1).toBeCloseTo(y10, 0)
    expect(g.band!.y0).toBeCloseTo(y10 - (y10 - y20) * 0.8, 0)
  })
  it('the recent window covers the slots of its first to its last year', () => {
    const slot = (g.points[1].x - g.points[0].x)
    expect(g.window!.x0).toBeCloseTo(g.points[10].x - slot / 2, 0)
    expect(g.window!.x1).toBeCloseTo(g.plot.x1, 0)
  })
  it('y ticks are round and inside the plot, x ticks are years', () => {
    expect(g.yTicks.map(t => t.label)).toEqual(['5', '10', '15', '20', '25'])
    expect(g.yTicks.every(t => t.y >= g.plot.y0 - 0.1 && t.y <= g.plot.y1 + 0.1)).toBe(true)
    expect(g.xTicks.map(t => t.label)).toContain('2010')
  })
  it('nulls break the line into runs', () => {
    const gap = lineChart({ width: 640, height: 240, series: yearly([1, 2, null, 4, 5]), grain: 'year' })
    expect(gap.d.match(/M/g)).toHaveLength(2)
    expect(gap.points).toHaveLength(4)
  })
  it('points mode draws no line, and markers go away when the series is long', () => {
    expect(lineChart({ width: 640, height: 240, series, grain: 'year', mode: 'points' }).d).toBe('')
    const months = Array.from({ length: 200 }, (_, i) => ({ t: `${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`, v: i % 7 }))
    expect(lineChart({ width: 640, height: 240, series: months, grain: 'month' }).markers).toBe(false)
    expect(g.markers).toBe(true)
  })
  it('no values gives an empty chart with axes only', () => {
    const e = lineChart({ width: 320, height: 200, series: yearly([null, null]), grain: 'year' })
    expect(e.empty).toBe(true)
    expect(e.points).toEqual([])
  })
  it('a single value is drawn in the middle of the plot', () => {
    const one = lineChart({ width: 640, height: 240, series: yearly([5], 2020), grain: 'year' })
    expect(one.points).toHaveLength(1)
    expect(one.points[0].x).toBeCloseTo((one.plot.x0 + one.plot.x1) / 2, 0)
  })
  it('the plot keeps room for the y labels at a phone width', () => {
    const p = lineChart({ width: 330, height: 220, series, grain: 'year' })
    expect(p.plot.x1).toBe(318)
    expect(p.plot.x1 - p.plot.x0).toBeGreaterThan(200)
  })
})

describe('lineChart: shared y axis and compact panels (Small multiples)', () => {
  const low = yearly([1, 2, 1, 2, 1])
  const high = yearly([100, 120, 110, 130, 100])
  it('a shared domain puts the same value at the same height in two panels', () => {
    const dom: [number, number] = [1, 130]
    const a = lineChart({ width: 160, height: 90, series: low, grain: 'year', yDomain: dom, compact: true })
    const b = lineChart({ width: 160, height: 90, series: high, grain: 'year', yDomain: dom, compact: true })
    expect(a.yTicks.map(t => t.y)).toEqual(b.yTicks.map(t => t.y))
    expect(a.points[1].y).toBeGreaterThan(b.points[1].y)
    // with its own axis a small series fills its panel instead
    const own = lineChart({ width: 160, height: 90, series: low, grain: 'year', compact: true })
    expect(own.points[1].y).toBeLessThan(a.points[1].y)
  })
  it('the domain only widens the axis: data outside it is still inside the plot', () => {
    const g = lineChart({ width: 160, height: 90, series: high, grain: 'year', yDomain: [1, 2], compact: true })
    expect(g.points.every(p => p.y >= g.plot.y0 - 0.1 && p.y <= g.plot.y1 + 0.1)).toBe(true)
  })
  it('compact pads less than the full chart and asks for fewer ticks', () => {
    const full = lineChart({ width: 160, height: 90, series: high, grain: 'year' })
    const c = lineChart({ width: 160, height: 90, series: high, grain: 'year', compact: true })
    expect(c.plot.y0).toBeLessThan(full.plot.y0)
    expect(c.plot.y1).toBeGreaterThan(full.plot.y1)
    expect(c.yTicks.length).toBeLessThanOrEqual(full.yTicks.length)
  })
})

describe('stacked shares', () => {
  const rows = [
    ...['2020-01-01', '2021-01-01'].flatMap((t, i) => [
      { t, cls: '0', v: i ? 0.5 : 0.6 }, { t, cls: '1', v: i ? 0.3 : 0.25 }, { t, cls: '2', v: 0.1 }, { t, cls: '3', v: i ? 0.1 : 0.05 },
    ]),
  ]
  it('orders classes by mean share and sums the rest into other', () => {
    const m = stackShares(rows, { '0': 'No Stress' }, 'year', 2)
    expect(m.classes.map(c => c.key)).toEqual(['0', '1', OTHER_KEY])
    expect(m.classes.map(c => c.label)).toEqual(['No Stress', '1', 'Other'])
    expect(m.classes[0].mean).toBeCloseTo(0.55, 10)
    expect(m.periods[0].parts[0]).toBeCloseTo(0.6, 10)
    expect(m.periods[0].parts[2]).toBeCloseTo(0.15, 10)
    expect(m.periods[1].parts[2]).toBeCloseTo(0.2, 10)
  })
  it('keeps every class when there are no more than top, and drops null shares', () => {
    const m = stackShares([...rows, { t: '2021-01-01', cls: '9', v: null }], {}, 'year', 6)
    expect(m.classes.map(c => c.key)).toEqual(['0', '1', '2', '3'])
  })
  it('bars stack from the bottom to the top of the plot, the shares summing to the full height', () => {
    const m = stackShares(rows, {}, 'year', 6)
    const g = stackChart(m, 640, 240)
    expect(g.bars).toHaveLength(2)
    const b = g.bars[0]
    expect(b.segs[0].y + b.segs[0].h).toBeCloseTo(g.plot.y1, 0)
    expect(b.segs[3].y).toBeCloseTo(g.plot.y0, 0)
    expect(b.segs.reduce((s, x) => s + x.h, 0)).toBeCloseTo(g.plot.y1 - g.plot.y0, 0)
    expect(g.yTicks.map(t => t.label)).toEqual(['0%', '25%', '50%', '75%', '100%'])
    expect(g.bars[1].x).toBeGreaterThan(g.bars[0].x + g.bars[0].w)
  })
  it('an empty model draws no bars', () => {
    expect(stackChart(stackShares([], {}, 'year'), 640, 240).bars).toEqual([])
  })
})
