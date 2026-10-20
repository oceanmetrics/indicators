// the Quad plot layout's rules, in plain functions: which plots a report has (what the points are), the square domain in
// SD units, where the labels go so they do not sit on each other, and the rows of the table that reads the same plot.
// the coordinates and the words are src/status/quad.ts; nothing here computes a status.
import type { Indicator } from '../../data.ts'
import type { Place } from '../../matrix.ts'
import type { Axes } from './smallMultiples.ts'

export interface QuadItem {
  key: string
  /** what the point is called: the indicator's short name, or the place's name */
  label: string
  place: Place
  ind: Indicator
}

export interface QuadGroup {
  key: string
  /** what the plot is of: the place (its points are indicators) or the indicator (its points are places) */
  title: string
  by: 'place' | 'indicator'
  items: QuadItem[]
}

/**
 * the plots of a report. one place gives one plot of its indicators; one indicator one plot of its places (the points
 * are what varies). otherwise `axes` decides: 'indicators' draws a plot per place with the indicators as points,
 * 'places' a plot per indicator with the places as points. a pair the `has` predicate refuses has no point, and a
 * plot with none is dropped.
 */
export function quadGroups(places: Place[], inds: Indicator[], axes: Axes, has: (p: Place, i: Indicator) => boolean = () => true): QuadGroup[] {
  const item = (p: Place, i: Indicator, by: 'place' | 'indicator'): QuadItem => ({ key: `${p.id}\u0000${i.id}`, label: by === 'place' ? i.short : p.name, place: p, ind: i })
  const perPlace = (): QuadGroup[] => places.map(p => ({ key: p.id, title: p.name, by: 'place' as const, items: inds.filter(i => has(p, i)).map(i => item(p, i, 'place')) }))
  const perInd = (): QuadGroup[] => inds.map(i => ({ key: i.id, title: i.short, by: 'indicator' as const, items: places.filter(p => has(p, i)).map(p => item(p, i, 'indicator')) }))
  const groups = places.length === 1 ? perPlace() : inds.length === 1 ? perInd() : axes === 'places' ? perInd() : perPlace()
  return groups.filter(g => g.items.length > 0)
}

/** the half-width of the square domain, in SDs: at least 2 so the ±1 guides have room, then the next whole SD past every point */
export function quadExtent(points: { x: number; y: number }[]): number {
  const far = Math.max(0, ...points.flatMap(p => [Math.abs(p.x), Math.abs(p.y)]).filter(Number.isFinite))
  return Math.max(2, Math.ceil(far * 1.08))
}

/** the whole-SD ticks of a domain of half-width `ext`, thinned to at most `max` */
export function quadTicks(ext: number, max = 9): number[] {
  const step = Math.max(1, Math.ceil((ext * 2) / max))
  const top = Math.floor(ext / step) * step
  const out: number[] = []
  for (let v = -top; v <= top; v += step) out.push(v)
  return out
}

export interface LabelIn { id: string; x: number; y: number; text: string }
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface LabelOut {
  id: string
  /** where the text is drawn (its baseline) and how it hangs from there */
  x: number
  y: number
  anchor: 'start' | 'end' | 'middle'
  text: string
  /** the box the text takes (padded): no other label or glyph box meets it */
  box: Box
  /** a line from the point to its label, when the label had to stand off */
  leader: { x1: number; y1: number; x2: number; y2: number } | null
  /** false when no free spot was left in the plot: the label is not drawn, the table under the plot carries it */
  placed: boolean
}

const CHAR = 6.6
const H = 14
/** the glyph's box around its point: the marker and its halo */
export const GLYPH = 10
/** how far from the point a label may stand: close in, then further with a leader line */
const RINGS = [10, 16, 24, 36, 54, 80]
/** the directions tried at each distance, in order of preference: right, left, above, below, then the diagonals */
const ANGLES = [0, 180, 270, 90, 315, 45, 225, 135, 337.5, 22.5, 202.5, 157.5, 292.5, 247.5, 67.5, 112.5]
/** a leader line is drawn from this distance on */
const LEADER_FROM = 24

const meets = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

/** the box of a glyph at a point */
export const glyphBox = (x: number, y: number): Box => ({ x0: x - GLYPH, y0: y - GLYPH, x1: x + GLYPH, y1: y + GLYPH })

/**
 * a spot for every label: the nearest of 16 directions around its point (right, left, above, below, the diagonals, in that
 * order) at growing distances that meets no glyph (its own included) and no label placed before it, and stays inside the
 * plot. a label that stands off from its glyph gets a leader line. when no spot is free the label is left off the plot
 * (`placed: false`); a placed label never overlaps a glyph or another label. the order of the points is the order of priority.
 */
export function placeLabels(points: LabelIn[], plot: { x0: number; y0: number; x1: number; y1: number }): LabelOut[] {
  const glyphs = points.map(p => glyphBox(p.x, p.y))
  const taken: Box[] = []
  const inside = (b: Box) => b.x0 >= plot.x0 && b.x1 <= plot.x1 && b.y0 >= plot.y0 && b.y1 <= plot.y1
  return points.map(p => {
    const w = p.text.length * CHAR + 2
    for (const r of RINGS) {
      for (const deg of ANGLES) {
        const dx = Math.cos((deg * Math.PI) / 180), dy = Math.sin((deg * Math.PI) / 180)
        const cx = p.x + dx * r + dx * (w / 2), cy = p.y + dy * r + dy * (H / 2)
        const box: Box = { x0: cx - w / 2, y0: cy - H / 2, x1: cx + w / 2, y1: cy + H / 2 }
        if (!inside(box) || glyphs.some(g => meets(box, g)) || taken.some(t => meets(box, t))) continue
        taken.push(box)
        // the text hangs from the side of the box nearest the point: its left edge for a label on the right, and so on
        const anchor = dx > 0.5 ? 'start' : dx < -0.5 ? 'end' : 'middle'
        const x = anchor === 'start' ? box.x0 + 1 : anchor === 'end' ? box.x1 - 1 : (box.x0 + box.x1) / 2
        const leader = r >= LEADER_FROM
          ? { x1: p.x, y1: p.y, x2: Math.min(Math.max(p.x, box.x0), box.x1), y2: Math.min(Math.max(p.y, box.y0), box.y1) }
          : null
        return { id: p.id, x, y: box.y1 - 3, anchor, text: p.text, box, leader, placed: true }
      }
    }
    return { id: p.id, x: p.x, y: p.y, anchor: 'start' as const, text: p.text, box: glyphs[points.indexOf(p)], leader: null, placed: false }
  })
}
