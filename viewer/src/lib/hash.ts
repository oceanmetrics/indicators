// the URL hash is the view's state, so every view is a permalink. keys: view (matrix | place | map; the matrix is the
// default and leaves it out), and per view:
// - Matrix: colls (comma list of place groups: gazetteer collections; none = the sanctuaries), q (place search), vocab,
//   leads, depth, cell (an open drawer: place_id|indicator), axes=p (places in rows; absent = indicators in rows,
//   places in columns; the old axes=t means the default and is dropped on the next write), empty=1 (also the
//   indicators with no value for any place on display), xp and xi (places and indicators removed from the display),
//   ai (indicators added beyond the leads).
// - Place: place (a place_id), coll (its group; kept for old links, the place is found by its id), method
//   (iea-sd | names-pct | values: overrides every continuous card's status method), ind (the indicator opened: its card
//   comes first).
// - Map: ind (the indicator), coll (the collection), color (value | departure | status | trend | record | class |
//   share), t (the period shown: "2024", "2024-07"; none = the latest), cls (the class of `share`), grain (year |
//   decade | month: the grain read; the indicator's status grain when absent), method.
// - Report: the report spec's own flat keys (src/report/spec.ts: pi, px, ctx, ii, ix, layout, status, recent, base,
//   grain, from, to, asof, title).
// vocab and depth are shared. defaults are left out. `?brand=` and `?theme=` are query switches, never hash keys. an
// old Matrix or Place permalink has none of the new keys and parses to the same state as before.
import type { VocabId } from './data.ts'
import type { Grain, MethodId } from '../../../src/status/index.ts'
import { DEFAULT_SPEC, specFromParams, specParams } from '../../../src/report/spec.ts'
import type { ReportSpec } from '../../../src/report/spec.ts'

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
  colls: string[]
  q: string
  vocab: VocabId
  leads: boolean
  depth: Depth
  cell: { place: string; indicator: string } | null
  place: string | null
  coll: string | null
  method: MethodId | null
  ind: string | null
  axes: Axes
  /** also show the indicators with no value for any place on display */
  showEmpty: boolean
  hidePlaces: string[]
  hideInds: string[]
  addInds: string[]
  color: MapColor | null
  t: string | null
  cls: string | null
  /** the Map's grain (the indicator's status grain when null) */
  grain: Grain | null
  /** the Report view's spec (the default spec in every other view) */
  spec: ReportSpec
}

export const DEFAULT_STATE: ViewState = {
  view: 'matrix', colls: [], q: '', vocab: 'onms', leads: true, depth: 'swim', cell: null,
  place: null, coll: null, method: null, ind: null,
  axes: 'indicators', showEmpty: false, hidePlaces: [], hideInds: [], addInds: [], color: null, t: null, cls: null, grain: null, spec: DEFAULT_SPEC,
}

// keep the readable characters of ids (NMS:FKNMS, erddap:dhw_5km:CRW_SST:mean, a|b) out of percent-encoding
const enc = (s: string) => encodeURIComponent(s).replace(/%3A/gi, ':').replace(/%7C/gi, '|')
const dec = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }

export function parseHash(hash: string): ViewState {
  const kv = new Map<string, string>()
  for (const part of hash.replace(/^#/, '').split('&')) {
    if (!part) continue
    const i = part.indexOf('=')
    if (i > 0) kv.set(part.slice(0, i), dec(part.slice(i + 1)))
  }
  const vocab = kv.get('vocab')
  const depth = kv.get('depth')
  const cell = kv.get('cell')
  const method = kv.get('method')
  const sep = cell ? cell.indexOf('|') : -1
  const place = kv.get('place') || null
  const color = kv.get('color')
  const list = (k: string) => (kv.get(k) ?? '').split(',').filter(Boolean)
  const t = kv.get('t') ?? ''
  return {
    // a Place view without a place is the matrix; a Map view picks its indicator when it has none
    view: kv.get('view') === 'place' && place ? 'place' : kv.get('view') === 'map' ? 'map' : kv.get('view') === 'report' ? 'report' : 'matrix',
    colls: (kv.get('colls') ?? '').split(',').filter(Boolean),
    q: kv.get('q') ?? '',
    vocab: vocab === 'names' || vocab === 'eov' || vocab === 'onms' ? vocab : DEFAULT_STATE.vocab,
    leads: kv.get('leads') === '0' ? false : true,
    depth: depth === 'skim' || depth === 'swim' || depth === 'dive' ? depth : DEFAULT_STATE.depth,
    cell: cell && sep > 0 && sep < cell.length - 1 ? { place: cell.slice(0, sep), indicator: cell.slice(sep + 1) } : null,
    place,
    coll: kv.get('coll') || null,
    method: METHOD_IDS.includes(method as MethodId) ? (method as MethodId) : null,
    ind: kv.get('ind') || null,
    // axes=t (before 2026-10-20) was the flipped matrix, which is now the default
    axes: kv.get('axes') === 'p' ? 'places' : 'indicators',
    showEmpty: kv.get('empty') === '1',
    hidePlaces: list('xp'),
    hideInds: list('xi'),
    addInds: list('ai'),
    color: MAP_COLORS.includes(color as MapColor) ? (color as MapColor) : null,
    t: /^\d{4}(-\d{2}(-\d{2})?)?$/.test(t) ? t : null,
    cls: kv.get('cls') || null,
    grain: MAP_GRAINS.includes(kv.get('grain') as Grain) ? (kv.get('grain') as Grain) : null,
    spec: kv.get('view') === 'report' ? specFromParams(kv, depth === 'skim' || depth === 'dive' ? depth : 'swim') : DEFAULT_SPEC,
  }
}

const SPEC_LISTS = new Set(['pi', 'px', 'ii', 'ix'])

/** the hash of a state; each view writes only its own keys */
export function serializeHash(s: ViewState): string {
  const parts: string[] = []
  const shared = () => {
    if (s.vocab !== DEFAULT_STATE.vocab) parts.push('vocab=' + s.vocab)
    if (s.depth !== DEFAULT_STATE.depth) parts.push('depth=' + s.depth)
  }
  if (s.view === 'place' && s.place) {
    parts.push('view=place', 'place=' + enc(s.place))
    if (s.coll) parts.push('coll=' + enc(s.coll))
    shared()
    if (s.method) parts.push('method=' + s.method)
    if (s.ind) parts.push('ind=' + enc(s.ind))
    return parts.join('&')
  }
  if (s.view === 'report') {
    parts.push('view=report')
    // the rule lists keep their commas readable; a title is one value, its commas encoded
    for (const [k, v] of specParams(s.spec)) parts.push(k + '=' + (SPEC_LISTS.has(k) ? v.split(',').map(enc).join(',') : enc(v)))
    shared()
    return parts.join('&')
  }
  if (s.view === 'map') {
    parts.push('view=map')
    if (s.ind) parts.push('ind=' + enc(s.ind))
    if (s.coll) parts.push('coll=' + enc(s.coll))
    if (s.color) parts.push('color=' + s.color)
    if (s.t) parts.push('t=' + s.t)
    if (s.cls) parts.push('cls=' + enc(s.cls))
    if (s.grain) parts.push('grain=' + s.grain)
    shared()
    if (s.method) parts.push('method=' + s.method)
    return parts.join('&')
  }
  if (s.colls.length) parts.push('colls=' + s.colls.map(enc).join(','))
  if (s.q) parts.push('q=' + enc(s.q))
  if (s.vocab !== DEFAULT_STATE.vocab) parts.push('vocab=' + s.vocab)
  if (!s.leads) parts.push('leads=0')
  if (s.depth !== DEFAULT_STATE.depth) parts.push('depth=' + s.depth)
  if (s.cell) parts.push('cell=' + enc(s.cell.place) + '|' + enc(s.cell.indicator))
  if (s.axes === 'places') parts.push('axes=p')
  if (s.showEmpty) parts.push('empty=1')
  if (s.hidePlaces.length) parts.push('xp=' + s.hidePlaces.map(enc).join(','))
  if (s.hideInds.length) parts.push('xi=' + s.hideInds.map(enc).join(','))
  if (s.addInds.length) parts.push('ai=' + s.addInds.map(enc).join(','))
  return parts.join('&')
}

/** the href of a Report view (with `#`) for a spec; its depth is the view's shared depth key */
export function reportHref(from: Pick<ViewState, 'vocab' | 'depth'>, spec: ReportSpec): string {
  return '#' + serializeHash({ ...DEFAULT_STATE, view: 'report', spec: { ...spec, depth: from.depth }, vocab: from.vocab, depth: from.depth })
}

/** the href of the Map view of an indicator (with `#`), carrying the shared keys of the state it is opened from */
export function mapHref(from: Pick<ViewState, 'vocab' | 'depth' | 'method'>, ind: string | null, coll?: string | null, color?: MapColor | null): string {
  return '#' + serializeHash({ ...DEFAULT_STATE, view: 'map', ind, coll: coll ?? null, color: color ?? null, vocab: from.vocab, depth: from.depth, method: from.method })
}

/** the href of a place's view (with `#`), carrying the shared keys of the state it is opened from */
export function placeHref(from: Pick<ViewState, 'vocab' | 'depth' | 'method'>, placeId: string, coll?: string | null, ind?: string | null): string {
  return '#' + serializeHash({ ...DEFAULT_STATE, view: 'place', place: placeId, coll: coll ?? null, ind: ind ?? null, vocab: from.vocab, depth: from.depth, method: from.method })
}

/**
 * the href of "Back to the matrix": the Matrix state the reader came from when this session has it, else (a cold
 * permalink) the default matrix narrowed to the place's group with the vocabulary and detail it is shown in. `cell`
 * reopens the drawer on that cell, and focus returns to it.
 */
export function matrixHref(came: ViewState | null, place: { vocab: VocabId; depth: Depth; coll: string | null }, cell: ViewState['cell'] = null): string {
  const s = came && came.view === 'matrix'
    ? came
    : { ...DEFAULT_STATE, colls: place.coll ? [place.coll] : [], vocab: place.vocab, depth: place.depth }
  return '#' + serializeHash(cell ? { ...s, cell } : s)
}
