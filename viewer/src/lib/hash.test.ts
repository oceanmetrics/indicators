import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE, parseHash, serializeHash } from './hash.ts'
import type { ViewState } from './hash.ts'

describe('the hash is the view state', () => {
  it('an empty hash is the default state', () => {
    expect(parseHash('')).toEqual(DEFAULT_STATE)
    expect(parseHash('#')).toEqual(DEFAULT_STATE)
  })
  it('the default state serializes to nothing', () => {
    expect(serializeHash(DEFAULT_STATE)).toBe('')
  })
  it('serializes only what differs from the default, in a fixed key order', () => {
    const s: ViewState = { colls: ['places', 'mr_eez'], q: 'florida keys', vocab: 'eov', leads: false, depth: 'dive', cell: { place: 'NMS:FKNMS', indicator: 'erddap:dhw_5km:CRW_SST:mean' } }
    expect(serializeHash(s)).toBe('colls=places,mr_eez&q=florida%20keys&vocab=eov&leads=0&depth=dive&cell=NMS:FKNMS|erddap:dhw_5km:CRW_SST:mean')
  })
  it('round-trips a full state', () => {
    const s: ViewState = { colls: ['mr_eez'], q: 'a&b=c, d', vocab: 'names', leads: false, depth: 'skim', cell: { place: 'MRGID:8371', indicator: 'sdg:ER_MRN_MPA' } }
    expect(parseHash('#' + serializeHash(s))).toEqual(s)
  })
  it('round-trips each default-differing key on its own', () => {
    for (const s of [
      { ...DEFAULT_STATE, vocab: 'eov' as const }, { ...DEFAULT_STATE, leads: false }, { ...DEFAULT_STATE, depth: 'dive' as const },
      { ...DEFAULT_STATE, q: 'ré' }, { ...DEFAULT_STATE, colls: ['places'] },
    ]) expect(parseHash(serializeHash(s))).toEqual(s)
  })
  it('an unknown vocab, depth or a malformed cell falls back to the default', () => {
    const s = parseHash('#vocab=bogus&depth=deep&leads=maybe&cell=justaplace')
    expect(s).toEqual(DEFAULT_STATE)
    expect(parseHash('#cell=|ind').cell).toBeNull()
    expect(parseHash('#cell=place|').cell).toBeNull()
  })
  it('keeps the colons and the bar of ids readable, and survives a bad percent escape', () => {
    expect(serializeHash({ ...DEFAULT_STATE, cell: { place: 'NMS:A', indicator: 'x:y' } })).toBe('cell=NMS:A|x:y')
    expect(parseHash('#q=100%').q).toBe('100%')
  })
})
