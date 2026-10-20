// what the Map view shows when the hash names less than it needs: only indicators with coverage can be mapped, an
// indicator has its own collections, and a hash with no indicator opens on sea surface temperature.
import type { CoverageRow } from '../../../../src/coverage/build.ts'
import type { Indicator, PlaceSet } from '../data.ts'
import { orderGroups } from '../matrix.ts'
import { expandGroups, findSet, isSetRef } from '../sets.ts'

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
 * the group a hash's `coll` names for an indicator: a group the indicator has values in; else (an old link names a values
 * collection) the group holding most of that collection's places with a value; else the indicator's first group
 */
export function resolveGroup(ind: Indicator, coverage: Cov[], want: string | null, sets: readonly PlaceSet[] = []): string | null {
  const groups = mapGroups(ind, coverage)
  if (want && groups.includes(want)) return want
  // a place set (`set:<id>`) stands when the indicator has values in at least one of its groups
  if (isSetRef(want)) {
    const set = findSet(want, sets)
    if (set && set.groups.some(g => groups.includes(g))) return want
    return groups[0] ?? null
  }
  if (want) {
    const n = new Map<string, Set<string>>()
    for (const r of coverage) if (r.indicator === ind.id && r.coll === want && hasValue(r)) n.set(groupOf(r), (n.get(groupOf(r)) ?? new Set()).add(r.place_id ?? ''))
    const best = [...n].sort((a, b) => b[1].size - a[1].size || groups.indexOf(a[0]) - groups.indexOf(b[0]))[0]
    if (best) return best[0]
  }
  return groups[0] ?? null
}

/**
 * the indicator to show for a group that has no value for the current one: the sea surface temperature if the group has it, else the
 * first lead with values there, else the first indicator with values there (manifest order); null when nothing is computed
 */
export function leadForGroup(indicators: Indicator[], coverage: Cov[], group: string | readonly string[]): Indicator | null {
  const groups = typeof group === 'string' ? [group] : group
  const here = mappable(indicators, coverage.filter(r => groups.includes(groupOf(r))))
  return here.find(i => i.id === DEFAULT_MAP_INDICATOR) ?? here.find(i => i.lead) ?? here[0] ?? null
}

export interface MapPick {
  ind: Indicator | null
  /** the place group shown */
  coll: string | null
  /** the groups the indicator has values in */
  colls: string[]
}

/** the indicator and group a Map hash resolves to: what it names when that can be mapped, else the defaults */
export function pickMap(indicators: Indicator[], coverage: CoverageRow[], want: { ind: string | null; coll: string | null }, sets: readonly PlaceSet[] = []): MapPick {
  const list = mappable(indicators, coverage)
  const ind = list.find(i => i.id === want.ind) ?? list.find(i => i.id === DEFAULT_MAP_INDICATOR) ?? list.find(i => i.lead) ?? list[0] ?? null
  if (!ind) return { ind: null, coll: null, colls: [] }
  return { ind, coll: resolveGroup(ind, coverage, want.coll, sets), colls: mapGroups(ind, coverage) }
}

/**
 * the sentence above the map when choosing a group switched the indicator: "SST is not computed for Exclusive Economic Zones;
 * showing OBIS species richness, all taxa."
 */
export function switchNotice(from: Pick<Indicator, 'short'>, to: Pick<Indicator, 'title'>, groupTitle: string): string {
  return `${from.short} is not computed for ${groupTitle}; showing ${to.title.replace(/\.$/, '')}.`
}

/**
 * the place groups a Map `coll` draws: the group itself, or the groups of the place set (those the indicator has values
 * in, in the set's order); a group only when the reference names none
 */
export function drawnGroups(coll: string, ind: Indicator, coverage: Cov[], sets: readonly PlaceSet[] = []): string[] {
  if (!isSetRef(coll)) return [coll]
  const have = new Set(mapGroups(ind, coverage))
  return expandGroups([coll], sets).filter(g => have.has(g))
}
