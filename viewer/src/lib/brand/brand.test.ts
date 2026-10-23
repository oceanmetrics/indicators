import { describe, expect, it } from 'vitest'
import { CHANGES_HREF, navAttrs, pageTitle, parseBrand, titleFor } from './brand.ts'

describe('brand', () => {
  it('?brand= picks the instance, oceanmetrics by default', () => {
    expect(parseBrand('')).toBe('oceanmetrics')
    expect(parseBrand('?brand=mbon')).toBe('mbon')
    expect(parseBrand('?brand=oceanmetrics&theme=dark')).toBe('oceanmetrics')
    expect(parseBrand('?brand=other')).toBe('oceanmetrics')
  })
  it('the shared bar is for the Ocean Metrics instance only: the MBON instance gets none', () => {
    expect(navAttrs('mbon', 'light')).toBeNull()
    expect(navAttrs('mbon', 'dark')).toBeNull()
    expect(navAttrs('oceanmetrics', 'light')).not.toBeNull()
  })
  it('the bar marks Indicators, wears the viewer’s resolved theme and sends "What changed" to the alerts page', () => {
    expect(navAttrs('oceanmetrics', 'dark', '')).toEqual({ current: 'indicators', theme: 'dark', 'changes-href': 'https://oceanmetrics.io/alerts/' })
    expect(navAttrs('oceanmetrics', 'light')?.theme).toBe('light')
    expect(CHANGES_HREF).toBe('https://oceanmetrics.io/alerts/')
  })
  it('analytics: data-ga (the kept hash key "view", a fixed title) only when the build has an id; never on the MBON instance', () => {
    expect(navAttrs('oceanmetrics', 'light', '')).toEqual({ current: 'indicators', theme: 'light', 'changes-href': 'https://oceanmetrics.io/alerts/' })
    expect(navAttrs('oceanmetrics', 'light', 'G-TEST000000')).toEqual({
      current: 'indicators', theme: 'light', 'changes-href': 'https://oceanmetrics.io/alerts/', 'data-ga': 'G-TEST000000', 'data-ga-keep': 'view',
      'data-ga-title': 'Ocean Metrics Indicators' })
    expect(navAttrs('mbon', 'light', 'G-TEST000000')).toBeNull()
  })
  it('without VITE_GA_ID (this test run) the bar gets no data-ga', () => {
    expect(navAttrs('oceanmetrics', 'dark')).not.toHaveProperty('data-ga')
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
