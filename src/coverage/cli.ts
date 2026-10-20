// npm run coverage:build -- [catalog] [--index <places_index.parquet path or URL>]
// reads <catalog>/indicators.json and every values file it lists, writes <catalog>/coverage.parquet.
// place names (for the status sentences) come from the gazetteer index, cached under cache/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet'
import { parquetWriteBuffer } from 'hyparquet-writer'
import { coverageOf } from './build.ts'
import type { CoverageRow, ManifestIndicator, ValueRow } from './build.ts'

const INDEX_URL = 'https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/index/places_index.parquet'
const INDEX_CACHE = 'cache/gazetteer/places_index.parquet'

const isoDate = (v: unknown): string | null => {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

export async function readValues(path: string): Promise<ValueRow[]> {
  const file = await asyncBufferFromFile(path)
  const rows = (await parquetReadObjects({ file })) as Record<string, unknown>[]
  return rows.map(r => ({ ...(r as unknown as ValueRow), time: isoDate(r.time), n: r.n == null ? null : Number(r.n) }))
}

async function placeNames(index: string): Promise<Map<string, string>> {
  let path = index
  if (/^https?:/.test(index)) {
    path = INDEX_CACHE
    if (!existsSync(path)) {
      const res = await fetch(index)
      if (!res.ok) throw new Error(`places index: ${res.status} ${index}`)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, Buffer.from(await res.arrayBuffer()))
    }
  }
  const rows = (await parquetReadObjects({ file: await asyncBufferFromFile(path), columns: ['place_id', 'name'] })) as { place_id: string; name: string }[]
  return new Map(rows.map(r => [r.place_id, r.name]))
}

const COLUMNS: [keyof CoverageRow, 'STRING' | 'DOUBLE' | 'INT32' | 'JSON'][] = [
  ['place_id', 'STRING'], ['place_name', 'STRING'], ['coll', 'STRING'], ['indicator', 'STRING'], ['time_grain', 'STRING'],
  ['t0', 'STRING'], ['t1', 'STRING'], ['n_periods', 'INT32'], ['last_time', 'STRING'], ['last_value', 'DOUBLE'],
  ['last_class', 'STRING'], ['status_method', 'STRING'], ['status', 'STRING'], ['trend', 'STRING'],
  ['recent_mean', 'DOUBLE'], ['recent_from', 'STRING'], ['recent_to', 'STRING'], ['lt_mean', 'DOUBLE'],
  ['lt_sd', 'DOUBLE'], ['why', 'STRING'], ['sentence', 'STRING'], ['spark', 'JSON'],
]

export function coverageParquet(rows: CoverageRow[], meta: Record<string, string>): ArrayBuffer {
  return parquetWriteBuffer({
    columnData: COLUMNS.map(([name, type]) => ({ name, type, data: rows.map(r => r[name]) as never })),
    kvMetadata: Object.entries(meta).map(([key, value]) => ({ key, value })),
  })
}

async function main() {
  const args = process.argv.slice(2)
  const at = args.indexOf('--index')
  const index = at >= 0 ? args[at + 1] : INDEX_URL
  const catalog = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--index') ?? 'catalog'
  const manifest = JSON.parse(readFileSync(join(catalog, 'indicators.json'), 'utf8'))
  const names = await placeNames(index)
  const all: CoverageRow[] = []
  for (const ind of manifest.indicators as ManifestIndicator[]) {
    for (const c of ind.collections) all.push(...coverageOf(await readValues(join(catalog, c.path)), ind, names))
  }
  const buf = coverageParquet(all, { 'om:manifest_version': manifest.version, 'om:created': new Date().toISOString().slice(0, 19) + 'Z' })
  writeFileSync(join(catalog, 'coverage.parquet'), Buffer.from(buf))
  const withStatus = all.filter(r => r.status != null).length
  console.log(`coverage: ${all.length} rows (${withStatus} with a status) -> ${join(catalog, 'coverage.parquet')} (${(buf.byteLength / 1024).toFixed(0)} kB)`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1) })
}
