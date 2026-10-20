import { describe, expect, it } from 'vitest'
import type { Indicator } from '../../data.ts'
import type { Place } from '../../matrix.ts'
import { placeLabels, quadExtent, quadGroups, quadTicks } from './quadPlot.ts'

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
  it('puts a lone label to the right of its point', () => {
    expect(placeLabels([{ id: 'a', x: 100, y: 100, text: 'SST' }], plot)).toEqual([{ id: 'a', x: 109, y: 104, anchor: 'start', text: 'SST' }])
  })
  it('moves the second of two overlapping labels out of the first one\'s way', () => {
    const [a, b] = placeLabels([{ id: 'a', x: 100, y: 100, text: 'Chlorophyll' }, { id: 'b', x: 104, y: 102, text: 'Oxygen' }], plot)
    expect(a.anchor).toBe('start')
    expect(b.anchor).not.toBe('start')
  })
  it('turns a label at the right edge to the left of its point', () => {
    const [a] = placeLabels([{ id: 'a', x: 390, y: 100, text: 'Oxygen' }], plot)
    expect(a.anchor).toBe('end')
    expect(a.x).toBe(381)
  })
  it('keeps the right-hand position when nothing is free, and returns one label per point in order', () => {
    const tiny = { x0: 0, y0: 0, x1: 20, y1: 20 }
    const out = placeLabels([{ id: 'a', x: 10, y: 10, text: 'A long label' }], tiny)
    expect(out.map(o => [o.id, o.anchor])).toEqual([['a', 'start']])
  })
})
