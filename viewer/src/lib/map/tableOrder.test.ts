import { describe, expect, it } from 'vitest'
import { byIdOrder, tableInOrder } from './tableOrder.ts'
import type { MapItem } from './classes.ts'

const item = (placeId: string, name: string, group: string): MapItem => ({ placeId, name, group, displayId: null, value: 1, valueText: '1', period: null, periodText: null, k: 0, label: 'x' }) as unknown as MapItem
const items = [item('B', 'Bravo', 'places'), item('Z', 'Zed EEZ', 'mr_eez'), item('A', 'Alpha', 'places'), item('M', 'Mid', 'places')]
const places = [{ id: 'A', name: 'Alpha', coll: 'places', lat: 10, lon: 0 }, { id: 'B', name: 'Bravo', coll: 'places', lat: 30, lon: 0 }, { id: 'Z', name: 'Zed EEZ', coll: 'mr_eez', lat: 20, lon: 0 }]
const ids = (xs: MapItem[]) => xs.map(i => i.placeId)

describe('the Map table in the order of the places', () => {
  it('A to Z grouped: the groups A-Z, then the places A-Z, as one list', () => {
    expect(ids(tableInOrder(items, places, { sort: 'az', group: true, custom: [] }))).toEqual(['Z', 'A', 'B', 'M'])
  })
  it('north to south across the groups when grouping is off; a place with no position goes last', () => {
    expect(ids(tableInOrder(items, places, { sort: 'ns', group: false, custom: [] }))).toEqual(['B', 'Z', 'A', 'M'])
  })
  it('a custom order moves a place first', () => {
    expect(ids(tableInOrder(items, places, { sort: 'custom', group: false, custom: ['M'] }))).toEqual(['M', 'A', 'B', 'Z'])
  })
  it('every item stays, none twice', () => {
    expect(ids(tableInOrder(items, [], { sort: 'we', group: true, custom: [] })).sort()).toEqual(['A', 'B', 'M', 'Z'])
  })
  it('the order of a list of ids (a report\'s places); the rest keep their order after it', () => {
    expect(ids(byIdOrder(items, ['M', 'A']))).toEqual(['M', 'A', 'B', 'Z'])
  })
})
