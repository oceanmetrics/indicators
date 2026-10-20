import { describe, expect, it } from 'vitest'
import { assess } from '../status/index.ts'
import type { MethodId } from '../status/index.ts'
import { STAGING_COLUMNS, swCaptions, swDataJson, swFiguresCsv, swFolder, swSettings, swSettingsMd, swStagingRow } from './sanctuarywatch.ts'
import type { SwFigure } from './sanctuarywatch.ts'

// 17 years (2009-2025) with one gap: steady near 14, then the last five near 15, so iea-sd says above
const VALUES = [14.0, 14.1, 13.9, null, 14.0, 14.2, 13.8, 14.1, 13.9, 14.0, 14.1, 13.9, 15.0, 15.1, 15.2, 15.0, 15.3]
const POINTS = VALUES.map((v, i) => ({ t: `${2009 + i}-01-01`, v }))
// the caller resolves these from the theme tokens; the functions only pass them through
const COLORS = { line: 'c-line', ref: 'c-ref', window: 'c-window', off: 'c-off' }

function figure(method: MethodId = 'iea-sd'): SwFigure {
  const a = assess(POINTS, method, { grain: 'year', recent: 5, minPeriods: 10 }, { title: 'Sea surface temperature', place: 'Channel Islands', unit: '°C', decimals: 2 })
  return {
    indicator: { id: 'erddap:dhw_5km:CRW_SST:mean', title: 'Sea surface temperature', short: 'SST', unit: '°C', decimals: 2, citation: 'NOAA Coral Reef Watch (2018).', method: 'Daily polygon means, averaged by year.' },
    place: { id: 'NMS:CINMS', name: 'Channel Islands' },
    points: POINTS, method, result: a.result, sentence: a.sentence, alt: a.alt, recent: 5,
    program: { title: 'NOAA Coral Reef Watch', url: 'https://coralreefwatch.noaa.gov' },
    permalink: 'https://oceanmetrics.io/indicators/#view=report&pi=NMS:CINMS', configHash: 'abc123def456', manifestVersion: '2026.10.20',
    tab: 'Water quality',
  }
}

describe('data.json in the plugin\'s schema', () => {
  it('columns are arrays of numbers or null, the gap stays null, the reference lines are constant columns', () => {
    const f = figure()
    const d = swDataJson(f)
    expect(Object.keys(d.data)).toEqual(['year', 'value', 'mean', 'mean_plus_1sd', 'mean_minus_1sd'])
    expect(d.data.year).toEqual(Array.from({ length: 17 }, (_, i) => 2009 + i))
    expect(d.data.value[3]).toBeNull()
    expect(new Set(d.data.mean).size).toBe(1)
    expect(d.data.mean[0]).toBeCloseTo(f.result.ltMean!, 6)
    expect(d.data.mean_plus_1sd[0]! - d.data.mean[0]!).toBeCloseTo(f.result.ltSd!, 5)
    for (const col of Object.values(d.data)) expect(col.every(v => v === null || typeof v === 'number')).toBe(true)
    // what validateJson checks (upload.php:280)
    expect(typeof d.metadata).toBe('object')
    expect(Object.values(d.data).every(Array.isArray)).toBe(true)
    expect(JSON.stringify(d)).not.toContain('"NA"')
  })
  it('metadata carries the status, the window and the configuration', () => {
    const m = swDataJson(figure()).metadata
    expect(m.status).toBe('above')
    expect(m.recent_window).toBe('2021-2025')
    expect(m.config_hash).toBe('abc123def456')
  })
  it('names-pct carries the median and the 10th and 90th percentiles; values carries none', () => {
    expect(Object.keys(swDataJson(figure('names-pct')).data)).toEqual(['year', 'value', 'median', 'p90', 'p10'])
    expect(Object.keys(swDataJson(figure('values')).data)).toEqual(['year', 'value'])
  })
})

describe('the plugin settings', () => {
  it('a line graph on `year`, four lines, the evaluation period on the recent window, the plugin\'s own Mean/StdDev off', () => {
    const pairs = swSettings(figure(), COLORS)
    const get = (k: string) => pairs.find(p => p[0] === k)?.[1]
    expect(pairs[0]).toEqual(['graphType', 'Plotly line graph (time series)'])
    expect([get('XAxis'), get('NumberOfLines'), get('EvaluationPeriod'), get('EvaluationPeriodStartDate'), get('EvaluationPeriodEndDate'), get('EvaluationPeriodText')])
      .toEqual(['year', '4', 'on', '2021', '2025', 'Last 5 years'])
    expect([get('Line1'), get('Line2'), get('Line3'), get('Line4')]).toEqual(['value', 'mean', 'mean_plus_1sd', 'mean_minus_1sd'])
    expect([get('Line2LineType'), get('Line3LineType')]).toEqual(['dash', 'dot'])
    for (const k of [1, 2, 3, 4]) expect([get(`Line${k}Mean`), get(`Line${k}StdDev`), get(`Line${k}Percentiles`)]).toEqual(['', '', ''])
    expect(get('YAxisTitle')).toBe('SST (°C)')
  })
  it('settings.md says the same in words', () => {
    const f = figure()
    const md = swSettingsMd(f, swSettings(f, COLORS))
    expect(md).toContain('Number of lines: **4**')
    expect(md).toContain('Line 2: column `mean`, title "Long-term mean", dash without markers, legend on.')
    expect(md).toContain('Evaluation period: on, 2021 to 2025, text "Last 5 years".')
  })
})

describe('captions and the staging sheet', () => {
  it('the short caption is the status sentence; the long one is statistical and carries the permalink', () => {
    const f = figure()
    const c = swCaptions(f)
    expect(c.short).toBe(f.sentence)
    expect(c.long).toContain('relative to the place\'s own record (iea-sd)')
    expect(c.long).toContain('say nothing about better or worse')
    expect(c.long).toContain(f.permalink)
  })
  it('figures.csv has the staging columns, quotes what needs quoting, and leaves scene and icon empty', () => {
    const f = figure()
    const csv = swFiguresCsv([swStagingRow(f, 1, 'Interactive')])
    const [head, row] = csv.split('\r\n')
    expect(head).toBe(STAGING_COLUMNS.join(','))
    expect(row.startsWith(',SST · Channel Islands,,,Water quality,1,NOAA Coral Reef Watch,https://coralreefwatch.noaa.gov,')).toBe(true)
    expect(row).toContain('"Sea surface temperature, Channel Islands (Ocean Metrics Indicators)"')
  })
  it('folder names are safe on every file system', () => {
    expect(swFolder('NMS:CINMS', 'erddap:dhw_5km:CRW_SST:mean')).toBe('NMS_CINMS__erddap_dhw_5km_CRW_SST_mean')
  })
})
