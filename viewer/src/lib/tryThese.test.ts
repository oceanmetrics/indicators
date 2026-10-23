import { describe, expect, it } from 'vitest'
import { parseHash } from './hash.ts'
import { TRY_THESE, tryHref } from './tryThese.ts'

describe('Help → Try these', () => {
  it('is the five views of the shoot script, in order', () => {
    expect(TRY_THESE.map(t => [t.id, tryHref(t, 'https://oceanmetrics.io/indicators/')])).toEqual([
      ['layer', 'https://oceanmetrics.io/indicators/#view=map&ind=erddap:dhw_5km:CRW_SST:mean&pi=coll:places&grain=month&t=2024-07&layer=grid:jplMURSST41mday:sst&place=NMS:CINMS'],
      ['compare', 'https://oceanmetrics.io/indicators/#view=map&ind=erddap:dhw_5km:CRW_SST:mean&pi=coll:places&grain=month&t=2024-07&layer=grid:jplMURSST41mday:sst&place=NMS:CINMS&t2=2016-07'],
      ['anomaly', 'https://oceanmetrics.io/indicators/#view=map&ind=erddap:dhw_5km:CRW_SST:mean&pi=coll:places&grain=month&t=2024-07&layer=grid:jplMURSST41mday:sst&place=NMS:CINMS&t2=2016-07&anom=1'],
      ['range', 'https://oceanmetrics.io/indicators/#view=map&ind=erddap:dhw_5km:CRW_SST:mean&pi=NMS:CINMS&place=NMS:CINMS&grain=month&t=2024-07&layer=grid:jplMURSST41mday:sst&t2=2003-2012'],
      ['place', 'https://oceanmetrics.io/indicators/#view=place&place=NMS:FKNMS'],
    ])
  })
  it('links on this page by the hash alone', () => {
    expect(tryHref(TRY_THESE[4])).toBe('#view=place&place=NMS:FKNMS')
  })
  it('every example reads back as the view it names', () => {
    const v = TRY_THESE.map(t => parseHash('#' + t.hash))
    expect(v.map(x => x.view)).toEqual(['map', 'map', 'map', 'map', 'place'])
    expect(v.slice(0, 4).map(x => x.layer)).toEqual(Array(4).fill('grid:jplMURSST41mday:sst'))
    expect(v.map(x => x.t2 ?? null)).toEqual([null, '2016-07', '2016-07', '2003-2012', null])
    expect(v[2].anom).toBe(true)
    expect(v[4].place).toBe('NMS:FKNMS')
  })
  it('has a label each', () => {
    for (const t of TRY_THESE) expect(t.label.length).toBeGreaterThan(5)
  })
})
