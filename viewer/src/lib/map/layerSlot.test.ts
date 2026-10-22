import { describe, expect, it } from 'vitest'
import { formatLayerKey, isPartFill, isSlotLayer, parseLayerKey, registerSlotKind, slotBeforeId, slotFor } from './layerSlot.ts'
import type { LayerSlot, LayerSpec } from './layerSlot.ts'

// the contract's own tests are in @oceanmetrics/map; these pin what the Map relies on through the re-export

describe('the layer key (layer=<kind>:<id>[:<variable>])', () => {
  it('round-trips with and without a variable', () => {
    for (const k of ['grid:dhw_5km:CRW_SST', 'grid:jplMURSST41mday:sst', 'grid:jplMURSST41mday', 'cog:sst-2024.07', 'h3:obis_species']) {
      expect(formatLayerKey(parseLayerKey(k) as LayerSpec)).toBe(k)
    }
    expect(parseLayerKey('grid:dhw_5km:CRW_SST')).toEqual({ kind: 'grid', id: 'dhw_5km', variable: 'CRW_SST' })
  })
  it('reads the Day 6 erddap: links as grid: and writes them back as grid:', () => {
    expect(parseLayerKey('erddap:dhw_5km:CRW_SST')).toEqual({ kind: 'grid', id: 'dhw_5km', variable: 'CRW_SST' })
    expect(formatLayerKey(parseLayerKey('erddap:dhw_5km') as LayerSpec)).toBe('grid:dhw_5km')
  })
  it('refuses an unknown kind, a missing id, too many parts and odd characters', () => {
    for (const k of ['', 'grid', 'grid:', 'wms:dhw_5km', 'grid:a:b:c', 'grid:a b', 'grid:a/b:c', 'grid::x']) expect(parseLayerKey(k)).toBeNull()
    expect(parseLayerKey(null)).toBeNull()
  })
})

describe('the registry', () => {
  const fake = (kind: LayerSlot['kind']) => async (spec: LayerSpec): Promise<LayerSlot> => ({
    id: formatLayerKey(spec), kind, title: `a ${kind} slot`, mount() {}, update() {}, unmount() {}, legend: () => null,
  })
  it('slotFor dispatches by kind', async () => {
    registerSlotKind('grid', fake('grid'))
    expect((await slotFor({ kind: 'grid', id: 'dhw_5km', variable: 'CRW_SST' })).title).toBe('a grid slot')
  })
  it('throws at once on a kind nothing has registered', () => {
    expect(() => slotFor({ kind: 'cog', id: 'x', variable: null })).toThrow('no layer slot kind "cog" is registered')
  })
})

describe('where the slot goes (the ids MapCanvas draws, in order)', () => {
  it('under the first vector part\'s fill, else the first drawn layer (a WMS part), else the fallback', () => {
    expect(slotBeforeId(['p0:fill', 'p0:halo', 'w1'])).toBe('p0:fill')
    expect(slotBeforeId(['w0', 'p1:fill'])).toBe('p1:fill')
    expect(slotBeforeId(['w0', 'w1'])).toBe('w0')
    expect(slotBeforeId([], { fallback: 'land' })).toBe('land')
    expect(slotBeforeId([])).toBeNull()
  })
  it('the slot\'s ids start slot: and are never a part fill', () => {
    expect(isSlotLayer('slot:grid:fill')).toBe(true)
    expect(isPartFill('slot:grid:fill')).toBe(false)
    expect(isPartFill('p3:fill')).toBe(true)
    expect(isPartFill('p3:line')).toBe(false)
  })
})
