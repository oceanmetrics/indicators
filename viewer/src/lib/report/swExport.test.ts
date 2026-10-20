import { describe, expect, it } from 'vitest'
import { DEFAULT_SPEC } from '../../../../src/report/spec.ts'
import type { ReportSpec } from '../../../../src/report/spec.ts'
import { swBundleFiles } from '../../../../src/report/swBundle.ts'
import type { CoverageRow } from '../../../../src/coverage/build.ts'
import type { Catalog, Indicator } from '../data.ts'
import { indexCoverage } from '../matrix.ts'
import type { PlaceRow } from '../valuesData.ts'
import { cellKey, modelFor } from './cells.ts'
import type { CellResult } from './cells.ts'
import { planSwBundle, swFigureFor } from './swExport.ts'

const IND = (id: string, o: Partial<Indicator> = {}): Indicator => ({
  id, title: `${id} title`, short: id.toUpperCase(), kind: 'continuous', category: { onms: 'water-quality' }, series: id, lead: true, min_periods: 10,
  status_grain: 'year', status_method: 'iea-sd', recent: 5, time_grains: ['year'], method: { kind: 'x', summary: 'Yearly means.' }, producer: { name: 'erddap-places' },
  dataset: { id: 'd', title: 'D', providers: [{ name: 'NOAA CRW', roles: ['producer'], url: 'https://crw' }, { name: 'Other', roles: ['host'] }] },
  collections: [{ coll: 'places', places: 2, rows: 30, path: `values/${id}.parquet` }], unit_label: '°C', decimals: 1, citation: 'NOAA CRW (2018).', ...o,
}) as unknown as Indicator
const SST = IND('sst'), NAMES = IND('npp', { status_method: 'names-pct' }), VALS = IND('sdg', { status_method: 'values' }), MONTHLY = IND('chl', { status_grain: 'month', time_grains: ['month'] })
const CAT = IND('cls', { kind: 'categorical' })
const manifest = { version: '2026.10.20', vocabularies: { onms: { terms: [{ id: 'water-quality', label: 'Water quality' }] } } } as unknown as Catalog['manifest']
const catalog = { manifest }
const cov = (id: string, name: string, ind: string): CoverageRow => ({ place_id: id, place_name: name, coll: 'places', indicator: ind, time_grain: 'year', last_value: 1, last_class: null } as CoverageRow)
const idx = indexCoverage([cov('NMS:A', 'Alpha', 'sst'), cov('NMS:B', 'Bravo', 'sst')])
const [A, B] = idx.places
const rows = (id: string, ind: string, grain = 'year', n = 20): PlaceRow[] => Array.from({ length: n }, (_, i) => ({ place_id: id, coll: 'places', indicator: ind, time_grain: grain, time: grain === 'year' ? `${2000 + i}-01-01` : `${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`, class: null, value: 10 + (i % 3), n: 1, unit: '°C' }) as PlaceRow)
const ctx = (spec: ReportSpec = DEFAULT_SPEC) => ({ catalog, spec, permalink: (p: { id: string }, i: Indicator) => `https://x/#view=place&place=${p.id}&ind=${i.id}` })
const ok = (ind: Indicator, p: typeof A, grain = 'year', spec: ReportSpec = DEFAULT_SPEC): CellResult => { const r = rows(p.id, ind.id, grain); return { s: 'ok', rows: r, model: modelFor(ind, p, r, spec) } }

describe('swFigureFor', () => {
  it('a year-grain iea-sd series is a figure with the cell\'s own status, words and provenance', () => {
    const r = ok(SST, A)
    const f = swFigureFor(SST, A, r, ctx()) as Exclude<ReturnType<typeof swFigureFor>, { why: string }>
    expect(f.method).toBe('iea-sd')
    expect(f.points).toHaveLength(20)
    expect(f.sentence).toBe((r as { model: { sentence: string } }).model.sentence)
    expect(f.alt).toBe((r as { model: { alt: string } }).model.alt)
    expect(f.program).toEqual({ title: 'NOAA CRW', url: 'https://crw' })
    expect(f.tab).toBe('Water quality')
    expect(f.configHash).toMatch(/^[0-9a-f]{12}$/)
    expect(f.permalink).toBe('https://x/#view=place&place=NMS:A&ind=sst')
    expect(f.recent).toBe(5)
    expect(f.indicator).toMatchObject({ id: 'sst', short: 'SST', unit: '°C', citation: 'NOAA CRW (2018).', method: 'Yearly means.' })
  })
  it('names-pct is exported too', () => {
    expect((swFigureFor(NAMES, A, ok(NAMES, A), ctx()) as { method: string }).method).toBe('names-pct')
  })
  it('the spec\'s years and window shape the series and the status', () => {
    const spec = { ...DEFAULT_SPEC, time: { grain: 'year' as const, from: 2005, to: null }, style: { ...DEFAULT_SPEC.style, recent: 7 } }
    const f = swFigureFor(SST, A, ok(SST, A, 'year', spec), ctx(spec)) as { points: unknown[]; recent: number }
    expect(f.points).toHaveLength(15)
    expect(f.recent).toBe(7)
  })
  it('says why a pair has no figure: values method, monthly status, categorical, an error, no result', () => {
    expect(swFigureFor(VALS, A, ok(VALS, A), ctx())).toEqual({ why: expect.stringMatching(/status method is values/) })
    expect(swFigureFor(MONTHLY, A, ok(MONTHLY, A, 'month'), ctx())).toEqual({ why: expect.stringMatching(/month grain/) })
    expect(swFigureFor(CAT, A, { s: 'ok', rows: [], model: modelFor(CAT, A, [], DEFAULT_SPEC) }, ctx())).toEqual({ why: 'not a continuous series' })
    expect(swFigureFor(SST, A, { s: 'error', msg: 'HTTP 404' }, ctx())).toEqual({ why: 'its values did not load (HTTP 404)' })
    expect(swFigureFor(SST, A, undefined, ctx())).toEqual({ why: 'its values did not arrive' })
  })
})

describe('planSwBundle', () => {
  const results = new Map<string, CellResult>([
    [cellKey(A, SST), ok(SST, A)], [cellKey(B, SST), ok(SST, B)], [cellKey(A, VALS), ok(VALS, A)], [cellKey(B, VALS), ok(VALS, B)],
  ])
  const plan = planSwBundle([A, B], [SST, VALS], results, ctx())
  it('one figure per place x indicator that has one, places then indicators, the others listed with why', () => {
    expect(plan.figures.map(f => `${f.place.id}/${f.indicator.id}`)).toEqual(['NMS:A/sst', 'NMS:B/sst'])
    expect(plan.skipped.map(s => [s.place, s.indicator])).toEqual([['Alpha', 'SDG'], ['Bravo', 'SDG']])
  })
  it('names the bundle for the report id, or for the place when there is one', () => {
    expect(plan.stem).toMatch(/^sanctuarywatch_[0-9a-f]{12}$/)
    expect(planSwBundle([A], [SST], results, ctx()).stem).toBe('sanctuarywatch_NMS_A')
  })
  it('the file list is the job\'s: a folder per figure with data.json, settings.json, settings.md, captions.md, alt.txt, and figures.csv', () => {
    const files = swBundleFiles(plan.figures, { line: 'c-line', ref: 'c-ref', window: 'c-win', off: 'c-off' }, 'Interactive')
    expect(files.map(f => f.path)).toEqual([
      ...['data.json', 'settings.json', 'settings.md', 'captions.md', 'alt.txt'].map(n => `NMS_A__sst/${n}`),
      ...['data.json', 'settings.json', 'settings.md', 'captions.md', 'alt.txt'].map(n => `NMS_B__sst/${n}`),
      'figures.csv',
    ])
    const data = JSON.parse(files[0].text)
    expect(data.metadata).toMatchObject({ indicator: 'sst', place_id: 'NMS:A', status_method: 'iea-sd' })
    expect(data.data.year).toHaveLength(20)
    expect(files[files.length - 1].text.split('\r\n')).toHaveLength(4)
    expect(files.find(f => f.path === 'NMS_A__sst/alt.txt')!.text).toBe(plan.figures[0].alt + '\n')
  })
  it('a report with nothing to export has an empty plan', () => {
    const p = planSwBundle([A], [VALS], results, ctx())
    expect(p.figures).toEqual([])
    expect(p.skipped).toHaveLength(1)
  })
})
