import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE, groupHref, mapHref, mapToMatrixHref, matrixHref, matrixToMapHref, placeToMapHref, parseHash, placeHref, reportHref, serializeHash } from './hash.ts'
import { DEFAULT_SPEC } from '../../../src/report/spec.ts'
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
  it('groupHref opens the Matrix on one place group, with the vocabulary and detail it is shown in', () => {
    expect(groupHref({ vocab: 'eov', depth: 'dive' }, 'mr_eez')).toBe('#colls=mr_eez&vocab=eov&depth=dive')
    expect(groupHref({ vocab: 'onms', depth: 'swim' }, 'places')).toBe('#colls=places')
  })
  it('matrixHref with a cell reopens the drawer on it, from the state it came from or from a cold permalink', () => {
    const cell = { place: 'NMS:CINMS', indicator: 'erddap:dhw_5km:CRW_SST:mean' }
    const came: ViewState = { ...DEFAULT_STATE, colls: ['mr_eez'], axes: 'places' }
    expect(matrixHref(came, { vocab: 'onms', depth: 'swim', coll: 'places' }, cell)).toBe('#colls=mr_eez&cell=NMS:CINMS|erddap:dhw_5km:CRW_SST:mean&axes=p')
    expect(matrixHref(null, { vocab: 'onms', depth: 'swim', coll: 'places' }, cell)).toBe('#colls=places&cell=NMS:CINMS|erddap:dhw_5km:CRW_SST:mean')
  })
})


describe('the Matrix edit keys (flip, remove, add)', () => {
  it('writes axes, empty, xp, xi and ai after the older keys, and round-trips them', () => {
    const s: ViewState = { ...DEFAULT_STATE, colls: ['noaa_nerrs'], axes: 'places', showEmpty: true, hidePlaces: ['NMS:TBNMS', 'NMS:LONMS'], hideInds: ['sdg:ER_MRN_MPA'], addInds: ['erddap:dhw_5km:CRW_DHW:mean'] }
    expect(serializeHash(s)).toBe('colls=noaa_nerrs&axes=p&empty=1&xp=NMS:TBNMS,NMS:LONMS&xi=sdg:ER_MRN_MPA&ai=erddap:dhw_5km:CRW_DHW:mean')
    expect(parseHash('#' + serializeHash(s))).toEqual(s)
  })
  it('indicators in rows is the default and leaves axes out; an unknown axes value is the default', () => {
    expect(DEFAULT_STATE.axes).toBe('indicators')
    expect(serializeHash({ ...DEFAULT_STATE, axes: 'indicators' })).toBe('')
    expect(parseHash('#axes=sideways').axes).toBe('indicators')
    expect(parseHash('#axes=p').axes).toBe('places')
  })
  it('the old axes=t (the flipped matrix) reads as the default and is dropped on the next write', () => {
    const old = parseHash('#colls=places&axes=t&xp=NMS:TBNMS')
    expect(old.axes).toBe('indicators')
    expect(serializeHash(old)).toBe('colls=places&xp=NMS:TBNMS')
  })
  it('empty=1 shows the indicators without values; it is absent by default and for any other value', () => {
    expect(parseHash('#empty=1').showEmpty).toBe(true)
    expect(parseHash('#empty=0').showEmpty).toBe(false)
    expect(parseHash('').showEmpty).toBe(false)
    expect(serializeHash({ ...DEFAULT_STATE, showEmpty: false })).toBe('')
  })
  it('the old colls= of a values collection (colls=places,mr_eez) still reads as groups', () => {
    expect(parseHash('#colls=places,mr_eez').colls).toEqual(['places', 'mr_eez'])
  })
  it('the edit keys do not leak into a Place or a Map hash', () => {
    const edits = { axes: 'places' as const, showEmpty: true, hidePlaces: ['a:b'], hideInds: ['c:d'], addInds: ['e:f'] }
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
  it('the grain is a Map key: written after cls, dropped when unknown, never in a Matrix hash', () => {
    const s: ViewState = { ...DEFAULT_STATE, view: 'map', ind: 'obis:species:fish', coll: 'mr_eez', t: '2010', grain: 'decade' }
    expect(serializeHash(s)).toBe('view=map&ind=obis:species:fish&coll=mr_eez&t=2010&grain=decade')
    expect(parseHash('#' + serializeHash(s))).toEqual(s)
    expect(parseHash('#view=map&grain=week').grain).toBeNull()
    expect(serializeHash({ ...DEFAULT_STATE, grain: 'decade' })).toBe('')
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

describe('the Report view hash', () => {
  const spec = { ...DEFAULT_SPEC, places: { include: ['coll:places'], exclude: ['NMS:TBNMS'], context: false }, indicators: { include: ['cat:water-quality', 'series:sst'], exclude: [] }, layout: 'scorecard' as const, title: 'Sanctuaries, water & heat' }
  it('writes view=report, the spec keys, then the shared keys; depth lives in the shared key', () => {
    const s: ViewState = { ...DEFAULT_STATE, view: 'report', spec: { ...spec, depth: 'dive' }, depth: 'dive' }
    expect(serializeHash(s)).toBe('view=report&pi=coll:places&px=NMS:TBNMS&ii=cat:water-quality,series:sst&layout=scorecard&title=Sanctuaries%2C%20water%20%26%20heat&depth=dive')
    expect(parseHash('#' + serializeHash(s))).toEqual(s)
  })
  it('a bare view=report is the default spec; the spec is the default outside the Report view', () => {
    expect(parseHash('#view=report')).toEqual({ ...DEFAULT_STATE, view: 'report' })
    expect(parseHash('#view=map&layout=scorecard').spec).toEqual(DEFAULT_SPEC)
    expect(serializeHash({ ...DEFAULT_STATE, spec })).toBe('')
  })
  it('reportHref carries the vocabulary and the depth', () => {
    expect(reportHref({ vocab: 'eov', depth: 'skim' }, spec)).toBe('#view=report&pi=coll:places&px=NMS:TBNMS&ii=cat:water-quality,series:sst&layout=scorecard&title=Sanctuaries%2C%20water%20%26%20heat&vocab=eov&depth=skim')
  })
})

describe('the context a view switch carries', () => {
  const from = { vocab: 'onms' as const, depth: 'swim' as const, method: null }
  const lead = (g: string) => (g === 'mr_eez' ? 'obis:species' : g === 'places' ? 'erddap:dhw_5km:CRW_SST:mean' : null)
  it('Matrix to Map opens the group and the indicator of the last opened cell', () => {
    expect(matrixToMapHref(from, ['places'], { indicator: 'sdg:ER_MRN_MPA', group: 'mr_eez' }, lead)).toBe('#view=map&ind=sdg:ER_MRN_MPA&coll=mr_eez')
  })
  it('with no cell opened yet it opens the first group on display on that group first lead with values', () => {
    expect(matrixToMapHref(from, ['mr_eez', 'places'], null, lead)).toBe('#view=map&ind=obis:species&coll=mr_eez')
    expect(matrixToMapHref({ ...from, depth: 'dive', vocab: 'eov' }, ['places'], null, lead)).toBe('#view=map&ind=erddap:dhw_5km:CRW_SST:mean&coll=places&vocab=eov&depth=dive')
  })
  it('a group with no lead with values opens the Map with no indicator, which then opens on its default', () => {
    expect(matrixToMapHref(from, ['noaa_nerrs'], null, lead)).toBe('#view=map&coll=noaa_nerrs')
  })
  it('Map to Matrix opens the Map group and the cell of the selected place, with the vocabulary and detail', () => {
    expect(mapToMatrixHref(from, 'noaa_nerrs', 'erddap:IMERG:precipitation:mean', 'NERRS:WEL')).toBe('#colls=noaa_nerrs&cell=NERRS:WEL|erddap:IMERG:precipitation:mean')
    expect(mapToMatrixHref({ vocab: 'eov', depth: 'dive' }, 'mr_eez', 'sdg:x', null)).toBe('#colls=mr_eez&vocab=eov&depth=dive')
    expect(mapToMatrixHref(from, null, null, null)).toBe('#')
  })
  it('Place to Map opens the place group and the indicator opened, with the place selected', () => {
    expect(placeToMapHref(from, { id: 'NMS:FKNMS', coll: 'places' }, 'sdg:x', lead)).toBe('#view=map&ind=sdg:x&coll=places&place=NMS:FKNMS')
    expect(placeToMapHref(from, { id: 'NMS:FKNMS', coll: 'places' }, null, lead)).toBe('#view=map&ind=erddap:dhw_5km:CRW_SST:mean&coll=places&place=NMS:FKNMS')
  })
  it('the Map hash round-trips its selected place; an old Map link has none', () => {
    const s = parseHash('#view=map&ind=sdg:x&coll=mr_eez&place=MRGID:8371&color=value')
    expect([s.view, s.coll, s.place]).toEqual(['map', 'mr_eez', 'MRGID:8371'])
    expect(serializeHash(s)).toBe('view=map&ind=sdg:x&coll=mr_eez&place=MRGID:8371&color=value')
    expect(parseHash('#view=map&ind=sdg:x&coll=mr_eez').place).toBeNull()
  })
})


describe('a place set in a link (set:<id>)', () => {
  it('the Map keeps coll=set:political readable and round-trips it', () => {
    const s: ViewState = { ...DEFAULT_STATE, view: 'map', ind: 'obis:species', coll: 'set:political', grain: 'decade' }
    expect(serializeHash(s)).toBe('view=map&ind=obis:species&coll=set:political&grain=decade')
    expect(parseHash('#view=map&ind=obis:species&coll=set:political&grain=decade')).toEqual(s)
    expect(mapHref({ vocab: 'onms', depth: 'swim', method: null }, 'obis:species', 'set:political')).toBe('#view=map&ind=obis:species&coll=set:political')
  })
  it('the Matrix colls takes it beside groups and round-trips it', () => {
    const s: ViewState = { ...DEFAULT_STATE, colls: ['set:political', 'places'] }
    expect(serializeHash(s)).toBe('colls=set:political,places')
    expect(parseHash('#colls=set:political,places')).toEqual(s)
    expect(groupHref({ vocab: 'onms', depth: 'swim' }, 'set:political')).toBe('#colls=set:political')
  })
  it('regression: an old Map or Matrix link (a group by name) parses and writes back unchanged', () => {
    const map = 'view=map&ind=obis:species&coll=mr_eez&grain=decade'
    expect(serializeHash(parseHash('#' + map))).toBe(map)
    const matrix = 'colls=places,mr_eez&vocab=eov'
    expect(serializeHash(parseHash('#' + matrix))).toBe(matrix)
  })
})

describe('the Map projection (proj)', () => {
  it('proj=globe is a Map key written after grain; the flat map leaves it out; anything else parses to flat', () => {
    const s: ViewState = { ...DEFAULT_STATE, view: 'map', ind: 'obis:species', coll: 'mr_eez', grain: 'decade', proj: 'globe' }
    expect(serializeHash(s)).toBe('view=map&ind=obis:species&coll=mr_eez&grain=decade&proj=globe')
    expect(parseHash('#view=map&ind=obis:species&coll=mr_eez&grain=decade&proj=globe')).toEqual(s)
    expect(serializeHash({ ...s, proj: null })).toBe('view=map&ind=obis:species&coll=mr_eez&grain=decade')
    expect(parseHash('#view=map&proj=flat').proj).toBeNull()
    expect(parseHash('#view=map&proj=orthographic').proj).toBeNull()
  })
  it('is never written by the Matrix or the Place view', () => {
    expect(serializeHash({ ...DEFAULT_STATE, proj: 'globe' })).toBe('')
    expect(serializeHash({ ...DEFAULT_STATE, view: 'place', place: 'NMS:CINMS', proj: 'globe' })).toBe('view=place&place=NMS:CINMS')
  })
})
