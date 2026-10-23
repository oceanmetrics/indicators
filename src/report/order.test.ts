// the order of places and indicators: exact orders from small synthetic fixtures, one test per rule.
import { describe, expect, it } from 'vitest'
import { bboxCentre } from '../coverage/centre.ts'
import {
  canMoveItem, compareText, customOf, DEFAULT_ORDER, indicatorsCustom, isDefaultOrder, moveGroup, moveItem, movedWords, nudgeGroup, nudgeItem,
  orderEquals, orderFromParams, orderIndicators, orderParams, orderPlaces, placesCustom, shownOf, stuckWords, usesRank,
} from './order.ts'
import type { AxisOrder, IndicatorSort, OrderIndicator, OrderPlace, PlaceSort, Shown, StatusRank } from './order.ts'

const titles: Record<string, string> = { places: 'National Marine Sanctuaries', mr_eez: 'Exclusive Economic Zones', noaa_nerrs: 'National Estuarine Research Reserves' }
const label = (c: string) => titles[c] ?? c
const P = (id: string, name: string, coll: string, lat: number | null, lon: number | null): OrderPlace => ({ id, name, coll, lat, lon })

const places: OrderPlace[] = [
  P('NMS:FKNMS', 'Florida Keys', 'places', 24.6, -81.0),
  P('NMS:CINMS', 'Channel Islands', 'places', 34.0, -119.9),
  P('NMS:HIHWNMS', 'Hawaiian Islands Humpback Whale', 'places', 21.0, -157.0),
  P('NMS:SBNMS', 'Stellwagen Bank', 'places', 42.4, -70.3),
  P('MRGID:8456', 'United States EEZ', 'mr_eez', 38.0, -120.0),
  P('MRGID:8403', 'Canadian EEZ', 'mr_eez', 56.0, -130.0),
  P('MRGID:8493', 'Mexican EEZ', 'mr_eez', 23.0, -105.0),
  P('NERRS:WEL', 'Wells', 'noaa_nerrs', 43.3, -70.5),
]
const ids = (gs: { items: { id: string }[] }[]) => gs.map(g => g.items.map(i => i.id))
const gids = (gs: { id: string }[]) => gs.map(g => g.id)
const pOrder = (o: Partial<AxisOrder<PlaceSort>>): AxisOrder<PlaceSort> => ({ ...DEFAULT_ORDER.places, ...o })
const iOrder = (o: Partial<AxisOrder<IndicatorSort>>): AxisOrder<IndicatorSort> => ({ ...DEFAULT_ORDER.indicators, ...o })

describe('places: the default is groups A-Z by title, places A-Z by name', () => {
  it('orders the groups by their title, not by the collection slug', () => {
    expect(gids(orderPlaces(places, pOrder({}), label))).toEqual(['mr_eez', 'noaa_nerrs', 'places'])
  })
  it('orders the places of a group A-Z by name', () => {
    expect(ids(orderPlaces(places, pOrder({}), label))).toEqual([
      ['MRGID:8403', 'MRGID:8493', 'MRGID:8456'],
      ['NERRS:WEL'],
      ['NMS:CINMS', 'NMS:FKNMS', 'NMS:HIHWNMS', 'NMS:SBNMS'],
    ])
  })
  it('a tie in name is broken by id, whatever the order given', () => {
    const twins = [P('B:2', 'Twin', 'places', 0, 0), P('A:1', 'Twin', 'places', 0, 0), P('C:3', 'Alpha', 'places', 0, 0)]
    expect(ids(orderPlaces(twins, pOrder({}), label))).toEqual([['C:3', 'A:1', 'B:2']])
    expect(ids(orderPlaces([...twins].reverse(), pOrder({}), label))).toEqual([['C:3', 'A:1', 'B:2']])
  })
  it('numbers inside a name sort as numbers', () => {
    expect(['Zone 10', 'Zone 2', 'Zone 1'].sort(compareText)).toEqual(['Zone 1', 'Zone 2', 'Zone 10'])
  })
  it('does not change the places it is given', () => {
    const before = places.map(p => p.id)
    orderPlaces(places, pOrder({}), label)
    expect(places.map(p => p.id)).toEqual(before)
  })
})

describe('places: north to south, south to north, west to east', () => {
  it('north to south inside each group, the groups still A-Z', () => {
    expect(ids(orderPlaces(places, pOrder({ sort: 'ns' }), label))).toEqual([
      ['MRGID:8403', 'MRGID:8456', 'MRGID:8493'],
      ['NERRS:WEL'],
      ['NMS:SBNMS', 'NMS:CINMS', 'NMS:FKNMS', 'NMS:HIHWNMS'],
    ])
  })
  it('south to north is the reverse of north to south within a group', () => {
    const ns = ids(orderPlaces(places, pOrder({ sort: 'ns' }), label))
    expect(ids(orderPlaces(places, pOrder({ sort: 'sn' }), label))).toEqual(ns.map(g => [...g].reverse()))
  })
  it('west to east by the centre of the bbox', () => {
    expect(ids(orderPlaces(places, pOrder({ sort: 'we' }), label))[2]).toEqual(['NMS:HIHWNMS', 'NMS:CINMS', 'NMS:FKNMS', 'NMS:SBNMS'])
  })
  it('a place with no position goes last, whichever way, then by name', () => {
    const some = [P('A:1', 'Alpha', 'places', null, null), P('B:2', 'Beta', 'places', 10, 10), P('C:3', 'Gamma', 'places', 20, 20), P('D:4', 'Delta', 'places', null, null)]
    expect(ids(orderPlaces(some, pOrder({ sort: 'ns' }), label))).toEqual([['C:3', 'B:2', 'A:1', 'D:4']])
    expect(ids(orderPlaces(some, pOrder({ sort: 'sn' }), label))).toEqual([['B:2', 'C:3', 'A:1', 'D:4']])
    expect(ids(orderPlaces(some, pOrder({ sort: 'we' }), label))).toEqual([['B:2', 'C:3', 'A:1', 'D:4']])
  })
  it('a latitude tie falls back to the name', () => {
    const tie = [P('B:2', 'Beta', 'places', 10, 5), P('A:1', 'Alpha', 'places', 10, 9)]
    expect(ids(orderPlaces(tie, pOrder({ sort: 'ns' }), label))).toEqual([['A:1', 'B:2']])
  })
  it('the antimeridian: a place centred across it sits at its true longitude, west to east', () => {
    // Aleutian Arc: 167.64 E to 165 W (the index writes 167.64 .. 195), centre -178.68; Guam 144 E; Hawaii -157
    const aleutian = bboxCentre({ xmin: 167.64, ymin: 47.8, xmax: 195, ymax: 54 })!
    const guam = bboxCentre({ xmin: 143, ymin: 13, xmax: 145, ymax: 14 })!
    const hawaii = bboxCentre({ xmin: -160, ymin: 19, xmax: -154, ymax: 22 })!
    const set = [P('X:G', 'Guam', 'places', guam.lat, guam.lon), P('X:A', 'Aleutian', 'places', aleutian.lat, aleutian.lon), P('X:H', 'Hawaii', 'places', hawaii.lat, hawaii.lon)]
    expect(ids(orderPlaces(set, pOrder({ sort: 'we' }), label))).toEqual([['X:A', 'X:H', 'X:G']])
  })
})

describe('places: grouping off is one flat list', () => {
  it('every place north to south across the collections', () => {
    const flat = orderPlaces(places, pOrder({ sort: 'ns', group: false }), label)
    expect(flat).toHaveLength(1)
    expect(flat[0].id).toBe('')
    expect(flat[0].items.map(p => p.id)).toEqual(['MRGID:8403', 'NERRS:WEL', 'NMS:SBNMS', 'MRGID:8456', 'NMS:CINMS', 'NMS:FKNMS', 'MRGID:8493', 'NMS:HIHWNMS'])
  })
  it('A to Z across the collections', () => {
    expect(orderPlaces(places, pOrder({ group: false }), label)[0].items.map(p => p.name)).toEqual([
      'Canadian EEZ', 'Channel Islands', 'Florida Keys', 'Hawaiian Islands Humpback Whale', 'Mexican EEZ', 'Stellwagen Bank', 'United States EEZ', 'Wells',
    ])
  })
})

describe('places: a custom order', () => {
  it('lists some places and groups first; the rest follow in A-Z, the groups A-Z', () => {
    const o = pOrder({ sort: 'custom', custom: ['g:places', 'NMS:SBNMS', 'NMS:HIHWNMS'] })
    const out = orderPlaces(places, o, label)
    expect(gids(out)).toEqual(['places', 'mr_eez', 'noaa_nerrs'])
    expect(ids(out)).toEqual([['NMS:SBNMS', 'NMS:HIHWNMS', 'NMS:CINMS', 'NMS:FKNMS'], ['MRGID:8403', 'MRGID:8493', 'MRGID:8456'], ['NERRS:WEL']])
  })
  it('an id or a group the list names that is not in the selection is ignored', () => {
    const o = pOrder({ sort: 'custom', custom: ['g:nowhere', 'GONE:1', 'NMS:SBNMS'] })
    const out = orderPlaces(places, o, label)
    expect(gids(out)).toEqual(['mr_eez', 'noaa_nerrs', 'places'])
    expect(ids(out)[2]).toEqual(['NMS:SBNMS', 'NMS:CINMS', 'NMS:FKNMS', 'NMS:HIHWNMS'])
  })
  it('a place the list does not know (a new one) falls in after the listed ones, in A-Z', () => {
    const o = pOrder({ sort: 'custom', custom: ['NMS:SBNMS', 'NMS:HIHWNMS'] })
    const added = [...places, P('NMS:AANMS', 'Aardvark Bank', 'places', 0, 0)]
    expect(ids(orderPlaces(added, o, label))[2]).toEqual(['NMS:SBNMS', 'NMS:HIHWNMS', 'NMS:AANMS', 'NMS:CINMS', 'NMS:FKNMS'])
  })
  it('the first mention of an id counts', () => {
    const o = pOrder({ sort: 'custom', custom: ['NMS:SBNMS', 'NMS:CINMS', 'NMS:SBNMS'] })
    expect(ids(orderPlaces(places, o, label))[2].slice(0, 2)).toEqual(['NMS:SBNMS', 'NMS:CINMS'])
  })
  it('with grouping off the group entries are ignored and the ids order the whole list', () => {
    const o = pOrder({ sort: 'custom', group: false, custom: ['g:places', 'NMS:SBNMS', 'MRGID:8456'] })
    expect(orderPlaces(places, o, label)[0].items.map(p => p.id)).toEqual(
      ['NMS:SBNMS', 'MRGID:8456', 'MRGID:8403', 'NMS:CINMS', 'NMS:FKNMS', 'NMS:HIHWNMS', 'MRGID:8493', 'NERRS:WEL'])
  })
  it('an empty custom list is the A-Z order', () => {
    expect(ids(orderPlaces(places, pOrder({ sort: 'custom' }), label))).toEqual(ids(orderPlaces(places, pOrder({}), label)))
  })
})

// ---- indicators ----
const terms = [{ id: 'physical', label: 'Physical' }, { id: 'biological', label: 'Biological' }, { id: 'chemical', label: 'Chemical' }]
const I = (id: string, short: string, series: string, lead: boolean, onms: string | undefined): OrderIndicator => ({ id, short, series, lead, category: onms ? { onms } : {} })
// the manifest order: a series' member before its lead, to show the lead first in the vocabulary order
const inds: OrderIndicator[] = [
  I('sst_anom', 'SST anomaly', 'sst', false, 'physical'),
  I('sst', 'Sea surface temperature', 'sst', true, 'physical'),
  I('chl', 'Chlorophyll', 'chl', true, 'biological'),
  I('ph', 'pH', 'ph', true, 'chemical'),
  I('dhw', 'Degree heating weeks', 'dhw', true, 'physical'),
  I('oxy', 'Oxygen', 'oxy', true, 'chemical'),
  I('misc', 'Misc', 'misc', true, undefined),
]

describe('indicators: the default is the groups A-Z by label, the indicators A-Z by short title, Other last', () => {
  it('orders the groups of the vocabulary by label, Other last', () => {
    expect(gids(orderIndicators(inds, iOrder({}), 'onms', terms))).toEqual(['biological', 'chemical', 'physical', 'other'])
  })
  it('orders the indicators of a group by short title', () => {
    expect(ids(orderIndicators(inds, iOrder({}), 'onms', terms))).toEqual([['chl'], ['oxy', 'ph'], ['dhw', 'sst', 'sst_anom'], ['misc']])
  })
  it('an indicator tagged with a term the vocabulary lacks is in Other', () => {
    const odd = [...inds, I('x', 'X', 'x', true, 'unknown_term')]
    expect(ids(orderIndicators(odd, iOrder({}), 'onms', terms))[3]).toEqual(['misc', 'x'])
  })
  it('the labels of the groups come from the vocabulary', () => {
    expect(orderIndicators(inds, iOrder({}), 'onms', terms).map(g => g.label)).toEqual(['Biological', 'Chemical', 'Physical', 'Other'])
  })
})

describe('indicators: the vocabulary order', () => {
  it('the vocabulary term order, a series together with its lead first, then the manifest order', () => {
    const out = orderIndicators(inds, iOrder({ sort: 'vocab' }), 'onms', terms)
    expect(gids(out)).toEqual(['physical', 'biological', 'chemical', 'other'])
    expect(ids(out)).toEqual([['sst', 'sst_anom', 'dhw'], ['chl'], ['ph', 'oxy'], ['misc']])
  })
  it('flat, it is the series order with each lead first', () => {
    expect(orderIndicators(inds, iOrder({ sort: 'vocab', group: false }), 'onms', terms)[0].items.map(i => i.id)).toEqual(['sst', 'sst_anom', 'chl', 'ph', 'dhw', 'oxy', 'misc'])
  })
})

describe('indicators: grouping off and a custom order', () => {
  it('flat A to Z', () => {
    expect(orderIndicators(inds, iOrder({ group: false }), 'onms', terms)[0].items.map(i => i.id)).toEqual(['chl', 'dhw', 'misc', 'oxy', 'ph', 'sst', 'sst_anom'])
  })
  it('a custom order lists groups and indicators; the rest follow A-Z', () => {
    const o = iOrder({ sort: 'custom', custom: ['g:physical', 'sst_anom', 'ph'] })
    const out = orderIndicators(inds, o, 'onms', terms)
    expect(gids(out)).toEqual(['physical', 'biological', 'chemical', 'other'])
    expect(ids(out)).toEqual([['sst_anom', 'dhw', 'sst'], ['chl'], ['ph', 'oxy'], ['misc']])
  })
  it('a group entry of another vocabulary is ignored', () => {
    const o = iOrder({ sort: 'custom', custom: ['g:nope'] })
    expect(gids(orderIndicators(inds, o, 'onms', terms))).toEqual(['biological', 'chemical', 'physical', 'other'])
  })
})

describe('the status sorts (the Matrix sort select): most first, a tie A-Z, without a rank A-Z', () => {
  const rank = (above: Record<string, number>, below: Record<string, number>, latest: Record<string, string> = {}): StatusRank =>
    ({ above: id => above[id] ?? 0, below: id => below[id] ?? 0, latest: id => latest[id] ?? null })
  const r = rank({ 'NMS:SBNMS': 3, 'NMS:CINMS': 1, 'NMS:FKNMS': 1, 'MRGID:8493': 2, sst: 2, ph: 1, chl: 2 }, { 'NMS:HIHWNMS': 4, 'NMS:FKNMS': 2, dhw: 5, oxy: 1 },
    { 'NMS:FKNMS': '2025-07-01', 'NMS:CINMS': '2025-01-01', 'NMS:SBNMS': '2024-01-01', 'MRGID:8456': '2023-01-01' })
  it('places by the count above, within each group (Channel Islands and Florida Keys tie on 1: A-Z)', () => {
    expect(ids(orderPlaces(places, pOrder({ sort: 'above' }), label, r))).toEqual([
      ['MRGID:8493', 'MRGID:8403', 'MRGID:8456'], ['NERRS:WEL'], ['NMS:SBNMS', 'NMS:CINMS', 'NMS:FKNMS', 'NMS:HIHWNMS']])
  })
  it('places by the count below, flat', () => {
    expect(orderPlaces(places, pOrder({ sort: 'below', group: false }), label, r)[0].items.map(p => p.id).slice(0, 3)).toEqual(['NMS:HIHWNMS', 'NMS:FKNMS', 'MRGID:8403'])
  })
  it('places by the most recent period; a place with none goes last', () => {
    expect(orderPlaces(places, pOrder({ sort: 'recent', group: false }), label, r)[0].items.map(p => p.id).slice(0, 5)).toEqual(['NMS:FKNMS', 'NMS:CINMS', 'NMS:SBNMS', 'MRGID:8456', 'MRGID:8403'])
  })
  it('without a rank a status sort is A to Z', () => {
    expect(ids(orderPlaces(places, pOrder({ sort: 'below' }), label))).toEqual(ids(orderPlaces(places, pOrder({}), label)))
  })
  it('indicators in series order, the leads first; the groups A-Z', () => {
    const out = orderIndicators(inds, iOrder({ sort: 'series' }), 'onms', terms)
    expect(gids(out)).toEqual(['biological', 'chemical', 'physical', 'other'])
    expect(ids(out)).toEqual([['chl'], ['ph', 'oxy'], ['sst', 'sst_anom', 'dhw'], ['misc']])
  })
  it('indicators by the count of places above or below, flat', () => {
    expect(orderIndicators(inds, iOrder({ sort: 'above', group: false }), 'onms', terms, r)[0].items.map(i => i.id)).toEqual(['chl', 'sst', 'ph', 'dhw', 'misc', 'oxy', 'sst_anom'])
    expect(orderIndicators(inds, iOrder({ sort: 'below', group: false }), 'onms', terms, r)[0].items.map(i => i.id).slice(0, 2)).toEqual(['dhw', 'oxy'])
  })
  it('an order needs counts only with a status sort on an axis (series needs none)', () => {
    expect(usesRank(DEFAULT_ORDER)).toBe(false)
    expect(usesRank({ ...DEFAULT_ORDER, indicators: iOrder({ sort: 'series' }) })).toBe(false)
    expect(usesRank({ ...DEFAULT_ORDER, places: pOrder({ sort: 'recent' }) })).toBe(true)
    expect(usesRank({ ...DEFAULT_ORDER, indicators: iOrder({ sort: 'below' }) })).toBe(true)
  })
  it('the status sorts are read from and written to the URL like the others', () => {
    const o = orderFromParams(new Map([['ps', 'below'], ['is', 'series']]))
    expect([o.places.sort, o.indicators.sort]).toEqual(['below', 'series'])
    expect(orderParams(o)).toEqual([['ps', 'below'], ['is', 'series']])
    expect(orderFromParams(new Map([['ps', 'series'], ['is', 'recent']]))).toEqual(DEFAULT_ORDER)
  })
})

// ---- moves ----
const shownPlaces = (): Shown[] => shownOf(orderPlaces(places, pOrder({}), label), p => p.id)
const itemsOf = (s: Shown[] | null, g: string) => s?.find(x => x.id === g)?.items

describe('moving an item', () => {
  it('after another item of its group', () => {
    expect(itemsOf(moveItem(shownPlaces(), true, 'NMS:CINMS', 'NMS:HIHWNMS', 'after'), 'places')).toEqual(['NMS:FKNMS', 'NMS:HIHWNMS', 'NMS:CINMS', 'NMS:SBNMS'])
  })
  it('before another item of its group', () => {
    expect(itemsOf(moveItem(shownPlaces(), true, 'NMS:SBNMS', 'NMS:CINMS', 'before'), 'places')).toEqual(['NMS:SBNMS', 'NMS:CINMS', 'NMS:FKNMS', 'NMS:HIHWNMS'])
  })
  it('is refused into another group while the axis is grouped', () => {
    expect(canMoveItem(shownPlaces(), true, 'NERRS:WEL', 'NMS:CINMS')).toBe(false)
    expect(moveItem(shownPlaces(), true, 'NERRS:WEL', 'NMS:CINMS', 'after')).toBeNull()
  })
  it('goes anywhere in a flat list', () => {
    const flat = shownOf(orderPlaces(places, pOrder({ group: false }), label), p => p.id)
    expect(canMoveItem(flat, false, 'NERRS:WEL', 'NMS:CINMS')).toBe(true)
    expect(moveItem(flat, false, 'NERRS:WEL', 'NMS:CINMS', 'before')![0].items.slice(0, 3)).toEqual(['MRGID:8403', 'NERRS:WEL', 'NMS:CINMS'])
  })
  it('onto itself, to where it already is, or an unknown id: nothing changes', () => {
    expect(moveItem(shownPlaces(), true, 'NMS:CINMS', 'NMS:CINMS', 'after')).toBeNull()
    expect(moveItem(shownPlaces(), true, 'NMS:CINMS', 'NMS:FKNMS', 'before')).toBeNull()
    expect(moveItem(shownPlaces(), true, 'NMS:CINMS', 'NOPE', 'before')).toBeNull()
  })
  it('does not change the order it is given', () => {
    const s = shownPlaces()
    moveItem(s, true, 'NMS:CINMS', 'NMS:SBNMS', 'after')
    expect(s).toEqual(shownPlaces())
  })
  it('one place at a time (the keys): it names the neighbour it went past', () => {
    const n = nudgeItem(shownPlaces(), true, 'NMS:CINMS', 1)!
    expect([n.past, n.side, itemsOf(n.shown, 'places')]).toEqual(['NMS:FKNMS', 'after', ['NMS:FKNMS', 'NMS:CINMS', 'NMS:HIHWNMS', 'NMS:SBNMS']])
    const m = nudgeItem(shownPlaces(), true, 'NMS:SBNMS', -1)!
    expect([m.past, m.side]).toEqual(['NMS:HIHWNMS', 'before'])
  })
  it('one place at the first or last place of its group does nothing', () => {
    expect(nudgeItem(shownPlaces(), true, 'NMS:CINMS', -1)).toBeNull()
    expect(nudgeItem(shownPlaces(), true, 'NMS:SBNMS', 1)).toBeNull()
    expect(nudgeItem(shownPlaces(), true, 'NERRS:WEL', 1)).toBeNull()
  })
})

describe('moving a group', () => {
  it('the whole group before or after another, its items kept', () => {
    const out = moveGroup(shownPlaces(), true, 'places', 'mr_eez', 'before')!
    expect(out.map(g => g.id)).toEqual(['places', 'mr_eez', 'noaa_nerrs'])
    expect(itemsOf(out, 'places')).toEqual(['NMS:CINMS', 'NMS:FKNMS', 'NMS:HIHWNMS', 'NMS:SBNMS'])
  })
  it('to where it already is, onto itself, or when the axis is flat: nothing changes', () => {
    expect(moveGroup(shownPlaces(), true, 'mr_eez', 'noaa_nerrs', 'before')).toBeNull()
    expect(moveGroup(shownPlaces(), true, 'mr_eez', 'mr_eez', 'after')).toBeNull()
    expect(moveGroup(shownPlaces(), false, 'places', 'mr_eez', 'before')).toBeNull()
  })
  it('one place at a time, and not past the first or last', () => {
    expect(nudgeGroup(shownPlaces(), true, 'mr_eez', 1)!.shown.map(g => g.id)).toEqual(['noaa_nerrs', 'mr_eez', 'places'])
    expect(nudgeGroup(shownPlaces(), true, 'mr_eez', -1)).toBeNull()
    expect(nudgeGroup(shownPlaces(), true, 'places', 1)).toBeNull()
  })
})

describe('the custom list a move writes', () => {
  const arrangeBy = (o: AxisOrder<PlaceSort>) => orderPlaces(places, o, label)
  it('lists only what the order needs: one moved place writes two ids', () => {
    const moved = moveItem(shownPlaces(), true, 'NMS:CINMS', 'NMS:HIHWNMS', 'after')!
    const o = placesCustom(places, moved, pOrder({}), label)
    expect(o).toEqual({ sort: 'custom', group: true, custom: ['NMS:FKNMS', 'NMS:HIHWNMS'] })
    expect(shownOf(arrangeBy(o), p => p.id)).toEqual(moved)
  })
  it('a moved group writes its group entry only', () => {
    const moved = moveGroup(shownPlaces(), true, 'places', 'mr_eez', 'before')!
    expect(placesCustom(places, moved, pOrder({}), label).custom).toEqual(['g:places'])
  })
  it('a place moved to the front writes it alone', () => {
    const moved = moveItem(shownPlaces(), true, 'NMS:SBNMS', 'NMS:CINMS', 'before')!
    expect(placesCustom(places, moved, pOrder({}), label).custom).toEqual(['NMS:SBNMS'])
  })
  it('reads back to the same order, in a flat list too', () => {
    const flat = shownOf(orderPlaces(places, pOrder({ group: false, sort: 'ns' }), label), p => p.id)
    const moved = moveItem(flat, false, 'NERRS:WEL', 'NMS:HIHWNMS', 'after')!
    const o = placesCustom(places, moved, pOrder({ group: false, sort: 'ns' }), label)
    expect(o.group).toBe(false)
    expect(shownOf(arrangeBy(o), p => p.id)[0].items).toEqual(moved[0].items)
  })
  it('the full list is groups then items, in order', () => {
    expect(customOf(shownPlaces(), true).slice(0, 5)).toEqual(['g:mr_eez', 'g:noaa_nerrs', 'g:places', 'MRGID:8403', 'MRGID:8493'])
    expect(customOf(shownPlaces(), false)[0]).toBe('MRGID:8403')
  })
  it('indicators: a moved indicator writes the ones it needs and reads back', () => {
    const shown = shownOf(orderIndicators(inds, iOrder({}), 'onms', terms), i => i.id)
    const moved = moveItem(shown, true, 'sst_anom', 'dhw', 'before')!
    const o = indicatorsCustom(inds, moved, iOrder({}), 'onms', terms)
    expect(o).toEqual({ sort: 'custom', group: true, custom: ['sst_anom'] })
    expect(shownOf(orderIndicators(inds, o, 'onms', terms), i => i.id)).toEqual(moved)
  })
  it('a move across groups of indicators is refused while grouped', () => {
    const shown = shownOf(orderIndicators(inds, iOrder({}), 'onms', terms), i => i.id)
    expect(moveItem(shown, true, 'chl', 'dhw', 'before')).toBeNull()
  })
})

describe('words', () => {
  it('say what moved', () => {
    expect(movedWords('Channel Islands', 'Chumash Heritage', 'after')).toBe('Moved Channel Islands after Chumash Heritage')
    expect(stuckWords('Wells', 'first')).toBe('Wells is already first')
    expect(stuckWords('Wells', 'group')).toContain('turn grouping off')
  })
})

describe('the URL form', () => {
  const kv = (o: Record<string, string>) => new Map(Object.entries(o))
  it('the default order writes nothing', () => {
    expect(orderParams(DEFAULT_ORDER)).toEqual([])
    expect(isDefaultOrder(orderFromParams(kv({})))).toBe(true)
  })
  it('writes only what differs', () => {
    expect(orderParams({ ...DEFAULT_ORDER, places: pOrder({ sort: 'ns' }) })).toEqual([['ps', 'ns']])
    expect(orderParams({ ...DEFAULT_ORDER, indicators: iOrder({ sort: 'vocab', group: false }) })).toEqual([['is', 'vocab'], ['ig', '0']])
    expect(orderParams({ ...DEFAULT_ORDER, places: pOrder({ group: false }) })).toEqual([['pg', '0']])
  })
  it('a custom list is written for custom only', () => {
    expect(orderParams({ ...DEFAULT_ORDER, places: pOrder({ sort: 'custom', custom: ['g:places', 'NMS:A'] }) })).toEqual([['ps', 'custom'], ['po', 'g:places,NMS:A']])
    expect(orderParams({ ...DEFAULT_ORDER, places: pOrder({ sort: 'ns', custom: ['NMS:A'] }) })).toEqual([['ps', 'ns']])
  })
  it('reads every key back', () => {
    const o = orderFromParams(kv({ ps: 'custom', pg: '0', po: 'NMS:A,NMS:B', is: 'vocab', ig: '0', io: 'x' }))
    expect(o.places).toEqual({ sort: 'custom', group: false, custom: ['NMS:A', 'NMS:B'] })
    expect(o.indicators).toEqual({ sort: 'vocab', group: false, custom: [] })
    expect(orderEquals(orderFromParams(new Map(orderParams(o))), o)).toBe(true)
  })
  it('an unknown sort falls back to A to Z; a list without custom is dropped', () => {
    const o = orderFromParams(kv({ ps: 'diagonal', po: 'NMS:A', is: 'ns' }))
    expect(o).toEqual(DEFAULT_ORDER)
  })
  it('the sort of one axis is not accepted on the other', () => {
    expect(orderFromParams(kv({ ps: 'vocab' })).places.sort).toBe('az')
    expect(orderFromParams(kv({ is: 'we' })).indicators.sort).toBe('az')
  })
})
