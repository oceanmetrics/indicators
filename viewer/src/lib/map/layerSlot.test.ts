import { describe, expect, it } from 'vitest'
import { clearsLayer, formatLayerKey, hitsLayer, isSlotLayer, parseLayerKey, registerSlotKind, slotBeforeId, slotFor } from './layerSlot.ts'
import type { LayerSlot, LayerSpec } from './layerSlot.ts'

describe('the layer key (layer=<kind>:<id>[:<variable>])', () => {
  it('round-trips with and without a variable', () => {
    for (const k of ['erddap:dhw_5km:CRW_SST', 'erddap:jplMURSST41mday:sst', 'erddap:jplMURSST41mday', 'cog:sst-2024.07', 'h3:obis_species']) {
      expect(formatLayerKey(parseLayerKey(k) as LayerSpec)).toBe(k)
    }
    expect(parseLayerKey('erddap:dhw_5km:CRW_SST')).toEqual({ kind: 'erddap', id: 'dhw_5km', variable: 'CRW_SST' })
    expect(parseLayerKey('erddap:dhw_5km')).toEqual({ kind: 'erddap', id: 'dhw_5km', variable: null })
  })
  it('refuses an unknown kind, a missing id, too many parts and odd characters', () => {
    for (const k of ['', 'erddap', 'erddap:', 'wms:dhw_5km', 'erddap:a:b:c', 'erddap:a b', 'erddap:a/b:c', 'erddap::x']) expect(parseLayerKey(k)).toBeNull()
    expect(parseLayerKey(null)).toBeNull()
  })
})

describe('the registry', () => {
  const fake = (kind: LayerSlot['kind']) => async (spec: LayerSpec): Promise<LayerSlot> => ({
    id: formatLayerKey(spec), kind, title: `a ${kind} slot`, mount() {}, update() {}, unmount() {}, legend: () => null,
  })
  it('slotFor dispatches by kind', async () => {
    registerSlotKind('erddap', fake('erddap'))
    registerSlotKind('h3', fake('h3'))
    expect((await slotFor({ kind: 'erddap', id: 'dhw_5km', variable: 'CRW_SST' })).title).toBe('a erddap slot')
    expect((await slotFor({ kind: 'h3', id: 'obis', variable: null })).id).toBe('h3:obis')
  })
  it('throws at once on a kind nothing has registered', () => {
    expect(() => slotFor({ kind: 'cog', id: 'x', variable: null })).toThrow('no layer slot kind "cog" is registered')
    expect(() => slotFor({ kind: 'wms' as never, id: 'x', variable: null })).toThrow(/wms/)
  })
})

describe('where the slot goes', () => {
  const v = (drawn = true) => ({ kind: 'vector' as const, drawn })
  const r = (drawn = true) => ({ kind: 'raster' as const, drawn })
  it('under the first vector part\'s fill', () => {
    expect(slotBeforeId([v(), r()])).toBe('p0:fill')
    expect(slotBeforeId([v(false), v(), r()])).toBe('p1:fill')
  })
  it('under the first WMS part when no vector part draws', () => {
    expect(slotBeforeId([r(), r()])).toBe('w0')
    expect(slotBeforeId([v(false), r()])).toBe('w1')
  })
  it('on top of the basemap when nothing draws', () => {
    expect(slotBeforeId([])).toBeNull()
    expect(slotBeforeId([v(false), r(false)])).toBeNull()
  })
})

describe('the slot\'s layer ids', () => {
  it('start slot:, so clear() removes them with the parts and keeps the basemap', () => {
    for (const id of ['slot:erddap', 'slot:erddap:raster', 'p0:fill', 'w1', 'pick-ring']) expect(clearsLayer(id)).toBe(true)
    for (const id of ['base-bg', 'base-light', 'base-dark']) expect(clearsLayer(id)).toBe(false)
  })
  it('are never hit by a click or the pointer; a part\'s are', () => {
    expect(isSlotLayer('slot:erddap:raster')).toBe(true)
    expect(hitsLayer('slot:erddap:raster')).toBe(false)
    expect(hitsLayer('p0:fill')).toBe(true)
    expect(hitsLayer('p2:dots')).toBe(true)
    expect(hitsLayer('base-light')).toBe(false)
  })
})
