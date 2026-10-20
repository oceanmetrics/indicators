import { describe, expect, it } from 'vitest'
import { assess } from '../status/index.ts'
import { swCaptions, swDataJson, swFiguresCsv, swSettings, swStagingRow } from './sanctuarywatch.ts'
import type { SwFigure } from './sanctuarywatch.ts'
import { swBundleFiles, swFigureFiles } from './swBundle.ts'

const POINTS = [14.0, 14.1, 13.9, 14.0, 14.2, 13.8, 14.1, 13.9, 14.0, 14.1, 13.9, 15.0, 15.1, 15.2, 15.0, 15.3].map((v, i) => ({ t: `${2010 + i}-01-01`, v }))
const COLORS = { line: 'c-line', ref: 'c-ref', window: 'c-window', off: 'c-off' }
function fig(placeId: string, place: string, ind: string): SwFigure {
  const a = assess(POINTS, 'iea-sd', { grain: 'year', recent: 5, minPeriods: 10 }, { title: 'SST', place, unit: '°C', decimals: 2 })
  return {
    indicator: { id: ind, title: 'Sea surface temperature', short: 'SST', unit: '°C', decimals: 2, citation: 'NOAA CRW (2018).', method: 'Yearly means.' },
    place: { id: placeId, name: place }, points: POINTS, method: 'iea-sd', result: a.result, sentence: a.sentence, alt: a.alt, recent: 5,
    program: { title: 'NOAA CRW' }, permalink: 'https://x/#view=place', configHash: 'abc123def456', manifestVersion: '2026.10.20', tab: 'Water quality',
  }
}
const A = fig('NMS:CINMS', 'Channel Islands', 'erddap:sst'), B = fig('NMS:FKNMS', 'Florida Keys', 'erddap:sst')

describe('swFigureFiles', () => {
  it('a figure\'s five text files, in the order the job writes them', () => {
    expect(swFigureFiles(A, COLORS).map(f => f.name)).toEqual(['data.json', 'settings.json', 'settings.md', 'captions.md', 'alt.txt'])
  })
  it('each file is what sanctuarywatch.ts builds', () => {
    const [data, settings, , captions, alt] = swFigureFiles(A, COLORS)
    expect(JSON.parse(data.text)).toEqual(swDataJson(A))
    expect(JSON.parse(settings.text)).toEqual(swSettings(A, COLORS))
    expect(captions.text).toBe(swCaptions(A).md)
    expect(alt.text).toBe(A.alt + '\n')
    expect(data.text.endsWith('\n')).toBe(true)
  })
})

describe('swBundleFiles', () => {
  const files = swBundleFiles([A, B], COLORS, 'Interactive')
  it('a folder per place and indicator, then figures.csv', () => {
    expect(files.map(f => f.path)).toEqual([
      ...['data.json', 'settings.json', 'settings.md', 'captions.md', 'alt.txt'].map(n => `NMS_CINMS__erddap_sst/${n}`),
      ...['data.json', 'settings.json', 'settings.md', 'captions.md', 'alt.txt'].map(n => `NMS_FKNMS__erddap_sst/${n}`),
      'figures.csv',
    ])
  })
  it('figures.csv has a header and a numbered row per figure, delivered as uploads', () => {
    const csv = files[files.length - 1].text
    expect(csv).toBe(swFiguresCsv([swStagingRow(A, 1, 'Interactive'), swStagingRow(B, 2, 'Interactive')]))
    expect(csv.split('\r\n').length).toBe(4)
    expect(csv).toContain('interactive figure (upload json)')
  })
  it('the External type carries the png link of each figure', () => {
    const ext = swBundleFiles([{ ...A, pngUrl: 'https://s/figure.png' }], COLORS, 'External')
    expect(ext[ext.length - 1].text).toContain('https://s/figure.png')
  })
  it('no figures give just the header', () => {
    expect(swBundleFiles([], COLORS, 'Interactive').map(f => f.path)).toEqual(['figures.csv'])
  })
})
