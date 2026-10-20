import { describe, expect, it } from 'vitest'
import type { CoverageRow } from '../../../../src/coverage/build.ts'
import type { Indicator, Term } from '../data.ts'
import { indexCoverage } from '../matrix.ts'
import { multiIndicatorLabel } from './indicators.ts'
import {
  buildIndicatorPickTree, groupsHint, groupsWithValues, nodeIndicatorIds, placesWithValue, placesWithValueAnywhere, toggleMatrixIndicators,
} from './indicatorsTree.ts'

// a small synthetic manifest: two categories, three series (sst has a lead and a second member), one indicator in no known category
const ind = (o: Partial<Indicator> & { id: string }): Indicator => ({
  title: o.id.toUpperCase(), short: o.id, kind: 'continuous', category: { onms: 'drivers' }, series: o.id, lead: true, ...o,
}) as Indicator
const SST = ind({ id: 'sst', short: 'SST', series: 'sst', series_title: 'Sea surface temperature' })
const SSTM = ind({ id: 'sst_max', short: 'SST max', series: 'sst', series_title: 'Sea surface temperature', lead: false, category: { onms: 'drivers' } })
const CHL = ind({ id: 'chl', short: 'Chlorophyll', category: { onms: 'water-quality' } })
const ODD = ind({ id: 'odd', short: 'Odd', category: { onms: 'unlisted' } })
const NONE = ind({ id: 'none', short: 'Nothing here', category: { onms: 'water-quality' } })
const inds = [SST, SSTM, CHL, ODD, NONE]
const terms: Term[] = [{ id: 'drivers', label: 'Drivers' }, { id: 'water-quality', label: 'Water quality' }]

const row = (place_id: string, indicator: string, last_value: number | null = 1, place_coll = 'places'): CoverageRow => ({
  place_id, place_name: place_id, coll: 'places', place_coll, indicator, time_grain: 'year', t0: '2000-01-01', t1: '2020-01-01', n_periods: 21,
  last_time: '2020-01-01', last_value, last_class: null, status_method: 'iea-sd', status: null, trend: null, recent_mean: null, recent_from: null,
  recent_to: null, lt_mean: null, lt_sd: null, why: null, sentence: 's', spark: '[]',
}) as CoverageRow
const idx = indexCoverage([row('A', 'sst'), row('B', 'sst'), row('A', 'sst_max'), row('A', 'chl'), row('B', 'odd'), row('A', 'none', null)])
const places = idx.places

describe('how many of the places have a value', () => {
  it('counts the places of the selection with a value for each indicator, not those with an empty row', () => {
    const w = placesWithValue(idx, places, inds)
    expect([...w].map(([id, s]) => [id, s.size])).toEqual([['sst', 2], ['sst_max', 1], ['chl', 1], ['odd', 1], ['none', 0]])
    expect([...placesWithValue(idx, [places[0]], inds).get('sst')!]).toEqual(['A'])
  })
})

describe('the indicator tree', () => {
  const withValues = placesWithValue(idx, places, inds)
  const base = { indicators: inds, vocab: 'onms' as const, terms, chosen: new Set(['sst', 'chl']), withValues, nPlaces: 2 }
  it('categories in vocabulary order, "Other" last; a series is its lead plus the others under "more"; "n of N places" on each', () => {
    const t = buildIndicatorPickTree(base)
    expect(t.map(c => [c.key, c.state, c.hint, c.children.map(s => s.key)])).toEqual([
      ['drivers', 'checked', '2 of 2 places', ['sst']], ['water-quality', 'checked', '1 of 2 places', ['chl']], ['other', 'unchecked', '1 of 2 places', ['odd']],
    ])
    const sst = t[0].children[0]
    expect([sst.label, sst.state, sst.hint, sst.children.map(l => [l.key, l.state, l.hint]), sst.more.map(l => [l.key, l.state, l.hint])])
      .toEqual(['Sea surface temperature', 'checked', '2 of 2 places', [['sst', 'checked', '2 of 2 places']], [['sst_max', 'unchecked', '1 of 2 places']]])
  })
  it('an indicator no place has a value for is left out unless it is chosen or "show indicators without values" is on', () => {
    const keys = (o: object) => buildIndicatorPickTree({ ...base, ...o }).flatMap(c => c.children.flatMap(s => [...s.children, ...s.more].map(l => l.key)))
    expect(keys({})).toEqual(['sst', 'sst_max', 'chl', 'odd'])
    expect(keys({ showEmpty: true })).toEqual(['sst', 'sst_max', 'chl', 'none', 'odd'])
    expect(keys({ chosen: new Set(['none']) })).toContain('none')
  })
  it('a series is mixed when only a non-lead is chosen', () => {
    const t = buildIndicatorPickTree({ ...base, chosen: new Set(['sst_max']) })
    expect(t[0].children[0].state).toBe('mixed')
    expect(t[0].state).toBe('unchecked')
  })
  it('a search keeps the leaves it matches, by short title, series title or id', () => {
    const keys = (q: string) => buildIndicatorPickTree({ ...base, query: q }).flatMap(c => c.children.flatMap(s => [...s.children, ...s.more].map(l => l.key)))
    expect(keys('chloro')).toEqual(['chl'])
    expect(keys('surface')).toEqual(['sst', 'sst_max'])
    expect(keys('sst_max')).toEqual(['sst_max'])
    expect(keys('zzz')).toEqual([])
  })
  it('a hint of its own for a leaf (the Map) leaves the groups with none', () => {
    const t = buildIndicatorPickTree({ ...base, hintOf: i => `h-${i.id}` })
    expect(t[0].hint).toBe('')
    expect(t[0].children[0].hint).toBe('')
    expect(t[0].children[0].children[0].hint).toBe('h-sst')
  })
})

describe('the Matrix keys a tick writes', () => {
  const t = buildIndicatorPickTree({ indicators: inds, vocab: 'onms', terms, chosen: new Set(['sst']), withValues: placesWithValue(idx, places, inds), nPlaces: 2 })
  it('a tick on a series is its lead, on a category the leads of its series, on a leaf itself; off is everything under it', () => {
    expect(nodeIndicatorIds(t[0].children[0], true)).toEqual(['sst'])
    expect(nodeIndicatorIds(t[0], true)).toEqual(['sst'])
    expect(nodeIndicatorIds(t[0].children[0].more[0], true)).toEqual(['sst_max'])
    expect(nodeIndicatorIds(t[0].children[0], false)).toEqual(['sst', 'sst_max'])
    expect(nodeIndicatorIds(t[0], false)).toEqual(['sst', 'sst_max'])
  })
  const pool = new Set(['sst', 'chl'])   // the leads
  it('on: a removed indicator comes back; one outside the pool is added', () => {
    expect(toggleMatrixIndicators({ hideInds: ['chl'], addInds: [] }, ['chl', 'sst_max'], true, pool)).toEqual({ hideInds: [], addInds: ['sst_max'] })
  })
  it('off: an added indicator is taken back out; one in the pool is removed', () => {
    expect(toggleMatrixIndicators({ hideInds: [], addInds: ['sst_max'] }, ['sst', 'sst_max'], false, pool)).toEqual({ hideInds: ['sst'], addInds: [] })
  })
  it('keeps what it does not touch and never repeats an id', () => {
    expect(toggleMatrixIndicators({ hideInds: ['x'], addInds: ['y'] }, ['sst'], false, pool)).toEqual({ hideInds: ['x', 'sst'], addInds: ['y'] })
    expect(toggleMatrixIndicators({ hideInds: ['sst'], addInds: [] }, ['sst'], false, pool)).toEqual({ hideInds: ['sst'], addInds: [] })
  })
})

describe('the button and the Map hints', () => {
  it('multi label: count, vocabulary, and leads only when on', () => {
    expect(multiIndicatorLabel(11, 'onms', true)).toBe('11 indicators · ONMS sections · leads only')
    expect(multiIndicatorLabel(1, 'eov', false)).toBe('1 indicator · GOOS EOVs')
  })
  it('groups with values, per indicator, counted by place (not by row) and by place_coll with coll as the fallback', () => {
    const g = groupsWithValues([
      row('A', 'sst'), row('A', 'sst'), row('B', 'sst'), row('P', 'sst', 1, 'mr_eez'), row('A', 'none', null),
      { ...row('Q', 'old'), place_coll: undefined, coll: 'noaa_nerrs' } as CoverageRow,
    ])
    expect([...g.get('sst')!]).toEqual([['places', 2], ['mr_eez', 1]])
    expect(g.has('none')).toBe(false)
    expect([...g.get('old')!]).toEqual([['noaa_nerrs', 1]])
  })
  it('hint: the group titles for one or two groups, a count past two, nothing for none', () => {
    const t = (c: string) => ({ places: 'Sanctuaries', mr_eez: 'EEZ', a: 'A', b: 'B' } as Record<string, string>)[c] ?? c
    expect(groupsHint(new Map([['mr_eez', 1], ['places', 2]]), t, ['places', 'mr_eez'])).toBe('Sanctuaries, EEZ')
    expect(groupsHint(new Map([['a', 1], ['b', 1], ['places', 1]]), t)).toBe('3 groups')
    expect(groupsHint(undefined, t)).toBe('')
  })
})

describe('the Map lists indicators by the places that have a value anywhere', () => {
  it('counts a place once however many rows it has, and leaves out an indicator with only empty rows', () => {
    const w = placesWithValueAnywhere([row('A', 'sst'), row('A', 'sst'), row('B', 'sst', 1, 'mr_eez'), row('A', 'none', null)])
    expect([...w].map(([id, s]) => [id, [...s]])).toEqual([['sst', ['A', 'B']]])
  })
})
