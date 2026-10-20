import { describe, expect, it } from 'vitest'
import { DEFAULT_SPEC } from '../../../../src/report/spec.ts'
import type { ReportSpec } from '../../../../src/report/spec.ts'
import { continuousRow } from '../../../../src/coverage/build.ts'
import type { CoverageRow, ValueRow } from '../../../../src/coverage/build.ts'
import type { Indicator, Manifest, Vocab, VocabId } from '../data.ts'
import { indexCoverage } from '../matrix.ts'
import { buildReport, byScore, emptyLines, exceptionWeight, requestHref, reportTitle, summaryLine } from './report.ts'
import { methodFor, needsRecompute, recentFor, recomputeStatus, scoreCell } from './scorecard.ts'

const ind = (o: Partial<Indicator> & { id: string }): Indicator => ({
  title: `${o.id} title`, short: o.id, kind: 'continuous', category: { onms: 'water-quality' },
  series: o.id, lead: true, min_periods: 10, status_grain: 'year', status_method: 'iea-sd', recent: 5, time_grains: ['year'],
  method: { kind: 'precomputed-exact', summary: '' }, producer: { name: 'erddap-places' },
  dataset: { id: 'd', title: 'D', providers: [] }, collections: [{ coll: 'places', places: 2, rows: 4, path: 'values/x/data.parquet' }],
  unit_label: '°C', decimals: 1, ...o,
}) as Indicator
const row = (o: Partial<CoverageRow>): CoverageRow => ({
  place_id: 'NMS:A', place_name: 'Alpha', coll: 'places', indicator: 'sst', time_grain: 'year', t0: '2000-01-01', t1: '2020-01-01',
  n_periods: 21, last_time: '2020-01-01', last_value: 26.04, last_class: null, status_method: 'iea-sd', status: 'above', trend: 'flat',
  recent_mean: null, recent_from: null, recent_to: null, lt_mean: null, lt_sd: null, why: null, sentence: 's', spark: '[]', ...o,
})
const vocabs = (): Record<VocabId, Vocab> => ({
  onms: { title: 'ONMS', terms: [{ id: 'water-quality', label: 'Water quality' }, { id: 'response', label: 'Response' }] },
  names: { title: 'NaMES', terms: [] }, eov: { title: 'EOV', terms: [] },
})

// sst (+ a non-lead, oisst) and chl in two sanctuaries (chl only in Alpha), sdg in one EEZ
const SST = ind({ id: 'sst', series: 'sst' })
const OISST = ind({ id: 'oisst', series: 'sst', lead: false })
const CHL = ind({ id: 'chl', series: 'chl' })
const SDG = ind({ id: 'sdg', series: 'sdg', category: { onms: 'response' }, status_method: 'values', producer: { name: 'sdg' }, collections: [{ coll: 'mr_eez', places: 1, rows: 1, path: 'values/s/data.parquet' }] })
const INDS = [SST, OISST, CHL, SDG]
const COVERAGE = [
  row({ indicator: 'sst' }), row({ indicator: 'sst', place_id: 'NMS:B', place_name: 'Bravo' }),
  row({ indicator: 'oisst' }), row({ indicator: 'chl' }),
  row({ indicator: 'chl', place_id: 'NMS:B', place_name: 'Bravo', last_value: null, why: 'no data' }),
  row({ indicator: 'sdg', place_id: 'MRGID:1', place_name: 'Zed EEZ', coll: 'mr_eez', status_method: null, status: null, trend: null }),
]
const manifest = { version: '2026.10.20', vocabularies: vocabs(), indicators: INDS } as unknown as Manifest
const catalog = { manifest, coverage: COVERAGE }
const idx = indexCoverage(COVERAGE, INDS)
const spec = (o: Partial<ReportSpec>): ReportSpec => ({ ...DEFAULT_SPEC, ...o })
const ids = (xs: { id: string }[]) => xs.map(x => x.id)

describe('the report a spec chooses', () => {
  it('expands the rules and gates by coverage: only places and indicators with a value remain', () => {
    const r = buildReport(catalog, idx, spec({ places: { include: ['coll:places'], exclude: [], context: false } }), 'onms')
    expect(ids(r.indicators)).toEqual(['sst', 'chl'])
    expect(ids(r.places)).toEqual(['NMS:A', 'NMS:B'])
  })
  it('an indicator with no value in the chosen places is dropped even when the rules include it', () => {
    const r = buildReport(catalog, idx, spec({ places: { include: ['coll:mr_eez'], exclude: [], context: false } }), 'onms')
    expect(ids(r.indicators)).toEqual(['sdg'])
    expect(ids(r.places)).toEqual(['MRGID:1'])
  })
  it('the budget counts the gated report, with the categories the vocabulary groups it in', () => {
    const r = buildReport(catalog, idx, spec({ layout: 'cards' }), 'onms')
    expect(r.groups.map(g => g.term.id)).toEqual(['water-quality', 'response'])
    expect(r.budget).toMatchObject({ places: 3, indicators: 3, panels: 9, ok: true, over: [] })
    expect(buildReport(catalog, idx, spec({ layout: 'small-multiples' }), 'onms').budget.ok).toBe(true)
    expect(buildReport(catalog, idx, spec({ layout: 'map-sheet' }), 'onms').budget.over).toEqual(['indicators > 1'])
  })
  it('lists the cells with no value, by kind', () => {
    const r = buildReport(catalog, idx, spec({}), 'onms')
    // sst everywhere but the EEZ ("live": erddap-places can compute it), chl in Bravo ("no data"), sdg in the sanctuaries
    expect(r.empties.map(e => `${e.place.id}/${e.ind.id}/${e.kind}`)).toEqual([
      'NMS:A/sdg/na', 'NMS:B/chl/nodata', 'NMS:B/sdg/na', 'MRGID:1/sst/live', 'MRGID:1/chl/live',
    ])
  })
  it('collapsing is on offer only when a chosen indicator is not its series lead', () => {
    expect(buildReport(catalog, idx, spec({}), 'onms').nonLeads).toBe(false)
    const r = buildReport(catalog, idx, spec({ indicators: { include: ['series:sst:*'], exclude: [] } }), 'onms')
    expect(ids(r.indicators)).toEqual(['sst', 'oisst'])
    expect(r.nonLeads).toBe(true)
  })
  it('orders places by collection, then name', () => {
    const r = buildReport(catalog, idx, spec({ places: { include: ['MRGID:1', 'NMS:B', 'NMS:A'], exclude: [], context: false } }), 'onms')
    expect(ids(r.places)).toEqual(['NMS:A', 'NMS:B', 'MRGID:1'])
  })
})

describe('words and the request', () => {
  it('the summary line', () => {
    expect(summaryLine(spec({ layout: 'scorecard' }), 9, 12)).toBe('9 places × 12 indicators · Scorecard · iea-sd')
    expect(summaryLine(spec({ style: { ...DEFAULT_SPEC.style, status: 'values' } }), 1, 1)).toBe('1 place × 1 indicator · Cards · values')
  })
  it('the title falls back to "Report"', () => {
    expect(reportTitle(spec({}))).toBe('Report')
    expect(reportTitle(spec({ title: ' Sanctuary condition ' }))).toBe('Sanctuary condition')
  })
  const E = buildReport(catalog, idx, spec({}), 'onms').empties
  it('lists the empty cells, at most max, then a count of the rest', () => {
    expect(emptyLines(E, 2)).toEqual([
      '- Alpha (NMS:A) / sdg (sdg): not applicable',
      '- Bravo (NMS:B) / chl (chl): no data',
      '- ... and 3 more',
    ])
  })
  it('a prefilled GitHub issue carries the permalink and the cells', () => {
    const href = requestHref('https://oceanmetrics.io/indicators/#view=report&layout=scorecard', E, 40)
    const u = new URL(href)
    expect(u.origin + u.pathname).toBe('https://github.com/oceanmetrics/indicators/issues/new')
    expect(u.searchParams.get('title')).toBe('Request: values for 5 cells')
    const body = u.searchParams.get('body')!
    expect(body.split('\n')[0]).toBe('Report: https://oceanmetrics.io/indicators/#view=report&layout=scorecard')
    expect(body).toContain('- Bravo (NMS:B) / chl (chl): no data')
    expect(href).toContain('title=Request%3A+values+for+5+cells')
  })
  it('one cell is "cell", not "cells"', () => {
    expect(new URL(requestHref('x', E.slice(0, 1))).searchParams.get('title')).toBe('Request: values for 1 cell')
  })
})

describe('exceptions first', () => {
  it('sorts highest score first and keeps the order of ties', () => {
    expect(byScore(['a', 'b', 'c', 'd'], t => ({ a: 1, b: 3, c: 1, d: 2 })[t]!)).toEqual(['b', 'd', 'a', 'c'])
  })
  it('weights an out-of-range status 3, a trend 2, in range 1, nothing 0', () => {
    expect([0, 1, 2, 3].map(exceptionWeight)).toEqual([3, 2, 1, 0])
  })
})

describe('a Scorecard cell', () => {
  const place = { id: 'NMS:A', name: 'Alpha', coll: 'places' }
  it('reads the coverage row: glyphs, value and a name that says all of it', () => {
    const c = scoreCell(SST, place, row({ status: 'below', trend: 'down' }))
    expect([c.kind, c.statusIcon, c.trendIcon, c.value, c.period, c.rank]).toEqual(['value', 'st-below', 'tr-down', '26.0 °C', '2020', 0])
    expect(c.aria).toBe('Alpha, sst: 26.0 °C in 2020; below its own record; trend down.')
  })
  it('a trend alone ranks 1, in range with no trend 2, a status method without a status 3', () => {
    expect(scoreCell(SST, place, row({ status: 'within', trend: 'up' })).rank).toBe(1)
    expect(scoreCell(SST, place, row({ status: 'within', trend: 'flat' })).rank).toBe(2)
    expect(scoreCell(SST, place, row({ status: null, trend: null, why: 'short' })).statusIcon).toBe('st-none')
    expect(scoreCell(SST, place, row({ status: null, trend: null, why: 'short' })).rank).toBe(3)
  })
  it('an empty cell has its state glyph and no value', () => {
    const c = scoreCell(CHL, place, row({ last_value: null }))
    expect([c.kind, c.stateIcon, c.value, c.rank]).toEqual(['nodata', 'cell-na', '', 3])
  })
})

describe('a spec that differs from the indicator default', () => {
  const place = { id: 'NMS:A', name: 'Alpha', coll: 'places' }
  const years = Array.from({ length: 20 }, (_, n) => 2000 + n)
  // a flat record of 10 with the last five years at 14: well above the long-term mean +/- 1 SD
  const values = (cut = 5): ValueRow[] => years.map((y, n) => ({
    place_id: 'NMS:A', coll: 'places', indicator: 'sst', time_grain: 'year', time: `${y}-01-01`, class: null, value: n >= years.length - cut ? 14 : 10 + (n % 2) * 0.1, n: 1, unit: '°C',
  }) as ValueRow)
  const cov = continuousRow(values(), SST as never, 'Alpha')

  it('the default spec reads the coverage row', () => {
    expect(needsRecompute(SST, cov, DEFAULT_SPEC)).toBe(false)
    expect(cov.status).toBe('above')
  })
  it('another method, window, baseline or span asks for the values', () => {
    const style = (o: Partial<ReportSpec['style']>) => spec({ style: { ...DEFAULT_SPEC.style, ...o } })
    expect(needsRecompute(SST, cov, style({ status: 'names-pct' }))).toBe(true)
    expect(needsRecompute(SST, cov, style({ recent: 10 }))).toBe(true)
    expect(needsRecompute(SST, cov, style({ baseline: [2000, 2010] }))).toBe(true)
    expect(needsRecompute(SST, cov, spec({ time: { grain: 'year', from: 2005, to: null } }))).toBe(true)
  })
  it('the spec\'s default method and window mean each indicator\'s own', () => {
    const names = ind({ id: 'n', status_method: 'names-pct', recent: 3 })
    expect(methodFor(names, DEFAULT_SPEC)).toBe('names-pct')
    expect(recentFor(names, DEFAULT_SPEC)).toBe(3)
    expect(needsRecompute(names, row({ indicator: 'n' }), DEFAULT_SPEC)).toBe(false)
    expect(methodFor(names, spec({ style: { ...DEFAULT_SPEC.style, status: 'values' } }))).toBe('values')
    expect(recentFor(names, spec({ style: { ...DEFAULT_SPEC.style, recent: 8 } }))).toBe(8)
  })
  it('an indicator whose own method is values never gets a status, and a row at another grain is left alone', () => {
    expect(methodFor(SDG, DEFAULT_SPEC)).toBeNull()
    expect(needsRecompute(SDG, row({ indicator: 'sdg' }), spec({ style: { ...DEFAULT_SPEC.style, status: 'names-pct' } }))).toBe(false)
    expect(needsRecompute(SST, row({ time_grain: 'month' }), spec({ style: { ...DEFAULT_SPEC.style, status: 'names-pct' } }))).toBe(false)
  })
  it('recomputes with src/status: the window decides the status', () => {
    expect(recomputeStatus(SST, place, values(), DEFAULT_SPEC).status).toBe('above')
    // a 12-year window over a record whose last 5 years are high: the recent mean is closer to the long-term mean
    const wide = recomputeStatus(SST, place, values(), spec({ style: { ...DEFAULT_SPEC.style, recent: 18 } }))
    expect(wide.recentFrom).toBe('2002-01-01')
  })
  it('cuts the record to the years the spec keeps', () => {
    const r = recomputeStatus(SST, place, values(), spec({ time: { grain: 'year', from: 2000, to: 2009 } }))
    expect(r.t1).toBe('2009-01-01')
  })
  it('a recomputed status replaces the row\'s in the cell, glyphs and words together', () => {
    const r = recomputeStatus(SST, place, values(), spec({ style: { ...DEFAULT_SPEC.style, status: 'values' } }))
    const c = scoreCell(SST, place, cov, r)
    expect([c.statusIcon, c.trendIcon, c.rank]).toEqual([null, null, 3])
    expect(c.aria).toContain('no status')
    const n = scoreCell(SST, place, cov, recomputeStatus(SST, place, values(), spec({ style: { ...DEFAULT_SPEC.style, status: 'names-pct' } })))
    expect([cov.status, n.statusIcon]).toEqual(['above', 'st-within'])
  })
})
