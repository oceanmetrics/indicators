import { describe, expect, it } from 'vitest'
import {
  axisSteps, boxCells, budgetLobes, collectionUrl, gridCredit, gridTitle, gridVia, layerChoices, leftOutLine, producersOf, slicePlaces, slicePlacesKey,
  slicedIds, slotLegendLine, stepDate, unitLabel,
} from './gridLayer.ts'
import type { MapPart } from './parts.ts'
import { gridOutline } from '@oceanmetrics/map'

const ind = (id: string, short: string, ds: string, title: string) => ({ id, short, dataset: { id: ds, title, providers: [] } })

describe('the picker\'s choices', () => {
  const inds = [
    ind('erddap:jplMURSST41mday:sst:mean', 'MUR SST', 'erddap:jplMURSST41mday', 'MUR SST monthly'),
    ind('erddap:dhw_5km:CRW_SST:mean', 'SST', 'erddap:dhw_5km', 'CRW 5 km'),
    ind('erddap:dhw_5km:CRW_DHW:max', 'DHW', 'erddap:dhw_5km', 'CRW 5 km'),
    ind('obis:species', 'Species', 'obis', 'OBIS'),
  ]
  it('lists none, then one grid: entry per ERDDAP variable, the shown indicator\'s dataset first', () => {
    expect(layerChoices(inds, { dataset: { id: 'erddap:dhw_5km' } } as never, null).map(c => c.value))
      .toEqual(['', 'grid:dhw_5km:CRW_SST', 'grid:dhw_5km:CRW_DHW', 'grid:jplMURSST41mday:sst'])
  })
  it('a layer the link names that is not listed comes after none', () => {
    const c = layerChoices(inds, null, 'grid:other:v')
    expect(c[1]).toEqual({ value: 'grid:other:v', label: 'other (v)', group: 'From the link' })
  })
})

describe('which places are sliced', () => {
  const home = (slug: string) => ({ slug }) as MapPart['home']
  const part = (o: Partial<MapPart>) => ({ group: 'places', kind: 'vector', derived: false, known: [], only: null, home: home('places'), ...o }) as MapPart
  it('the computed places of a vector group, from its own collection, its chosen ones when chosen in part', () => {
    const s = slicePlaces([part({ known: ['NMS:B', 'NMS:A'] }), part({ group: 'noaa_nerrs', home: home('noaa_nerrs'), known: ['NERR:1', 'NERR:2'], only: ['NERR:2'] })])
    expect(s.places).toEqual([{ coll: 'places', id: 'NMS:A' }, { coll: 'places', id: 'NMS:B' }, { coll: 'noaa_nerrs', id: 'NERR:2' }])
    expect(s.without).toEqual([])
    expect(slicePlacesKey(s)).toBe('places/NMS:A,places/NMS:B,noaa_nerrs/NERR:2')
  })
  it('a reference group (its own WMS) and a derived group have no polygon here: named, not sliced', () => {
    const s = slicePlaces([part({ group: 'fao_high_seas', derived: true, known: ['x'] }), part({ group: 'mr_eez', kind: 'raster', known: ['MRGID:1'] })])
    expect(s.places).toEqual([])
    expect(s.without).toEqual(['fao_high_seas', 'mr_eez'])
  })
})

describe('the cell budget', () => {
  it('counts the cells a box covers, a partial cell as one', () => {
    expect(boxCells([-83.15, 24.3, -80.07, 25.65], [0.05, 0.05])).toBe(62 * 27)
    expect(boxCells([0, 0, 0, 0], [0.05, 0.05])).toBe(1)
  })
  it('keeps places whole: a place with a lobe over the lobe cap is left out, so is one past the total', () => {
    const l = (w: number, e: number) => ({ bbox: [w, 0, e, 1] })
    const r = budgetLobes([
      { place: 'A', lobes: [l(0, 10)] },
      { place: 'B', lobes: [l(0, 5), l(170, 260)] },
      { place: 'C', lobes: [l(0, 30)] },
      { place: 'D', lobes: [l(0, 1)] },
    ], [1, 1], { lobe: 50, total: 35 })
    expect(r.left).toEqual(['B', 'C'])
    expect(r.kept.map(x => x.bbox[2])).toEqual([10, 1])
    expect(r.cells).toBe(11)
  })
  it('reads the axis steps of a collection, 0.05 when not stated', () => {
    expect(axisSteps({ 'cube:dimensions': { longitude: { step: 0.01 }, latitude: { step: 0.01 } } })).toEqual([0.01, 0.01])
    expect(axisSteps({})).toEqual([0.05, 0.05])
  })
})

describe('the step a period asks for', () => {
  it('is the period\'s first day; none is the latest', () => {
    expect(stepDate('2024-07')).toBe('2024-07-01')
    expect(stepDate('2024')).toBe('2024-01-01')
    expect(stepDate('2024-07-16')).toBe('2024-07-16')
    expect(stepDate(null)).toBeNull()
    expect(stepDate('latest')).toBeNull()
  })
})

describe('the legend and the credit', () => {
  const base = { title: 'Sea surface temperature from CRW', t: '2024-07-01', via: gridVia('pae-paha.pacioos.hawaii.edu'), problem: null, units: '°C' }
  const period = (t: string) => t.slice(0, 7)
  it('says loading until the slice is in, then its range', () => {
    expect(slotLegendLine({ ...base, ramp: null }, period)).toBe('Layer: Sea surface temperature from CRW at 2024-07 · grid slice in the browser (DuckDB-WASM) from ERDDAP at pae-paha.pacioos.hawaii.edu · loading the slice…')
    expect(slotLegendLine({ ...base, ramp: { min: 24.123, max: 30.9, colors: [] } }, period)).toBe('Layer: Sea surface temperature from CRW at 2024-07 · grid slice in the browser (DuckDB-WASM) from ERDDAP at pae-paha.pacioos.hawaii.edu · 24.1 to 30.9 °C')
  })
  it('says the problem when there is one, and "the latest time" without t', () => {
    expect(slotLegendLine({ ...base, t: null, problem: 'no data: HTTP 500' }, period)).toMatch(/at the latest time · .* · no data: HTTP 500$/)
  })
  it('names the places left out and the groups without a polygon', () => {
    expect(leftOutLine(['NMS:PMNM'], ['mr_eez'], id => ({ 'NMS:PMNM': 'Papahānaumokuākea', mr_eez: 'EEZs' })[id] ?? id))
      .toBe('not sliced (more than 250,000 cells a request at this grid): Papahānaumokuākea · no polygon to mask here (drawn by their publisher): EEZs')
    expect(leftOutLine([], [], String)).toBe('')
  })
  it('titles the layer by its variable, credits its producers and where it is read', () => {
    const t = gridTitle({ title: 'CRW 5 km' }, { name: 'CRW_SST', description: 'sea surface temperature' })
    expect(t).toBe('Sea surface temperature from CRW 5 km')
    expect(gridCredit(t, producersOf({ providers: [{ name: 'NOAA CRW', roles: ['producer', 'licensor'] }, { name: 'PacIOOS', roles: ['host'] }] }), 'pae-paha.pacioos.hawaii.edu'))
      .toBe('Sea surface temperature from CRW 5 km (NOAA CRW), sliced in the browser from ERDDAP at pae-paha.pacioos.hawaii.edu')
  })
  it('says Celsius (and Kelvin, which the engine converts) as °C', () => {
    expect(unitLabel('Celsius')).toBe('°C')
    expect(unitLabel('degree_C')).toBe('°C')
    expect(unitLabel('kelvin')).toBe('°C')
    expect(unitLabel('Celsius weeks')).toBe('Celsius weeks')
    expect(unitLabel('1')).toBeNull()
  })
  it('reads a dataset\'s collection from the gazetteer', () => {
    expect(collectionUrl('dhw_5km')).toBe('https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/erddap/dhw_5km/collection.json')
  })
})

describe('one row per cell', () => {
  // the two package fixes this Map found (map 0.2.2, engine 0.1.1) replaced indicators' own workarounds; the cell twice where two
  // places' boxes overlap is the engine's regression test now (`sliceSource` reads the lobes with SELECT DISTINCT)
  it('consumer check (map 0.2.2): no square outline on the grids drawn here (CRW 0.05°, MUR 0.01°), so no mesh over the data', () => {
    expect(gridOutline(0.05)).toBeNull()
    expect(gridOutline(0.01)).toBeNull()
  })
})

describe('the places whose fill gives way to the slice', () => {
  const ps = [{ coll: 'places', id: 'NMS:A' }, { coll: 'places', id: 'NMS:PMNM' }]
  it('are the sliced places less the ones left out', () => {
    expect(slicedIds(ps, ['NMS:PMNM'], { problem: null, ramp: null }, true)).toEqual(['NMS:A'])
  })
  it('none without a slot; none when the slice failed whole, so every fill comes back (regression: a 404 left the map empty)', () => {
    expect(slicedIds(ps, [], null, false)).toBeNull()
    expect(slicedIds(ps, [], { problem: 'no data: 404', ramp: null }, true)).toBeNull()
    expect(slicedIds(ps, [], { problem: 'no cells in this period', ramp: { min: 0, max: 1, colors: [] } }, true)).toEqual(['NMS:A', 'NMS:PMNM'])
  })
})
