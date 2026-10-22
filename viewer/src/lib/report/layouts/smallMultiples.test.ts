import { describe, expect, it } from 'vitest'
import { assess, completeGrid } from '@oceanmetrics/status'
import type { Point } from '@oceanmetrics/status'
import type { Indicator } from '../../data.ts'
import type { Place } from '../../matrix.ts'
import type { CardModel } from '../../place.ts'
import { lastText, panelRows, sharedDomain } from './smallMultiples.ts'

const P = (id: string): Place => ({ id: `NMS:${id}`, name: id, coll: 'places' })
const I = (id: string, o: Partial<Indicator> = {}): Indicator => ({ id, short: id.toUpperCase(), unit_label: '°C', decimals: 1, ...o }) as Indicator
const [A, B, C] = [P('A'), P('B'), P('C')]
const [SST, CHL] = [I('sst'), I('chl')]

describe('panelRows', () => {
  it('indicators in rows: one row per indicator, a panel per place', () => {
    const rows = panelRows([A, B], [SST, CHL], 'indicators')
    expect(rows.map(r => [r.key, r.by, r.panels.map(p => p.place.name)])).toEqual([['sst', 'indicator', ['A', 'B']], ['chl', 'indicator', ['A', 'B']]])
    expect(rows[0].title).toBe('SST')
  })
  it('places in rows: one row per place, a panel per indicator', () => {
    const rows = panelRows([A, B], [SST, CHL], 'places')
    expect(rows.map(r => [r.key, r.by, r.panels.map(p => p.ind.id)])).toEqual([['NMS:A', 'place', ['sst', 'chl']], ['NMS:B', 'place', ['sst', 'chl']]])
    expect(rows[0].title).toBe('A')
  })
  it('a pair with no value gets no panel, and a row left empty is dropped', () => {
    const has = (p: Place, i: Indicator) => !(p.id === 'NMS:B' && i.id === 'chl') && p.id !== 'NMS:C'
    const rows = panelRows([A, B, C], [SST, CHL], 'indicators', has)
    expect(rows.map(r => r.panels.map(p => p.place.name))).toEqual([['A', 'B'], ['A']])
    expect(panelRows([C], [SST, CHL], 'places', has)).toEqual([])
  })
})

const yearly = (vs: (number | null)[], y0 = 2000): Point[] => vs.map((v, i) => ({ t: `${y0 + i}-01-01`, v }))
const model = (vs: (number | null)[]): CardModel => {
  const s = yearly(vs)
  const a = assess(s, 'iea-sd', { grain: 'year', recent: 5, minPeriods: 10 }, { title: 'x', place: 'y' })
  const vals = s.filter(p => p.v != null)
  return { kind: 'continuous', series: completeGrid(s, 'year'), result: a.result, last: vals[vals.length - 1] ?? null, grain: 'year' } as unknown as CardModel
}

describe('sharedDomain', () => {
  const low = model([1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2])   // mean 1.5, SD ~0.52
  const high = model([100, 120, 100, 120, 100, 120, 100, 120, 100, 120, 100, 120])
  it('is the range of every panel of an indicator row, band included', () => {
    const d = sharedDomain('indicator', 'shared', [low, high])!
    // the lowest edge is the low panel's mean - 1 SD (just under its smallest value 1), the highest the high panel's mean + 1 SD
    expect(d[0]).toBeCloseTo(low.result!.ltMean! - low.result!.ltSd!, 12)
    expect(d[0]).toBeLessThan(1)
    expect(d[1]).toBeCloseTo(high.result!.ltMean! + high.result!.ltSd!, 12)
    expect(d[1]).toBeGreaterThan(120)
    const wide = model([0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10])
    // the band reaches 5 + 5.22 SD above, past the largest value 10
    expect(sharedDomain('indicator', 'shared', [wide])![1]).toBeGreaterThan(10)
  })
  it('free axes, and rows of one place (mixed units), share nothing', () => {
    expect(sharedDomain('indicator', 'free', [low, high])).toBeNull()
    expect(sharedDomain('place', 'shared', [low, high])).toBeNull()
  })
  it('skips panels still loading or without values; null when none has a value', () => {
    expect(sharedDomain('indicator', 'shared', [null, undefined, low])![1]).toBeLessThan(5)
    expect(sharedDomain('indicator', 'shared', [null])).toBeNull()
    expect(sharedDomain('indicator', 'shared', [])).toBeNull()
  })
})

describe('lastText', () => {
  it('the value with its unit and the period', () => {
    expect(lastText({ last: { t: '2024-01-01', v: 26.04 }, grain: 'year' }, SST)).toBe('26.0 °C · 2024')
  })
  it('no unit, no space', () => {
    expect(lastText({ last: { t: '2024-01-01', v: 3 }, grain: 'year' }, I('x', { unit_label: '', decimals: 0 }))).toBe('3 · 2024')
  })
  it('no value says so', () => {
    expect(lastText({ last: null, grain: 'year' }, SST)).toBe('no value')
  })
})
