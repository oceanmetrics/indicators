// the one selection the Matrix, Map, Report and Place views share: which places and which indicators, as the report spec's
// rules (src/report/spec.ts). it lives in the spec's own `places` and `indicators` (no second copy) and in the hash as
// `pi`, `px` (place include, exclude), `ii`, `ix` (indicator include, exclude). plain functions, tested without a browser.
// - places: `coll:<slug>`, `set:<id>`, a place id, `*`; the default is `coll:places` (the sanctuaries)
// - indicators: `*` (each series' lead; the default), `all`, `cat:<term>`, `series:<id>`, `series:<id>:*`, ids
// the keys of the earlier views (Matrix: colls xp ai xi leads; Map: coll) are read as the same selection, so old links open
// on the same places and indicators.
import { DEFAULT_SPEC, expandIndicators, expandPlaces } from '../../../src/report/spec.ts'
import type { IndicatorLike, PlaceLike, PlaceSetLike, ReportSpec } from '../../../src/report/spec.ts'

export type PlaceSel = ReportSpec['places']
export type IndSel = ReportSpec['indicators']
export interface Selection {
  places: PlaceSel
  indicators: IndSel
}

/** the selection of anything that holds a spec (a view state) */
export const selectionOf = (s: { spec: ReportSpec }): Selection => ({ places: s.spec.places, indicators: s.spec.indicators })

/** the same thing with another selection (the spec's other keys, the Report's own, stay) */
export function withSelection<T extends { spec: ReportSpec }>(s: T, sel: Partial<Selection>): T {
  return { ...s, spec: { ...s.spec, places: sel.places ?? s.spec.places, indicators: sel.indicators ?? s.spec.indicators } }
}


/** the selection of one place group (`coll:<slug>`), the indicators kept: what a link to "this group" opens */
export const groupSelection = (sel: Selection, group: string): Selection => ({
  places: { include: [group.startsWith('set:') ? group : `coll:${group}`], exclude: [], context: sel.places.context },
  indicators: sel.indicators,
})

// ---- the leads switch ----

/** only each series' lead (the default), not every indicator */
export const leadsOnly = (ind: IndSel): boolean => !ind.include.includes('all')

/** every indicator (`all`, which holds the rest), or back to the leads (`*` when nothing else is included) */
export function setLeadsOnly(ind: IndSel, on: boolean): IndSel {
  if (!on) return { include: ['all'], exclude: ind.exclude }
  const include = ind.include.filter(r => r !== 'all')
  return { include: include.length ? include : ['*'], exclude: ind.exclude }
}

const isRule = (r: string) => r === '*' || r === 'all' || r === 'none' || r.startsWith('cat:') || r.startsWith('series:')
/** the indicators named by id in the include list (added by hand): kept in the Matrix even when no place has a value */
export const namedIndicators = (ind: IndSel): string[] => ind.include.filter(r => !isRule(r))

// ---- keeping a link's own place or indicator inside the selection ----

/** the places selection with `place` in it: unchanged when it is already selected, else its id joins include (and leaves exclude) */
export function includePlace<P extends PlaceLike>(sel: PlaceSel, place: P, sets: readonly PlaceSetLike[] = []): PlaceSel {
  if (expandPlaces(sel, [place], sets).length) return sel
  return { ...sel, include: [...sel.include.filter(r => r !== 'none'), place.id], exclude: sel.exclude.filter(r => r !== place.id) }
}

/** the indicators selection with `indicator` in it, likewise */
export function includeIndicator<T extends IndicatorLike>(sel: IndSel, indicator: T, all: T[]): IndSel {
  if (expandIndicators(sel, all).some(i => i.id === indicator.id)) return sel
  return { include: [...sel.include.filter(r => r !== 'none'), indicator.id], exclude: sel.exclude.filter(r => r !== indicator.id) }
}

// ---- old links ----

const uniq = (xs: string[]) => [...new Set(xs)]
const list = (v: string | undefined) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean)
const asRule = (g: string) => (g.startsWith('set:') ? g : `coll:${g}`)

/**
 * the decoded keys of a hash with the old selection keys rewritten as the new ones:
 * - `colls=a,b` (Matrix) and `coll=a` (Map) -> `pi=coll:a,coll:b` (a `set:` entry stays `set:`)
 * - `xp` -> `px`, `xi` -> `ix`
 * - `ai` -> appended to `ii` (the leads, `*`, stay)
 * - `leads=0` -> `ii=all`
 * - an old Map link (it names `coll`) opened on its `ind`, so that indicator joins `ii`
 * a link that already has the new keys is left as it is; the old keys are dropped.
 */
export function migrateSelectionKeys(kv: Map<string, string>): Map<string, string> {
  const out = new Map(kv)
  const map = kv.get('view') === 'map'
  // places
  if (!kv.has('pi')) {
    const groups = [...list(kv.get('colls')), ...(map ? list(kv.get('coll')) : [])]
    if (groups.length) out.set('pi', uniq(groups.map(asRule)).join(','))
  }
  if (kv.has('xp')) out.set('px', uniq([...list(kv.get('px')), ...list(kv.get('xp'))]).join(','))
  // indicators
  let ii = kv.has('ii') ? list(kv.get('ii')) : null
  if (kv.get('leads') === '0') ii = ['all']
  else {
    const add = list(kv.get('ai'))
    if (map && kv.has('coll') && kv.get('ind') && !kv.has('ii')) add.push(kv.get('ind') as string)
    if (add.length) ii = uniq([...(ii ?? ['*']), ...add])
  }
  if (ii) out.set('ii', ii.join(','))
  if (kv.has('xi')) out.set('ix', uniq([...list(kv.get('ix')), ...list(kv.get('xi'))]).join(','))
  for (const k of ['colls', 'xp', 'xi', 'ai', 'leads']) out.delete(k)
  if (map) out.delete('coll')
  return out
}
