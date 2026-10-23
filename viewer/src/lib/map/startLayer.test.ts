import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYER, DEFAULT_LAYER_CHOICE, withDefaultLayer } from './startLayer.ts'

const NONE = { value: '', label: 'None' }
const CRW = { value: 'grid:dhw_5km:CRW_SST', label: 'SST (CRW_SST)', group: 'NOAA Coral Reef Watch' }

describe('the Map\'s one-click layer', () => {
  it('is MUR SST, monthly', () => expect(DEFAULT_LAYER).toBe('grid:jplMURSST41mday:sst'))
  it('is added after none when the manifest does not list it', () => {
    expect(withDefaultLayer([NONE, CRW])).toEqual([NONE, DEFAULT_LAYER_CHOICE, CRW])
  })
  it('replaces its "From the link" entry with its name', () => {
    expect(withDefaultLayer([NONE, { value: DEFAULT_LAYER, label: 'jplMURSST41mday (sst)', group: 'From the link' }, CRW]))
      .toEqual([NONE, DEFAULT_LAYER_CHOICE, CRW])
  })
  it('leaves a listed default as the manifest names it', () => {
    const own = { value: DEFAULT_LAYER, label: 'SST (sst)', group: 'MUR' }
    expect(withDefaultLayer([NONE, own, CRW])).toEqual([NONE, own, CRW])
  })
})
