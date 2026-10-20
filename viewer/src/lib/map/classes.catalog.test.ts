// the real catalog, when built (catalog/ is git-ignored; CI has none, so nothing is read unless it is there): for every
// mappable indicator and collection, the Map's status and trend at the latest period are the coverage row's, whether
// the model is made from coverage alone or from the values file. one assertion per place, so a drift names it.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parquetReadObjects } from 'hyparquet'
import { beforeAll, describe, expect, it } from 'vitest'
import { normalizeRow } from '../data.ts'
import type { Manifest } from '../data.ts'
import { groupByPlace, readValues } from '../valuesData.ts'
import type { PlaceRow } from '../valuesData.ts'
import type { CoverageRow } from '../../../../src/coverage/build.ts'
import { mapColls, mapGroups, mappable, valuesCollsOfGroup } from './pick.ts'
import { mapModel } from './classes.ts'

const DIR = resolve(__dirname, '../../../../catalog')
const have = existsSync(resolve(DIR, 'indicators.json')) && existsSync(resolve(DIR, 'coverage.parquet'))
const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

describe.skipIf(!have)('the Map on the real catalog', () => {
  let manifest: Manifest
  let cov: CoverageRow[] = []
  const values = new Map<string, Map<string, PlaceRow[]>>()

  beforeAll(async () => {
    manifest = JSON.parse(readFileSync(resolve(DIR, 'indicators.json'), 'utf8')) as Manifest
    cov = (await parquetReadObjects({ file: ab(readFileSync(resolve(DIR, 'coverage.parquet'))) })).map(normalizeRow)
    for (const ind of manifest.indicators) for (const c of ind.collections) {
      values.set(c.path, groupByPlace(await readValues(ab(readFileSync(resolve(DIR, c.path))))))
    }
  })

  it('status and trend at the latest period equal the coverage rows, for every place', () => {
    let checked = 0
    for (const ind of mappable(manifest.indicators, cov)) {
      if (ind.kind !== 'continuous') continue
      for (const coll of mapColls(ind, cov)) {
        const path = ind.collections.find(c => c.coll === coll)!.path
        for (const v of [null, values.get(path)!]) {
          const m = mapModel(ind, cov, v, { coll, color: 'status', t: null, method: null, cls: null })
          for (const it of m.items) {
            const r = cov.find(c => c.indicator === ind.id && c.coll === coll && c.place_id === it.placeId && c.time_grain === ind.status_grain)
            const who = `${it.placeId} ${ind.id} (${v ? 'values' : 'coverage'})`
            expect(it.status, who).toBe(r?.status ?? null)
            expect(it.trend, who).toBe(r?.trend ?? null)
            if (r?.last_value != null) expect(it.value, who).toBe(r.last_value)
            checked++
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(300)
  }, 120_000)

  it('categorical indicators give the same largest class from coverage and from the values file', () => {
    for (const ind of mappable(manifest.indicators, cov)) {
      if (ind.kind !== 'categorical') continue
      for (const coll of mapColls(ind, cov)) {
        const path = ind.collections.find(c => c.coll === coll)!.path
        const a = mapModel(ind, cov, null, { coll, color: 'class', t: null, method: null, cls: null })
        const b = mapModel(ind, cov, values.get(path)!, { coll, color: 'class', t: null, method: null, cls: null })
        expect(b.items.map(i => [i.placeId, i.label]), ind.id).toEqual(a.items.map(i => [i.placeId, i.label]))
      }
    }
  }, 120_000)

  it('every mode of every indicator builds a legend and classes every place it can', () => {
    for (const ind of mappable(manifest.indicators, cov)) {
      for (const coll of mapColls(ind, cov)) {
        const path = ind.collections.find(c => c.coll === coll)!.path
        const base = mapModel(ind, cov, values.get(path)!, { coll, color: null, t: null, method: null, cls: null })
        for (const color of base.modes) {
          const m = mapModel(ind, cov, values.get(path)!, { coll, color, t: null, method: null, cls: null })
          expect(m.color, `${ind.id} ${color}`).toBe(color)
          expect(m.pending, `${ind.id} ${color}`).toBe(false)
          expect(m.legend.length, `${ind.id} ${color}`).toBeGreaterThan(0)
          for (const it of m.items) if (it.k != null) expect(m.legend[it.k], `${ind.id} ${color} ${it.placeId}`).toBeTruthy()
        }
      }
    }
  }, 120_000)

  it('every group of every indicator reads values files that hold exactly its places with a value, from the merged files', () => {
    let groups = 0
    for (const ind of mappable(manifest.indicators, cov)) {
      for (const group of mapGroups(ind, cov)) {
        const colls = valuesCollsOfGroup(ind, cov, group)
        expect(colls.length, `${ind.id} ${group}`).toBeGreaterThan(0)
        const merged = new Map<string, PlaceRow[]>()
        for (const c of colls) for (const [id, rows] of values.get(ind.collections.find(x => x.coll === c)!.path)!) merged.set(id, [...(merged.get(id) ?? []), ...rows])
        const m = mapModel(ind, cov, merged, { group, color: null, t: null, method: null, cls: null })
        const want = new Set(cov.filter(r => r.indicator === ind.id && (r.place_coll ?? r.coll) === group).map(r => r.place_id))
        expect(new Set(m.items.map(i => i.placeId)), `${ind.id} ${group}`).toEqual(want)
        expect(m.pending, `${ind.id} ${group}`).toBe(false)
        groups++
      }
    }
    expect(groups).toBeGreaterThan(100)
  }, 120_000)
})
