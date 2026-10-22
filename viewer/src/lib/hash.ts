// the URL hash is the view's state, so every view is a permalink. keys: view (matrix | place | map | report; the matrix is the
// default and leaves it out), the selection every view shares, and per view:
// - the selection (Matrix, Map, Report and Place all write it; src/lib/selection.ts): pi and px (the places included and
//   excluded: `coll:<slug>`, `set:<id>`, a place id; none = `coll:places`, the sanctuaries), ii and ix (the indicators:
//   `*` = each series' lead, the default, `all`, `cat:<term>`, `series:<id>`, `series:<id>:*`, ids). the old keys (colls, xp,
//   xi, ai, leads, and the Map's coll) are read as the same selection and dropped on the next write.
// - the order the selection is shown in (src/report/order.ts), shared like the selection: ps (place sort: az, the default, ns, sn,
//   we, custom), pg=0 (places not grouped), po (the custom order: a comma list of place ids, led by `g:<collection>` entries
//   for the groups), is (indicator sort: az, the default, vocab, custom), ig=0, io (as po, with `g:<term>`).
// - shared: vocab, depth, axes=p (places as rows; absent = indicators in rows, places in columns; the old axes=t means the
//   default and is dropped on the next write), empty=1 (also the indicators with no value for any place on display), t (the
//   period: "2024", "2024-07"; none = the latest). one `t` drives the Map, the layer under it and, from build week 3
//   (2026-11-13 to 11-19, the period scrubber), the Matrix: today the Map and its layer read it, and the Matrix, the Report and
//   the Place view carry it untouched, so it survives a switch of views.
// - Matrix: q (place search, narrows the selection), cell (an open drawer: place_id|indicator).
// - Place: place (a place_id), coll (its group; kept for old links, the place is found by its id), method
//   (iea-sd | names-pct | values: overrides every continuous card's status method), ind (the indicator opened: its card
//   comes first).
// - Map: ind (the indicator: one of the selection's), place (the place selected), color (value | departure | status | trend |
//   record | class | share), cls (the class of `share`), grain (year | decade | month: the grain read; the indicator's status
//   grain when absent), proj (globe; absent = the flat map), layer (the layer under the map, `<kind>:<id>[:<variable>]`:
//   map/layerSlot.ts), method.
// - Report: the report spec's own flat keys after the selection (src/report/spec.ts: ctx, layout, status, recent, base,
//   grain, from, to, asof, title).
// defaults are left out. `?brand=` and `?theme=` are query switches, never hash keys.
import type { VocabId } from './data.ts'
import type { Grain, MethodId } from '@oceanmetrics/status'
import { DEFAULT_SPEC, specFromParams, specParams } from '../../../src/report/spec.ts'
import type { ReportSpec } from '../../../src/report/spec.ts'
import { ORDER_KEYS, ORDER_LISTS } from '../../../src/report/order.ts'
import { migrateSelectionKeys, selectionSpec, withSelection } from './selection.ts'
import { formatLayerKey, parseLayerKey } from './map/layerSlot.ts'

export type Depth = 'skim' | 'swim' | 'dive'
export const DEPTHS: Depth[] = ['skim', 'swim', 'dive']
export type ViewKind = 'matrix' | 'place' | 'map' | 'report'
export const METHOD_IDS: MethodId[] = ['iea-sd', 'names-pct', 'values']
/** what the Matrix's rows are: indicators (the default, places in columns) or places */
export type Axes = 'places' | 'indicators'
/** what the Map colours each place by */
export type MapColor = 'value' | 'departure' | 'status' | 'trend' | 'record' | 'class' | 'share'
export const MAP_COLORS: MapColor[] = ['value', 'departure', 'status', 'trend', 'record', 'class', 'share']
const MAP_GRAINS: Grain[] = ['decade', 'year', 'month', 'day', 'all']

export interface ViewState {
  view: ViewKind
  q: string
  vocab: VocabId
  depth: Depth
  cell: { place: string; indicator: string } | null
  place: string | null
  /** the Place view's group (an old link's; the place is found by its id) */
  coll: string | null
  method: MethodId | null
  ind: string | null
  axes: Axes
  /** also show the indicators with no value for any place on display */
  showEmpty: boolean
  color: MapColor | null
  t: string | null
  cls: string | null
  /** the Map's grain (the indicator's status grain when null) */
  grain: Grain | null
  /** the Map's projection: the globe, or null for the flat map (the default) */
  proj: 'globe' | null
  /** the layer under the Map (`erddap:dhw_5km:CRW_SST`), or null for none */
  layer: string | null
  /** the report spec: its `places` and `indicators` are the selection every view shares; its other keys are the Report's (the default in every other view) */
  spec: ReportSpec
}

export const DEFAULT_STATE: ViewState = {
  view: 'matrix', q: '', vocab: 'onms', depth: 'swim', cell: null,
  place: null, coll: null, method: null, ind: null,
  axes: 'indicators', showEmpty: false, color: null, t: null, cls: null, grain: null, proj: null, layer: null, spec: DEFAULT_SPEC,
}

// keep the readable characters of ids (NMS:FKNMS, erddap:dhw_5km:CRW_SST:mean, a|b) out of percent-encoding
const enc = (s: string) => encodeURIComponent(s).replace(/%3A/gi, ':').replace(/%7C/gi, '|')
const dec = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }

export function parseHash(hash: string): ViewState {
  const raw = new Map<string, string>()
  for (const part of hash.replace(/^#/, '').split('&')) {
    if (!part) continue
    const i = part.indexOf('=')
    if (i > 0) raw.set(part.slice(0, i), dec(part.slice(i + 1)))
  }
  const kv = migrateSelectionKeys(raw)
  const vocab = kv.get('vocab')
  const depth = kv.get('depth')
  const cell = kv.get('cell')
  const method = kv.get('method')
  const sep = cell ? cell.indexOf('|') : -1
  const place = kv.get('place') || null
  const color = kv.get('color')
  const t = kv.get('t') ?? ''
  const layer = parseLayerKey(kv.get('layer'))
  // a Place view without a place is the matrix; a Map view picks its indicator when it has none
  const view: ViewKind = kv.get('view') === 'place' && place ? 'place' : kv.get('view') === 'map' ? 'map' : kv.get('view') === 'report' ? 'report' : 'matrix'
  const spec = specFromParams(kv, depth === 'skim' || depth === 'dive' ? depth : 'swim')
  return {
    view,
    q: kv.get('q') ?? '',
    vocab: vocab === 'names' || vocab === 'eov' || vocab === 'onms' ? vocab : DEFAULT_STATE.vocab,
    depth: depth === 'skim' || depth === 'swim' || depth === 'dive' ? depth : DEFAULT_STATE.depth,
    cell: cell && sep > 0 && sep < cell.length - 1 ? { place: cell.slice(0, sep), indicator: cell.slice(sep + 1) } : null,
    place,
    coll: view === 'map' ? null : kv.get('coll') || null,
    method: METHOD_IDS.includes(method as MethodId) ? (method as MethodId) : null,
    ind: kv.get('ind') || null,
    // axes=t (before 2026-10-20) was the flipped matrix, which is now the default
    axes: kv.get('axes') === 'p' ? 'places' : 'indicators',
    showEmpty: kv.get('empty') === '1',
    color: MAP_COLORS.includes(color as MapColor) ? (color as MapColor) : null,
    t: /^\d{4}(-\d{2}(-\d{2})?)?$/.test(t) ? t : null,
    cls: kv.get('cls') || null,
    grain: MAP_GRAINS.includes(kv.get('grain') as Grain) ? (kv.get('grain') as Grain) : null,
    proj: kv.get('proj') === 'globe' ? 'globe' : null,
    layer: layer ? formatLayerKey(layer) : null,
    // outside the Report only the selection is read; the Report's other keys are its own
    spec: view === 'report' ? spec : selectionSpec(spec),
  }
}

const SPEC_LISTS = new Set(['pi', 'px', 'ii', 'ix'])
const listValue = (k: string, v: string) => (SPEC_LISTS.has(k) || ORDER_LISTS.has(k) ? v.split(',').map(enc).join(',') : enc(v))

/** the selection's keys of a spec (`pi`, `px`, `ii`, `ix`) and the order's (`ps pg po is ig io`), defaults left out, as `key=value` parts */
function selectionParts(spec: ReportSpec): string[] {
  return specParams(spec).filter(([k]) => SPEC_LISTS.has(k) || ORDER_KEYS.has(k)).map(([k, v]) => k + '=' + listValue(k, v))
}

/** the hash of a state; each view writes only its own keys */
export function serializeHash(s: ViewState): string {
  const parts: string[] = []
  const shared = () => {
    if (s.vocab !== DEFAULT_STATE.vocab) parts.push('vocab=' + s.vocab)
    if (s.depth !== DEFAULT_STATE.depth) parts.push('depth=' + s.depth)
    if (s.axes === 'places') parts.push('axes=p')
    if (s.showEmpty) parts.push('empty=1')
    if (s.t) parts.push('t=' + s.t)
  }
  if (s.view === 'place' && s.place) {
    parts.push('view=place', 'place=' + enc(s.place))
    if (s.coll) parts.push('coll=' + enc(s.coll))
    parts.push(...selectionParts(s.spec))
    shared()
    if (s.method) parts.push('method=' + s.method)
    if (s.ind) parts.push('ind=' + enc(s.ind))
    return parts.join('&')
  }
  if (s.view === 'report') {
    parts.push('view=report')
    // the rule lists keep their commas readable; a title is one value, its commas encoded
    for (const [k, v] of specParams(s.spec)) parts.push(k + '=' + listValue(k, v))
    shared()
    return parts.join('&')
  }
  if (s.view === 'map') {
    parts.push('view=map')
    if (s.ind) parts.push('ind=' + enc(s.ind))
    parts.push(...selectionParts(s.spec))
    if (s.place) parts.push('place=' + enc(s.place))
    if (s.color) parts.push('color=' + s.color)
    if (s.cls) parts.push('cls=' + enc(s.cls))
    if (s.grain) parts.push('grain=' + s.grain)
    if (s.proj) parts.push('proj=' + s.proj)
    if (s.layer) parts.push('layer=' + enc(s.layer))
    shared()
    if (s.method) parts.push('method=' + s.method)
    return parts.join('&')
  }
  parts.push(...selectionParts(s.spec))
  if (s.q) parts.push('q=' + enc(s.q))
  if (s.vocab !== DEFAULT_STATE.vocab) parts.push('vocab=' + s.vocab)
  if (s.depth !== DEFAULT_STATE.depth) parts.push('depth=' + s.depth)
  if (s.cell) parts.push('cell=' + enc(s.cell.place) + '|' + enc(s.cell.indicator))
  if (s.axes === 'places') parts.push('axes=p')
  if (s.showEmpty) parts.push('empty=1')
  if (s.t) parts.push('t=' + s.t)
  return parts.join('&')
}

// ---- the context a view switch carries ----

/** what a link to another view carries of the state it is opened from: the selection, the vocabulary, the detail level, the orientation, show-empty and the period */
export type Carry = Pick<ViewState, 'vocab' | 'depth' | 'axes' | 'showEmpty' | 'spec'> & Partial<Pick<ViewState, 'method' | 't'>>

const selOnly = (from: Pick<ViewState, 'spec'>): ReportSpec => selectionSpec(from.spec)

const carried = (from: Carry): ViewState => ({
  ...DEFAULT_STATE, vocab: from.vocab, depth: from.depth, axes: from.axes, showEmpty: from.showEmpty, t: from.t ?? null, spec: selOnly(from),
})

/** another view's state with this one's shared keys: its own keys stay, the selection, vocabulary, detail, orientation, show-empty and period follow */
export function carryOver(target: ViewState, from: Carry): ViewState {
  const spec = withSelection(target, { places: from.spec.places, indicators: from.spec.indicators, order: from.spec.order }).spec
  return {
    ...target, vocab: from.vocab, depth: from.depth, axes: from.axes, showEmpty: from.showEmpty, t: from.t ?? null,
    spec: target.view === 'report' ? { ...spec, depth: from.depth } : spec,
  }
}

/** the href of a Report view (with `#`) for a spec; its depth is the view's shared depth key */
export function reportHref(from: Carry, spec: ReportSpec): string {
  return '#' + serializeHash({ ...carried(from), view: 'report', spec: { ...spec, depth: from.depth } })
}

/** the href of the Map view (with `#`): the selection of the state it is opened from, an indicator and a selected place */
export function mapHref(from: Carry, ind: string | null, color?: MapColor | null, place?: string | null): string {
  return '#' + serializeHash({ ...carried(from), view: 'map', ind, place: place ?? null, color: color ?? null, method: from.method ?? null })
}

/** the href of a place's view (with `#`), carrying the shared keys and the selection of the state it is opened from */
export function placeHref(from: Carry, placeId: string, coll?: string | null, ind?: string | null): string {
  return '#' + serializeHash({ ...carried(from), view: 'place', place: placeId, coll: coll ?? null, ind: ind ?? null, method: from.method ?? null })
}

/**
 * the href of "Back to the matrix": the Matrix state the reader came from when this session has it, with the selection the Place
 * view carries (the same, unless it was changed in the Place view), else (a cold permalink) the Matrix of that selection.
 * `cell` reopens the drawer on that cell, and focus returns to it.
 */
export function matrixHref(came: ViewState | null, from: Carry, cell: ViewState['cell'] = null): string {
  const s = came && came.view === 'matrix' ? carryOver(came, from) : carried(from)
  return '#' + serializeHash(cell ? { ...s, cell } : s)
}

/** the href of the Matrix narrowed to one place group or place set (with `#`), the indicators and shared keys of the state it is opened from */
export function groupHref(from: Carry, group: string): string {
  const places = { include: [group.startsWith('set:') ? group : `coll:${group}`], exclude: [], context: false }
  return '#' + serializeHash(withSelection(carried(from), { places, indicators: from.spec.indicators }))
}

/** the Map opened from the Matrix: the indicator and place of the last opened cell, over the same selection */
export function matrixToMapHref(from: Carry, last: { indicator: string; place: string } | null): string {
  return mapHref(from, last?.indicator ?? null, null, last?.place ?? null)
}

/** the Matrix opened from the Map: the same selection, and the cell of the selected place when there is one */
export function mapToMatrixHref(from: Carry, ind: string | null, place: string | null): string {
  return '#' + serializeHash({ ...carried(from), cell: place && ind ? { place, indicator: ind } : null })
}

/** the Map opened from the Place view: the same selection, the indicator opened, with the place selected */
export function placeToMapHref(from: Carry, placeId: string, ind: string | null): string {
  return mapHref(from, ind, null, placeId)
}
