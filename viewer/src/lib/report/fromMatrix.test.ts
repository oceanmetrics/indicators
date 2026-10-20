import { describe, expect, it } from 'vitest'
import { DEFAULT_SPEC, expandIndicators, expandPlaces } from '../../../../src/report/spec.ts'
import type { CoverageRow } from '../../../../src/coverage/build.ts'
import type { Indicator } from '../data.ts'
import { DEFAULT_STATE } from '../hash.ts'
import { indexCoverage } from '../matrix.ts'
import { PRESETS, availablePresets, presetOf } from './presets.ts'
import { matrixToSpec } from './fromMatrix.ts'

const ind = (id: string, series: string, lead: boolean, onms: string): Indicator => ({ id, series, lead, category: { onms }, collections: [{ coll: 'places' }, { coll: 'mr_eez' }] } as unknown as Indicator)
const INDS = [ind('sst:a', 'sst', true, 'water-quality'), ind('sst:b', 'sst', false, 'water-quality'), ind('npp:a', 'npp', true, 'living-resources'), ind('sdg:a', 'sdg-14', true, 'response')]
const place = (place_id: string, place_name: string, coll: string) => ({ place_id, place_name, coll, indicator: 'sst:a', time_grain: 'year' }) as unknown as CoverageRow
const IDX = indexCoverage([
  place('NMS:A', 'Alpha', 'places'), place('NMS:B', 'Bravo', 'places'), place('NMS:C', 'Charlie', 'places'), place('NMS:D', 'Delta', 'places'),
  place('MRGID:1', 'Zed EEZ', 'mr_eez'),
])
const view = { colls: [] as string[], q: '', hidePlaces: [] as string[], hideInds: [] as string[], addInds: [] as string[], leads: true }
const ctx = { idx: IDX, indicators: INDS }

describe('the Matrix as a report spec', () => {
  it('the untouched Matrix is every place and every lead, as a Scorecard', () => {
    expect(matrixToSpec(view, ctx)).toEqual({ ...DEFAULT_SPEC, layout: 'scorecard' })
  })
  it('chosen collections become `coll:` rules, removed places become excludes', () => {
    const s = matrixToSpec({ ...view, colls: ['places', 'mr_eez'], hidePlaces: ['NMS:B'] }, ctx)
    expect(s.places).toEqual({ include: ['coll:places', 'coll:mr_eez'], exclude: ['NMS:B'], context: false })
  })
  it('a `coll:` rule also matches a values collection, so a place grouped elsewhere is excluded when it is not on display', () => {
    // Pitcairn is grouped under mr_eez but has rows in `places`: `coll:places` would bring it along
    const pit = (indicator: string, coll: string) => ({ place_id: 'MRGID:8439', place_name: 'Pitcairn', coll, place_coll: 'mr_eez', indicator, time_grain: 'year' }) as unknown as CoverageRow
    const idx = indexCoverage([place('NMS:A', 'Alpha', 'places'), pit('sst:a', 'places'), pit('sdg:a', 'mr_eez')])
    const s = matrixToSpec({ ...view, colls: ['places'] }, { idx, indicators: INDS })
    expect(s.places).toEqual({ include: ['coll:places'], exclude: ['MRGID:8439'], context: false })
    expect(expandPlaces(s.places, idx.places).map(p => p.id)).toEqual(['NMS:A'])
    // both groups on display: nothing to exclude
    expect(matrixToSpec({ ...view, colls: ['places', 'mr_eez'] }, { idx, indicators: INDS }).places.exclude).toEqual([])
  })
  it('leads-only on: `*` plus the indicators added beyond the leads, less the removed leads', () => {
    const s = matrixToSpec({ ...view, addInds: ['sst:b'], hideInds: ['npp:a'] }, ctx)
    expect(s.indicators).toEqual({ include: ['*', 'sst:b'], exclude: ['npp:a'] })
    expect(expandIndicators(s.indicators, INDS).map(i => i.id)).toEqual(['sst:a', 'sst:b', 'sdg:a'])
  })
  it('leads-only off: every series whole', () => {
    const s = matrixToSpec({ ...view, leads: false, addInds: ['sst:b'], hideInds: ['sst:b'] }, ctx)
    expect(s.indicators).toEqual({ include: ['series:sst:*', 'series:npp:*', 'series:sdg-14:*'], exclude: ['sst:b'] })
    expect(expandIndicators(s.indicators, INDS).map(i => i.id)).toEqual(['sst:a', 'npp:a', 'sdg:a'])
  })
  it('a removed indicator the rules would not show needs no exclude', () => {
    expect(matrixToSpec({ ...view, hideInds: ['sst:b'] }, ctx).indicators.exclude).toEqual([])
  })
  it('3 places or fewer open as Cards, more as a Scorecard', () => {
    expect(matrixToSpec({ ...view, colls: ['mr_eez'] }, ctx).layout).toBe('cards')
    expect(matrixToSpec({ ...view, colls: ['places'], hidePlaces: ['NMS:D'] }, ctx).layout).toBe('cards')
    expect(matrixToSpec({ ...view, colls: ['places'] }, ctx).layout).toBe('scorecard')
  })
  it('a search lists the places it finds by id', () => {
    const s = matrixToSpec({ ...view, q: 'a', hidePlaces: ['NMS:A'] }, ctx)
    expect(s.places.include).toEqual(['NMS:B', 'NMS:C', 'NMS:D'])
    expect(s.layout).toBe('cards')
    expect(matrixToSpec({ ...view, q: 'nothing like it' }, ctx).places.include).toEqual(['none'])
    expect(expandPlaces(matrixToSpec({ ...view, q: 'nothing like it' }, ctx).places, IDX.places)).toEqual([])
  })
  it('the default state has no stray keys: it carries no depth of its own', () => {
    expect(matrixToSpec(DEFAULT_STATE, ctx).depth).toBe(DEFAULT_SPEC.depth)
  })
})

describe('the presets', () => {
  const places = IDX.places
  it('are all named and titled by their label', () => {
    expect(PRESETS.map(p => p.label)).toEqual([
      'Sanctuary condition', 'One sanctuary: Channel Islands', 'Climate drivers and water quality', 'Biodiversity (OBIS)', 'Response (SDG 14)',
    ])
    expect(PRESETS.every(p => p.spec.title === p.label)).toBe(true)
  })
  it('are shown only when they expand to a place and an indicator', () => {
    const ids = availablePresets(PRESETS, [...INDS], [...places, { id: 'NMS:CINMS', coll: 'places' }]).map(p => p.id)
    // no `obis-all` series here, so the OBIS preset is hidden; no drivers-pressures term, but water-quality matches
    expect(ids).toEqual(['sanctuary-condition', 'cinms', 'climate', 'response'])
  })
  it('hides the one-sanctuary preset when that sanctuary is not in the catalog', () => {
    expect(availablePresets(PRESETS, [...INDS], places).map(p => p.id)).not.toContain('cinms')
  })
  it('the OBIS preset shows once the series exists', () => {
    const withObis = [...INDS, ind('obis:species', 'obis-all', true, 'living-resources')]
    expect(availablePresets(PRESETS, withObis, places).map(p => p.id)).toContain('obis')
  })
  it('a spec is a preset when its places, indicators and layout match', () => {
    expect(presetOf(PRESETS[1].spec)?.id).toBe('cinms')
    expect(presetOf({ ...PRESETS[1].spec, layout: 'scorecard' })).toBeNull()
  })
})
