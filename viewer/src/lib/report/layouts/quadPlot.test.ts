import { describe, expect, it } from 'vitest'
import type { Indicator } from '../../data.ts'
import type { Place } from '../../matrix.ts'
import { glyphBox, placeLabels, quadExtent, quadGroups, quadTicks } from './quadPlot.ts'
import type { Box } from './quadPlot.ts'

const P = (id: string): Place => ({ id: `NMS:${id}`, name: `Place ${id}`, coll: 'places' })
const I = (id: string): Indicator => ({ id, short: id.toUpperCase() }) as Indicator
const [A, B, C] = [P('A'), P('B'), P('C')]
const [SST, CHL, NPP] = [I('sst'), I('chl'), I('npp')]
const labels = (g: { items: { label: string }[] }) => g.items.map(i => i.label)

describe('quadGroups', () => {
  it('one place: one plot whose points are its indicators', () => {
    const g = quadGroups([A], [SST, CHL], 'indicators')
    expect(g.map(x => [x.title, x.by, labels(x)])).toEqual([['Place A', 'place', ['SST', 'CHL']]])
  })
  it('one indicator across places: one plot whose points are the places, whichever the axes', () => {
    for (const axes of ['indicators', 'places'] as const) {
      const g = quadGroups([A, B, C], [SST], axes)
      expect(g.map(x => [x.title, x.by, labels(x)])).toEqual([['SST', 'indicator', ['Place A', 'Place B', 'Place C']]])
    }
  })
  it('axes indicators: a plot per place of indicator points; axes places: a plot per indicator of place points', () => {
    expect(quadGroups([A, B], [SST, CHL], 'indicators').map(x => [x.title, labels(x)])).toEqual([['Place A', ['SST', 'CHL']], ['Place B', ['SST', 'CHL']]])
    expect(quadGroups([A, B], [SST, CHL], 'places').map(x => [x.title, labels(x)])).toEqual([['SST', ['Place A', 'Place B']], ['CHL', ['Place A', 'Place B']]])
  })
  it('a pair with no value has no point and an empty plot is dropped', () => {
    const has = (p: Place, i: Indicator) => !(p.id === 'NMS:B') && !(p.id === 'NMS:A' && i.id === 'npp')
    expect(quadGroups([A, B], [SST, CHL, NPP], 'indicators', has).map(x => [x.title, labels(x)])).toEqual([['Place A', ['SST', 'CHL']]])
  })
  it('point keys are unique across a plot', () => {
    const keys = quadGroups([A, B], [SST, CHL], 'places').flatMap(g => g.items.map(i => i.key))
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('the domain', () => {
  it('is at least ±2 SD so the guides at ±1 have room', () => {
    expect(quadExtent([])).toBe(2)
    expect(quadExtent([{ x: 0.3, y: -0.8 }])).toBe(2)
  })
  it('grows to the next whole SD past the farthest point on either axis', () => {
    expect(quadExtent([{ x: 0.3, y: -2.9 }])).toBe(4)
    expect(quadExtent([{ x: 5.2, y: 0 }, { x: 0, y: 1 }])).toBe(6)
  })
  it('ignores a non-finite coordinate rather than blowing the scale up', () => {
    expect(quadExtent([{ x: Number.POSITIVE_INFINITY, y: 0 }, { x: 1, y: 1 }])).toBe(2)
  })
  it('ticks are whole SDs, symmetric, thinned when the domain is wide', () => {
    expect(quadTicks(2)).toEqual([-2, -1, 0, 1, 2])
    expect(quadTicks(6).length).toBeLessThanOrEqual(9)
    expect(quadTicks(6)).toContain(0)
    expect(quadTicks(10)).toEqual([-9, -6, -3, 0, 3, 6, 9])
  })
})

describe('placeLabels', () => {
  const plot = { x0: 0, y0: 0, x1: 400, y1: 300 }
  const meets = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
  /** the rule itself: a placed label's box meets no glyph box (its own included) and no other placed label's box, and stays in the plot */
  function expectClean(pts: { id: string; x: number; y: number; text: string }[], out: ReturnType<typeof placeLabels>, box = plot) {
    expect(out.map(o => o.id)).toEqual(pts.map(p => p.id))
    const glyphs = pts.map(p => glyphBox(p.x, p.y))
    out.filter(o => o.placed).forEach((o, i, placed) => {
      expect(o.box.x0, `${o.id} inside`).toBeGreaterThanOrEqual(box.x0)
      expect(o.box.x1, `${o.id} inside`).toBeLessThanOrEqual(box.x1)
      expect(o.box.y0, `${o.id} inside`).toBeGreaterThanOrEqual(box.y0)
      expect(o.box.y1, `${o.id} inside`).toBeLessThanOrEqual(box.y1)
      glyphs.forEach((g, k) => expect(meets(o.box, g), `${o.id} over the glyph of ${pts[k].id}`).toBe(false))
      placed.forEach((q, j) => { if (j !== i) expect(meets(o.box, q.box), `${o.id} over the label ${q.id}`).toBe(false) })
    })
  }

  it('puts a lone label to the right of its point, touching its glyph', () => {
    const [a] = placeLabels([{ id: 'a', x: 100, y: 100, text: 'SST' }], plot)
    expect(a).toMatchObject({ id: 'a', x: 111, y: 104, anchor: 'start', text: 'SST', leader: null, placed: true })
    expect(a.box.x0).toBe(110)
  })
  it('turns a label at the right edge to the left of its point', () => {
    const [a] = placeLabels([{ id: 'a', x: 390, y: 100, text: 'Oxygen' }], plot)
    expect(a.anchor).toBe('end')
    expect(a.placed).toBe(true)
    expect(a.box.x1).toBeLessThanOrEqual(380)
  })
  it('a label that cannot go right, left or beside goes above or below its point', () => {
    const [a] = placeLabels([{ id: 'a', x: 200, y: 3, text: 'A very long label indeed to push it out' }], { x0: 0, y0: 0, x1: 400, y1: 300 })
    expect(a.anchor).toBe('middle')
  })
  it('a crowded cluster of six points within a few pixels: no label meets any glyph or any other label', () => {
    // 0.3 SD on a plot of ~300 px per 4 SD is ~22 px: six points inside that, as the CINMS indicators sat
    const pts = [
      { id: 'sst', x: 200, y: 150, text: 'SST' }, { id: 'o2', x: 207, y: 143, text: 'Oxygen' }, { id: 'temp', x: 214, y: 144, text: 'Temperature 0.5 m' },
      { id: 'chl', x: 201, y: 158, text: 'Chlorophyll-a (ocean colour)' }, { id: 'ph', x: 192, y: 146, text: 'pH' }, { id: 'npp', x: 205, y: 162, text: 'NPP' },
    ]
    const out = placeLabels(pts, plot)
    expectClean(pts, out)
    expect(out.every(o => o.placed)).toBe(true)
    // the ones that had to stand off say so with a leader line from their own point
    for (const o of out.filter(o => o.leader)) {
      const p = pts.find(q => q.id === o.id)!
      expect([o.leader!.x1, o.leader!.y1]).toEqual([p.x, p.y])
    }
  })
  it('the order of the points is the order of priority: the first takes the nearest free spot, the next one works around it', () => {
    const pts = [{ id: 'a', x: 100, y: 100, text: 'Alpha' }, { id: 'b', x: 104, y: 102, text: 'Bravo' }]
    const [a, b] = placeLabels(pts, plot)
    // the right-hand spot of a is under the glyph of b, so a goes to the left; b then takes its right
    expect([a.anchor, b.anchor]).toEqual(['end', 'start'])
    expect(a.leader).toBeNull()
    expect(b.box).not.toEqual(a.box)
    expectClean(pts, [a, b])
  })
  it('points on top of each other and at the corners of the plot are still clean', () => {
    const pts = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, x: i < 6 ? 40 + i : 360 - i, y: i < 6 ? 30 + (i % 2) : 270 + (i % 3), text: `Indicator ${i}` }))
    expectClean(pts, placeLabels(pts, plot))
  })
  it('when the plot has no room left a label is left off, never drawn over something', () => {
    const tiny = { x0: 0, y0: 0, x1: 90, y1: 40 }
    const pts = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, x: 20 + i * 8, y: 20, text: 'A long label' }))
    const out = placeLabels(pts, tiny)
    expect(out.some(o => !o.placed)).toBe(true)
    expectClean(pts, out, tiny)
  })
  it('a leader line runs from the point to the nearest edge of its label', () => {
    const pts = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, x: 200 + i, y: 150, text: 'Label' }))
    const out = placeLabels(pts, plot)
    const lead = out.find(o => o.leader)
    expect(lead).toBeTruthy()
    const { leader, box } = lead!
    expect(leader!.x2).toBeGreaterThanOrEqual(box.x0)
    expect(leader!.x2).toBeLessThanOrEqual(box.x1)
    expect(leader!.y2).toBeGreaterThanOrEqual(box.y0)
    expect(leader!.y2).toBeLessThanOrEqual(box.y1)
  })
})
