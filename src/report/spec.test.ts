import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPEC, budget, budgetLine, coverageCounts, exceptionRank, expandIndicators, expandPlaces, matchIndicators,
  seriesLeads, specFromParams, specId, specParams,
} from './spec.ts'
import type { ReportSpec } from './spec.ts'

const IND = [
  { id: 'erddap:sst:mean', series: 'sst', lead: true, category: { onms: 'water-quality', names: 'physical-chemical', eov: 'sea-surface-temperature' } },
  { id: 'erddap:oisst:mean', series: 'sst', lead: false, category: { onms: 'water-quality', names: 'physical-chemical', eov: 'sea-surface-temperature' } },
  { id: 'erddap:npp:mean', series: 'npp', lead: true, category: { onms: 'living-resources', names: 'biological', eov: 'phytoplankton' } },
  { id: 'obis:species', series: 'obis-all', lead: true, category: { onms: 'living-resources', names: 'biological' } },
  { id: 'obis:records', series: 'obis-all', lead: false, category: { onms: 'living-resources', names: 'biological' } },
  { id: 'sdg:x', series: 'sdg', lead: false, category: { onms: 'response' } },
]
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
      places: { include: ['coll:places'], exclude: ['NMS:TBNMS'], context: true },
      indicators: { include: ['cat:water-quality', 'series:obis-all'], exclude: ['obis:simpson'] },
      layout: 'scorecard',
      style: { status: 'names-pct', recent: 10, baseline: [1991, 2020] },
      time: { grain: 'year', from: 1982, to: 2020 },
      as_of: '2026.10.20',
      title: 'Sanctuary condition',
    }
    expect(specParams(s)).toEqual([
      ['pi', 'coll:places'], ['px', 'NMS:TBNMS'], ['ctx', '1'], ['ii', 'cat:water-quality,series:obis-all'], ['ix', 'obis:simpson'],
      ['layout', 'scorecard'], ['status', 'names-pct'], ['recent', '10'], ['base', '1991-2020'], ['from', '1982'], ['to', '2020'],
      ['asof', '2026.10.20'], ['title', 'Sanctuary condition'],
    ])
    expect(specFromParams(new Map(specParams(s)))).toEqual(s)
  })
  it('falls back to the default on an unknown layout, method or grain, an out-of-range window or a reversed baseline', () => {
    const s = specFromParams(kv('layout=poster&status=anomaly&grain=week&recent=1&base=2020-1991&from=x'))
    expect(s).toEqual(DEFAULT_SPEC)
    expect(specFromParams(kv('recent=51')).style.recent).toBe(5)
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

describe('expanding the rules', () => {
  it('a series lead is the marked one, else its first member', () => {
    expect([...seriesLeads(IND)].map(([s, i]) => `${s}=${i.id}`)).toEqual(['sst=erddap:sst:mean', 'npp=erddap:npp:mean', 'obis-all=obis:species', 'sdg=sdg:x'])
  })
  it('* is every series lead; cat: is the leads tagged with the term in any vocabulary', () => {
    expect(ids(matchIndicators('*', IND))).toEqual(['erddap:sst:mean', 'erddap:npp:mean', 'obis:species', 'sdg:x'])
    expect(ids(matchIndicators('cat:living-resources', IND))).toEqual(['erddap:npp:mean', 'obis:species'])
    expect(ids(matchIndicators('cat:sea-surface-temperature', IND))).toEqual(['erddap:sst:mean'])
  })
  it('series: is its lead, series:…:* every member, an id itself, an unknown rule nothing', () => {
    expect(ids(matchIndicators('series:sst', IND))).toEqual(['erddap:sst:mean'])
    expect(ids(matchIndicators('series:sst:*', IND))).toEqual(['erddap:sst:mean', 'erddap:oisst:mean'])
    expect(ids(matchIndicators('erddap:oisst:mean', IND))).toEqual(['erddap:oisst:mean'])
    expect(matchIndicators('cat:nope', IND)).toEqual([])
  })
  it('include then exclude, in manifest order; an exclude may be a rule', () => {
    expect(ids(expandIndicators({ include: ['cat:living-resources', 'erddap:oisst:mean'], exclude: ['obis:species'] }, IND)))
      .toEqual(['erddap:oisst:mean', 'erddap:npp:mean'])
    expect(ids(expandIndicators({ include: ['*'], exclude: ['series:obis-all:*'] }, IND))).toEqual(['erddap:sst:mean', 'erddap:npp:mean', 'sdg:x'])
  })
  it('places: *, coll:, an id; then the excludes', () => {
    expect(ids(expandPlaces({ include: ['coll:places'], exclude: ['NMS:TBNMS'], context: false }, PLACES))).toEqual(['NMS:CINMS', 'NMS:FKNMS'])
    expect(ids(expandPlaces({ include: ['NMS:CINMS', 'MRGID:8371'], exclude: [], context: false }, PLACES))).toEqual(['NMS:CINMS', 'MRGID:8371'])
    expect(expandPlaces({ include: ['*'], exclude: ['coll:mr_eez'], context: false }, PLACES)).toHaveLength(3)
  })
  it('coverage counts the chosen places with a value, per indicator', () => {
    const rows = [
      { place_id: 'NMS:CINMS', coll: 'places', indicator: 'erddap:sst:mean', last_value: 15.2 },
      { place_id: 'NMS:CINMS', coll: 'places', indicator: 'erddap:sst:mean', last_value: 15.1 },   // a second grain
      { place_id: 'NMS:FKNMS', coll: 'places', indicator: 'erddap:sst:mean', last_value: null },
      { place_id: 'NMS:FKNMS', coll: 'places', indicator: 'erddap:npp:mean', last_value: 300 },
      { place_id: 'MRGID:8456', coll: 'mr_eez', indicator: 'erddap:npp:mean', last_value: 1 },     // not chosen
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
