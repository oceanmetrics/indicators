// the report's own chart as a standalone SVG string (the SanctuaryWatch bundle's figure.svg, and the PNG drawn from it): the
// same geometry as the Place view's TimeChart (chart.ts: the line, the long-term band or percentile band, the mean line, the
// shaded recent window), with every colour written in as an attribute (a file has no stylesheet and no theme) from a palette the
// caller resolved from the theme's tokens. plain function, no DOM. the title and the alt text ride along as <title> and <desc>.
import { completeGrid } from '@oceanmetrics/status'
import type { MethodId, Point, StatusResult } from '@oceanmetrics/status'
import { lineChart, overlayOf } from '../chart.ts'

/** colours as `#rrggbb` (or any CSS colour), resolved from the light theme's tokens by the caller */
export interface FigurePalette {
  /** the series (--link) */
  line: string
  /** the text and the mean line (--text-body) */
  text: string
  /** the title and the unit (--text-strong) */
  strong: string
  /** gridlines (--divider) */
  grid: string
  /** axes and the window's outline (--border-strong) */
  axis: string
  /** the recent window (--selected-bg) */
  window: string
  /** the long-term band (--bg-tint) */
  band: string
  /** the page (--bg-surface) */
  surface: string
  /** a font stack (--font-mono) */
  font: string
}

/** the token each palette colour is read from: hex lives in brand/themes only */
export const PALETTE_TOKENS: Record<keyof FigurePalette, string> = {
  line: '--link', text: '--text-body', strong: '--text-strong', grid: '--divider', axis: '--border-strong',
  window: '--selected-bg', band: '--bg-tint', surface: '--bg-surface', font: '--font-mono',
}

export interface FigureIn {
  points: Point[]
  result: StatusResult
  method: MethodId
  title: string
  unit: string
  alt: string
  recent: number
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n = (v: number) => String(Math.round(v * 10) / 10)

export function figureSvg(f: FigureIn, pal: FigurePalette, size: { width: number; height: number } = { width: 760, height: 420 }): string {
  const { width: w, height: h } = size
  const overlay = overlayOf(f.result)
  const mode = f.method === 'values' ? 'points' : 'line'
  const g = lineChart({ width: w, height: h, series: completeGrid(f.points, 'year'), grain: 'year', overlay, mode })
  const last = g.points[g.points.length - 1]
  const o: string[] = []
  const text = (x: number, y: number, s: string, extra = '') => o.push(`<text x="${n(x)}" y="${n(y)}" ${extra}font-family="${esc(pal.font)}" font-size="11" fill="${pal.text}">${esc(s)}</text>`)
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">`)
  o.push(`<title>${esc(f.title)}</title>`, `<desc>${esc(f.alt)}</desc>`)
  o.push(`<rect width="${w}" height="${h}" fill="${pal.surface}"/>`)
  if (g.window) {
    o.push(`<rect x="${n(g.window.x0)}" y="${n(g.plot.y0)}" width="${n(Math.max(0, g.window.x1 - g.window.x0))}" height="${n(g.plot.y1 - g.plot.y0)}" fill="${pal.window}" stroke="${pal.axis}" stroke-width="1" stroke-dasharray="3 3"/>`)
    text(g.window.x1, 11, `last ${f.recent} years`, 'text-anchor="end" ')
  }
  for (const t of g.yTicks) {
    o.push(`<line x1="${n(g.plot.x0)}" x2="${n(g.plot.x1)}" y1="${n(t.y)}" y2="${n(t.y)}" stroke="${pal.grid}" stroke-width="1"/>`)
    text(g.plot.x0 - 6, t.y + 3.5, t.label, 'text-anchor="end" ')
  }
  if (g.band) {
    o.push(`<rect x="${n(g.plot.x0)}" y="${n(g.band.y0)}" width="${n(g.plot.x1 - g.plot.x0)}" height="${n(Math.max(1, g.band.y1 - g.band.y0))}" fill="${pal.band}"/>`)
    for (const y of [g.band.y0, g.band.y1]) o.push(`<line x1="${n(g.plot.x0)}" x2="${n(g.plot.x1)}" y1="${n(y)}" y2="${n(y)}" stroke="${pal.axis}" stroke-width="1"/>`)
  }
  if (g.center != null) o.push(`<line x1="${n(g.plot.x0)}" x2="${n(g.plot.x1)}" y1="${n(g.center)}" y2="${n(g.center)}" stroke="${pal.text}" stroke-width="1.5" stroke-dasharray="5 3"/>`)
  for (const t of g.xTicks) {
    o.push(`<line x1="${n(t.x)}" x2="${n(t.x)}" y1="${n(g.plot.y1)}" y2="${n(g.plot.y1 + 4)}" stroke="${pal.axis}" stroke-width="1"/>`)
    text(t.x, g.plot.y1 + 16, t.label, 'text-anchor="middle" ')
  }
  o.push(`<line x1="${n(g.plot.x0)}" x2="${n(g.plot.x1)}" y1="${n(g.plot.y1)}" y2="${n(g.plot.y1)}" stroke="${pal.axis}" stroke-width="1"/>`)
  if (f.unit) o.push(`<text x="4" y="11" font-family="${esc(pal.font)}" font-size="11" font-weight="600" fill="${pal.strong}">${esc(f.unit)}</text>`)
  if (g.d) o.push(`<path d="${g.d}" fill="none" stroke="${pal.line}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`)
  if (g.markers) for (const p of g.points) o.push(`<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${mode === 'points' ? 3.4 : 2.6}" fill="${pal.surface}" stroke="${pal.line}" stroke-width="1.6"/>`)
  if (last) o.push(`<circle cx="${n(last.x)}" cy="${n(last.y)}" r="4.2" fill="${pal.line}" stroke="${pal.surface}" stroke-width="1.5"/>`)
  if (g.empty) text((g.plot.x0 + g.plot.x1) / 2, (g.plot.y0 + g.plot.y1) / 2, 'No values to draw', 'text-anchor="middle" ')
  o.push('</svg>')
  return o.join('\n') + '\n'
}
