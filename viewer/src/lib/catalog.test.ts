// the real catalog, when it has been built (catalog/ is git-ignored): every coverage indicator is in the manifest and
// every cell of the default matrix resolves to a state. skipped on a fresh clone.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parquetReadObjects } from 'hyparquet'
import { describe, expect, it } from 'vitest'
import { normalizeRow } from './data.ts'
import type { Manifest } from './data.ts'
import { cellAria, cellModel, groupColumns, indexCoverage, pickRow, selectionRollups, selectionRows } from './matrix.ts'
import { VOCAB_IDS } from './data.ts'

const DIR = resolve(__dirname, '../../../catalog')
const have = existsSync(resolve(DIR, 'indicators.json')) && existsSync(resolve(DIR, 'coverage.parquet'))

// a skipped describe still runs its body to collect the tests: read nothing unless the catalog is there (CI has none)
describe.skipIf(!have)('the real catalog', async () => {
  const manifest = (have ? JSON.parse(readFileSync(resolve(DIR, 'indicators.json'), 'utf8')) : { indicators: [] }) as Manifest
  const buf = have ? readFileSync(resolve(DIR, 'coverage.parquet')) : null
  const rows = buf ? (await parquetReadObjects({ file: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer })).map(normalizeRow) : []
  const idx = indexCoverage(rows)
  const ids = new Set(manifest.indicators.map(i => i.id))

  it('every coverage indicator is in the manifest', () => {
    expect([...new Set(rows.map(r => r.indicator))].filter(i => !ids.has(i))).toEqual([])
  })
  it('every collection with coverage is listed by some indicator', () => {
    const listed = new Set(manifest.indicators.flatMap(i => i.collections.map(c => c.coll)))
    expect(idx.colls.filter(c => !listed.has(c))).toEqual([])
  })
  it('every category tag of every indicator is a term of its vocabulary', () => {
    for (const ind of manifest.indicators) for (const v of VOCAB_IDS) {
      const tag = ind.category[v]
      if (tag) expect(manifest.vocabularies[v].terms.map(t => t.id), `${ind.id} ${v}`).toContain(tag)
    }
  })
  it('every cell resolves to a state with an accessible name, in every vocabulary, leads or all', () => {
    for (const vocab of VOCAB_IDS) for (const leads of [true, false]) {
      const cols = groupColumns(manifest.indicators.filter(i => !leads || i.lead), manifest.vocabularies, vocab)
      const inds = cols.flatMap(c => c.indicators)
      expect(inds.length).toBe(manifest.indicators.filter(i => !leads || i.lead).length)
      for (const g of selectionRows(idx.places, idx, '')) for (const p of g.places) for (const ind of inds) {
        const m = cellModel(ind, p, pickRow(idx, p.id, ind))
        expect(['value', 'class', 'nodata', 'live', 'na']).toContain(m.kind)
        expect(cellAria(ind, p, m).length).toBeGreaterThan(10)
      }
    }
  }, 60_000)   // 110 indicators × ~300 places × 6 ways (OBIS made it ~10 s)
  it('the summary of every place by the leads has the places and the cells with a status the coverage promises', () => {
    const places = selectionRows(idx.places, idx, '').flatMap(g => g.places)
    const r = selectionRollups(rows, places, manifest.indicators.filter(i => i.lead))
    expect(places.length).toBe(new Set(rows.map(r => r.place_id)).size)
    expect(r.total.above + r.total.within + r.total.below).toBeGreaterThan(0)
    expect(r.total.cells).toBe(r.total.above + r.total.within + r.total.below + r.total.none + r.total.nodata)
  })
})
