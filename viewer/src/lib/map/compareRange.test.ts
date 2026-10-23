// the climatology Then (erddap-places parity row 32): t2 as a year range, the mean of its periods at the month of t
import { describe, expect, it } from 'vitest'
import { compareLegendLine, isYearRange, MAX_MEAN_PERIODS, meanSql, parseYearRange, rangeLabel, rangeMonth, yearRangeChoices, yearRangePeriods } from './compare.ts'

const ym = (t: string) => t.slice(0, 7)

describe('t2 as a year range', () => {
  it('2003-2012 is a range; a month, a backwards range and words are not', () => {
    expect(parseYearRange('2003-2012')).toEqual({ y0: 2003, y1: 2012 })
    expect(parseYearRange('2010-2010')).toEqual({ y0: 2010, y1: 2010 })
    expect(parseYearRange('2024-07')).toBeNull()
    expect(parseYearRange('2012-2003')).toBeNull()
    expect(isYearRange('1985-2005')).toBe(true)
    expect(isYearRange(null)).toBe(false)
  })
  it('the month: that of t, else of the latest step, else January', () => {
    expect(rangeMonth('2024-07-01', null)).toBe('07')
    expect(rangeMonth(null, '2026-09-16T00:00:00Z')).toBe('09')
    expect(rangeMonth(null, null)).toBe('01')
  })
  it('one period a year at the month, oldest first, as step dates', () => {
    const p = yearRangePeriods({ y0: 2003, y1: 2012 }, '07', { start: '2002-06-16T00:00:00Z', end: '2026-09-16T00:00:00Z' })
    expect(p.periods).toEqual(['2003-07-01', '2004-07-01', '2005-07-01', '2006-07-01', '2007-07-01', '2008-07-01', '2009-07-01', '2010-07-01', '2011-07-01', '2012-07-01'])
    expect([p.asked, p.outside, p.capped, p.inside]).toEqual([10, 0, false, 10])
  })
  it('years outside the record are left out (MUR starts in 2002-06: 1985-2005 at July is 2002..2005)', () => {
    const p = yearRangePeriods({ y0: 1985, y1: 2005 }, '07', { start: '2002-06-16T00:00:00Z', end: '2026-09-16T00:00:00Z' })
    expect(p.periods.map(ym)).toEqual(['2002-07', '2003-07', '2004-07', '2005-07'])
    expect([p.asked, p.outside, p.capped]).toEqual([21, 17, false])
    // a month after the record's last: the range's last year is out
    expect(yearRangePeriods({ y0: 2024, y1: 2026 }, '11', { start: '2002-06-16T00:00:00Z', end: '2026-09-16T00:00:00Z' }).periods.map(ym)).toEqual(['2024-11', '2025-11'])
  })
  it('capped at 12 periods: the first 12 inside the record are kept, and it says so', () => {
    expect(MAX_MEAN_PERIODS).toBe(12)
    const p = yearRangePeriods({ y0: 2003, y1: 2020 }, '07', null)
    expect(p.periods.map(ym)).toEqual(['2003-07', '2004-07', '2005-07', '2006-07', '2007-07', '2008-07', '2009-07', '2010-07', '2011-07', '2012-07', '2013-07', '2014-07'])
    expect([p.capped, p.inside]).toEqual([true, 18])
    expect(rangeLabel({ y0: 2003, y1: 2020 }, '07', ym, { ...p, failed: [] })).toBe('mean of 2003-07..2014-07 (12 periods: capped at 12 of 18)')
  })
  it('the label: from the range alone until its slices are in, then what the mean held', () => {
    const r = { y0: 2003, y1: 2012 }
    expect(rangeLabel(r, '07', ym)).toBe('mean of 2003-07..2012-07')
    const p = yearRangePeriods({ y0: 1985, y1: 2005 }, '07', { start: '2002-06-16T00:00:00Z', end: '2026-09-16T00:00:00Z' })
    expect(rangeLabel({ y0: 1985, y1: 2005 }, '07', ym, { ...p, failed: ['2004-07-01'] })).toBe('mean of 2002-07..2005-07 (3 periods; 17 outside the record; 1 failed: 2004-07)')
    const none = yearRangePeriods({ y0: 1985, y1: 1990 }, '07', { start: '2002-06-16T00:00:00Z', end: '2026-09-16T00:00:00Z' })
    expect(rangeLabel({ y0: 1985, y1: 1990 }, '07', ym, { ...none, failed: [] })).toBe('mean of 1985-07..1990-07 (no period inside the record)')
  })
  it('the choices: the baselines that overlap the record, and the ten years before t', () => {
    expect(yearRangeChoices(['1985-04', '2010-01', '2026-09'], '2024-07').map(c => c.value)).toEqual(['1985-2005', '2003-2012', '2014-2023'])
    expect(yearRangeChoices(['2008-01', '2016-01'], null).map(c => c.value)).toEqual(['2003-2012'])
    expect(yearRangeChoices([], null)).toEqual([])
    expect(yearRangeChoices(['2003-01', '2024-01'], '2024')[0]).toEqual({ value: '1985-2005', label: 'mean of 1985–2005', group: 'Then: the mean of a year range' })
  })
  it('the mean in SQL: one row per cell centre, the mean of the periods with data, NULL where none has', () => {
    expect(meanSql(['a', 'b'])).toBe([
      'SELECT any_value(lat) AS lat, any_value(lon) AS lon, any_value(weight) AS weight,',
      '  avg(value) FILTER (WHERE value IS NOT NULL AND NOT isnan(value)) AS value',
      'FROM (SELECT lat, lon, weight, value FROM a UNION ALL SELECT lat, lon, weight, value FROM b)',
      'GROUP BY ROUND(lat, 5), ROUND(lon, 5)',
      'ORDER BY lat, lon',
    ].join('\n'))
    expect(() => meanSql([])).toThrow()
    expect(() => meanSql(['a; DROP'])).toThrow()
  })
  it('the legend line names the Then of a range: "Then: mean of 2003-07..2012-07"', () => {
    const line = compareLegendLine({ title: 'SST', via: 'grid slice', first: { t: '2024-07-01', ramp: { min: 12, max: 20 }, units: '°C' }, second: { t: '2003-2012', ramp: { min: 11, max: 19 } }, anom: false, secondLabel: 'Then: mean of 2003-07..2012-07 (10 periods)' }, ym)
    expect(line).toBe('Compare: SST · left of the handle Then: mean of 2003-07..2012-07 (10 periods) · right 2024-07 · one colour scale over both periods · 12.0 to 20.0 °C · grid slice')
  })
})
