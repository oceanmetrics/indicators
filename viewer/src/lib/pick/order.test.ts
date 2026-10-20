// the Order control's words and the changes a click makes
import { describe, expect, it } from 'vitest'
import { DEFAULT_ORDER } from '../../../../src/report/order.ts'
import type { OrderSpec } from '../../../../src/report/order.ts'
import { hasCustom, orderLabel, resetAxis, resetOrder, setGroup, setIndicatorSort, setPlaceSort } from './order.ts'

const custom: OrderSpec = { places: { sort: 'custom', group: true, custom: ['NMS:A'] }, indicators: { sort: 'vocab', group: false, custom: [] } }

describe('what the Order button says', () => {
  it('A to Z for the default', () => expect(orderLabel(DEFAULT_ORDER)).toBe('A to Z'))
  it('names an axis only when it differs', () => {
    expect(orderLabel(setPlaceSort(DEFAULT_ORDER, 'ns'))).toBe('Places: north to south')
    expect(orderLabel(setGroup(DEFAULT_ORDER, 'places', false))).toBe('Places: A to Z, ungrouped')
    expect(orderLabel(custom)).toBe('Places: custom · Indicators: vocabulary order, ungrouped')
  })
})

describe('the changes of a click', () => {
  it('a sort key is set and the custom list is kept for going back', () => {
    const o = setPlaceSort(custom, 'we')
    expect(o.places).toEqual({ sort: 'we', group: true, custom: ['NMS:A'] })
    expect(hasCustom(o.places)).toBe(true)
    expect(setPlaceSort(o, 'custom').places.sort).toBe('custom')
    expect(setIndicatorSort(DEFAULT_ORDER, 'vocab').indicators.sort).toBe('vocab')
  })
  it('grouping goes on or off on one axis only', () => {
    expect(setGroup(DEFAULT_ORDER, 'indicators', false)).toEqual({ ...DEFAULT_ORDER, indicators: { ...DEFAULT_ORDER.indicators, group: false } })
  })
  it('reset returns one axis, or both, to the default', () => {
    expect(resetAxis(custom, 'places')).toEqual({ ...custom, places: DEFAULT_ORDER.places })
    expect(resetOrder()).toEqual(DEFAULT_ORDER)
  })
})
