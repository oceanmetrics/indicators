// the embed route's hash: `#card=<place_id>|<indicator>&method=<iea-sd|names-pct|values>&depth=<skim|swim|dive>[&vocab=][&coll=][&fig=1]`.
// fig=1 draws the card as a still figure (no buttons, table, downloads or elements): what the figure job saves as PNG.
// one IndicatorCard with no app chrome, for iframes (SanctuaryWatch figures, ONMS and MBON pages) and for the figure job.
import { DEPTHS, METHOD_IDS } from './hash.ts'
import type { Depth } from './hash.ts'
import type { VocabId } from './data.ts'
import type { MethodId } from '@oceanmetrics/status'

export interface EmbedState {
  place: string
  indicator: string
  coll: string | null
  method: MethodId | null
  depth: Depth
  vocab: VocabId
  /** a still figure: the card without its controls */
  still: boolean
}

const dec = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }

/** the card the hash asks for, or null when it names none */
export function parseEmbedHash(hash: string): EmbedState | null {
  const kv = new Map<string, string>()
  for (const part of hash.replace(/^#/, '').split('&')) {
    const i = part.indexOf('=')
    if (i > 0) kv.set(part.slice(0, i), dec(part.slice(i + 1)))
  }
  const card = kv.get('card') ?? ''
  const sep = card.indexOf('|')
  if (sep <= 0 || sep >= card.length - 1) return null
  const method = kv.get('method') as MethodId
  const depth = kv.get('depth') as Depth
  const vocab = kv.get('vocab')
  return {
    place: card.slice(0, sep),
    indicator: card.slice(sep + 1),
    coll: kv.get('coll') || null,
    method: METHOD_IDS.includes(method) ? method : null,
    depth: DEPTHS.includes(depth) ? depth : 'swim',
    vocab: vocab === 'names' || vocab === 'eov' ? vocab : 'onms',
    still: kv.get('fig') === '1',
  }
}

/** the hash of a card (the inverse of parseEmbedHash; defaults left out) */
export function embedHash(s: Pick<EmbedState, 'place' | 'indicator'> & Partial<EmbedState>): string {
  const parts = [`card=${encodeURIComponent(s.place).replace(/%3A/gi, ':')}|${encodeURIComponent(s.indicator).replace(/%3A/gi, ':')}`]
  if (s.coll) parts.push('coll=' + encodeURIComponent(s.coll))
  if (s.method) parts.push('method=' + s.method)
  if (s.depth && s.depth !== 'swim') parts.push('depth=' + s.depth)
  if (s.vocab && s.vocab !== 'onms') parts.push('vocab=' + s.vocab)
  if (s.still) parts.push('fig=1')
  return parts.join('&')
}

/** the app's own address from the embed page's (`.../embed/` -> `.../`), query and hash dropped */
export function appHome(pageHref: string): string {
  const u = new URL('../', pageHref)
  u.search = ''
  u.hash = ''
  return u.href
}
