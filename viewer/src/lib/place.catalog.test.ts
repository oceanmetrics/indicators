// the real catalog, when built (catalog/ is git-ignored; CI has none, so nothing is read unless it is there): for
// every place x indicator with a coverage row at the status grain, the card the Place view builds in the browser from
// the values file reproduces the coverage row's status, trend, sentence and statistics exactly. one assertion per row,
// so a drift names the place and the indicator.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parquetReadObjects } from 'hyparquet'
import { beforeAll, describe, expect, it } from 'vitest'
import { normalizeRow } from './data.ts'
import type { Manifest } from './data.ts'
import { cardModel, groupCards, placeCoverage } from './place.ts'
import { groupByPlace, readValues } from './valuesData.ts'
import type { PlaceRow } from './valuesData.ts'
import type { CoverageRow } from '../../../src/coverage/build.ts'
import { indexCoverage } from './matrix.ts'
import { VOCAB_IDS } from './data.ts'

const DIR = resolve(__dirname, '../../../catalog')
const have = existsSync(resolve(DIR, 'indicators.json')) && existsSync(resolve(DIR, 'coverage.parquet'))
// reading every values file of the real catalog (265 files, 2026-10-20) takes 10–25 s on a busy machine: more than
// vitest's 10 s default for a hook, which failed both catalog tests under load while each passed alone
const CATALOG_LOAD_MS = 60_000
const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

describe.skipIf(!have)('the Place view on the real catalog', () => {
  let manifest: Manifest
  let cov: CoverageRow[] = []
  const values = new Map<string, Map<string, PlaceRow[]>>()

  beforeAll(async () => {
    manifest = JSON.parse(readFileSync(resolve(DIR, 'indicators.json'), 'utf8')) as Manifest
    cov = (await parquetReadObjects({ file: ab(readFileSync(resolve(DIR, 'coverage.parquet'))) })).map(normalizeRow)
    for (const ind of manifest.indicators) for (const c of ind.collections) {
      values.set(c.path, groupByPlace(await readValues(ab(readFileSync(resolve(DIR, c.path))))))
    }
  }, CATALOG_LOAD_MS)

  it('every status-grain coverage row is reproduced: status, trend, sentence and the long-term statistics', () => {
    let checked = 0, withStatus = 0
    for (const r of cov) {
      const ind = manifest.indicators.find(i => i.id === r.indicator)!
      if (r.time_grain !== ind.status_grain || !r.sentence) continue
      const path = ind.collections.find(c => c.coll === r.coll)!.path
      const rows = values.get(path)!.get(r.place_id) ?? []
      const m = cardModel(ind, r.place_name, rows)
      const who = `${r.place_id} ${r.indicator}`
      expect(m.grain, who).toBe(ind.status_grain)
      expect(m.sentence, who).toBe(r.sentence)
      if (ind.kind === 'continuous') {
        expect(m.status, who).toBe(r.status)
        expect(m.trend, who).toBe(r.trend)
        expect(m.result?.ltMean ?? null, who).toBe(r.lt_mean)
        expect(m.result?.ltSd ?? null, who).toBe(r.lt_sd)
        expect(m.result?.recentFrom ?? null, who).toBe(r.recent_from)
        expect(m.result?.recentTo ?? null, who).toBe(r.recent_to)
        expect(m.alt.length, who).toBeGreaterThan(20)
      }
      checked++
      if (r.status) withStatus++
    }
    expect(checked).toBeGreaterThan(100)
    expect(withStatus).toBeGreaterThan(20)
  }, 60_000)   // every status-grain row of the real catalog (17k with OBIS)

  it('FKNMS has a card for every indicator the matrix has a cell for, each with a sentence, in every vocabulary', () => {
    const { place, rows } = placeCoverage(cov, 'NMS:FKNMS')
    expect(place?.name).toContain('Florida Keys')
    const idx = indexCoverage(rows)
    const covered = manifest.indicators.filter(i => idx.rows.has(`${place!.id}\u0000${i.id}`))
    expect(covered.length).toBeGreaterThanOrEqual(15)
    for (const v of VOCAB_IDS) {
      const groups = groupCards(covered, manifest.vocabularies, v)
      const shown = groups.flatMap(g => g.series.flatMap(s => [s.lead, ...s.more]))
      expect(shown.map(i => i.id).sort(), v).toEqual(covered.map(i => i.id).sort())
    }
    for (const ind of covered) {
      const path = ind.collections.find(c => c.coll === place!.coll)!.path
      const m = cardModel(ind, place!.name, values.get(path)!.get(place!.id) ?? [])
      expect(m.sentence.length, ind.id).toBeGreaterThan(10)
      expect(m.kind, ind.id).not.toBe('empty')
    }
  })
})
