import { describe, expect, it } from 'vitest'
import { breakParts } from './wrap.ts'

describe('breakParts', () => {
  it('cuts a dataset id after its : and _ and never inside a word', () => {
    expect(breakParts('erddap:IMERG_monthly_global_precip:precipitation:mean')).toEqual(['erddap:', 'IMERG_', 'monthly_', 'global_', 'precip:', 'precipitation:', 'mean'])
  })
  it('cuts a url after its / and . but keeps the // of the scheme together', () => {
    expect(breakParts('https://erddap.marine.usf.edu/info/index.html')).toEqual(['https://', 'erddap.', 'marine.', 'usf.', 'edu/', 'info/', 'index.', 'html'])
  })
  it('joined again it is the text, spaces included; text with no separator is one part', () => {
    const s = 'Values: Ocean Metrics Indicators, manifest 2026.10.23, place NMS:FKNMS, CC BY 4.0, https://oceanmetrics.io/indicators/'
    expect(breakParts(s).join('')).toBe(s)
    expect(breakParts('Florida')).toEqual(['Florida'])
    expect(breakParts('')).toEqual([])
  })
})
