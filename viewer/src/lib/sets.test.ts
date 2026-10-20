import { describe, expect, it } from 'vitest'
import type { PlaceSet } from './data.ts'
import { collTitle } from './data.ts'
import { expandGroups, findSet, isSetRef, setRef } from './sets.ts'

const political: PlaceSet = { id: 'political', title: 'Ocean by jurisdiction', groups: ['mr_eez', 'fao_high_seas'], note: 'n' }
const other: PlaceSet = { id: 'wide', title: 'Wide', groups: ['fao_high_seas', 'places'] }
const sets = [political, other]

describe('place set references', () => {
  it('set:<id> is a reference, a group is not', () => {
    expect([isSetRef('set:political'), isSetRef('mr_eez'), isSetRef(''), isSetRef(null), isSetRef(undefined)]).toEqual([true, false, false, false, false])
    expect(setRef(political)).toBe('set:political')
  })
  it('findSet resolves a known reference and nothing else', () => {
    expect(findSet('set:political', sets)).toBe(political)
    expect(findSet('set:nope', sets)).toBeNull()
    expect(findSet('mr_eez', sets)).toBeNull()
    expect(findSet(null, sets)).toBeNull()
  })
})

describe('expandGroups', () => {
  it('a set becomes its groups in the set order; a group stays', () => {
    expect(expandGroups(['set:political'], sets)).toEqual(['mr_eez', 'fao_high_seas'])
    expect(expandGroups(['places', 'set:political'], sets)).toEqual(['places', 'mr_eez', 'fao_high_seas'])
  })
  it('no group twice, the first mention wins', () => {
    expect(expandGroups(['fao_high_seas', 'set:political', 'set:wide'], sets)).toEqual(['fao_high_seas', 'mr_eez', 'places'])
  })
  it('an unknown set is dropped (an old or mistyped link names no group)', () => {
    expect(expandGroups(['set:nope', 'places'], sets)).toEqual(['places'])
    expect(expandGroups(['set:political'], [])).toEqual([])
  })
  it('old links, which name groups only, expand to themselves', () => {
    expect(expandGroups(['places', 'mr_eez'], sets)).toEqual(['places', 'mr_eez'])
    expect(expandGroups(['places', 'mr_eez'], [])).toEqual(['places', 'mr_eez'])
  })
})

describe('titles', () => {
  it('a set has its own title; the FAO groups have short titles; an unknown set is its reference', () => {
    expect(collTitle('set:political', {}, sets)).toBe('Ocean by jurisdiction')
    expect(collTitle('fao_high_seas')).toBe('High seas by FAO area')
    expect(collTitle('fao_major_areas')).toBe('FAO major fishing areas')
    expect(collTitle('set:nope', {}, sets)).toBe('set:nope')
  })
})
