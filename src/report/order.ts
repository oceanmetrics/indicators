// the order of the places and the indicators, one implementation for every view (the Matrix, the Map's table, the Report's
// layouts, the pickers) and for the Node figure job. plain functions, no DOM, so they are tested with small fixtures and read the
// same everywhere. the order is part of the report spec (`ReportSpec.order`) and of the URL (`ps pg po` for the places, `is ig io`
// for the indicators), shared by every view like the selection.
//
// - a sort key per axis. places: `az` (the default), `ns` (north to south), `sn` (south to north), `we` (west to east), by the
//   centre of the place's bbox (`lat`, `lon`: src/coverage/centre.ts); a place with no position goes last. indicators: `az` (the
//   default: by short title) or `vocab` (the vocabulary's own term order, a series together, its lead first, then the manifest
//   order). `custom` on either: the reader's own order, `custom` below.
// - the status sorts (the Matrix's sort select, build week 3), which read counts of the selection on display (`StatusRank`, made
//   by the viewer from @oceanmetrics/catalog `rollups`): places by the count of cells above (`above`), below (`below`), or by
//   the most recent period with a value (`recent`); indicators in series order, the leads first (`series`), or by the count of
//   places above (`above`) or below (`below`). most first, a tie A-Z. without a rank (a caller that has no counts) they read
//   as A-Z, `series` needs none.
// - grouping, on by default: places by their home collection (the groups A-Z by title), indicators by the chosen vocabulary's
//   category (the groups A-Z by label, "Other" last). off gives one flat list in which any item can go anywhere.
// - `custom` is an id list: for a grouped axis it may begin with group entries, `g:<group id>` (a collection slug, a vocabulary
//   term), which order the groups; the item entries order the items of each group by their place in the list. an item that is
//   not listed follows the listed ones of its group, in the axis's base sort (A-Z), and a group that is not listed follows the
//   listed groups, A-Z, so a new indicator or place appears without breaking a custom order. an entry that names nothing now is
//   ignored. with grouping off the group entries are ignored and the item entries order the whole list.
// - the URL carries the custom list only for `custom`, as short as it can be: an entry is dropped when the order is the same
//   without it (`compactCustom`), so moving one place writes a few ids, not all of them.

export type PlaceSort = 'az' | 'ns' | 'sn' | 'we' | 'above' | 'below' | 'recent' | 'custom'
export type IndicatorSort = 'az' | 'vocab' | 'series' | 'above' | 'below' | 'custom'
export const PLACE_SORTS: PlaceSort[] = ['az', 'ns', 'sn', 'we', 'above', 'below', 'recent', 'custom']
export const INDICATOR_SORTS: IndicatorSort[] = ['az', 'vocab', 'series', 'above', 'below', 'custom']

/**
 * the counts a status sort reads, per place id or indicator id: cells above and below their own record, and the latest period
 * with a value (an ISO time, compared as text). an id the rank does not know counts 0 and has no period.
 */
export interface StatusRank {
  above: (id: string) => number
  below: (id: string) => number
  latest: (id: string) => string | null
}
/** the sorts that read a StatusRank */
export const RANK_SORTS: ReadonlySet<string> = new Set(['above', 'below', 'recent'])
/** does the order need counts (a status sort on either axis)? the caller then makes a StatusRank */
export const usesRank = (o: OrderSpec): boolean => RANK_SORTS.has(o.places.sort) || RANK_SORTS.has(o.indicators.sort)
/** most first; a tie, or no rank, falls to the next comparison */
const byCount = <T>(get: ((id: string) => number) | undefined, id: (t: T) => string) => (a: T, b: T) => (get ? get(id(b)) - get(id(a)) : 0)
/** the most recent period first; one with none last */
const byLatest = <T>(rank: StatusRank | undefined, id: (t: T) => string) => (a: T, b: T) => {
  if (!rank) return 0
  const x = rank.latest(id(a)), y = rank.latest(id(b))
  return x === y ? 0 : x == null ? 1 : y == null ? -1 : x < y ? 1 : -1
}

export interface AxisOrder<S extends string> {
  sort: S
  /** keep the groups (the default); false = one flat list */
  group: boolean
  /** the custom order: group entries (`g:<id>`), then item ids; read only when sort is `custom` */
  custom: string[]
}
export interface OrderSpec {
  places: AxisOrder<PlaceSort>
  indicators: AxisOrder<IndicatorSort>
}

export const DEFAULT_ORDER: OrderSpec = {
  places: { sort: 'az', group: true, custom: [] },
  indicators: { sort: 'az', group: true, custom: [] },
}

export const GROUP_ENTRY = 'g:'
export const groupEntry = (id: string) => GROUP_ENTRY + id

export const isDefaultAxis = (a: AxisOrder<string>): boolean => a.sort === 'az' && a.group
export const isDefaultOrder = (o: OrderSpec): boolean => isDefaultAxis(o.places) && isDefaultAxis(o.indicators)

// ---- the URL form ----

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i])
const list = (v: string | undefined) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean)

function axisFromParams<S extends string>(kv: Map<string, string>, k: { sort: string; group: string; custom: string }, sorts: readonly S[], dflt: S): AxisOrder<S> {
  const s = kv.get(k.sort) as S
  const sort = sorts.includes(s) ? s : dflt
  return { sort, group: kv.get(k.group) !== '0', custom: sort === 'custom' ? list(kv.get(k.custom)) : [] }
}

/** the order from the decoded keys of a URL (unknown or malformed values fall back to the default) */
export function orderFromParams(kv: Map<string, string>): OrderSpec {
  return {
    places: axisFromParams(kv, { sort: 'ps', group: 'pg', custom: 'po' }, PLACE_SORTS, 'az'),
    indicators: axisFromParams(kv, { sort: 'is', group: 'ig', custom: 'io' }, INDICATOR_SORTS, 'az'),
  }
}

/** the order's keys and values for a URL, defaults left out; the custom lists are comma lists (the caller encodes each id) */
export function orderParams(o: OrderSpec): [string, string][] {
  const out: [string, string][] = []
  const axis = (a: AxisOrder<string>, ks: [string, string, string]) => {
    if (a.sort !== 'az') out.push([ks[0], a.sort])
    if (!a.group) out.push([ks[1], '0'])
    if (a.sort === 'custom' && a.custom.length) out.push([ks[2], a.custom.join(',')])
  }
  axis(o.places, ['ps', 'pg', 'po'])
  axis(o.indicators, ['is', 'ig', 'io'])
  return out
}

/** is the keys' value a comma list of ids (so the caller keeps its commas readable)? */
export const ORDER_LISTS = new Set(['po', 'io'])
/** the keys of the order, which a view switch carries with the selection */
export const ORDER_KEYS = new Set(['ps', 'pg', 'po', 'is', 'ig', 'io'])

export const orderEquals = (a: OrderSpec, b: OrderSpec): boolean =>
  a.places.sort === b.places.sort && a.places.group === b.places.group && same(a.places.custom, b.places.custom) &&
  a.indicators.sort === b.indicators.sort && a.indicators.group === b.indicators.group && same(a.indicators.custom, b.indicators.custom)

// ---- the engine ----

/** a group of the ordered items; a flat list is one group with the id and label '' */
export interface Group<T> {
  id: string
  label: string
  items: T[]
}

/** what an axis needs to be ordered: where an item belongs, how groups and items compare in the axis's base sort */
interface Axis<T> {
  id: (t: T) => string
  group: (t: T) => string
  groupLabel: (g: string) => string
  groupCmp: (a: string, b: string) => number
  cmp: (a: T, b: T) => number
}

const collator = new Intl.Collator('en', { numeric: true })
/** A-Z by label, a tie by id (numbers inside a name in numeric order: "Zone 2" before "Zone 10") */
export const compareText = (a: string, b: string): number => collator.compare(a, b)

function arrange<T>(items: T[], ax: Axis<T>, grouped: boolean, custom: readonly string[] | null): Group<T>[] {
  const rank = new Map<string, number>()
  const gRank = new Map<string, number>()
  custom?.forEach((e, n) => {
    if (e.startsWith(GROUP_ENTRY)) { const g = e.slice(GROUP_ENTRY.length); if (!gRank.has(g)) gRank.set(g, n) }
    else if (!rank.has(e)) rank.set(e, n)
  })
  const byItem = (a: T, b: T) => {
    const ra = rank.get(ax.id(a)), rb = rank.get(ax.id(b))
    if (ra != null && rb != null) return ra - rb
    return ra != null ? -1 : rb != null ? 1 : ax.cmp(a, b)
  }
  if (!grouped) return [{ id: '', label: '', items: [...items].sort(byItem) }]
  const by = new Map<string, T[]>()
  for (const t of items) {
    const g = ax.group(t)
    if (!by.has(g)) by.set(g, [])
    by.get(g)!.push(t)
  }
  const groups = [...by.keys()].sort((a, b) => {
    const ra = gRank.get(a), rb = gRank.get(b)
    if (ra != null && rb != null) return ra - rb
    return ra != null ? -1 : rb != null ? 1 : ax.groupCmp(a, b)
  })
  return groups.map(g => ({ id: g, label: ax.groupLabel(g), items: by.get(g)!.sort(byItem) }))
}

// ---- places ----

/** what the order needs of a place */
export interface OrderPlace {
  id: string
  name: string
  /** the place's group: its home gazetteer collection */
  coll: string
  lat?: number | null
  lon?: number | null
}

/** descending (north first) or ascending, a place with no position after the others */
const byNumber = (get: (p: OrderPlace) => number | null | undefined, dir: 1 | -1) => (a: OrderPlace, b: OrderPlace) => {
  const x = get(a), y = get(b)
  if (x == null && y == null) return 0
  if (x == null) return 1
  if (y == null) return -1
  return (x - y) * dir
}
const byName = (a: OrderPlace, b: OrderPlace) => compareText(a.name, b.name) || compareText(a.id, b.id)

function placeAxis<P extends OrderPlace>(sort: PlaceSort, groupLabel: (coll: string) => string, rank?: StatusRank): Axis<P> {
  const key = sort === 'ns' ? byNumber(p => p.lat, -1) : sort === 'sn' ? byNumber(p => p.lat, 1) : sort === 'we' ? byNumber(p => p.lon, 1)
    : sort === 'above' ? byCount<OrderPlace>(rank?.above, p => p.id) : sort === 'below' ? byCount<OrderPlace>(rank?.below, p => p.id)
    : sort === 'recent' ? byLatest<OrderPlace>(rank, p => p.id) : null
  return {
    id: p => p.id,
    group: p => p.coll,
    groupLabel,
    groupCmp: (a, b) => compareText(groupLabel(a), groupLabel(b)) || compareText(a, b),
    cmp: key ? (a, b) => key(a, b) || byName(a, b) : byName,
  }
}

/** the places in order: grouped by collection (the groups A-Z by title) or flat; `custom` lists their own order; `rank` serves the status sorts */
export function orderPlaces<P extends OrderPlace>(places: P[], o: AxisOrder<PlaceSort>, groupLabel: (coll: string) => string = c => c, rank?: StatusRank): Group<P>[] {
  const sort: PlaceSort = o.sort === 'custom' ? 'az' : o.sort
  return arrange(places, placeAxis<P>(sort, groupLabel, rank), o.group, o.sort === 'custom' ? o.custom : null)
}

// ---- indicators ----

/** what the order needs of an indicator, and of a vocabulary term */
export interface OrderIndicator {
  id: string
  short: string
  series: string
  lead: boolean
  category: Partial<Record<string, string>>
}
export interface OrderTerm {
  id: string
  label: string
}
/** the group of the indicators whose tag is not a term of the vocabulary: last in either order */
export const OTHER_GROUP = 'other'

function indicatorAxis<I extends OrderIndicator>(sort: IndicatorSort, vocab: string, terms: readonly OrderTerm[], input: I[], rank?: StatusRank): Axis<I> {
  const known = new Map(terms.map((t, n) => [t.id, n]))
  const label = (g: string) => terms.find(t => t.id === g)?.label ?? 'Other'
  const group = (i: I) => {
    const tag = i.category[vocab]
    return tag && known.has(tag) ? tag : OTHER_GROUP
  }
  const seriesRank = new Map<string, number>()
  input.forEach(i => { if (!seriesRank.has(i.series)) seriesRank.set(i.series, seriesRank.size) })
  const at = new Map(input.map((i, n) => [i.id, n]))
  const otherLast = (a: string, b: string) => Number(a === OTHER_GROUP) - Number(b === OTHER_GROUP)
  // a series together in the order the series first appear, its lead first, then the order given
  const inSeries = (a: I, b: I) => (seriesRank.get(a.series) as number) - (seriesRank.get(b.series) as number) || Number(b.lead) - Number(a.lead) || (at.get(a.id) as number) - (at.get(b.id) as number)
  const az = (a: I, b: I) => compareText(a.short, b.short) || compareText(a.id, b.id)
  const count = sort === 'above' ? byCount<I>(rank?.above, i => i.id) : sort === 'below' ? byCount<I>(rank?.below, i => i.id) : null
  return {
    id: i => i.id,
    group,
    groupLabel: label,
    groupCmp: sort === 'vocab'
      ? (a, b) => otherLast(a, b) || (known.get(a) ?? 0) - (known.get(b) ?? 0)
      : (a, b) => otherLast(a, b) || compareText(label(a), label(b)) || compareText(a, b),
    cmp: sort === 'vocab' || sort === 'series' ? inSeries : count ? (a, b) => count(a, b) || az(a, b) : az,
  }
}

/**
 * the indicators in order, grouped by the vocabulary's categories or flat. `az`: the groups A-Z by label and the indicators A-Z
 * by short title; `vocab`: the vocabulary's term order, a series together with its lead first, then the order given; `series`:
 * the groups A-Z, a series together with its lead first; `above` / `below`: the groups A-Z, the indicators by their count of
 * places above or below (`rank`). "Other" is the last group of each.
 */
export function orderIndicators<I extends OrderIndicator>(indicators: I[], o: AxisOrder<IndicatorSort>, vocab: string, terms: readonly OrderTerm[], rank?: StatusRank): Group<I>[] {
  const sort: IndicatorSort = o.sort === 'custom' ? 'az' : o.sort
  return arrange(indicators, indicatorAxis(sort, vocab, terms, indicators, rank), o.group, o.sort === 'custom' ? o.custom : null)
}

// ---- moving: the pure model of a drag or a keypress ----

/** what is on display, as ids: the groups and the ids of their items, in order (a flat list is one group) */
export interface Shown {
  id: string
  items: string[]
}
export type Side = 'before' | 'after'

export const shownOf = <T>(groups: Group<T>[], id: (t: T) => string): Shown[] => groups.map(g => ({ id: g.id, items: g.items.map(id) }))

function find(shown: Shown[], id: string): { g: number; i: number } | null {
  for (let g = 0; g < shown.length; g++) {
    const i = shown[g].items.indexOf(id)
    if (i >= 0) return { g, i }
  }
  return null
}

/**
 * can the item go next to `target`? not onto itself, not into another group while the axis is grouped (an indicator's group is its
 * category, a place's its collection); anywhere in a flat list
 */
export function canMoveItem(shown: Shown[], grouped: boolean, id: string, target: string): boolean {
  const a = find(shown, id), b = find(shown, target)
  return !!a && !!b && id !== target && (!grouped || a.g === b.g)
}

/** the item moved before or after `target`; null when it cannot (`canMoveItem`) or would not change anything */
export function moveItem(shown: Shown[], grouped: boolean, id: string, target: string, side: Side): Shown[] | null {
  if (!canMoveItem(shown, grouped, id, target)) return null
  const a = find(shown, id) as { g: number; i: number }
  const out = shown.map(g => ({ id: g.id, items: g.items.filter(x => x !== id) }))
  const b = find(out, target) as { g: number; i: number }
  out[b.g].items.splice(b.i + (side === 'after' ? 1 : 0), 0, id)
  return out[b.g].items.join('\u0000') === shown[a.g].items.join('\u0000') && a.g === b.g ? null : out
}

/** a whole group moved before or after another; only a grouped axis has groups to move */
export function moveGroup(shown: Shown[], grouped: boolean, id: string, target: string, side: Side): Shown[] | null {
  if (!grouped || id === target) return null
  const a = shown.findIndex(g => g.id === id), b = shown.findIndex(g => g.id === target)
  if (a < 0 || b < 0) return null
  const rest = shown.filter(g => g.id !== id)
  const at = rest.findIndex(g => g.id === target) + (side === 'after' ? 1 : 0)
  const out = [...rest.slice(0, at), shown[a], ...rest.slice(at)]
  return out.every((g, n) => g.id === shown[n].id) ? null : out
}

/** what a one-step move did: the new order, and the neighbour it went past (for the words) */
export interface Nudge {
  shown: Shown[]
  past: string
  side: Side
}

/** an item one place earlier (-1) or later (1) within its group (the whole list when flat); null at the edge */
export function nudgeItem(shown: Shown[], grouped: boolean, id: string, delta: -1 | 1): Nudge | null {
  const at = find(shown, id)
  if (!at) return null
  const past = shown[at.g].items[at.i + delta]
  if (past == null) return null
  const side: Side = delta > 0 ? 'after' : 'before'
  const out = moveItem(shown, grouped, id, past, side)
  return out ? { shown: out, past, side } : null
}

/** a group one place earlier or later; null at the edge or when the axis is flat */
export function nudgeGroup(shown: Shown[], grouped: boolean, id: string, delta: -1 | 1): Nudge | null {
  const at = shown.findIndex(g => g.id === id)
  const past = shown[at + delta]?.id
  if (at < 0 || past == null) return null
  const side: Side = delta > 0 ? 'after' : 'before'
  const out = moveGroup(shown, grouped, id, past, side)
  return out ? { shown: out, past, side } : null
}

/** the custom list of what is on display: the group entries (a grouped axis), then the item ids in order */
export function customOf(shown: Shown[], grouped: boolean): string[] {
  return [...(grouped ? shown.map(g => groupEntry(g.id)) : []), ...shown.flatMap(g => g.items)]
}

/**
 * the shortest form of a custom list that orders `items` the same way: entries are dropped, last first, while the order does not
 * change (an unlisted item falls in its base place). moving one place writes a few ids, not all of them.
 */
function compact<T>(items: T[], ax: Axis<T>, grouped: boolean, entries: string[]): string[] {
  const flat = (gs: Group<T>[]) => gs.map(g => g.id + '\u0001' + g.items.map(ax.id).join('\u0000')).join('\u0002')
  const target = flat(arrange(items, ax, grouped, entries))
  const keep = [...entries]
  for (let n = keep.length - 1; n >= 0; n--) {
    const without = [...keep.slice(0, n), ...keep.slice(n + 1)]
    if (flat(arrange(items, ax, grouped, without)) === target) keep.splice(n, 1)
  }
  return keep
}

/** the places' axis order after a move: custom, listing what the move needs (`items` are the places on display) */
export function placesCustom<P extends OrderPlace>(items: P[], shown: Shown[], o: AxisOrder<PlaceSort>, groupLabel: (coll: string) => string = c => c): AxisOrder<PlaceSort> {
  return { sort: 'custom', group: o.group, custom: compact(items, placeAxis<P>('az', groupLabel), o.group, customOf(shown, o.group)) }
}

/** the indicators' axis order after a move */
export function indicatorsCustom<I extends OrderIndicator>(items: I[], shown: Shown[], o: AxisOrder<IndicatorSort>, vocab: string, terms: readonly OrderTerm[]): AxisOrder<IndicatorSort> {
  return { sort: 'custom', group: o.group, custom: compact(items, indicatorAxis('az', vocab, terms, items), o.group, customOf(shown, o.group)) }
}

// ---- words ----

/** "Moved Channel Islands after Chumash Heritage" */
export const movedWords = (name: string, other: string, side: Side) => `Moved ${name} ${side} ${other}`
/** what a move that cannot happen says */
export const stuckWords = (name: string, edge: 'first' | 'last' | 'group') =>
  edge === 'group' ? `${name} cannot move into another group; turn grouping off to move it anywhere` : `${name} is already ${edge}`

export const PLACE_SORT_WORDS: Record<PlaceSort, string> = {
  az: 'A to Z', ns: 'North to south', sn: 'South to north', we: 'West to east', above: 'Most above', below: 'Most below', recent: 'Most recent period', custom: 'Custom',
}
export const INDICATOR_SORT_WORDS: Record<IndicatorSort, string> = {
  az: 'A to Z', vocab: 'Vocabulary order', series: 'Series order, leads first', above: 'Most above', below: 'Most below', custom: 'Custom',
}
