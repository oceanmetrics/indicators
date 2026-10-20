import { describe, expect, it } from 'vitest'
import type { CoverageRow } from '../../../../../src/coverage/build.ts'
import type { Indicator } from '../../data.ts'
import type { Place } from '../../matrix.ts'
import type { PlaceRow } from '../../valuesData.ts'
import { loadSheetValues, locatorItems, placeGroups, sheetCoverage, sheetGroups } from './maps.ts'

const P = (id: string, coll = 'places', extra: Partial<Place> = {}): Place => ({ id, name: `Place ${id}`, coll, ...extra })
const cov = (place_id: string, o: Partial<CoverageRow> = {}): CoverageRow => ({ place_id, place_name: place_id, coll: 'places', indicator: 'sst', time_grain: 'year', last_value: 1, last_class: null, ...o }) as CoverageRow
const IND = { id: 'sst', collections: [{ coll: 'places', path: 'values/sst/places.parquet' }, { coll: 'mr_eez', path: 'values/sst/eez.parquet' }] } as unknown as Indicator

describe('the locator', () => {
  it('draws every chosen place in class 0 and keeps the feature id of a derived place', () => {
    const items = locatorItems([P('NMS:A'), P('FAO:1', 'fao_high_seas', { displayId: '27' })])
    expect(items.map(i => [i.placeId, i.group, i.k, i.displayId])).toEqual([['NMS:A', 'places', 0, null], ['FAO:1', 'fao_high_seas', 0, '27']])
    expect(items.every(i => i.value == null && i.status == null)).toBe(true)
  })
  it('the groups are the chosen places\' own, each once, in order of appearance', () => {
    expect(placeGroups([P('a'), P('b', 'mr_eez'), P('c')])).toEqual(['places', 'mr_eez'])
    expect(placeGroups([])).toEqual([])
  })
})

describe('the Map sheet', () => {
  const rows = [cov('NMS:A'), cov('NMS:B'), cov('NMS:C'), cov('MRGID:1', { coll: 'mr_eez' }), cov('NMS:A', { indicator: 'chl' }), cov('NMS:D', { last_value: null })]
  it('colours the chosen places only, for the indicator only', () => {
    expect(sheetCoverage(rows, [P('NMS:A'), P('NMS:C'), P('MRGID:1', 'mr_eez')], IND).map(r => r.place_id)).toEqual(['NMS:A', 'NMS:C', 'MRGID:1'])
  })
  it('draws the groups of chosen places that have a value, a group by its place_coll', () => {
    const r = sheetCoverage(rows, [P('NMS:A'), P('NMS:D'), P('MRGID:1', 'mr_eez')], IND)
    expect(sheetGroups(r)).toEqual(['places', 'mr_eez'])
    expect(sheetGroups(sheetCoverage(rows, [P('NMS:D')], IND))).toEqual([])
    expect(sheetGroups([cov('X:1', { coll: 'places', place_coll: 'fao_high_seas' } as Partial<CoverageRow>)])).toEqual(['fao_high_seas'])
  })
  it('reads the values files of the groups once and keeps the chosen places\' rows only', async () => {
    const row = (id: string): PlaceRow => ({ place_id: id }) as PlaceRow
    const calls: string[] = []
    const load = async (url: string) => { calls.push(url); return new Map([['NMS:A', [row('NMS:A')]], ['NMS:Z', [row('NMS:Z')]]]) }
    const r = sheetCoverage(rows, [P('NMS:A')], IND)
    const out = await loadSheetValues({ base: 'https://x/' }, IND, r, ['places'], load)
    expect(calls).toEqual(['https://x/values/sst/places.parquet'])
    expect([...out.keys()]).toEqual(['NMS:A'])
  })
  it('a place in two values files has its rows joined', async () => {
    const two = [cov('MRGID:1', { coll: 'places', place_coll: 'mr_eez' } as Partial<CoverageRow>), cov('MRGID:1', { coll: 'mr_eez', place_coll: 'mr_eez' } as Partial<CoverageRow>)]
    const load = async (url: string) => new Map([['MRGID:1', [{ place_id: url } as unknown as PlaceRow]]])
    const out = await loadSheetValues({ base: 'b/' }, IND, two, ['mr_eez'], load)
    expect(out.get('MRGID:1')!.map(r => r.place_id)).toEqual(['b/values/sst/places.parquet', 'b/values/sst/eez.parquet'])
  })
})
