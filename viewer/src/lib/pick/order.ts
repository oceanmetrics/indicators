// the Order control's rules that the page needs before its panel opens, in plain functions: the words on its button and the changes a
// click makes to the order (a sort key, grouping on or off, a reset). the order itself, and how it is applied, is
// src/report/order.ts; the panel (OrderPanel.svelte) loads on the first open.
import { DEFAULT_ORDER, INDICATOR_SORT_WORDS, isDefaultAxis, isDefaultOrder, PLACE_SORT_WORDS } from '../../../../src/report/order.ts'
import type { AxisOrder, IndicatorSort, OrderSpec, PlaceSort } from '../../../../src/report/order.ts'

export type OrderAxisName = 'places' | 'indicators'

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** "north to south", "north to south, ungrouped": what one axis is in, in a few words */
function axisWords(sort: string, words: Record<string, string>, a: AxisOrder<string>): string {
  return lower(words[sort]) + (a.group ? '' : ', ungrouped')
}

/** what the Order button says: "A to Z" for the default, else what differs ("Places: north to south · Indicators: custom") */
export function orderLabel(o: OrderSpec): string {
  if (isDefaultOrder(o)) return 'A to Z'
  const parts: string[] = []
  if (!isDefaultAxis(o.places)) parts.push(`Places: ${axisWords(o.places.sort, PLACE_SORT_WORDS, o.places)}`)
  if (!isDefaultAxis(o.indicators)) parts.push(`Indicators: ${axisWords(o.indicators.sort, INDICATOR_SORT_WORDS, o.indicators)}`)
  return parts.join(' · ')
}

/**
 * a sort key chosen on an axis. the custom list stays in the state (choosing "Custom" again brings the reader's order back) but is not
 * written to the URL unless the sort is custom
 */
export function setPlaceSort(o: OrderSpec, sort: PlaceSort): OrderSpec {
  return { ...o, places: { ...o.places, sort } }
}
export function setIndicatorSort(o: OrderSpec, sort: IndicatorSort): OrderSpec {
  return { ...o, indicators: { ...o.indicators, sort } }
}

/** grouping on or off on an axis (the custom list is kept; off, its group entries are not used) */
export function setGroup(o: OrderSpec, axis: OrderAxisName, group: boolean): OrderSpec {
  return { ...o, [axis]: { ...o[axis], group } }
}

/** one axis back to its default sort, grouped, with no custom order */
export function resetAxis(o: OrderSpec, axis: OrderAxisName): OrderSpec {
  return { ...o, [axis]: DEFAULT_ORDER[axis] }
}

/** both axes back to the default */
export const resetOrder = (): OrderSpec => DEFAULT_ORDER

/** has the reader a custom order of their own to go back to on this axis? */
export const hasCustom = (a: AxisOrder<string>): boolean => a.custom.length > 0

/** the sort keys offered as buttons: every one but `custom`, which is made by moving a header (it shows when there is one) */
export const PLACE_KEYS: PlaceSort[] = ['az', 'ns', 'sn', 'we']
export const INDICATOR_KEYS: IndicatorSort[] = ['az', 'vocab']
