// what the Map view shows when the hash names less than it needs: only indicators with coverage can be mapped, an
// indicator has its own collections, and a hash with no indicator opens on sea surface temperature.
import type { CoverageRow } from '../../../../src/coverage/build.ts'
import type { Indicator } from '../data.ts'

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

export interface MapPick {
  ind: Indicator | null
  coll: string | null
  colls: string[]
}

/** the indicator and collection a Map hash resolves to: what it names when that can be mapped, else the defaults */
export function pickMap(indicators: Indicator[], coverage: CoverageRow[], want: { ind: string | null; coll: string | null }): MapPick {
  const list = mappable(indicators, coverage)
  const ind = list.find(i => i.id === want.ind) ?? list.find(i => i.id === DEFAULT_MAP_INDICATOR) ?? list.find(i => i.lead) ?? list[0] ?? null
  if (!ind) return { ind: null, coll: null, colls: [] }
  const colls = mapColls(ind, coverage)
  return { ind, coll: want.coll && colls.includes(want.coll) ? want.coll : colls[0] ?? null, colls }
}
