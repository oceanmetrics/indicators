import { describe, expect, it } from 'vitest'
import type { Indicator } from '../data.ts'
import { dataCredit, layerCredit, partsCredit, slotCredit, styleCredit } from './credit.ts'

describe('the credit lines', () => {
  it('the basemap is credited from its style\'s own attribution: tags dropped, each source once', () => {
    const carto = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/about-carto/">CARTO</a>'
    expect(styleCredit({ sources: { protomaps: { attribution: carto } } })).toBe('Basemap: © OpenStreetMap contributors © CARTO')
    expect(styleCredit({ sources: { a: { attribution: 'GEBCO' }, b: { attribution: 'GEBCO' }, c: { attribution: '© OpenStreetMap contributors' }, d: {} } }))
      .toBe('Basemap: GEBCO; © OpenStreetMap contributors')
    expect(styleCredit({ sources: {} })).toBe('')
    expect(styleCredit(null)).toBe('')
  })
  it('a source line another one holds is left out (regression: OSM twice, CARTO\'s and the land mask\'s, 2026-10-23)', () => {
    const carto = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/about-carto/">CARTO</a>'
    expect(styleCredit({ sources: { protomaps: { attribution: carto }, gebco: { attribution: 'GEBCO 2025 Grid' }, 'osm-land': { attribution: '© OpenStreetMap contributors' } } }))
      .toBe('Basemap: © OpenStreetMap contributors © CARTO; GEBCO 2025 Grid')
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
  it('the layer under the map carries its own credit, else its title; nothing without a layer', () => {
    expect(slotCredit({ title: 'SST from CRW', credit: 'SST from CRW (NOAA Coral Reef Watch (CRW)), sliced in the browser from ERDDAP at pae-paha.pacioos.hawaii.edu' }))
      .toBe('Layer: SST from CRW (NOAA Coral Reef Watch (CRW)), sliced in the browser from ERDDAP at pae-paha.pacioos.hawaii.edu')
    expect(slotCredit({ title: 'SST from CRW' })).toBe('Layer: SST from CRW')
    expect(slotCredit(null)).toBe('')
  })
})
