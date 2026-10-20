import { describe, expect, it } from 'vitest'
import { needsPlaces, placeFilter, selectionGroups, selectionTitle } from './selection.ts'

const sel = (include: string[], exclude: string[] = []) => ({ include, exclude, context: false })
const p = (id: string, coll: string) => ({ id, name: id, coll })
const UNIVERSE = [
  p('NMS:A', 'places'), p('NMS:B', 'places'), p('NERRS:WEL', 'noaa_nerrs'), p('NERRS:ACE', 'noaa_nerrs'), p('NERRS:GTM', 'noaa_nerrs'),
  p('MRGID:1', 'mr_eez'), p('MRGID:2', 'mr_eez'), p('FAOHS:21', 'fao_high_seas'),
]
const SETS = [{ id: 'political', title: 'Ocean by jurisdiction', groups: ['mr_eez', 'fao_high_seas'] }]

describe('the groups of the selection the Map draws', () => {
  it('a group named by coll: is drawn whole', () => {
    expect(selectionGroups(sel(['coll:places']), UNIVERSE, SETS)).toEqual([{ group: 'places', only: null }])
    expect(selectionGroups(sel(['coll:places']), null, SETS)).toEqual([{ group: 'places', only: null }])
  })
  it('every group of the selection is a part, in the Matrix group order: groups, then the groups of a place set', () => {
    expect(selectionGroups(sel(['coll:mr_eez', 'coll:noaa_nerrs', 'coll:places']), UNIVERSE, SETS).map(g => g.group)).toEqual(['places', 'noaa_nerrs', 'mr_eez'])
    expect(selectionGroups(sel(['set:political', 'coll:places']), UNIVERSE, SETS).map(g => [g.group, g.only])).toEqual([['places', null], ['mr_eez', null], ['fao_high_seas', null]])
    expect(selectionGroups(sel(['set:nope']), UNIVERSE, SETS)).toEqual([])
  })
  it('places named by id make their group a part restricted to them; the whole group wins over places of it', () => {
    expect(selectionGroups(sel(['NERRS:WEL', 'NERRS:GTM']), UNIVERSE, SETS)).toEqual([{ group: 'noaa_nerrs', only: ['NERRS:WEL', 'NERRS:GTM'] }])
    expect(selectionGroups(sel(['coll:noaa_nerrs', 'NERRS:WEL']), UNIVERSE, SETS)).toEqual([{ group: 'noaa_nerrs', only: null }])
    expect(selectionGroups(sel(['coll:places', 'NERRS:WEL']), UNIVERSE, SETS)).toEqual([{ group: 'places', only: null }, { group: 'noaa_nerrs', only: ['NERRS:WEL'] }])
  })
  it('excluded places are not drawn: the group is then the other places of it', () => {
    expect(selectionGroups(sel(['coll:noaa_nerrs'], ['NERRS:ACE']), UNIVERSE, SETS)).toEqual([{ group: 'noaa_nerrs', only: ['NERRS:WEL', 'NERRS:GTM'] }])
    expect(selectionGroups(sel(['set:political'], ['MRGID:2']), UNIVERSE, SETS)).toEqual([{ group: 'mr_eez', only: ['MRGID:1'] }, { group: 'fao_high_seas', only: null }])
  })
  it('a group with nothing left is not drawn, and an excluded place named by id does not come back', () => {
    expect(selectionGroups(sel(['coll:places'], ['NMS:A', 'NMS:B']), UNIVERSE, SETS)).toEqual([])
    expect(selectionGroups(sel(['NERRS:WEL'], ['NERRS:WEL']), UNIVERSE, SETS)).toEqual([])
    expect(selectionGroups(sel(['none']), UNIVERSE, SETS)).toEqual([])
  })
  it('* is every group given', () => {
    expect(selectionGroups(sel(['*']), UNIVERSE, SETS, ['places', 'mr_eez']).map(g => g.group)).toEqual(['places', 'mr_eez'])
  })
  it('regression: the Map draws the groups of the selection, not a single group', () => {
    expect(selectionGroups(sel(['coll:places', 'coll:noaa_nerrs']), UNIVERSE, SETS)).toHaveLength(2)
  })
  it('the embed has no places: only whole groups are known; the places that need them are said so', () => {
    expect(needsPlaces(sel(['coll:places', 'set:political']))).toBe(false)
    expect(needsPlaces(sel(['coll:places'], ['NMS:A']))).toBe(true)
    expect(needsPlaces(sel(['NMS:A']))).toBe(true)
    expect(needsPlaces(sel(['*']))).toBe(false)
    expect(needsPlaces(sel(['none']))).toBe(false)
    expect(selectionGroups(sel(['NMS:A']), null, SETS)).toEqual([])
  })
})

describe('which places of the coverage the Map reads', () => {
  it('a whole group: every place of it; a restricted one: its chosen places; a group not in the selection: none', () => {
    const f = placeFilter([{ group: 'places', only: null }, { group: 'noaa_nerrs', only: ['NERRS:WEL'] }])
    expect(f('NMS:A', 'places')).toBe(true)
    expect(f('NERRS:WEL', 'noaa_nerrs')).toBe(true)
    expect(f('NERRS:ACE', 'noaa_nerrs')).toBe(false)
    expect(f('MRGID:1', 'mr_eez')).toBe(false)
  })
})

describe('what names the selection above the map', () => {
  const titles = (c: string) => ({ places: 'National Marine Sanctuaries', noaa_nerrs: 'NERRs', 'set:political': 'Ocean by jurisdiction' } as Record<string, string>)[c] ?? c
  it('a group by its title, with the number of its places when it is not whole', () => {
    expect(selectionTitle(sel(['coll:places']), [{ group: 'places', only: null }], titles)).toBe('National Marine Sanctuaries')
    expect(selectionTitle(sel(['NERRS:WEL']), [{ group: 'noaa_nerrs', only: ['NERRS:WEL'] }], titles)).toBe('NERRs (1 place)')
    expect(selectionTitle(sel(['coll:noaa_nerrs'], ['NERRS:ACE']), [{ group: 'noaa_nerrs', only: ['NERRS:WEL', 'NERRS:GTM'] }], titles)).toBe('NERRs (2 places)')
  })
  it('a place set that is the whole selection by its title; several groups by count; nothing', () => {
    expect(selectionTitle(sel(['set:political']), [{ group: 'mr_eez', only: null }, { group: 'fao_high_seas', only: null }], titles)).toBe('Ocean by jurisdiction')
    expect(selectionTitle(sel(['set:political', 'coll:places']), [{ group: 'places', only: null }, { group: 'mr_eez', only: null }, { group: 'fao_high_seas', only: null }], titles)).toBe('3 groups')
    expect(selectionTitle(sel(['none']), [], titles)).toBe('No places')
  })
})
