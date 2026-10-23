import { describe, expect, it } from 'vitest'
import { anomalyDomain, anomalySql, clampSwipe, compareLegendLine, defaultT2, keySwipe, scissorBox, swipeX, unionRange } from './compare.ts'

describe('the swipe geometry (one map: the second slot cut by the scissor box)', () => {
  it('the handle sits at the fraction of the box, kept off the edges (erddap-places clipFor\'s inset, here the handle\'s x)', () => {
    expect(swipeX(0.5, 1280)).toBe(640)
    expect(swipeX(0.25, 390)).toBe(98)
    expect(swipeX(0, 390)).toBe(8)
    expect(swipeX(1.4, 1000)).toBe(980)
    expect(clampSwipe(Number.NaN)).toBe(0.5)
  })
  it('the scissor box is the left of the handle, whole height, in drawing-buffer pixels from the bottom-left', () => {
    // 1280 css px at a device pixel ratio of 2: the buffer is 2560 wide, the line at 1280 buffer px = 640 css px
    expect(scissorBox(0.5, 2560, 1800)).toEqual([0, 0, 1280, 1800])
    // a phone at 3x: 390 css px, the handle at 30 %
    expect(scissorBox(0.3, 1170, 1500)).toEqual([0, 0, 351, 1500])
    expect(scissorBox(-1, 1000, 600)).toEqual([0, 0, 20, 600])
  })
  it('regression: the slot at t is cut to the right of the handle, so it does not show through the slot at t2 on the left', () => {
    expect(scissorBox(0.5, 2560, 1800, 'right')).toEqual([1280, 0, 1280, 1800])
    expect(scissorBox(0.3, 1170, 1500, 'right')).toEqual([351, 0, 819, 1500])
    // the two boxes meet at the handle and cover the buffer once
    const [l, r] = [scissorBox(0.37, 999, 10, 'left'), scissorBox(0.37, 999, 10, 'right')]
    expect(l[2] + r[2]).toBe(999)
    expect(r[0]).toBe(l[2])
  })
  it('the handle\'s keys: arrows 5 %, Shift 1 %, PageUp/PageDown 25 %, Home and End to the edges, other keys nothing', () => {
    expect(keySwipe('ArrowLeft', false, 0.5)).toBeCloseTo(0.45, 10)
    expect(keySwipe('ArrowRight', true, 0.5)).toBeCloseTo(0.51, 10)
    expect(keySwipe('PageDown', false, 0.1)).toBe(0.02)
    expect(keySwipe('Home', false, 0.5)).toBe(0.02)
    expect(keySwipe('End', false, 0.5)).toBe(0.98)
    expect(keySwipe('a', false, 0.5)).toBeNull()
  })
})

describe('the second period', () => {
  const ps = ['2016-07-01', '2017-07-01', '2018-07-01', '2019-07-01']
  it('opens on the start of the scrubber\'s window, so the window\'s two ends are compared', () => {
    expect(defaultT2(ps, 3, 2)).toBe('2017-07-01')
    expect(defaultT2(ps, 3, 12)).toBe('2016-07-01')
  })
  it('a window of one period or none is one period back; at the first period, the next; none with one period', () => {
    expect(defaultT2(ps, 3, 0)).toBe('2018-07-01')
    expect(defaultT2(ps, 0, 3)).toBe('2017-07-01')
    expect(defaultT2(['2020-01-01'], 0, 1)).toBeNull()
  })
})

describe('the colour scale', () => {
  it('one scale over both periods: the union of the ranges that are in', () => {
    expect(unionRange([[12.5, 28], [11.2, 31.2]])).toEqual([11.2, 31.2])
    expect(unionRange([[12.5, 28], null])).toEqual([12.5, 28])
    expect(unionRange([null, undefined])).toBeNull()
  })
  it('the anomaly is symmetric about 0 and holds every value', () => {
    expect(anomalyDomain([-0.8, 2.5])).toEqual([-2.5, 2.5])
    expect(anomalyDomain([-3, 1])).toEqual([-3, 3])
    expect(anomalyDomain([0, 0])).toEqual([-1, 1])
    expect(anomalyDomain(null)).toBeNull()
  })
})

describe('the anomaly SQL', () => {
  it('is t2 - t per cell of the t2 slice, NULL where either has none (a null value arrives as NaN), joined on rounded centres', () => {
    expect(anomalySql('a1', 'b1')).toBe([
      'SELECT b.lat AS lat, b.lon AS lon, b.weight AS weight,',
      '  CASE WHEN a.value IS NULL OR isnan(a.value) OR b.value IS NULL OR isnan(b.value) THEN NULL ELSE b.value - a.value END AS value',
      'FROM b1 b',
      'LEFT JOIN a1 a ON ROUND(a.lat, 5) = ROUND(b.lat, 5) AND ROUND(a.lon, 5) = ROUND(b.lon, 5)',
      'ORDER BY b.lat, b.lon',
    ].join('\n'))
  })
  it('refuses a table name that is not an identifier', () => {
    expect(() => anomalySql('a; DROP TABLE x', 'b')).toThrow(/bad table name/)
  })
})

describe('the legend names both periods', () => {
  const period = (t: string) => t.slice(0, 7)
  const base = { title: 'Sea surface temperature from MUR', via: 'grid slice in the browser (DuckDB-WASM) from ERDDAP at erddap.oceanmetrics.io' }
  it('the swipe: the period left of the handle (t2), right (t), one scale, its range', () => {
    expect(compareLegendLine({ ...base, anom: false, first: { t: '2024-07-01', ramp: { min: 11.2, max: 31.2 }, units: '°C' }, second: { t: '2016-07-01', ramp: { min: 11.2, max: 31.2 }, units: '°C' } }, period))
      .toBe('Compare: Sea surface temperature from MUR · left of the handle 2016-07 · right 2024-07 · one colour scale over both periods · 11.2 to 31.2 °C · grid slice in the browser (DuckDB-WASM) from ERDDAP at erddap.oceanmetrics.io')
  })
  it('until a slice is in it says which; a failed one says why', () => {
    expect(compareLegendLine({ ...base, anom: false, first: { t: '2024-07-01', ramp: { min: 11, max: 30 } }, second: { t: '2016-07-01', ramp: null } }, period))
      .toBe(`Compare: Sea surface temperature from MUR · left of the handle 2016-07 · right 2024-07 · one colour scale over both periods · 11.0 to 30.0 · loading the slice at 2016-07… · ${base.via}`)
    expect(compareLegendLine({ ...base, anom: false, first: { t: null, ramp: null, problem: 'no data: HTTP 500' }, second: { t: '2016-07-01', ramp: null } }, period))
      .toBe(`Compare: Sea surface temperature from MUR · left of the handle 2016-07 · right the latest time · one colour scale over both periods · loading the slice at 2016-07… · the latest time: no data: HTTP 500 · ${base.via}`)
  })
  it('the anomaly: t2 minus t, per cell, a signed symmetric range and which colour is which', () => {
    expect(compareLegendLine({ ...base, anom: true, first: { t: '2024-07-01', ramp: { min: 11.2, max: 31.2 } }, second: { t: '2016-07-01', ramp: { min: -2.46, max: 2.46 }, units: '°C' } }, period))
      .toBe(`Difference: Sea surface temperature from MUR, 2016-07 minus 2024-07, per cell · −2.46 to +2.46 °C · blue lower in 2016-07, red higher · ${base.via}`)
  })
  it('regression: a year range\'s long Then is said once in the difference, then by its short name (it was repeated whole)', () => {
    const long = 'Then: mean of 2003-01..2012-01 (10 periods)'
    const line = compareLegendLine({ ...base, anom: true, secondLabel: long, secondShort: 'Then', first: { t: '2024-01-01', ramp: { min: 0, max: 300 } }, second: { t: '2003-2012', ramp: { min: -33, max: 33 }, units: 'mm' } }, period)
    expect(line).toBe(`Difference: Sea surface temperature from MUR, ${long} minus 2024-01, per cell · −33.0 to +33.0 mm · blue lower in Then, red higher · ${base.via}`)
    expect(line.split('mean of').length - 1).toBe(1)
  })
  it('a year range still loading is named by its short name in the state, after its long name in the swipe line', () => {
    expect(compareLegendLine({ ...base, anom: false, secondLabel: 'Then: mean of 2003-07..2012-07', secondShort: 'Then', first: { t: '2024-07-01', ramp: { min: 11, max: 30 } }, second: { t: '2003-2012', ramp: null } }, period))
      .toBe(`Compare: Sea surface temperature from MUR · left of the handle Then: mean of 2003-07..2012-07 · right 2024-07 · one colour scale over both periods · 11.0 to 30.0 · loading the slice at Then… · ${base.via}`)
  })
})
