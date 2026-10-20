// what the Map view shows when the hash names less than it needs: only indicators with coverage can be mapped, an
// indicator has its own collections, and the indicator is the hash's when it is in the selection, else the first selected one
// with values in the selected places (sea surface temperature first).
import type { CoverageRow } from '../../../../src/coverage/build.ts'
import type { Indicator } from '../data.ts'
import { orderGroups } from '../matrix.ts'

export const DEFAULT_MAP_INDICATOR = 'erddap:dhw_5km:CRW_SST:mean'

/** the indicators that have at least one coverage row with a value, in manifest order */
export function mappable(indicators: Indicator[], coverage: Pick<CoverageRow, 'indicator' | 'last_value' | 'last_class'>[]): Indicator[] {
  const have = new Set(coverage.filter(r => r.last_value != null || r.last_class != null).map(r => r.indicator))
  return indicators.filter(i => have.has(i.id))
}

/** the collections of an indicator that have a value in coverage, in the manifest's order */
export function mapColls(ind: Indicator, coverage: Pick<CoverageRow, 'indicator' | 'coll' | 'last_value' | 'last_class'>[]): string[] {
  const have = new Set(coverage.filter(r => r.indicator === ind.id && (r.last_value != null || r.last_class != null)).map(r => r.coll))
  return ind.collections.map(c => c.coll).filter(c => have.has(c))
}

type Cov = Pick<CoverageRow, 'indicator' | 'coll' | 'last_value' | 'last_class'> & { place_id?: string; place_coll?: string | null }
const hasValue = (r: Pick<CoverageRow, 'last_value' | 'last_class'>) => r.last_value != null || r.last_class != null

/** a coverage row's place group: its home gazetteer collection (a coverage table built before `place_coll` groups by `coll`) */
export const groupOf = (r: Pick<CoverageRow, 'coll'> & { place_coll?: string | null }): string => r.place_coll ?? r.coll

/** the place groups an indicator has a value in, in the Matrix's group order */
export function mapGroups(ind: Indicator, coverage: Cov[]): string[] {
  return orderGroups(coverage.filter(r => r.indicator === ind.id && hasValue(r)).map(groupOf))
}

/**
 * the values collections (files) of an indicator that hold places of a group (or of any of several, the groups of a place
 * set) with a value, in the manifest's order: the EEZ group of SST is `places` (Pitcairn), of OBIS `mr_eez` and `places`
 */
export function valuesCollsOfGroup(ind: Indicator, coverage: Cov[], group: string | readonly string[]): string[] {
  const groups = typeof group === 'string' ? [group] : group
  const have = new Set(coverage.filter(r => r.indicator === ind.id && groups.includes(groupOf(r)) && hasValue(r)).map(r => r.coll))
  return ind.collections.map(c => c.coll).filter(c => have.has(c))
}

/**
 * the indicator the Map shows: the hash's when it is one of the selection's (`selected`) and has a value in the selected places
 * (`have`: indicator id -> the places with a value), else sea surface temperature if the selection has it, else the first lead,
 * else the first selected indicator with values there (manifest order); null when no selected indicator has a value
 */
export function pickMapIndicator(selected: Indicator[], have: ReadonlyMap<string, ReadonlySet<string>>, want: string | null): Indicator | null {
  const list = selected.filter(i => (have.get(i.id)?.size ?? 0) > 0)
  return list.find(i => i.id === want) ?? list.find(i => i.id === DEFAULT_MAP_INDICATOR) ?? list.find(i => i.lead) ?? list[0] ?? null
}
