import { describe, expect, it } from 'vitest'
import { appHome, embedHash, parseEmbedHash } from './embed.ts'

describe('the embed hash', () => {
  it('names a card by place and indicator, split at the first bar', () => {
    expect(parseEmbedHash('#card=NMS:CINMS|erddap:dhw_5km:CRW_SST:mean')).toEqual({
      place: 'NMS:CINMS', indicator: 'erddap:dhw_5km:CRW_SST:mean', coll: null, method: null, depth: 'swim', vocab: 'onms', still: false,
    })
  })
  it('reads method, depth, vocabulary and collection, and drops what it does not know', () => {
    const s = parseEmbedHash('#card=MRGID:8371|sdg:ER_MRN_MPA&coll=mr_eez&method=names-pct&depth=dive&vocab=eov')
    expect(s).toMatchObject({ coll: 'mr_eez', method: 'names-pct', depth: 'dive', vocab: 'eov' })
    expect(parseEmbedHash('#card=A:1|b&method=anomaly&depth=deep&vocab=x')).toMatchObject({ method: null, depth: 'swim', vocab: 'onms' })
  })
  it('a hash without a card, or with half of one, is null', () => {
    expect(parseEmbedHash('')).toBeNull()
    expect(parseEmbedHash('#card=NMS:CINMS')).toBeNull()
    expect(parseEmbedHash('#card=|x')).toBeNull()
    expect(parseEmbedHash('#card=a|')).toBeNull()
  })
  it('writes the hash back with only what differs', () => {
    expect(embedHash({ place: 'NMS:CINMS', indicator: 'erddap:a:b:mean' })).toBe('card=NMS:CINMS|erddap:a:b:mean')
    const s = { place: 'NMS:A', indicator: 'i:1', method: 'values' as const, depth: 'skim' as const, vocab: 'names' as const }
    expect(embedHash(s)).toBe('card=NMS:A|i:1&method=values&depth=skim&vocab=names')
    expect(parseEmbedHash('#' + embedHash(s))).toMatchObject(s)
  })
  it('fig=1 asks for a still figure, and is written back only when set', () => {
    expect(parseEmbedHash('#card=NMS:A|i:1&fig=1')?.still).toBe(true)
    expect(embedHash({ place: 'NMS:A', indicator: 'i:1', still: true })).toBe('card=NMS:A|i:1&fig=1')
    expect(embedHash({ place: 'NMS:A', indicator: 'i:1', still: false })).toBe('card=NMS:A|i:1')
  })
  it('the app home is one folder up from the embed page, without query or hash', () => {
    expect(appHome('https://oceanmetrics.io/indicators/embed/?theme=dark#card=a|b')).toBe('https://oceanmetrics.io/indicators/')
    expect(appHome('http://localhost:5184/embed/')).toBe('http://localhost:5184/')
  })
})
