import { describe, expect, it } from 'vitest'
import { DOT_IMAGE, DOT_MAXZOOM, TRANSPARENT, classedIds, fillColorExpr, focusFilter, lineColorExpr, lineWidthExpr, haloWidthExpr, memberDotsLayer, onlyFilter } from './paint.ts'

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

describe('a derived part draws only its pieces', () => {
  it('the filter keeps the features whose id is a piece, sorted; a whole layer has none', () => {
    expect(onlyFilter(['FAO:87', 'FAO:21'])).toEqual(['in', ['get', 'place_id'], ['literal', ['FAO:21', 'FAO:87']]])
    expect(onlyFilter(null)).toBeUndefined()
  })
  it('the selected place is outlined by the id of its feature; none selected matches nothing', () => {
    expect(focusFilter('FAO:21')).toEqual(['==', ['get', 'place_id'], 'FAO:21'])
    expect(focusFilter(null)).toEqual(['==', ['get', 'place_id'], ''])
  })
})

describe('the hollow circles of the members that are not computed', () => {
  it('a symbol layer below the zoom where outlines show, at every member the computed list does not hold', () => {
    expect(memberDotsLayer('places', 'noaa_nerrs', ['NERRS:WEL', 'NERRS:ACE'])).toEqual({
      id: 'places:dots', type: 'symbol', source: 'places', 'source-layer': 'noaa_nerrs', maxzoom: DOT_MAXZOOM,
      layout: { 'icon-image': DOT_IMAGE, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
      filter: ['!', ['in', ['get', 'place_id'], ['literal', ['NERRS:ACE', 'NERRS:WEL']]]],
    })
  })
  it('nothing computed: every member; the circles are visible only at small zooms', () => {
    const l = memberDotsLayer('p', 'x', [])
    expect('filter' in l).toBe(false)
    expect(DOT_MAXZOOM).toBeGreaterThanOrEqual(5)
    expect(DOT_MAXZOOM).toBeLessThanOrEqual(8)
  })
  it('a derived part limits the circles to its pieces', () => {
    expect(memberDotsLayer('p', 'x', ['A'], ['A', 'B']).filter).toEqual(['all', ['in', ['get', 'place_id'], ['literal', ['A', 'B']]], ['!', ['in', ['get', 'place_id'], ['literal', ['A']]]]])
    expect(memberDotsLayer('p', 'x', [], ['B', 'A']).filter).toEqual(['in', ['get', 'place_id'], ['literal', ['A', 'B']]])
  })
})
