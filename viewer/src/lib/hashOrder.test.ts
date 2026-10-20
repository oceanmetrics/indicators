// the order keys of the hash (ps pg po is ig io): written only when they differ, shared by every view like the selection.
import { describe, expect, it } from 'vitest'
import { carryOver, DEFAULT_STATE, groupHref, mapHref, matrixHref, parseHash, placeHref, reportHref, serializeHash } from './hash.ts'
import { DEFAULT_SPEC, specId, specJson } from '../../../src/report/spec.ts'
import type { ViewState } from './hash.ts'

type Order = ViewState['spec']['order']
const ordered = (places: Partial<Order['places']>, indicators: Partial<Order['indicators']> = {}): ViewState => ({
  ...DEFAULT_STATE,
  spec: { ...DEFAULT_SPEC, order: { places: { ...DEFAULT_SPEC.order.places, ...places }, indicators: { ...DEFAULT_SPEC.order.indicators, ...indicators } } },
})

describe('the order of places and indicators (ps pg po is ig io)', () => {
  it('the default order (groups A-Z, items A-Z) writes nothing', () => {
    expect(serializeHash(DEFAULT_STATE)).toBe('')
    expect(parseHash('')).toEqual(DEFAULT_STATE)
  })
  it('writes only what differs, after the selection, in a fixed order', () => {
    const s = ordered({ sort: 'ns', group: false }, { sort: 'vocab' })
    expect(serializeHash(s)).toBe('ps=ns&pg=0&is=vocab')
    expect(serializeHash({ ...s, spec: { ...s.spec, places: { ...s.spec.places, include: ['coll:mr_eez'] } } })).toBe('pi=coll:mr_eez&ps=ns&pg=0&is=vocab')
  })
  it('a custom order is a comma list: group entries g:<id>, then ids, colons readable', () => {
    const s = ordered({ sort: 'custom', custom: ['g:places', 'NMS:FKNMS', 'NMS:CINMS'] }, { sort: 'custom', group: false, custom: ['erddap:dhw_5km:CRW_SST:mean', 'sdg:x'] })
    expect(serializeHash(s)).toBe('ps=custom&po=g:places,NMS:FKNMS,NMS:CINMS&is=custom&ig=0&io=erddap:dhw_5km:CRW_SST:mean,sdg:x')
    expect(parseHash(serializeHash(s))).toEqual(s)
  })
  it('round-trips each key on its own, in every view', () => {
    for (const o of [ordered({ sort: 'sn' }), ordered({ sort: 'we' }), ordered({ group: false }), ordered({}, { sort: 'vocab' }), ordered({}, { group: false }),
      ordered({ sort: 'custom', custom: ['g:mr_eez'] }), ordered({}, { sort: 'custom', custom: ['g:physical', 'x:y'] })]) {
      for (const view of ['matrix', 'map', 'report'] as const) {
        const s = { ...o, view }
        expect(parseHash(serializeHash(s))).toEqual(s)
      }
      const p = { ...o, view: 'place' as const, place: 'NMS:A' }
      expect(parseHash(serializeHash(p))).toEqual(p)
    }
  })
  it('a custom list without the custom sort is dropped; an unknown sort is the default', () => {
    expect(parseHash('#ps=ns&po=NMS:A').spec.order.places).toEqual({ sort: 'ns', group: true, custom: [] })
    expect(parseHash('#ps=diagonal&is=we').spec.order).toEqual(DEFAULT_SPEC.order)
  })
  it('a view switch carries the order with the selection', () => {
    const s = ordered({ sort: 'ns', group: false }, { sort: 'custom', custom: ['sdg:x'] })
    const c = { vocab: s.vocab, depth: s.depth, axes: s.axes, showEmpty: s.showEmpty, spec: s.spec }
    const orderOf = (href: string) => parseHash(href).spec.order
    expect(orderOf(reportHref(c, s.spec))).toEqual(s.spec.order)
    expect(orderOf(mapHref(c, null))).toEqual(s.spec.order)
    expect(orderOf(placeHref(c, 'NMS:A'))).toEqual(s.spec.order)
    expect(orderOf(groupHref(c, 'mr_eez'))).toEqual(s.spec.order)
    expect(orderOf(matrixHref(null, c))).toEqual(s.spec.order)
    expect(carryOver(DEFAULT_STATE, c).spec.order).toEqual(s.spec.order)
  })
  it('a report keeps its order in report.json only when it is not the default, so old report ids hold', () => {
    expect(JSON.parse(specJson(DEFAULT_SPEC))).not.toHaveProperty('order')
    const custom = { ...DEFAULT_SPEC, order: ordered({ sort: 'ns' }).spec.order }
    expect(JSON.parse(specJson(custom)).order.places.sort).toBe('ns')
    expect(specId(custom, '1')).not.toBe(specId(DEFAULT_SPEC, '1'))
  })
})
