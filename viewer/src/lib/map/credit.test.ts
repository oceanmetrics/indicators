import { describe, expect, it } from 'vitest'
import type { Indicator } from '../data.ts'
import { basemapCredit, dataCredit, layerCredit, partsCredit } from './credit.ts'

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
    expect(dataCredit({ ...ind, dataset: { ...ind.dataset, license: 'various' } } as unknown as Indicator)).toBe('Data: CRW SST (NOAA CRW)')
  })
})

describe('the credit of the parts drawn', () => {
  const eez = { title: 'EEZ', attribution: 'Flanders Marine Institute (2023).', source_link: { href: 'u', title: 'Marine Regions (VLIZ)' } }
  const fao = { title: 'FAO', attribution: 'FAO. 2024. Major Fishing Areas.', source_link: null }
  it('one group: its attribution and its source', () => {
    expect(partsCredit([eez])).toBe('Places: Flanders Marine Institute (2023) (Marine Regions (VLIZ))')
  })
  it('a set: each group’s attribution, once', () => {
    expect(partsCredit([fao, eez, eez])).toBe('Places: FAO. 2024. Major Fishing Areas. Flanders Marine Institute (2023) (Marine Regions (VLIZ))')
  })
  it('the title stands in for a missing attribution, and nothing gives nothing', () => {
    expect(partsCredit([{ title: 'T', attribution: '', source_link: null }])).toBe('Places: T')
    expect(partsCredit([])).toBe('')
  })
})
