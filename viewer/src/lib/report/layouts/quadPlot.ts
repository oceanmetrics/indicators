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
export interface LabelOut { id: string; x: number; y: number; anchor: 'start' | 'end' | 'middle'; text: string }

const CHAR = 6.4
const H = 12

/**
 * a position for every label next to its point: to the right, else to the left, above, below, taking the first that
 * overlaps no label placed before it and stays inside the plot. when none is free the right-hand one is kept (the
 * table under the plot carries every label either way). the order of the points is the order of priority.
 */
export function placeLabels(points: LabelIn[], plot: { x0: number; y0: number; x1: number; y1: number }, gap = 9): LabelOut[] {
  type Box = { x0: number; x1: number; y0: number; y1: number }
  const placed: Box[] = []
  const hits = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
  return points.map(p => {
    const w = p.text.length * CHAR
    const cands: { anchor: LabelOut['anchor']; x: number; y: number; box: Box }[] = [
      { anchor: 'start', x: p.x + gap, y: p.y + 4, box: { x0: p.x + gap, x1: p.x + gap + w, y0: p.y - H / 2, y1: p.y + H / 2 } },
      { anchor: 'end', x: p.x - gap, y: p.y + 4, box: { x0: p.x - gap - w, x1: p.x - gap, y0: p.y - H / 2, y1: p.y + H / 2 } },
      { anchor: 'middle', x: p.x, y: p.y - gap, box: { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - gap - H + 3, y1: p.y - gap + 3 } },
      { anchor: 'middle', x: p.x, y: p.y + gap + 8, box: { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y + gap, y1: p.y + gap + H } },
    ]
    const inside = (b: Box) => b.x0 >= plot.x0 && b.x1 <= plot.x1 && b.y0 >= plot.y0 && b.y1 <= plot.y1
    const pick = cands.find(c => inside(c.box) && !placed.some(q => hits(c.box, q))) ?? cands[0]
    placed.push(pick.box)
    return { id: p.id, x: pick.x, y: pick.y, anchor: pick.anchor, text: p.text }
  })
}
