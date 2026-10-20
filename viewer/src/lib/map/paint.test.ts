import { describe, expect, it } from 'vitest'
import { TRANSPARENT, classedIds, fillColorExpr, lineColorExpr, lineWidthExpr } from './paint.ts'

const classOf = new Map([['NMS:B', 1], ['NMS:A', 0], ['NMS:C', 1]])

describe('the vector paint', () => {
  it('fills a class by a match on place_id, ids sorted, the rest transparent', () => {
    expect(fillColorExpr(classOf, ['c1', 'c2'])).toEqual([
      'match', ['get', 'place_id'], ['NMS:A'], 'c1', ['NMS:B', 'NMS:C'], 'c2', TRANSPARENT,
    ])
  })
  it('with no class at all nothing is filled', () => {
    expect(fillColorExpr(new Map(), ['c1'])).toBe(TRANSPARENT)
  })
  it('a class with no colour is left unfilled rather than painted wrong', () => {
    expect(fillColorExpr(new Map([['A', 3]]), ['c1'])).toBe(TRANSPARENT)
  })
  it('outlines a classed place in its class colour and any other in the none colour', () => {
    expect(lineColorExpr(classOf, ['c1', 'c2'], 'none')).toEqual([
      'match', ['get', 'place_id'], ['NMS:A'], 'c1', ['NMS:B', 'NMS:C'], 'c2', 'none',
    ])
    expect(lineColorExpr(new Map(), ['c1'], 'none')).toBe('none')
  })
  it('outlines a classed place heavier than the rest', () => {
    const ids = classedIds(classOf)
    expect(ids).toEqual(['NMS:A', 'NMS:B', 'NMS:C'])
    expect(lineWidthExpr(ids)).toEqual(['case', ['in', ['get', 'place_id'], ['literal', ids]], 2.5, 1.2])
    expect(lineWidthExpr([])).toBe(1.2)
  })
})
