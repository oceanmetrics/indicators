import { describe, expect, it } from 'vitest'
import { crossesAntimeridian, crossingMinZoom, geometryBounds, unionBoxes, worldCopies } from './bounds.ts'

describe('the bounds of a place', () => {
  it('a polygon, a multipolygon and several geometries together', () => {
    const poly = { coordinates: [[[-70.6, 43.2], [-70.5, 43.2], [-70.5, 43.4], [-70.6, 43.4], [-70.6, 43.2]]] }
    expect(geometryBounds([poly])).toEqual([[-70.6, 43.2], [-70.5, 43.4]])
    const multi = { coordinates: [[[[10, 1], [11, 1], [11, 2], [10, 1]]], [[[20, -5], [21, -5], [21, -4], [20, -5]]]] }
    expect(geometryBounds([multi])).toEqual([[10, -5], [21, 2]])
    expect(geometryBounds([poly, multi])).toEqual([[-70.6, -5], [21, 43.4]])
  })
  it('a point is a degenerate box; no coordinates give nothing', () => {
    expect(geometryBounds([{ coordinates: [5, 6] }])).toEqual([[5, 6], [5, 6]])
    expect(geometryBounds([])).toBeNull()
    expect(geometryBounds([{}])).toBeNull()
  })
})

describe('the union of boxes over the antimeridian', () => {
  it('one box is itself, with west in [-180, 180)', () => {
    expect(unionBoxes([[-125, 32, -117, 40]])).toEqual([-125, 32, -117, 40])
    expect(unionBoxes([])).toBeNull()
  })
  it('two boxes either side of 180 are one short box over it, not the world', () => {
    expect(unionBoxes([[170, -5, 180, 5], [-180, -2, -170, 8]])).toEqual([170, -5, 190, 8])
  })
  it('a box already unwrapped (east beyond 180, as the gazetteer gives a layer over the antimeridian) stays one box', () => {
    expect(unionBoxes([[177.8, -15.4, 290, 48.5]])).toEqual([177.8, -15.4, 290, 48.5])
    expect(unionBoxes([[177.8, -15.4, 290, 48.5], [-160, 18, -154, 23]])).toEqual([177.8, -15.4, 290, 48.5])
  })
  it('the Pacific sanctuaries: Papahanaumokuakea over 180, Hawaii and Samoa, the west coast, the east coast: about 134 degrees, Pacific-centred', () => {
    const boxes: [number, number, number, number][] = [
      [160, 23, 180, 30], [-180, 23, -161, 30], [-160, 18, -154, 23], [-171, -15, -169, -14],
      [-125, 32, -117, 40], [-124, 46, -123, 48], [-81, 24, -66, 43],
    ]
    const u = unionBoxes(boxes)!
    expect(u).toEqual([160, -15, 294, 48])
    expect(u[2] - u[0]).toBe(134)
  })
  it('the plain way round when that is shorter: boxes in Europe and Asia do not wrap', () => {
    expect(unionBoxes([[-10, 35, 5, 60], [100, 10, 140, 50]])).toEqual([-10, 10, 140, 60])
  })
  it('boxes that cover the whole circle, or a world box, are the world', () => {
    expect(unionBoxes([[-180, -62, 180, 87]])).toEqual([-180, -62, 180, 87])
    expect(unionBoxes([[-180, 0, 0, 10], [0, 0, 180, 10]])).toEqual([-180, 0, 180, 10])
    expect(unionBoxes([[-170, 0, 10, 5], [0, 0, 190, 5]])).toEqual([-180, 0, 180, 5])
  })
  it('latitude is the plain min and max', () => {
    const u = unionBoxes([[10, -30, 20, -10], [30, 5, 40, 60]])!
    expect([u[1], u[3]]).toEqual([-30, 60])
  })
})

describe('world copies', () => {
  it('one world only when the world is narrower than the frame (512 px at zoom 0)', () => {
    expect(worldCopies(0, 1440)).toBe(false)
    expect(worldCopies(1, 1000)).toBe(true)
    expect(worldCopies(1.49, 1440)).toBe(false)
    expect(worldCopies(1.5, 1440)).toBe(true)
    expect(worldCopies(3, 390)).toBe(true)
  })
  it('a view over the antimeridian keeps its copies (they are the other side of the same place) but its zoom may not go below one world across the frame', () => {
    expect(worldCopies(0, 1440, true)).toBe(true)
    expect(crossingMinZoom(1440)).toBeCloseTo(Math.log2(1440 / 512), 12)
    expect(512 * 2 ** crossingMinZoom(1440)).toBeCloseTo(1440, 9)
    expect(crossingMinZoom(100)).toBe(0)
    expect(crossingMinZoom(0)).toBe(0)
  })
  it('a box crosses the antimeridian when it runs past 180 either way', () => {
    expect(crossesAntimeridian([160, 18, 294, 48])).toBe(true)
    expect(crossesAntimeridian([-200, 0, -170, 10])).toBe(true)
    expect(crossesAntimeridian([-180, -62, 180, 87])).toBe(false)
    expect(crossesAntimeridian([-125, 32, -117, 40])).toBe(false)
  })
})
