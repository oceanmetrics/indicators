// the URL hash is the view's state, so every view is a permalink. keys: colls (comma list of collections), q (place
// search), vocab, leads, depth, cell (an open drawer: place_id|indicator). defaults are left out. `?brand=` and
// `?theme=` are query switches, never hash keys.
import type { VocabId } from './data.ts'

export type Depth = 'skim' | 'swim' | 'dive'
export const DEPTHS: Depth[] = ['skim', 'swim', 'dive']

export interface ViewState {
  colls: string[]
  q: string
  vocab: VocabId
  leads: boolean
  depth: Depth
  cell: { place: string; indicator: string } | null
}

export const DEFAULT_STATE: ViewState = { colls: [], q: '', vocab: 'onms', leads: true, depth: 'swim', cell: null }

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
  const sep = cell ? cell.indexOf('|') : -1
  return {
    colls: (kv.get('colls') ?? '').split(',').filter(Boolean),
    q: kv.get('q') ?? '',
    vocab: vocab === 'names' || vocab === 'eov' || vocab === 'onms' ? vocab : DEFAULT_STATE.vocab,
    leads: kv.get('leads') === '0' ? false : true,
    depth: depth === 'skim' || depth === 'swim' || depth === 'dive' ? depth : DEFAULT_STATE.depth,
    cell: cell && sep > 0 && sep < cell.length - 1 ? { place: cell.slice(0, sep), indicator: cell.slice(sep + 1) } : null,
  }
}

export function serializeHash(s: ViewState): string {
  const parts: string[] = []
  if (s.colls.length) parts.push('colls=' + s.colls.map(enc).join(','))
  if (s.q) parts.push('q=' + enc(s.q))
  if (s.vocab !== DEFAULT_STATE.vocab) parts.push('vocab=' + s.vocab)
  if (!s.leads) parts.push('leads=0')
  if (s.depth !== DEFAULT_STATE.depth) parts.push('depth=' + s.depth)
  if (s.cell) parts.push('cell=' + enc(s.cell.place) + '|' + enc(s.cell.indicator))
  return parts.join('&')
}
