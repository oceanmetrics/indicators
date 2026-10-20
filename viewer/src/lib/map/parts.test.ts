// what the Map draws, as parts: a place set layers its groups (derived and vector first, WMS on top); a derived group is drawn
// as the features of another layer
import { describe, expect, it } from 'vitest'
import type { Place } from '../matrix.ts'
import type { MapItem } from './classes.ts'
import type { GazLayer } from './gazetteer.ts'
import { parseLayers } from './gazetteer.ts'
import { buildParts, drawLayer, featureOf, orderParts, partsBbox, partsKey, placeOf } from './parts.ts'

const json = {
  layers: [
    { slug: 'mr_eez', collection: 'mr_eez', kind: 'raster', bbox: [-180, -62, 180, 87], raster: { tiles: ['https://v/wmts?LAYER=eez'], info_url: 'i', info_id: 'mrgid' }, authority: 'MRGID' },
    { slug: 'fao_high_seas', collection: 'fao_high_seas', kind: 'derived', pmtiles: null, source_layer: null, display: { via: 'fao_major_areas', id_from: 'fao_id' }, bbox: [-180, -85.6, 180, 90] },
    { slug: 'fao_major_areas', collection: 'fao_major_areas', kind: 'vector', pmtiles: 'https://x/fao.pmtiles', source_layer: 'fao_major_areas', bbox: [-180, -85.6, 180, 90] },
    { slug: 'noaa_nerrs', collection: 'noaa_nerrs', kind: 'vector', pmtiles: 'https://x/nerrs.pmtiles', source_layer: 'noaa_nerrs', bbox: [-158, 18, -66, 60] },
    { slug: 'orphan', collection: 'orphan', kind: 'derived', pmtiles: null, display: { via: 'nowhere', id_from: 'x' }, bbox: [0, 0, 1, 1] },
    { slug: 'rasterish', collection: 'rasterish', kind: 'derived', display: { via: 'mr_eez', id_from: 'x' }, bbox: [0, 0, 1, 1] },
  ],
}
const all = parseLayers(json)

const item = (placeId: string, group: string, k: number | null, displayId: string | null = null): MapItem =>
  ({ placeId, name: placeId, group, displayId, value: 1, valueText: '1', period: null, periodText: null, k, label: '', status: null, trend: null })
const place = (id: string, coll: string, displayId: string | null = null): Place => ({ id, name: id, coll, ...(displayId ? { displayId } : {}) })

const items = [
  item('MRGID:8456', 'mr_eez', 2), item('MRGID:8371', 'mr_eez', null),
  item('FAOHS:21', 'fao_high_seas', 3, 'FAO:21'), item('FAOHS:87', 'fao_high_seas', 0, 'FAO:87'),
]
const places = [place('FAOHS:21', 'fao_high_seas', 'FAO:21'), place('FAOHS:87', 'fao_high_seas', 'FAO:87'), place('FAOHS:34', 'fao_high_seas', 'FAO:34'), place('MRGID:8456', 'mr_eez')]

describe('the gazetteer layers of a derived group', () => {
  it('parse: a derived layer keeps its display (the layer that draws it and the id column); others have none', () => {
    expect(all.fao_high_seas.kind).toBe('derived')
    expect(all.fao_high_seas.display).toEqual({ via: 'fao_major_areas', id_from: 'fao_id' })
    expect(all.fao_high_seas.pmtiles).toBeNull()
    expect(all.noaa_nerrs.display).toBeNull()
    expect(all.mr_eez.kind).toBe('raster')
  })
  it('a derived layer is drawn by its via layer; a vector layer by itself; a raster layer by its WMS', () => {
    expect(drawLayer(all.fao_high_seas, all)?.slug).toBe('fao_major_areas')
    expect(drawLayer(all.noaa_nerrs, all)?.slug).toBe('noaa_nerrs')
    expect(drawLayer(all.mr_eez, all)?.slug).toBe('mr_eez')
  })
  it('a derived layer whose via is missing, or is not a vector layer with tiles, cannot be drawn', () => {
    expect(drawLayer(all.orphan, all)).toBeNull()
    expect(drawLayer(all.rasterish, all)).toBeNull()
    expect(drawLayer({ ...all.noaa_nerrs, pmtiles: null } as GazLayer, all)).toBeNull()
  })
})

describe('the parts of a place set', () => {
  const { parts, missing } = buildParts(['mr_eez', 'fao_high_seas'], all, items, places, true)
  it('the derived group is drawn first and the WMS group on top, whatever the set order', () => {
    expect(parts.map(p => [p.group, p.kind, p.layer.slug])).toEqual([['fao_high_seas', 'vector', 'fao_major_areas'], ['mr_eez', 'raster', 'mr_eez']])
    expect(missing).toEqual([])
  })
  it('the derived part colours each FAO feature by its place and draws only the pieces of the group', () => {
    const fao = parts[0]
    expect(fao.derived).toBe(true)
    expect([...fao.classOf]).toEqual([['FAO:21', 3], ['FAO:87', 0]])
    expect(fao.only).toEqual(['FAO:21', 'FAO:34', 'FAO:87'])
    expect(fao.known).toEqual(['FAO:21', 'FAO:87'])
  })
  it('a click on a feature of the derived part is the place, not the FAO area; a feature that is no piece is none', () => {
    const fao = parts[0]
    expect(placeOf(fao, 'FAO:87')).toBe('FAOHS:87')
    expect(placeOf(fao, 'FAO:88')).toBeNull()
    expect(featureOf(fao, 'FAOHS:21')).toBe('FAO:21')
    expect(featureOf(fao, 'NMS:X')).toBe('NMS:X')
  })
  it('the reference part is keyed by place id and is opaque with the set', () => {
    const eez = parts[1]
    expect([...eez.classOf]).toEqual([['MRGID:8456', 2]])
    expect(parts.map(p => p.opaque)).toEqual([true, true])
    expect(buildParts(['mr_eez'], all, items, places).parts[0].opaque).toBe(false)
  })
  it('a vector part knows its computed members', () => {
    const p = buildParts(['noaa_nerrs'], all, [item('NERRS:WEL', 'noaa_nerrs', 1)], [place('NERRS:WEL', 'noaa_nerrs')]).parts[0]
    expect([p.known, p.only, p.derived, [...p.classOf]]).toEqual([['NERRS:WEL'], null, false, [['NERRS:WEL', 1]]])
  })
  it('a group that cannot be drawn is reported, the others still are', () => {
    const r = buildParts(['orphan', 'mr_eez', 'nope'], all, items, places)
    expect(r.parts.map(p => p.group)).toEqual(['mr_eez'])
    expect(r.missing).toEqual(['orphan', 'nope'])
  })
})

describe('part order, key and extent', () => {
  it('orderParts keeps the vector order and puts reference parts last', () => {
    expect(orderParts([{ kind: 'raster', n: 1 }, { kind: 'vector', n: 2 }, { kind: 'raster', n: 3 }, { kind: 'vector', n: 4 }]).map(p => p.n)).toEqual([2, 4, 1, 3])
  })
  it('the key changes with the groups drawn, not with the classes', () => {
    const a = buildParts(['mr_eez', 'fao_high_seas'], all, items, places).parts
    const b = buildParts(['mr_eez', 'fao_high_seas'], all, items.map(i => ({ ...i, k: 1 })), places).parts
    expect(partsKey(a)).toBe(partsKey(b))
    expect(partsKey(a)).toBe('fao_high_seas:vector:fao_major_areas|mr_eez:raster:mr_eez')
    expect(partsKey(buildParts(['mr_eez'], all, items, places).parts)).not.toBe(partsKey(a))
  })
  it('the extent is the union of the groups’ own, with latitudes held inside the Mercator range', () => {
    expect(partsBbox(buildParts(['mr_eez', 'fao_high_seas'], all, items, places).parts)).toEqual([-180, -85, 180, 85])
    expect(partsBbox(buildParts(['mr_eez'], all, items, places).parts)).toEqual([-180, -62, 180, 85])
    expect(partsBbox(buildParts(['noaa_nerrs'], all, [], []).parts)).toEqual([-158, 18, -66, 60])
  })
})
