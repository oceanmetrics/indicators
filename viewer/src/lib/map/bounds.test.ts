import { describe, expect, it } from 'vitest'
import { geometryBounds } from './bounds.ts'

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
