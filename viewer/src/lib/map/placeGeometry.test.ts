import { describe, expect, it } from 'vitest'
import { bboxOf, groupsFor, rowsToPlaces } from './placeGeometry.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const group = (n: number, min?: string, max?: string) => ({
  num_rows: BigInt(n),
  columns: [{ meta_data: { path_in_schema: ['place_id'], statistics: min == null ? undefined : { min_value: enc(min), max_value: enc(max!) } } }],
})

describe('the row groups that may hold a place', () => {
  it('are those whose place_id range admits an id, and any group without statistics', () => {
    const meta = { row_groups: [group(2, 'NMS:A', 'NMS:C'), group(3, 'NMS:D', 'NMS:F'), group(1)] }
    expect(groupsFor(meta, ['NMS:E'])).toEqual([{ rowStart: 2, rowEnd: 5 }, { rowStart: 5, rowEnd: 6 }])
    expect(groupsFor(meta, ['NMS:B', 'NMS:F'])).toEqual([{ rowStart: 0, rowEnd: 2 }, { rowStart: 2, rowEnd: 5 }, { rowStart: 5, rowEnd: 6 }])
  })
})

describe('the rows as places', () => {
  const sq = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
  it('reads a bbox struct or array', () => {
    expect(bboxOf({ xmin: -1, ymin: -2, xmax: 3, ymax: 4 })).toEqual([-1, -2, 3, 4])
    expect(bboxOf([1, 2, 3, 4])).toEqual([1, 2, 3, 4])
    expect(bboxOf({ xmin: 1 })).toBeNull()
  })
  it('keeps the ids asked for, in their order, each once, with a polygon; decodes WKB bytes', () => {
    const rows = [
      { place_id: 'B', bbox: [0, 0, 1, 1], geometry: sq },
      { place_id: 'A', bbox: [0, 0, 1, 1], geometry: new Uint8Array([1]) },
      { place_id: 'C', bbox: [0, 0, 1, 1], geometry: { type: 'Point', coordinates: [0, 0] } },
      { place_id: 'B', bbox: [9, 9, 9, 9], geometry: sq },
      { place_id: 'Z', bbox: [0, 0, 1, 1], geometry: sq },
    ]
    const got = rowsToPlaces(rows, ['A', 'B', 'C'], () => sq as never)
    expect(got.map(p => p.place_id)).toEqual(['A', 'B'])
    expect(got[1].bbox).toEqual([0, 0, 1, 1])
  })
})
