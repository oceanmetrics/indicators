import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE, mapHref, matrixHref, parseHash, placeHref, serializeHash } from './hash.ts'
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
    const s: ViewState = { ...DEFAULT_STATE, colls: ['places', 'mr_eez'], q: 'florida keys', vocab: 'eov', leads: false, depth: 'dive', cell: { place: 'NMS:FKNMS', indicator: 'erddap:dhw_5km:CRW_SST:mean' } }
    expect(serializeHash(s)).toBe('colls=places,mr_eez&q=florida%20keys&vocab=eov&leads=0&depth=dive&cell=NMS:FKNMS|erddap:dhw_5km:CRW_SST:mean')
  })
  it('round-trips a full state', () => {
    const s: ViewState = { ...DEFAULT_STATE, colls: ['mr_eez'], q: 'a&b=c, d', vocab: 'names', leads: false, depth: 'skim', cell: { place: 'MRGID:8371', indicator: 'sdg:ER_MRN_MPA' } }
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

  it('an old Matrix permalink (no view, place, coll, method or ind) parses as before and writes back unchanged', () => {
    const old = 'colls=places,mr_eez&q=florida&vocab=eov&leads=0&depth=dive&cell=NMS:FKNMS|erddap:dhw_5km:CRW_SST:mean'
    const s = parseHash('#' + old)
    expect(s.view).toBe('matrix')
    expect(s.place).toBeNull()
    expect(serializeHash(s)).toBe(old)
  })
})

describe('the Place view hash', () => {
  const place: ViewState = { ...DEFAULT_STATE, view: 'place', place: 'NMS:FKNMS', coll: 'places', vocab: 'eov', depth: 'dive', method: 'names-pct', ind: 'erddap:dhw_5km:CRW_SST:mean' }
  it('writes view first, then place, coll, the shared keys, method and ind', () => {
    expect(serializeHash(place)).toBe('view=place&place=NMS:FKNMS&coll=places&vocab=eov&depth=dive&method=names-pct&ind=erddap:dhw_5km:CRW_SST:mean')
  })
  it('round-trips, and leaves the defaults out', () => {
    expect(parseHash('#' + serializeHash(place))).toEqual(place)
    const bare: ViewState = { ...DEFAULT_STATE, view: 'place', place: 'MRGID:8371' }
    expect(serializeHash(bare)).toBe('view=place&place=MRGID:8371')
    expect(parseHash('#view=place&place=MRGID:8371')).toEqual(bare)
  })
  it('a Place view without a place is the matrix, and an unknown method is no override', () => {
    expect(parseHash('#view=place').view).toBe('matrix')
    expect(parseHash('#view=place&place=NMS:CINMS&method=anomaly').method).toBeNull()
    expect(parseHash('#view=bogus&place=NMS:CINMS').view).toBe('matrix')
  })
  it('the Matrix keys do not leak into a Place hash, nor the Place keys into a Matrix hash', () => {
    expect(serializeHash({ ...place, colls: ['places'], q: 'x', leads: false, cell: { place: 'a:b', indicator: 'c:d' } })).toBe(serializeHash(place))
    expect(serializeHash({ ...DEFAULT_STATE, place: 'NMS:FKNMS', method: 'values', ind: 'x:y' })).toBe('')
  })
  it('placeHref carries the vocabulary, the detail level and the method into the place', () => {
    expect(placeHref({ vocab: 'names', depth: 'swim', method: null }, 'NMS:CINMS', 'places')).toBe('#view=place&place=NMS:CINMS&coll=places&vocab=names')
    expect(placeHref({ vocab: 'onms', depth: 'dive', method: 'values' }, 'NMS:CINMS', null, 'sdg:ER_MRN_MPA')).toBe('#view=place&place=NMS:CINMS&depth=dive&method=values&ind=sdg:ER_MRN_MPA')
  })
  it('matrixHref restores the matrix state it came from, else the place collection on a cold permalink', () => {
    const came: ViewState = { ...DEFAULT_STATE, colls: ['mr_eez'], q: 'dutch', vocab: 'names', leads: false }
    expect(matrixHref(came, { vocab: 'eov', depth: 'dive', coll: 'places' })).toBe('#colls=mr_eez&q=dutch&vocab=names&leads=0')
    expect(matrixHref(null, { vocab: 'eov', depth: 'dive', coll: 'places' })).toBe('#colls=places&vocab=eov&depth=dive')
    expect(matrixHref(place, { vocab: 'onms', depth: 'swim', coll: null })).toBe('#')
  })
})


describe('the Matrix edit keys (flip, remove, add)', () => {
  it('writes axes, xp, xi and ai after the older keys, and round-trips them', () => {
    const s: ViewState = { ...DEFAULT_STATE, colls: ['places'], axes: 'indicators', hidePlaces: ['NMS:TBNMS', 'NMS:LONMS'], hideInds: ['sdg:ER_MRN_MPA'], addInds: ['erddap:dhw_5km:CRW_DHW:mean'] }
    expect(serializeHash(s)).toBe('colls=places&axes=t&xp=NMS:TBNMS,NMS:LONMS&xi=sdg:ER_MRN_MPA&ai=erddap:dhw_5km:CRW_DHW:mean')
    expect(parseHash('#' + serializeHash(s))).toEqual(s)
  })
  it('places in rows is the default and leaves axes out; an unknown axes value is the default', () => {
    expect(serializeHash({ ...DEFAULT_STATE, axes: 'places' })).toBe('')
    expect(parseHash('#axes=sideways').axes).toBe('places')
  })
  it('the edit keys do not leak into a Place or a Map hash', () => {
    const edits = { axes: 'indicators' as const, hidePlaces: ['a:b'], hideInds: ['c:d'], addInds: ['e:f'] }
    expect(serializeHash({ ...DEFAULT_STATE, ...edits, view: 'place', place: 'NMS:CINMS' })).toBe('view=place&place=NMS:CINMS')
    expect(serializeHash({ ...DEFAULT_STATE, ...edits, view: 'map', ind: 'x:y' })).toBe('view=map&ind=x:y')
  })
})

describe('the Map view hash', () => {
  const map: ViewState = { ...DEFAULT_STATE, view: 'map', ind: 'obis:species', coll: 'mr_eez', color: 'value', t: '2019', vocab: 'eov', depth: 'dive', method: 'names-pct' }
  it('writes view first, then ind, coll, color, t, cls, the shared keys and method', () => {
    expect(serializeHash(map)).toBe('view=map&ind=obis:species&coll=mr_eez&color=value&t=2019&vocab=eov&depth=dive&method=names-pct')
    expect(serializeHash({ ...map, color: 'share', cls: 'Tropical Seas', t: null, vocab: 'onms', depth: 'swim', method: null }))
      .toBe('view=map&ind=obis:species&coll=mr_eez&color=share&cls=Tropical%20Seas')
  })
  it('round-trips, and a bare view=map is a Map with nothing chosen yet', () => {
    expect(parseHash('#' + serializeHash(map))).toEqual(map)
    expect(parseHash('#view=map')).toEqual({ ...DEFAULT_STATE, view: 'map' })
    expect(serializeHash({ ...DEFAULT_STATE, view: 'map' })).toBe('view=map')
  })
  it('an unknown color or a malformed period is dropped', () => {
    const s = parseHash('#view=map&ind=a:b&color=rainbow&t=last')
    expect(s.color).toBeNull()
    expect(s.t).toBeNull()
    expect(parseHash('#view=map&t=2024-07').t).toBe('2024-07')
  })
  it('the Map keys do not leak into a Matrix hash', () => {
    expect(serializeHash({ ...DEFAULT_STATE, color: 'status', t: '2020', cls: 'x', ind: 'a:b', coll: 'places' })).toBe('')
  })
  it('mapHref carries the vocabulary, the detail level and the method', () => {
    expect(mapHref({ vocab: 'eov', depth: 'swim', method: null }, 'erddap:dhw_5km:CRW_SST:mean', 'places', 'status'))
      .toBe('#view=map&ind=erddap:dhw_5km:CRW_SST:mean&coll=places&color=status&vocab=eov')
  })
})
