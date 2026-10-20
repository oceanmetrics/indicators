import { describe, expect, it } from 'vitest'
import { TRANSPARENT, classedIds, fillColorExpr, lineColorExpr, lineWidthExpr, haloWidthExpr } from './paint.ts'

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
  it('a computed place with no class keeps the none outline and every other member of the collection gets the faint one', () => {
    expect(lineColorExpr(classOf, ['c1', 'c2'], 'none', ['NMS:A', 'NMS:D', 'NMS:B'], 'faint')).toEqual([
      'match', ['get', 'place_id'], ['NMS:A'], 'c1', ['NMS:B', 'NMS:C'], 'c2', ['NMS:D'], 'none', 'faint',
    ])
    expect(lineColorExpr(new Map(), ['c1'], 'none', ['W', 'V'], 'faint')).toEqual(['match', ['get', 'place_id'], ['V', 'W'], 'none', 'faint'])
    // nothing computed has no class: every member is faint
    expect(lineColorExpr(new Map(), ['c1'], 'none', [], 'faint')).toBe('faint')
  })
  it('the faint members are drawn thinnest', () => {
    expect(lineWidthExpr(['A'], ['A', 'B'])).toEqual(['case', ['in', ['get', 'place_id'], ['literal', ['A']]], 2.5, ['in', ['get', 'place_id'], ['literal', ['A', 'B']]], 1.2, 0.8])
  })
  it('outlines a classed place heavier than the rest', () => {
    const ids = classedIds(classOf)
    expect(ids).toEqual(['NMS:A', 'NMS:B', 'NMS:C'])
    expect(lineWidthExpr(ids)).toEqual(['case', ['in', ['get', 'place_id'], ['literal', ids]], 2.5, 1.2])
    expect(lineWidthExpr([])).toBe(1.2)
  })
})

describe('the halo under classed outlines', () => {
  it('a darker ring under each classed place only', () => {
    expect(haloWidthExpr(['NMS:A', 'NMS:B'])).toEqual(['case', ['in', ['get', 'place_id'], ['literal', ['NMS:A', 'NMS:B']]], 4.5, 0])
    expect(haloWidthExpr([])).toBe(0)
  })
})
