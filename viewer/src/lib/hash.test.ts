import { describe, expect, it } from 'vitest'
import { carryOver, DEFAULT_STATE, groupHref, mapHref, mapToMatrixHref, matrixHref, matrixToMapHref, placeToMapHref, parseHash, placeHref, reportHref, serializeHash } from './hash.ts'
import { DEFAULT_SPEC } from '../../../src/report/spec.ts'
import type { ReportSpec } from '../../../src/report/spec.ts'
import type { ViewState } from './hash.ts'

/** a state whose selection is the given rules (everything else the default) */
const sel = (pi?: string[], ii?: string[], px: string[] = [], ix: string[] = []): ReportSpec => ({
  ...DEFAULT_SPEC,
  places: { include: pi ?? DEFAULT_SPEC.places.include, exclude: px, context: false },
  indicators: { include: ii ?? DEFAULT_SPEC.indicators.include, exclude: ix },
})
const st = (o: Partial<ViewState> & { pi?: string[]; ii?: string[]; px?: string[]; ix?: string[] } = {}): ViewState => {
  const { pi, ii, px, ix, ...rest } = o
  return { ...DEFAULT_STATE, ...rest, spec: pi || ii || px || ix ? sel(pi, ii, px, ix) : (rest.spec ?? DEFAULT_SPEC) }
}
const from = { vocab: 'onms' as const, depth: 'swim' as const, axes: 'indicators' as const, showEmpty: false, spec: DEFAULT_SPEC, method: null }

describe('the hash is the view state', () => {
  it('an empty hash is the default state', () => {
    expect(parseHash('')).toEqual(DEFAULT_STATE)
    expect(parseHash('#')).toEqual(DEFAULT_STATE)
  })
  it('the default state serializes to nothing', () => {
    expect(serializeHash(DEFAULT_STATE)).toBe('')
  })
  it('the default selection is the sanctuaries and each series lead, written as nothing', () => {
    expect(DEFAULT_STATE.spec.places).toEqual({ include: ['coll:places'], exclude: [], context: false })
    expect(DEFAULT_STATE.spec.indicators).toEqual({ include: ['*'], exclude: [] })
  })
  it('serializes only what differs from the default, in a fixed key order', () => {
    const s = st({ pi: ['coll:places', 'coll:mr_eez'], ii: ['all'], q: 'florida keys', vocab: 'eov', depth: 'dive', cell: { place: 'NMS:FKNMS', indicator: 'erddap:dhw_5km:CRW_SST:mean' } })
    expect(serializeHash(s)).toBe('pi=coll:places,coll:mr_eez&ii=all&q=florida%20keys&vocab=eov&depth=dive&cell=NMS:FKNMS|erddap:dhw_5km:CRW_SST:mean')
  })
  it('round-trips a full state', () => {
    const s = st({ pi: ['coll:mr_eez', 'set:political'], px: ['MRGID:1'], ii: ['*', 'sdg:ER_MRN_MPA'], ix: ['erddap:dhw_5km:CRW_SST:mean'], q: 'a&b=c, d', vocab: 'names', depth: 'skim', cell: { place: 'MRGID:8371', indicator: 'sdg:ER_MRN_MPA' } })
    expect(parseHash('#' + serializeHash(s))).toEqual(s)
  })
  it('round-trips each default-differing key on its own', () => {
    for (const s of [
      st({ vocab: 'eov' }), st({ ii: ['all'] }), st({ depth: 'dive' }), st({ q: 'ré' }), st({ pi: ['coll:noaa_nerrs'] }),
      st({ px: ['NMS:TBNMS'] }), st({ ix: ['sdg:x'] }), st({ axes: 'places' }), st({ showEmpty: true }),
    ]) expect(parseHash(serializeHash(s))).toEqual(s)
  })
  it('an unknown vocab, depth or a malformed cell falls back to the default', () => {
    const s = parseHash('#vocab=bogus&depth=deep&cell=justaplace')
    expect(s).toEqual(DEFAULT_STATE)
    expect(parseHash('#cell=|ind').cell).toBeNull()
  })
  it('the selection is written in every view that has one: Matrix, Map, Report and Place', () => {
    const pi = ['coll:noaa_nerrs'], ii = ['cat:water-quality']
    expect(serializeHash(st({ pi, ii }))).toBe('pi=coll:noaa_nerrs&ii=cat:water-quality')
    expect(serializeHash(st({ view: 'map', ind: 'a:b', pi, ii }))).toBe('view=map&ind=a:b&pi=coll:noaa_nerrs&ii=cat:water-quality')
    expect(serializeHash(st({ view: 'report', pi, ii }))).toBe('view=report&pi=coll:noaa_nerrs&ii=cat:water-quality')
    expect(serializeHash(st({ view: 'place', place: 'NMS:A', pi, ii }))).toBe('view=place&place=NMS:A&pi=coll:noaa_nerrs&ii=cat:water-quality')
  })
  it('a selection written in one view is read back unchanged in another', () => {
    const base = st({ pi: ['set:political', 'NMS:CINMS'], px: ['MRGID:2'], ii: ['*', 'series:obis-all:*'], ix: ['obis:records'] })
    for (const view of ['matrix', 'map', 'report', 'place'] as const) {
      const s = { ...base, view, place: view === 'place' ? 'NMS:CINMS' : null }
      const back = parseHash('#' + serializeHash(s))
      expect(back.spec.places).toEqual(base.spec.places)
      expect(back.spec.indicators).toEqual(base.spec.indicators)
    }
  })
  it('the Report\'s own keys are not read outside the Report view', () => {
    expect(parseHash('#view=map&layout=scorecard&title=x').spec).toEqual(DEFAULT_SPEC)
    expect(parseHash('#layout=scorecard&status=values').spec).toEqual(DEFAULT_SPEC)
  })
})

describe('old links read as the same selection (migration on parse)', () => {
  const places = (h: string) => parseHash('#' + h).spec.places
  const inds = (h: string) => parseHash('#' + h).spec.indicators
  it('colls=a,b is pi=coll:a,coll:b; a set: entry stays set:', () => {
    expect(places('colls=places,mr_eez').include).toEqual(['coll:places', 'coll:mr_eez'])
    expect(places('colls=set:political,places').include).toEqual(['set:political', 'coll:places'])
    expect(serializeHash(parseHash('#colls=places,mr_eez&vocab=eov'))).toBe('pi=coll:places,coll:mr_eez&vocab=eov')
  })
  it('xp is px and xi is ix', () => {
    const s = parseHash('#colls=places&xp=NMS:TBNMS,NMS:LONMS&xi=sdg:ER_MRN_MPA')
    expect(s.spec.places).toEqual({ include: ['coll:places'], exclude: ['NMS:TBNMS', 'NMS:LONMS'], context: false })
    expect(s.spec.indicators).toEqual({ include: ['*'], exclude: ['sdg:ER_MRN_MPA'] })
    expect(serializeHash(s)).toBe('px=NMS:TBNMS,NMS:LONMS&ix=sdg:ER_MRN_MPA')
  })
  it('ai is appended to ii, keeping the leads (*)', () => {
    expect(inds('ai=erddap:dhw_5km:CRW_DHW:mean,sdg:x').include).toEqual(['*', 'erddap:dhw_5km:CRW_DHW:mean', 'sdg:x'])
    expect(serializeHash(parseHash('#ai=erddap:dhw_5km:CRW_DHW:mean'))).toBe('ii=*,erddap:dhw_5km:CRW_DHW:mean')
  })
  it('leads=0 is ii=all', () => {
    expect(inds('leads=0').include).toEqual(['all'])
    expect(serializeHash(parseHash('#colls=places,mr_eez&vocab=eov&leads=0&depth=dive'))).toBe('pi=coll:places,coll:mr_eez&ii=all&vocab=eov&depth=dive')
  })
  it('an old Matrix link opens on the same places and indicators, then writes only the new keys', () => {
    const old = 'colls=places,mr_eez&q=florida&vocab=eov&leads=0&depth=dive&cell=NMS:FKNMS|erddap:dhw_5km:CRW_SST:mean&axes=p&empty=1&xp=NMS:TBNMS&xi=sdg:x'
    const s = parseHash('#' + old)
    expect(s.view).toBe('matrix')
    expect(s.spec.places).toEqual({ include: ['coll:places', 'coll:mr_eez'], exclude: ['NMS:TBNMS'], context: false })
    expect(s.spec.indicators).toEqual({ include: ['all'], exclude: ['sdg:x'] })
    expect([s.q, s.vocab, s.depth, s.axes, s.showEmpty, s.cell]).toEqual(['florida', 'eov', 'dive', 'places', true, { place: 'NMS:FKNMS', indicator: 'erddap:dhw_5km:CRW_SST:mean' }])
    expect(serializeHash(s)).toBe('pi=coll:places,coll:mr_eez&px=NMS:TBNMS&ii=all&ix=sdg:x&q=florida&vocab=eov&depth=dive&cell=NMS:FKNMS|erddap:dhw_5km:CRW_SST:mean&axes=p&empty=1')
  })
  it('a Map link\'s coll=<group> is pi=coll:<group>; its indicator joins ii (the indicator the link opened on)', () => {
    const s = parseHash('#view=map&ind=obis:species&coll=mr_eez&grain=decade')
    expect(s.view).toBe('map')
    expect(s.spec.places.include).toEqual(['coll:mr_eez'])
    expect(s.spec.indicators.include).toEqual(['*', 'obis:species'])
    expect(s.ind).toBe('obis:species')
    expect(serializeHash(s)).toBe('view=map&ind=obis:species&pi=coll:mr_eez&ii=*,obis:species&grain=decade')
  })
  it('a Map link\'s coll=set:political is pi=set:political, and a values collection slug still resolves as a group rule', () => {
    expect(parseHash('#view=map&ind=obis:species&coll=set:political&grain=decade').spec.places.include).toEqual(['set:political'])
    expect(parseHash('#view=map&ind=a:b&coll=places').spec.places.include).toEqual(['coll:places'])
  })
  it('a Map link of the Place view\'s time (place=, color=, t=) keeps them; its coll is gone from the state', () => {
    const s = parseHash('#view=map&ind=sdg:x&coll=mr_eez&place=MRGID:8371&color=value')
    expect([s.coll, s.place, s.color]).toEqual([null, 'MRGID:8371', 'value'])
    expect(serializeHash(s)).toBe('view=map&ind=sdg:x&pi=coll:mr_eez&ii=*,sdg:x&place=MRGID:8371&color=value')
  })
  it('an old Report link keeps its rules; pi=* still means every place', () => {
    const s = parseHash('#view=report&pi=*&layout=scorecard')
    expect(s.spec.places.include).toEqual(['*'])
    expect(serializeHash(s)).toBe('view=report&pi=*&layout=scorecard')
    const named = parseHash('#view=report&pi=coll:places&layout=scorecard')
    expect(named.spec.places.include).toEqual(['coll:places'])
    expect(serializeHash(named)).toBe('view=report&layout=scorecard')
  })
  it('a link with both the old and the new keys keeps the new ones', () => {
    expect(parseHash('#colls=places&pi=coll:noaa_nerrs').spec.places.include).toEqual(['coll:noaa_nerrs'])
    expect(parseHash('#xp=a:b&px=c:d').spec.places.exclude).toEqual(['c:d', 'a:b'])
  })
  it('regression: the real old permalinks of keys.mjs, shoot.mjs and the README open on the same places and indicators', () => {
    const cases: [string, string[], string[], string[]][] = [
      // [old hash, place include, place exclude, indicator include]
      ['axes=p', ['coll:places'], [], ['*']],
      ['colls=noaa_nerrs,places', ['coll:noaa_nerrs', 'coll:places'], [], ['*']],
      ['colls=set:political&axes=p', ['set:political'], [], ['*']],
      ['xp=NMS:NMSAS,NMS:FKNMS&xi=erddap:IMERG_monthly_global_precip:precipitation:mean', ['coll:places'], ['NMS:NMSAS', 'NMS:FKNMS'], ['*']],
      ['cell=NERRS:WEL|sdg:ER_MRN_MPA&colls=places,noaa_nerrs&empty=1', ['coll:places', 'coll:noaa_nerrs'], [], ['*']],
      ['view=map&ind=erddap:dhw_5km:CRW_SST:mean&coll=places', ['coll:places'], [], ['*', 'erddap:dhw_5km:CRW_SST:mean']],
      ['view=map&ind=obis:species&coll=mr_eez', ['coll:mr_eez'], [], ['*', 'obis:species']],
      ['view=map&ind=erddap:IMERG_monthly_global_precip:precipitation:mean&coll=noaa_nerrs&place=NERRS:WEL', ['coll:noaa_nerrs'], [], ['*', 'erddap:IMERG_monthly_global_precip:precipitation:mean']],
      ['view=map&ind=obis:species:fish&coll=mr_eez&grain=decade&t=2010', ['coll:mr_eez'], [], ['*', 'obis:species:fish']],
      ['view=report&pi=coll:places&layout=scorecard&title=Sanctuary%20condition', ['coll:places'], [], ['*']],
      ['view=report&pi=NMS:CINMS&title=One%20sanctuary%3A%20Channel%20Islands', ['NMS:CINMS'], [], ['*']],
    ]
    for (const [h, pi, px, ii] of cases) {
      const s = parseHash('#' + h)
      expect([h, s.spec.places.include, s.spec.places.exclude, s.spec.indicators.include]).toEqual([h, pi, px, ii])
      // and the next write is stable: the new keys alone read back to the same state
      expect(parseHash('#' + serializeHash(s))).toEqual(s)
    }
  })
})

describe('the Place view hash', () => {
  const place = st({ view: 'place', place: 'NMS:FKNMS', coll: 'places', vocab: 'eov', depth: 'dive', method: 'names-pct', ind: 'erddap:dhw_5km:CRW_SST:mean' })
  it('writes view first, then place, coll, the selection, the shared keys, method and ind', () => {
    expect(serializeHash(place)).toBe('view=place&place=NMS:FKNMS&coll=places&vocab=eov&depth=dive&method=names-pct&ind=erddap:dhw_5km:CRW_SST:mean')
    expect(serializeHash({ ...place, spec: sel(['coll:mr_eez'], ['all']) })).toBe('view=place&place=NMS:FKNMS&coll=places&pi=coll:mr_eez&ii=all&vocab=eov&depth=dive&method=names-pct&ind=erddap:dhw_5km:CRW_SST:mean')
  })
  it('round-trips, and leaves the defaults out', () => {
    expect(parseHash('#' + serializeHash(place))).toEqual(place)
    const bare = st({ view: 'place', place: 'MRGID:8371' })
    expect(serializeHash(bare)).toBe('view=place&place=MRGID:8371')
    expect(parseHash('#view=place&place=MRGID:8371')).toEqual(bare)
  })
  it('a Place view without a place is the matrix, and an unknown method is no override', () => {
    expect(parseHash('#view=place').view).toBe('matrix')
    expect(parseHash('#view=place&place=NMS:CINMS&method=anomaly').method).toBeNull()
    expect(parseHash('#view=bogus&place=NMS:CINMS').view).toBe('matrix')
  })
  it('the Matrix keys do not leak into a Place hash, nor the Place keys into a Matrix hash', () => {
    expect(serializeHash({ ...place, q: 'x', cell: { place: 'a:b', indicator: 'c:d' } })).toBe(serializeHash(place))
    expect(serializeHash({ ...DEFAULT_STATE, place: 'NMS:FKNMS', method: 'values', ind: 'x:y' })).toBe('')
  })
  it('placeHref carries the selection, the vocabulary, the detail level and the method into the place', () => {
    expect(placeHref({ ...from, vocab: 'names' }, 'NMS:CINMS', 'places')).toBe('#view=place&place=NMS:CINMS&coll=places&vocab=names')
    expect(placeHref({ ...from, depth: 'dive', method: 'values' }, 'NMS:CINMS', null, 'sdg:ER_MRN_MPA')).toBe('#view=place&place=NMS:CINMS&depth=dive&method=values&ind=sdg:ER_MRN_MPA')
    expect(placeHref({ ...from, spec: sel(['coll:mr_eez'], ['all'], [], ['sdg:x']), axes: 'places' }, 'MRGID:8371', 'mr_eez'))
      .toBe('#view=place&place=MRGID:8371&coll=mr_eez&pi=coll:mr_eez&ii=all&ix=sdg:x&axes=p')
  })
  it('matrixHref restores the matrix state it came from with the selection of the Place view, else the Matrix of that selection', () => {
    const came = st({ pi: ['coll:mr_eez'], q: 'dutch', vocab: 'names', ii: ['all'] })
    expect(matrixHref(came, { ...from, vocab: 'names', spec: came.spec })).toBe('#pi=coll:mr_eez&ii=all&q=dutch&vocab=names')
    // the selection changed while in the Place view: the Matrix follows
    expect(matrixHref(came, { ...from, vocab: 'names', spec: sel(['coll:noaa_nerrs'], ['all']) })).toBe('#pi=coll:noaa_nerrs&ii=all&q=dutch&vocab=names')
    expect(matrixHref(null, { ...from, vocab: 'eov', depth: 'dive', spec: sel(['coll:mr_eez']) })).toBe('#pi=coll:mr_eez&vocab=eov&depth=dive')
    expect(matrixHref(place, from)).toBe('#')
  })
  it('groupHref opens the Matrix on one place group, keeping the indicators, vocabulary and detail it is shown in', () => {
    expect(groupHref({ ...from, vocab: 'eov', depth: 'dive' }, 'mr_eez')).toBe('#pi=coll:mr_eez&vocab=eov&depth=dive')
    expect(groupHref(from, 'places')).toBe('#')
    expect(groupHref({ ...from, spec: sel(['coll:places'], ['all'], ['NMS:A']) }, 'set:political')).toBe('#pi=set:political&ii=all')
  })
  it('matrixHref with a cell reopens the drawer on it, from the state it came from or from a cold permalink', () => {
    const cell = { place: 'NMS:CINMS', indicator: 'erddap:dhw_5km:CRW_SST:mean' }
    const came = st({ pi: ['coll:mr_eez'], axes: 'places' })
    expect(matrixHref(came, { ...from, axes: 'places', spec: came.spec }, cell)).toBe('#pi=coll:mr_eez&cell=NMS:CINMS|erddap:dhw_5km:CRW_SST:mean&axes=p')
    expect(matrixHref(null, from, cell)).toBe('#cell=NMS:CINMS|erddap:dhw_5km:CRW_SST:mean')
  })
})

describe('the Matrix edit keys (flip, show empty)', () => {
  it('writes the selection, then axes and empty, and round-trips them', () => {
    const s = st({ pi: ['coll:noaa_nerrs'], px: ['NMS:TBNMS', 'NMS:LONMS'], ix: ['sdg:ER_MRN_MPA'], ii: ['*', 'erddap:dhw_5km:CRW_DHW:mean'], axes: 'places', showEmpty: true })
    expect(serializeHash(s)).toBe('pi=coll:noaa_nerrs&px=NMS:TBNMS,NMS:LONMS&ii=*,erddap:dhw_5km:CRW_DHW:mean&ix=sdg:ER_MRN_MPA&axes=p&empty=1')
    expect(parseHash('#' + serializeHash(s))).toEqual(s)
  })
  it('indicators in rows is the default and leaves axes out; an unknown axes value is the default', () => {
    expect(DEFAULT_STATE.axes).toBe('indicators')
    expect(serializeHash(st({ axes: 'indicators' }))).toBe('')
    expect(parseHash('#axes=sideways').axes).toBe('indicators')
    expect(parseHash('#axes=p').axes).toBe('places')
  })
  it('the old axes=t (the flipped matrix) reads as the default and is dropped on the next write', () => {
    const old = parseHash('#colls=places&axes=t&xp=NMS:TBNMS')
    expect(old.axes).toBe('indicators')
    expect(serializeHash(old)).toBe('px=NMS:TBNMS')
  })
  it('empty=1 shows the indicators without values; it is absent by default and for any other value', () => {
    expect(parseHash('#empty=1').showEmpty).toBe(true)
    expect(parseHash('#empty=0').showEmpty).toBe(false)
    expect(parseHash('').showEmpty).toBe(false)
    expect(serializeHash(st({ showEmpty: false }))).toBe('')
  })
  it('axes and empty are shared: the Map, Report and Place views carry them', () => {
    expect(serializeHash(st({ view: 'map', ind: 'x:y', axes: 'places', showEmpty: true }))).toBe('view=map&ind=x:y&axes=p&empty=1')
    expect(serializeHash(st({ view: 'report', axes: 'places' }))).toBe('view=report&axes=p')
    expect(serializeHash(st({ view: 'place', place: 'NMS:A', axes: 'places' }))).toBe('view=place&place=NMS:A&axes=p')
    expect(parseHash('#view=report&axes=p').axes).toBe('places')
  })
  it('the Matrix-only keys (q, cell) do not leak into a Place or a Map hash', () => {
    expect(serializeHash({ ...st({ view: 'place', place: 'NMS:CINMS' }), q: 'x', cell: { place: 'a:b', indicator: 'c:d' } })).toBe('view=place&place=NMS:CINMS')
    expect(serializeHash({ ...st({ view: 'map', ind: 'x:y' }), q: 'x' })).toBe('view=map&ind=x:y')
  })
})

describe('the Map view hash', () => {
  const map = st({ view: 'map', ind: 'obis:species', pi: ['coll:mr_eez'], color: 'value', t: '2019', vocab: 'eov', depth: 'dive', method: 'names-pct' })
  it('writes view first, then ind, the selection, color, t, cls, the shared keys and method', () => {
    expect(serializeHash(map)).toBe('view=map&ind=obis:species&pi=coll:mr_eez&color=value&t=2019&vocab=eov&depth=dive&method=names-pct')
    expect(serializeHash({ ...map, color: 'share', cls: 'Tropical Seas', t: null, vocab: 'onms', depth: 'swim', method: null }))
      .toBe('view=map&ind=obis:species&pi=coll:mr_eez&color=share&cls=Tropical%20Seas')
  })
  it('round-trips, and a bare view=map is a Map with nothing chosen yet', () => {
    expect(parseHash('#' + serializeHash(map))).toEqual(map)
    expect(parseHash('#view=map')).toEqual({ ...DEFAULT_STATE, view: 'map' })
    expect(serializeHash({ ...DEFAULT_STATE, view: 'map' })).toBe('view=map')
  })
  it('the grain is a Map key: written after cls, dropped when unknown, never in a Matrix hash', () => {
    const s = st({ view: 'map', ind: 'obis:species:fish', pi: ['coll:mr_eez'], t: '2010', grain: 'decade' })
    expect(serializeHash(s)).toBe('view=map&ind=obis:species:fish&pi=coll:mr_eez&t=2010&grain=decade')
    expect(parseHash('#' + serializeHash(s))).toEqual(s)
    expect(parseHash('#view=map&grain=week').grain).toBeNull()
    expect(serializeHash(st({ grain: 'decade' }))).toBe('')
  })
  it('an unknown color or a malformed period is dropped', () => {
    const s = parseHash('#view=map&ind=a:b&color=rainbow&t=last')
    expect(s.color).toBeNull()
    expect(s.t).toBeNull()
    expect(parseHash('#view=map&t=2024-07').t).toBe('2024-07')
  })
  it('the Map keys do not leak into a Matrix hash', () => {
    expect(serializeHash(st({ color: 'status', t: '2020', cls: 'x', ind: 'a:b' }))).toBe('')
  })
  it('mapHref carries the selection, the vocabulary, the detail level and the method', () => {
    expect(mapHref({ ...from, vocab: 'eov' }, 'erddap:dhw_5km:CRW_SST:mean', 'status')).toBe('#view=map&ind=erddap:dhw_5km:CRW_SST:mean&color=status&vocab=eov')
    expect(mapHref({ ...from, spec: sel(['coll:mr_eez'], ['all']) }, 'obis:species')).toBe('#view=map&ind=obis:species&pi=coll:mr_eez&ii=all')
  })
  it('the selected place round-trips', () => {
    const s = parseHash('#view=map&ind=sdg:x&pi=coll:mr_eez&place=MRGID:8371&color=value')
    expect([s.view, s.place]).toEqual(['map', 'MRGID:8371'])
    expect(serializeHash(s)).toBe('view=map&ind=sdg:x&pi=coll:mr_eez&place=MRGID:8371&color=value')
    expect(parseHash('#view=map&ind=sdg:x&pi=coll:mr_eez').place).toBeNull()
  })
})

describe('the Report view hash', () => {
  const spec: ReportSpec = { ...DEFAULT_SPEC, places: { include: ['coll:mr_eez'], exclude: ['MRGID:1'], context: false }, indicators: { include: ['cat:water-quality', 'series:sst'], exclude: [] }, layout: 'scorecard', title: 'Sanctuaries, water & heat' }
  it('writes view=report, the spec keys (the selection first), then the shared keys; depth lives in the shared key', () => {
    const s = st({ view: 'report', spec: { ...spec, depth: 'dive' }, depth: 'dive' })
    expect(serializeHash(s)).toBe('view=report&pi=coll:mr_eez&px=MRGID:1&ii=cat:water-quality,series:sst&layout=scorecard&title=Sanctuaries%2C%20water%20%26%20heat&depth=dive')
    expect(parseHash('#' + serializeHash(s))).toEqual(s)
  })
  it('a bare view=report is the default spec; the spec is the default outside the Report view', () => {
    expect(parseHash('#view=report')).toEqual({ ...DEFAULT_STATE, view: 'report' })
    expect(parseHash('#view=map&layout=scorecard').spec).toEqual(DEFAULT_SPEC)
    expect(serializeHash(st({ spec }))).toBe('pi=coll:mr_eez&px=MRGID:1&ii=cat:water-quality,series:sst')
  })
  it('reportHref carries the vocabulary, the depth and the orientation', () => {
    expect(reportHref({ ...from, vocab: 'eov', depth: 'skim', axes: 'places' }, spec)).toBe('#view=report&pi=coll:mr_eez&px=MRGID:1&ii=cat:water-quality,series:sst&layout=scorecard&title=Sanctuaries%2C%20water%20%26%20heat&vocab=eov&depth=skim&axes=p')
  })
})

describe('the context a view switch carries', () => {
  const eez = { ...from, spec: sel(['coll:mr_eez'], ['all'], ['MRGID:1']) }
  it('Matrix to Map opens the indicator and place of the last opened cell, over the same selection', () => {
    expect(matrixToMapHref(eez, { indicator: 'sdg:ER_MRN_MPA', place: 'MRGID:8371' })).toBe('#view=map&ind=sdg:ER_MRN_MPA&pi=coll:mr_eez&px=MRGID:1&ii=all&place=MRGID:8371')
  })
  it('with no cell opened yet it opens the Map on the selection alone, which picks its first indicator', () => {
    expect(matrixToMapHref(from, null)).toBe('#view=map')
    expect(matrixToMapHref({ ...from, depth: 'dive', vocab: 'eov' }, null)).toBe('#view=map&vocab=eov&depth=dive')
  })
  it('Map to Matrix opens the same selection and the cell of the selected place, with the vocabulary and detail', () => {
    expect(mapToMatrixHref({ ...from, spec: sel(['coll:noaa_nerrs']) }, 'erddap:IMERG:precipitation:mean', 'NERRS:WEL')).toBe('#pi=coll:noaa_nerrs&cell=NERRS:WEL|erddap:IMERG:precipitation:mean')
    expect(mapToMatrixHref({ ...from, vocab: 'eov', depth: 'dive' }, 'sdg:x', null)).toBe('#vocab=eov&depth=dive')
    expect(mapToMatrixHref(from, null, null)).toBe('#')
  })
  it('Place to Map opens the same selection and the indicator opened, with the place selected', () => {
    expect(placeToMapHref(from, 'NMS:FKNMS', 'sdg:x')).toBe('#view=map&ind=sdg:x&place=NMS:FKNMS')
    expect(placeToMapHref(eez, 'MRGID:8371', null)).toBe('#view=map&pi=coll:mr_eez&px=MRGID:1&ii=all&place=MRGID:8371')
  })
  it('carryOver gives another view\'s state this one\'s selection and shared keys, and keeps its own keys', () => {
    const report = st({ view: 'report', spec: { ...DEFAULT_SPEC, layout: 'scorecard', title: 'T' } })
    const out = carryOver(report, { ...eez, depth: 'dive', axes: 'places' })
    expect(serializeHash(out)).toBe('view=report&pi=coll:mr_eez&px=MRGID:1&ii=all&layout=scorecard&title=T&depth=dive&axes=p')
    const matrix = st({ q: 'abc', cell: { place: 'a:b', indicator: 'c:d' } })
    expect(serializeHash(carryOver(matrix, eez))).toBe('pi=coll:mr_eez&px=MRGID:1&ii=all&q=abc&cell=a:b|c:d')
  })
})

describe('a place set in a link (set:<id>)', () => {
  it('the selection keeps set:political readable and round-trips it, in the Map and the Matrix', () => {
    const map = st({ view: 'map', ind: 'obis:species', pi: ['set:political'], grain: 'decade' })
    expect(serializeHash(map)).toBe('view=map&ind=obis:species&pi=set:political&grain=decade')
    expect(parseHash('#view=map&ind=obis:species&pi=set:political&grain=decade')).toEqual(map)
    expect(mapHref({ ...from, spec: sel(['set:political']) }, 'obis:species')).toBe('#view=map&ind=obis:species&pi=set:political')
    const matrix = st({ pi: ['set:political', 'coll:places'] })
    expect(serializeHash(matrix)).toBe('pi=set:political,coll:places')
    expect(parseHash('#pi=set:political,coll:places')).toEqual(matrix)
  })
  it('regression: an old Map or Matrix link (a group by name) opens on that group and writes the new keys', () => {
    expect(serializeHash(parseHash('#view=map&ind=obis:species&coll=mr_eez&grain=decade'))).toBe('view=map&ind=obis:species&pi=coll:mr_eez&ii=*,obis:species&grain=decade')
    expect(serializeHash(parseHash('#colls=places,mr_eez&vocab=eov'))).toBe('pi=coll:places,coll:mr_eez&vocab=eov')
  })
})
