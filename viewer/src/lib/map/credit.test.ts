import { describe, expect, it } from 'vitest'
import type { Indicator } from '../data.ts'
import { basemapCredit, dataCredit, layerCredit } from './credit.ts'

describe('the credit lines', () => {
  it('the basemap is named for the theme', () => {
    expect(basemapCredit(false)).toBe('Basemap: Esri Light Gray Canvas (Esri, HERE, Garmin, FAO, NOAA, USGS)')
    expect(basemapCredit(true)).toContain('Dark Gray Canvas')
  })
  it('the places carry their layer’s attribution, the title when it has none, nothing without a layer', () => {
    expect(layerCredit({ title: 'T', attribution: 'Flanders Marine Institute (2023).' })).toBe('Places: Flanders Marine Institute (2023).')
    expect(layerCredit({ title: 'T', attribution: '' })).toBe('Places: T')
    expect(layerCredit(null)).toBe('')
  })
  it('the data credit names the dataset, its producers and licensors, and the licence', () => {
    const ind = {
      license: 'CC-BY-4.0',
      dataset: {
        title: 'CRW SST', license: 'CC0-1.0',
        providers: [{ name: 'NOAA CRW', roles: ['producer', 'licensor'] }, { name: 'Ocean Metrics LLC', roles: ['processor', 'host'] }],
      },
    } as unknown as Indicator
    expect(dataCredit(ind)).toBe('Data: CRW SST (NOAA CRW), CC0-1.0')
    // no licence of its own, or "other": none is claimed (the catalog's CC BY 4.0 is for the values, not the dataset)
    expect(dataCredit({ ...ind, dataset: { ...ind.dataset, license: undefined, providers: [] } } as unknown as Indicator)).toBe('Data: CRW SST')
    expect(dataCredit({ ...ind, dataset: { ...ind.dataset, license: 'other' } } as unknown as Indicator)).toBe('Data: CRW SST (NOAA CRW)')
  })
})
