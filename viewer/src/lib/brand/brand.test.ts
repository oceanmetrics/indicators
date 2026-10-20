import { describe, expect, it } from 'vitest'
import { MARK_SVG, pageTitle, parseBrand, themedMark, titleFor } from './brand.ts'

describe('brand', () => {
  it('?brand= picks the instance, oceanmetrics by default', () => {
    expect(parseBrand('')).toBe('oceanmetrics')
    expect(parseBrand('?brand=mbon')).toBe('mbon')
    expect(parseBrand('?brand=oceanmetrics&theme=dark')).toBe('oceanmetrics')
    expect(parseBrand('?brand=other')).toBe('oceanmetrics')
  })
  it('the mark hands its fixed waterline fill to the theme token and keeps the ring on currentColor', () => {
    expect(themedMark('<g fill="currentColor"/><path fill="' + '#' + 'f5b528"/>')).toBe('<g fill="currentColor"/><path fill="var(--om-mark-spark)"/>')
    expect(MARK_SVG).toContain('fill="var(--om-mark-spark)"')
    expect(MARK_SVG).toContain('fill="currentColor"')
    expect(MARK_SVG).not.toMatch(new RegExp('fill="' + '#'))
  })
  it('the page title carries the instance', () => {
    expect(titleFor('mbon')).toBe('Ocean Metrics Indicators · MBON')
    expect(titleFor('oceanmetrics')).toBe('Ocean Metrics Indicators · Ocean Metrics')
  })
  it('a view’s title is "<view> · Ocean Metrics Indicators", or "· MBON" on the MBON instance', () => {
    expect(pageTitle('oceanmetrics', 'Matrix')).toBe('Matrix · Ocean Metrics Indicators')
    expect(pageTitle('oceanmetrics', 'Florida Keys National Marine Sanctuary')).toBe('Florida Keys National Marine Sanctuary · Ocean Metrics Indicators')
    expect(pageTitle('mbon', 'Matrix')).toBe('Matrix · MBON')
  })
})
