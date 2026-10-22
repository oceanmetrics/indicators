import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assess, completeGrid } from '@oceanmetrics/status'
import { lineChart, overlayOf } from '../chart.ts'
import { figureSvg, PALETTE_TOKENS } from './figureSvg.ts'
import type { FigureIn, FigurePalette } from './figureSvg.ts'

const PAL: FigurePalette = { line: 'P-LINE', text: 'P-TEXT', strong: 'P-STRONG', grid: 'P-GRID', axis: 'P-AXIS', window: 'P-WIN', band: 'P-BAND', surface: 'P-SURF', font: 'P-FONT' }
const POINTS = [14, 14.1, 13.9, 14, 14.2, 13.8, 14.1, 13.9, 14, 14.1, 13.9, 15, 15.1, 15.2, 15, 15.3].map((v, i) => ({ t: `${2010 + i}-01-01`, v }))
const fig = (method: 'iea-sd' | 'names-pct' | 'values' = 'iea-sd'): FigureIn => {
  const a = assess(POINTS, method, { grain: 'year', recent: 5, minPeriods: 10 }, { title: 'SST', place: 'A & B <x>', unit: '°C', decimals: 1 })
  return { points: POINTS, result: a.result, method, title: 'SST · "A"', unit: '°C', alt: a.alt, recent: 5 }
}

describe('figureSvg', () => {
  const svg = figureSvg(fig(), PAL)
  it('is a standalone svg with the title and the alt text, and no theme variables or NaN', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 420" width="760" height="420" role="img">')).toBe(true)
    expect(svg).toContain('<title>SST · &quot;A&quot;</title>')
    expect(svg).toMatch(/<desc>Time series of SST/)
    expect(svg).not.toContain('var(')
    expect(svg).not.toContain('NaN')
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
  })
  it('draws the line of chart.ts and writes every palette colour in', () => {
    const g = lineChart({ width: 760, height: 420, series: completeGrid(POINTS, 'year'), grain: 'year', overlay: overlayOf(fig().result) })
    expect(svg).toContain(`<path d="${g.d}" fill="none" stroke="P-LINE"`)
    for (const c of ['P-LINE', 'P-TEXT', 'P-STRONG', 'P-GRID', 'P-AXIS', 'P-WIN', 'P-BAND', 'P-SURF', 'P-FONT']) expect(svg).toContain(c)
  })
  it('draws the band, the mean line and the shaded window for iea-sd, a point per value and the last one marked', () => {
    expect(svg).toContain('fill="P-BAND"')
    expect(svg).toContain('stroke-dasharray="5 3"')
    expect(svg).toContain('fill="P-WIN"')
    expect(svg).toContain('last 5 years')
    expect(svg.match(/<circle /g)!.length).toBe(POINTS.length + 1)
  })
  it('the values method has no band, no window and no line (points only)', () => {
    const v = figureSvg(fig('values'), PAL)
    expect(v).not.toContain('P-BAND')
    expect(v).not.toContain('P-WIN')
    expect(v).not.toContain('<path')
  })
  it('names-pct draws its percentile band too', () => {
    expect(figureSvg(fig('names-pct'), PAL)).toContain('fill="P-BAND"')
  })
  it('text from the data is escaped', () => {
    const f = { ...fig(), unit: 'a<b&c' }
    expect(figureSvg(f, PAL)).toContain('a&lt;b&amp;c')
  })
  it('no values draws the axes and says so', () => {
    const e = figureSvg({ ...fig(), points: [{ t: '2020-01-01', v: null }, { t: '2021-01-01', v: null }] }, PAL)
    expect(e).toContain('No values to draw')
  })
  it('a size changes the viewBox', () => {
    expect(figureSvg(fig(), PAL, { width: 400, height: 300 })).toContain('viewBox="0 0 400 300"')
  })
})

describe('the palette tokens', () => {
  // the export reads these from the light theme: each colour must be defined in the Ocean Metrics theme's light block (the
  // font stack is the kit's own token, and the mbon theme is the kit's tokens as they are)
  it('oceanmetrics.css defines every colour token the figure is resolved from', () => {
    const css = readFileSync(new URL('../../../../brand/themes/oceanmetrics.css', import.meta.url), 'utf8')
    const light = css.slice(0, css.indexOf('[data-theme="dark"]'))
    for (const [key, token] of Object.entries(PALETTE_TOKENS)) if (key !== 'font') expect(light, token).toMatch(new RegExp(`${token}\\s*:`))
  })
})
