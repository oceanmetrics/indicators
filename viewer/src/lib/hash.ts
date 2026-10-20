// the URL hash is the view's state, so every view is a permalink. keys: view (matrix | place; the matrix is the
// default and leaves it out), colls (comma list of collections), q (place search), vocab, leads, depth, cell (an open
// drawer: place_id|indicator), and for the Place view place (a place_id), coll (its collection, only to tell apart a
// place_id that lives in two), method (iea-sd | names-pct | values: overrides every continuous card's status
// method) and ind (an indicator id to open and scroll to). defaults are left out. `?brand=` and `?theme=` are query
// switches, never hash keys. an old Matrix permalink has none of the new keys and parses to the same state as before.
import type { VocabId } from './data.ts'
import type { MethodId } from '../../../src/status/index.ts'

export type Depth = 'skim' | 'swim' | 'dive'
export const DEPTHS: Depth[] = ['skim', 'swim', 'dive']
export type ViewKind = 'matrix' | 'place'
export const METHOD_IDS: MethodId[] = ['iea-sd', 'names-pct', 'values']

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
}

export const DEFAULT_STATE: ViewState = {
  view: 'matrix', colls: [], q: '', vocab: 'onms', leads: true, depth: 'swim', cell: null,
  place: null, coll: null, method: null, ind: null,
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
  return {
    // a Place view without a place is the matrix
    view: kv.get('view') === 'place' && place ? 'place' : 'matrix',
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
  }
}

/** the hash of a state; the Matrix and the Place view each write only their own keys */
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
  if (s.colls.length) parts.push('colls=' + s.colls.map(enc).join(','))
  if (s.q) parts.push('q=' + enc(s.q))
  if (s.vocab !== DEFAULT_STATE.vocab) parts.push('vocab=' + s.vocab)
  if (!s.leads) parts.push('leads=0')
  if (s.depth !== DEFAULT_STATE.depth) parts.push('depth=' + s.depth)
  if (s.cell) parts.push('cell=' + enc(s.cell.place) + '|' + enc(s.cell.indicator))
  return parts.join('&')
}

/** the href of a place's view (with `#`), carrying the shared keys of the state it is opened from */
export function placeHref(from: Pick<ViewState, 'vocab' | 'depth' | 'method'>, placeId: string, coll?: string | null, ind?: string | null): string {
  return '#' + serializeHash({ ...DEFAULT_STATE, view: 'place', place: placeId, coll: coll ?? null, ind: ind ?? null, vocab: from.vocab, depth: from.depth, method: from.method })
}

/**
 * the href of "Back to the matrix": the Matrix state the reader came from when this session has it, else (a cold
 * permalink) the default matrix narrowed to the place's collection with the vocabulary and detail it is shown in.
 */
export function matrixHref(came: ViewState | null, place: { vocab: VocabId; depth: Depth; coll: string | null }): string {
  const s = came && came.view === 'matrix'
    ? came
    : { ...DEFAULT_STATE, colls: place.coll ? [place.coll] : [], vocab: place.vocab, depth: place.depth }
  return '#' + serializeHash(s)
}
