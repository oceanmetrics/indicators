import { describe, expect, it } from 'vitest'
import { parseSpark, sparkGeometry } from './spark.ts'

describe('parseSpark', () => {
  it('reads the coverage column', () => {
    expect(parseSpark('[["2020-01-01",1.5],["2021-01-01",null]]')).toEqual([['2020-01-01', 1.5], ['2021-01-01', null]])
  })
  it('gives [] for empty, malformed or foreign JSON, and drops malformed pairs', () => {
    expect(parseSpark('')).toEqual([])
    expect(parseSpark(null)).toEqual([])
    expect(parseSpark('{"a":1}')).toEqual([])
    expect(parseSpark('[not json')).toEqual([])
    expect(parseSpark('[["2020-01-01","x"],[1,2],["2021-01-01",3]]')).toEqual([['2021-01-01', 3]])
  })
})

describe('sparkGeometry', () => {
  it('an empty series has no geometry', () => {
    expect(sparkGeometry([])).toEqual({ d: '', last: null, n: 0 })
  })
  it('a single point is a dot in the middle with no line', () => {
    expect(sparkGeometry([['2020-01-01', 5]], 96, 24, 3)).toEqual({ d: '', last: { x: 48, y: 12 }, n: 1 })
  })
  it('two points run corner to corner inside the padding, high values up', () => {
    const g = sparkGeometry([['2020-01-01', 0], ['2021-01-01', 10]], 100, 20, 2)
    expect(g.d).toBe('M2 18L98 2')
    expect(g.last).toEqual({ x: 98, y: 2 })
  })
  it('a flat series runs along the middle', () => {
    const g = sparkGeometry([['2020-01-01', 7], ['2021-01-01', 7]], 100, 20, 2)
    expect(g.d).toBe('M2 10L98 10')
  })
  it('a null breaks the line instead of bridging it', () => {
    const g = sparkGeometry([['2020-01-01', 0], ['2021-01-01', null], ['2022-01-01', 10], ['2023-01-01', 0]], 100, 20, 2)
    expect(g.d.startsWith('M2 18M')).toBe(true)
    expect(g.d.match(/M/g)?.length).toBe(2)
    expect(g.n).toBe(3)
  })
  it('periods are placed by date, so a gap in the record shows as a gap', () => {
    const g = sparkGeometry([['2000-01-01', 0], ['2001-01-01', 5], ['2020-01-01', 10]], 100, 20, 0)
    const xs = [...g.d.matchAll(/[ML]([\d.]+) /g)].map(m => Number(m[1]))
    expect(xs[1]).toBeLessThan(10)
    expect(xs[2]).toBe(100)
  })
})
