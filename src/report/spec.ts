// the report spec (plan §6): chosen places × chosen indicators in a chosen layout. plain functions, no DOM, so the
// viewer and the Node figure export (SanctuaryWatch, Phase 4) read a spec the same way.
// - selections are rules, never expanded lists: `*`, `coll:<slug>`, `cat:<term>`, `series:<id>` (its lead),
//   `series:<id>:*` (every member), or an id; each untick goes in `exclude`. a live report picks up what is
//   published later; `as_of` (a manifest version) marks a frozen one.
// - in a URL the spec is flat, readable keys (`pi`, `px`, `ii`, `ix`, `ctx`, `layout`, `status`, `recent`, `base`,
//   `grain`, `from`, `to`, `split`, `asof`, `title`); defaults are left out, so the default spec writes nothing.
import type { Grain, MethodId, Status, Trend } from '../status/index.ts'

export type Layout = 'cards' | 'scorecard' | 'small-multiples' | 'quad' | 'map-sheet' | 'dossier'
export type Depth = 'skim' | 'swim' | 'dive'
export const LAYOUT_IDS: Layout[] = ['cards', 'scorecard', 'small-multiples', 'quad', 'map-sheet', 'dossier']
const METHODS: MethodId[] = ['iea-sd', 'names-pct', 'values']
const GRAINS: Grain[] = ['all', 'decade', 'year', 'month', 'day']

export interface ReportSpec {
  places: { include: string[]; exclude: string[]; context: boolean }
  indicators: { include: string[]; exclude: string[] }
  layout: Layout
  /** sections, when a fix split an over-budget report: one per place or one per category; null = one report */
  split: 'place' | 'category' | null
  style: { status: MethodId; recent: number; baseline: [number, number] | null }
  time: { grain: Grain; from: number | null; to: number | null }
  depth: Depth
  as_of: string | null
  title: string | null
}

export const DEFAULT_SPEC: ReportSpec = {
  places: { include: ['*'], exclude: [], context: false },
  indicators: { include: ['*'], exclude: [] },
  layout: 'cards',
  split: null,
  style: { status: 'iea-sd', recent: 5, baseline: null },
  time: { grain: 'year', from: null, to: null },
  depth: 'swim',
  as_of: null,
  title: null,
}

// ---- the URL form ----

const list = (v: string | undefined) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean)
const int = (v: string | undefined) => (v != null && /^-?\d+$/.test(v) ? Number(v) : null)
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** a spec from the decoded key/value pairs of a URL (unknown or malformed values fall back to the default) */
export function specFromParams(kv: Map<string, string>, depth: Depth = DEFAULT_SPEC.depth): ReportSpec {
  const d = DEFAULT_SPEC
  const pi = list(kv.get('pi')), ii = list(kv.get('ii'))
  const layout = kv.get('layout') as Layout
  const status = kv.get('status') as MethodId
  const grain = kv.get('grain') as Grain
  const recent = int(kv.get('recent'))
  const base = /^(\d{4})-(\d{4})$/.exec(kv.get('base') ?? '')
  return {
    places: { include: pi.length ? pi : d.places.include, exclude: list(kv.get('px')), context: kv.get('ctx') === '1' },
    indicators: { include: ii.length ? ii : d.indicators.include, exclude: list(kv.get('ix')) },
    layout: LAYOUT_IDS.includes(layout) ? layout : d.layout,
    split: kv.get('split') === 'place' || kv.get('split') === 'category' ? (kv.get('split') as 'place' | 'category') : null,
    style: {
      status: METHODS.includes(status) ? status : d.style.status,
      recent: recent != null && recent >= 2 && recent <= 50 ? recent : d.style.recent,
      baseline: base && Number(base[1]) <= Number(base[2]) ? [Number(base[1]), Number(base[2])] : null,
    },
    time: { grain: GRAINS.includes(grain) ? grain : d.time.grain, from: int(kv.get('from')), to: int(kv.get('to')) },
    depth,
    as_of: kv.get('asof') || null,
    title: kv.get('title') || null,
  }
}

/** the spec's keys and values for a URL, in a fixed order, defaults left out (depth is the view's shared key) */
export function specParams(s: ReportSpec): [string, string][] {
  const d = DEFAULT_SPEC
  const out: [string, string][] = []
  if (!same(s.places.include, d.places.include)) out.push(['pi', s.places.include.join(',')])
  if (s.places.exclude.length) out.push(['px', s.places.exclude.join(',')])
  if (s.places.context) out.push(['ctx', '1'])
  if (!same(s.indicators.include, d.indicators.include)) out.push(['ii', s.indicators.include.join(',')])
  if (s.indicators.exclude.length) out.push(['ix', s.indicators.exclude.join(',')])
  if (s.layout !== d.layout) out.push(['layout', s.layout])
  if (s.style.status !== d.style.status) out.push(['status', s.style.status])
  if (s.style.recent !== d.style.recent) out.push(['recent', String(s.style.recent)])
  if (s.style.baseline) out.push(['base', `${s.style.baseline[0]}-${s.style.baseline[1]}`])
  if (s.time.grain !== d.time.grain) out.push(['grain', s.time.grain])
  if (s.time.from != null) out.push(['from', String(s.time.from)])
  if (s.time.to != null) out.push(['to', String(s.time.to)])
  if (s.split) out.push(['split', s.split])
  if (s.as_of) out.push(['asof', s.as_of])
  if (s.title) out.push(['title', s.title])
  return out
}

/** the canonical report.json text: keys in the spec's order, two-space indent */
export function specJson(s: ReportSpec): string {
  return JSON.stringify(s, null, 2)
}

/**
 * the report id: a short hash (FNV-1a, 48 bits as 12 hex digits) of the canonical spec with the manifest version,
 * the same construction as a cell's configuration hash. stable, deterministic, not cryptographic.
 */
export function specId(s: ReportSpec, manifestVersion: string): string {
  const text = specJson({ ...s, depth: DEFAULT_SPEC.depth }) + '\n' + manifestVersion
  let h1 = 0x811c9dc5, h2 = 0x01000193
  for (let i = 0; i < text.length; i++) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619) >>> 0
    h2 = Math.imul(h2 ^ text.charCodeAt(i), 2246822519) >>> 0
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 12)
}

// ---- expanding the rules ----

export interface IndicatorLike {
  id: string
  series: string
  lead: boolean
  category: Partial<Record<string, string>>
}
export interface PlaceLike {
  id: string
  coll: string
}

/** each series' lead (its first member when none is marked), keyed by series */
export function seriesLeads<T extends IndicatorLike>(indicators: T[]): Map<string, T> {
  const out = new Map<string, T>()
  for (const i of indicators) if (i.lead && !out.has(i.series)) out.set(i.series, i)
  for (const i of indicators) if (!out.has(i.series)) out.set(i.series, i)
  return out
}

/** the indicators one rule selects (in manifest order) */
export function matchIndicators<T extends IndicatorLike>(rule: string, indicators: T[]): T[] {
  const leads = new Set(seriesLeads(indicators).values())
  if (rule === '*') return indicators.filter(i => leads.has(i))
  if (rule.startsWith('cat:')) {
    const term = rule.slice(4)
    return indicators.filter(i => leads.has(i) && Object.values(i.category).includes(term))
  }
  if (rule.startsWith('series:')) {
    const all = rule.endsWith(':*')
    const id = all ? rule.slice(7, -2) : rule.slice(7)
    return indicators.filter(i => i.series === id && (all || leads.has(i)))
  }
  return indicators.filter(i => i.id === rule)
}

/** include rules, then exclude rules (which may also be rules: `series:x:*` drops a whole series), manifest order */
export function expandIndicators<T extends IndicatorLike>(sel: ReportSpec['indicators'], indicators: T[]): T[] {
  const inc = new Set(sel.include.flatMap(r => matchIndicators(r, indicators)))
  const exc = new Set(sel.exclude.flatMap(r => matchIndicators(r, indicators)))
  return indicators.filter(i => inc.has(i) && !exc.has(i))
}

/** the places one rule selects: `*`, `coll:<slug>`, or a place_id (in every collection that has it) */
export function matchPlaces<P extends PlaceLike>(rule: string, places: P[]): P[] {
  if (rule === '*') return places
  if (rule.startsWith('coll:')) return places.filter(p => p.coll === rule.slice(5))
  return places.filter(p => p.id === rule)
}

/** include rules, then exclude rules, in the order of `places` (the caller sorts) */
export function expandPlaces<P extends PlaceLike>(sel: ReportSpec['places'], places: P[]): P[] {
  const inc = new Set(sel.include.flatMap(r => matchPlaces(r, places)))
  const exc = new Set(sel.exclude.flatMap(r => matchPlaces(r, places)))
  return places.filter(p => inc.has(p) && !exc.has(p))
}

/**
 * coverage counts for the tree ("7 of 9 places"): for each indicator, how many of the chosen places have a value at
 * any grain. `rows` are coverage rows (place_id, coll, indicator, last_value).
 */
export function coverageCounts(rows: { place_id: string; coll: string; indicator: string; last_value: number | null }[], places: PlaceLike[]): Map<string, number> {
  const chosen = new Set(places.map(p => p.coll + '\u0000' + p.id))
  const seen = new Map<string, Set<string>>()
  for (const r of rows) {
    const k = r.coll + '\u0000' + r.place_id
    if (r.last_value == null || !chosen.has(k)) continue
    if (!seen.has(r.indicator)) seen.set(r.indicator, new Set())
    seen.get(r.indicator)!.add(k)
  }
  return new Map([...seen].map(([ind, s]) => [ind, s.size]))
}

// ---- layouts and the panel budget ----

export interface LayoutInfo {
  title: string
  /** caps on places, indicators and panels (places × indicators); absent = no cap */
  caps: { places?: number; indicators?: number; panels?: number }
  /** laid out for paper, one section after another: never over budget */
  paged?: boolean
}

export const LAYOUTS: Record<Layout, LayoutInfo> = {
  cards: { title: 'Cards', caps: { places: 3, panels: 40 } },
  scorecard: { title: 'Scorecard', caps: { places: 60, indicators: 20 } },
  'small-multiples': { title: 'Small multiples', caps: { places: 30, indicators: 3 } },
  quad: { title: 'Quad plot', caps: { panels: 30 } },
  'map-sheet': { title: 'Map sheet', caps: { indicators: 1 } },
  dossier: { title: 'Dossier', caps: {}, paged: true },
}

export type Fix =
  | { kind: 'layout'; layout: Layout }
  | { kind: 'split'; by: 'place' | 'category'; sections: number }
  | { kind: 'collapse' }

export interface Budget {
  places: number
  indicators: number
  panels: number
  /** which caps are exceeded, e.g. ["places > 3", "panels > 40"] */
  over: string[]
  ok: boolean
  /** the ways out, in order: another layout that fits, sections that fit, collapsing series to their leads */
  fixes: Fix[]
}

function overCaps(layout: Layout, places: number, indicators: number): string[] {
  const c = LAYOUTS[layout].caps
  const over: string[] = []
  if (c.places != null && places > c.places) over.push(`places > ${c.places}`)
  if (c.indicators != null && indicators > c.indicators) over.push(`indicators > ${c.indicators}`)
  if (c.panels != null && places * indicators > c.panels) over.push(`panels > ${c.panels}`)
  return over
}

/**
 * the budget of a layout for a selection. `categories` is how many category sections the indicators fall in, and
 * `nonLeads` whether any chosen indicator is not its series' lead (so collapsing would shrink the selection).
 */
export function budget(layout: Layout, places: number, indicators: number, categories = 1, nonLeads = false): Budget {
  const over = LAYOUTS[layout].paged ? [] : overCaps(layout, places, indicators)
  const fixes: Fix[] = []
  if (over.length) {
    for (const l of LAYOUT_IDS) if (l !== layout && l !== 'dossier' && overCaps(l, places, indicators).length === 0) fixes.push({ kind: 'layout', layout: l })
    if (places > 1 && overCaps(layout, 1, indicators).length === 0) fixes.push({ kind: 'split', by: 'place', sections: places })
    const perCat = Math.ceil(indicators / Math.max(1, categories))
    if (categories > 1 && overCaps(layout, places, perCat).length === 0) fixes.push({ kind: 'split', by: 'category', sections: categories })
    if (nonLeads) fixes.push({ kind: 'collapse' })
  }
  return { places, indicators, panels: places * indicators, over, ok: over.length === 0, fixes }
}

/** "9 places × 12 indicators = 108 panels; Cards shows up to 40" */
export function budgetLine(layout: Layout, b: Budget): string {
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`
  const c = LAYOUTS[layout].caps
  const head = `${n(b.places, 'place')} × ${n(b.indicators, 'indicator')} = ${n(b.panels, 'panel')}`
  if (LAYOUTS[layout].paged) return `${head}; ${LAYOUTS[layout].title} pages them all`
  const caps = [c.places != null ? `${c.places} places` : null, c.indicators != null ? `${c.indicators} indicators` : null, c.panels != null ? `${c.panels} panels` : null].filter(Boolean)
  return `${head}; ${LAYOUTS[layout].title} shows up to ${caps.join(' and ')}`
}

// ---- exceptions first ----

/** sort rank of a panel when a status method is on: out-of-range status first, then a trend, then the rest */
export function exceptionRank(status: Status | null | undefined, trend: Trend | null | undefined): number {
  if (status === 'above' || status === 'below') return 0
  if (trend === 'up' || trend === 'down') return 1
  if (status === 'within' || trend === 'flat') return 2
  return 3
}
