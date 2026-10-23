import { describe, expect, it } from 'vitest'
import { DEFAULT_SPEC } from './spec.ts'
import type { ReportSpec } from './spec.ts'
import { watchHref, watchPlaceHref } from './watch.ts'

const spec = (p: Partial<Pick<ReportSpec, 'places' | 'indicators' | 'title'>>): ReportSpec => ({ ...DEFAULT_SPEC, ...p })
const q = (h: string) => Object.fromEntries(new URL(h).searchParams)

describe('watchHref', () => {
  it('the default selection names the sanctuaries explicitly, with the report title', () => {
    const h = watchHref(spec({ title: 'Sanctuary condition' }))
    expect(h).toBe('https://oceanmetrics.io/alerts/?pi=coll%3Aplaces&title=Sanctuary+condition')
  })
  it('rules with excludes and indicator rules carry pi px ii ix, URL-encoded, and no layout or style keys', () => {
    const h = watchHref({
      ...DEFAULT_SPEC, layout: 'scorecard', title: 'Climate & heat',
      places: { include: ['coll:places', 'set:west'], exclude: ['NMS:FKNMS'], context: false },
      indicators: { include: ['cat:temperature', 'series:sst:*'], exclude: ['sst_x'] },
    })
    expect(q(h)).toEqual({ pi: 'coll:places,set:west', px: 'NMS:FKNMS', ii: 'cat:temperature,series:sst:*', ix: 'sst_x', title: 'Climate & heat' })
    expect(h).toContain('title=Climate+%26+heat')
    expect(h).not.toContain('layout')
  })
  it('one place id and nothing else is place=<id>', () => {
    expect(watchHref(spec({ places: { include: ['NMS:CINMS'], exclude: [], context: false } }))).toBe('https://oceanmetrics.io/alerts/?place=NMS%3ACINMS')
    // not when an indicator rule, an exclude, a group or several ids make it a rule
    expect(q(watchHref(spec({ places: { include: ['NMS:CINMS'], exclude: [], context: false }, indicators: { include: ['all'], exclude: [] } })))).toEqual({ pi: 'NMS:CINMS', ii: 'all' })
    expect(q(watchHref(spec({ places: { include: ['NMS:CINMS', 'NMS:FKNMS'], exclude: [], context: false } })))).toEqual({ pi: 'NMS:CINMS,NMS:FKNMS' })
    expect(q(watchHref(spec({ places: { include: ['coll:places'], exclude: [], context: false } })))).toEqual({ pi: 'coll:places' })
  })
  it('a place page links its own id, named', () => {
    expect(watchPlaceHref('NMS:CINMS')).toBe('https://oceanmetrics.io/alerts/?place=NMS%3ACINMS')
    expect(q(watchPlaceHref('NMS:CINMS', 'Channel Islands'))).toEqual({ place: 'NMS:CINMS', title: 'Channel Islands' })
  })
})
