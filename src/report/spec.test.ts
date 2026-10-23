import { describe, expect, it } from 'vitest'
import { expandPlaces } from '@oceanmetrics/catalog/report'
import { DEFAULT_SPEC, budget, budgetLine, coverageCounts, exceptionRank, specFromParams, specId, specParams } from './spec.ts'
import type { ReportSpec } from './spec.ts'

const ids = (xs: { id: string }[]) => xs.map(x => x.id)
const PLACES = [
  { id: 'NMS:CINMS', coll: 'places' }, { id: 'NMS:FKNMS', coll: 'places' }, { id: 'NMS:TBNMS', coll: 'places' },
  { id: 'MRGID:8456', coll: 'mr_eez' }, { id: 'MRGID:8371', coll: 'mr_eez' },
]
const kv = (s: string) => new Map(s.split('&').filter(Boolean).map(p => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)] as [string, string] }))

describe('the report spec in a URL', () => {
  it('the default spec writes no keys, and no keys read back the default', () => {
    expect(specParams(DEFAULT_SPEC)).toEqual([])
    expect(specFromParams(new Map())).toEqual(DEFAULT_SPEC)
  })
  it('writes only what differs, in a fixed order, and round-trips', () => {
    const s: ReportSpec = {
      ...DEFAULT_SPEC,
      places: { include: ['coll:mr_eez'], exclude: ['NMS:TBNMS'], context: true },
      indicators: { include: ['cat:water-quality', 'series:obis-all'], exclude: ['obis:simpson'] },
      layout: 'scorecard',
      style: { status: 'names-pct', recent: 10, baseline: [1991, 2020] },
      time: { grain: 'year', from: 1982, to: 2020 },
      split: 'place',
      yaxis: 'free',
      as_of: '2026.10.20',
      title: 'Sanctuary condition',
    }
    expect(specParams(s)).toEqual([
      ['pi', 'coll:mr_eez'], ['px', 'NMS:TBNMS'], ['ctx', '1'], ['ii', 'cat:water-quality,series:obis-all'], ['ix', 'obis:simpson'],
      ['layout', 'scorecard'], ['status', 'names-pct'], ['recent', '10'], ['base', '1991-2020'], ['from', '1982'], ['to', '2020'],
      ['split', 'place'], ['ys', 'free'], ['asof', '2026.10.20'], ['title', 'Sanctuary condition'],
    ])
    expect(specFromParams(new Map(specParams(s)))).toEqual(s)
  })
  it('falls back to the default on an unknown layout, method or grain, an out-of-range window or a reversed baseline', () => {
    const s = specFromParams(kv('layout=poster&status=anomaly&grain=week&recent=1&base=2020-1991&from=x&split=tile'))
    expect(s).toEqual(DEFAULT_SPEC)
    expect(specFromParams(kv('recent=51')).style.recent).toBe(5)
  })
  it('ys=free is the Small multiples y axis: shared writes nothing, anything but free reads as shared', () => {
    expect(DEFAULT_SPEC.yaxis).toBe('shared')
    expect(specParams({ ...DEFAULT_SPEC, yaxis: 'free' })).toEqual([['ys', 'free']])
    expect(specParams({ ...DEFAULT_SPEC, yaxis: 'shared' })).toEqual([])
    expect(specFromParams(kv('ys=free')).yaxis).toBe('free')
    expect(specFromParams(kv('ys=shared')).yaxis).toBe('shared')
    expect(specFromParams(kv('ys=loose')).yaxis).toBe('shared')
  })
  it('an old link with ctx=1 still reads (context extents are no longer shown, the key is kept so links do not break)', () => {
    expect(specFromParams(kv('ctx=1')).places.context).toBe(true)
    expect(specParams(specFromParams(kv('ctx=1')))).toEqual([['ctx', '1']])
  })
  it('depth is the view\'s own key: it is passed in, never written', () => {
    expect(specFromParams(new Map(), 'dive').depth).toBe('dive')
    expect(specParams({ ...DEFAULT_SPEC, depth: 'dive' })).toEqual([])
  })
  it('the id depends on the selection and the manifest version, not on depth', () => {
    const a = specId(DEFAULT_SPEC, '2026.10.20')
    expect(a).toMatch(/^[0-9a-f]{12}$/)
    expect(specId({ ...DEFAULT_SPEC, depth: 'dive' }, '2026.10.20')).toBe(a)
    expect(specId(DEFAULT_SPEC, '2026.10.21')).not.toBe(a)
    expect(specId({ ...DEFAULT_SPEC, layout: 'scorecard' }, '2026.10.20')).not.toBe(a)
  })
})

// the rules themselves (matchPlaces, expandPlaces, matchIndicators, expandIndicators, seriesLeads) moved to
// @oceanmetrics/catalog/report with their tests (catalog 0.5.0); what stays is the spec's use of them
describe('the spec over the rules', () => {
  it('the spec reads the places rules of @oceanmetrics/catalog/report: coll:places is strict for the default', () => {
    const pl = [
      { id: 'NMS:A', coll: 'places', valuesColls: ['places'] },
      { id: 'MRGID:8439', coll: 'mr_eez', valuesColls: ['mr_eez', 'places'] },
    ]
    expect(ids(expandPlaces(DEFAULT_SPEC.places, pl))).toEqual(['NMS:A'])
  })
  it('the spec keeps ctx between the places and the indicators keys', () => {
    expect(specParams({ ...DEFAULT_SPEC, places: { include: ['*'], exclude: ['x:1'], context: true }, indicators: { include: ['all'], exclude: ['y:2'] } }))
      .toEqual([['pi', '*'], ['px', 'x:1'], ['ctx', '1'], ['ii', 'all'], ['ix', 'y:2']])
  })
  it('the default spec never shares its arrays with a spec read from a URL', () => {
    const s = specFromParams(new Map())
    s.places.include.push('x:1')
    expect(DEFAULT_SPEC.places.include).toEqual(['coll:places'])
  })
  it('the default places are the sanctuaries (coll:places), written as nothing', () => {
    expect(DEFAULT_SPEC.places.include).toEqual(['coll:places'])
    expect(specParams({ ...DEFAULT_SPEC, places: { ...DEFAULT_SPEC.places, include: ['*'] } })).toEqual([['pi', '*']])
  })
  it('coverage counts the chosen places with a value, per indicator', () => {
    const rows = [
      { place_id: 'NMS:CINMS', indicator: 'erddap:sst:mean', last_value: 15.2 },
      { place_id: 'NMS:CINMS', indicator: 'erddap:sst:mean', last_value: 15.1 },   // a second grain
      { place_id: 'NMS:FKNMS', indicator: 'erddap:sst:mean', last_value: null },
      { place_id: 'NMS:FKNMS', indicator: 'erddap:npp:mean', last_value: 300 },
      { place_id: 'MRGID:8456', indicator: 'erddap:npp:mean', last_value: 1 },     // not chosen
    ]
    expect([...coverageCounts(rows, PLACES.slice(0, 2))]).toEqual([['erddap:sst:mean', 1], ['erddap:npp:mean', 1]])
  })
})

describe('the panel budget', () => {
  it('within the caps: ok, no fixes', () => {
    expect(budget('cards', 2, 12)).toEqual({ places: 2, indicators: 12, panels: 24, over: [], ok: true, fixes: [] })
  })
  it('Cards over its place and panel caps offers Scorecard, per-place sections and collapsing', () => {
    const b = budget('cards', 9, 12, 4, true)
    expect(b.over).toEqual(['places > 3', 'panels > 40'])
    expect(b.fixes).toEqual([
      { kind: 'layout', layout: 'scorecard' },
      { kind: 'split', by: 'place', sections: 9 },
      { kind: 'collapse' },
    ])
    expect(budgetLine('cards', b)).toBe('9 places × 12 indicators = 108 panels; Cards shows up to 3 places and 40 panels')
  })
  it('a category split is offered when each category fits', () => {
    const b = budget('scorecard', 10, 30, 3)
    expect(b.over).toEqual(['indicators > 20'])
    expect(b.fixes).toContainEqual({ kind: 'split', by: 'category', sections: 3 })
  })
  it('the Map sheet takes one indicator; the Dossier is paged and never over', () => {
    expect(budget('map-sheet', 20, 2).over).toEqual(['indicators > 1'])
    expect(budget('dossier', 100, 100).ok).toBe(true)
    expect(budgetLine('dossier', budget('dossier', 1, 1))).toBe('1 place × 1 indicator = 1 panel; Dossier pages them all')
  })
})

describe('exceptions first', () => {
  it('out of range, then a trend, then within or flat, then no status', () => {
    expect([exceptionRank('above', 'flat'), exceptionRank('below', null), exceptionRank('within', 'up'), exceptionRank('within', 'flat'), exceptionRank(null, null)])
      .toEqual([0, 0, 1, 2, 3])
  })
})
