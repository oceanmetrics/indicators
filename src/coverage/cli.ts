// npm run coverage:build -- [catalog] [--gazetteer-index <places_index.parquet path or URL | none>] [--layers <layers.json path or URL | none>]
// reads <catalog>/indicators.json and every values file it lists, writes <catalog>/coverage.parquet.
// the gazetteer index gives each place's name (for the status sentences) and its home collection (`place_coll`: the
// first of its collections in layers.json order); both files are cached under cache/gazetteer/ for a day. `none`, or
// OM_OFFLINE=1 without a cached copy, builds without them: names are place ids and `place_coll` is the values `coll`.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet'
import { parquetWriteBuffer } from 'hyparquet-writer'
import { coverageOf, placeHomes } from './build.ts'
import type { CoverageRow, IndexEntry, ManifestIndicator, ValueRow } from './build.ts'

const INDEX_URL = 'https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/index/places_index.parquet'
const LAYERS_URL = 'https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/index/layers.json'
const CACHE_DIR = 'cache/gazetteer'
const DAY_MS = 24 * 3600 * 1000

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

/** a local path for a file or URL: a URL is fetched into the cache (refreshed after a day); `null` for `none` or offline */
async function localCopy(src: string, cacheName: string): Promise<string | null> {
  if (src === 'none') return null
  if (!/^https?:/.test(src)) return src
  const path = join(CACHE_DIR, cacheName)
  const fresh = existsSync(path) && Date.now() - statSync(path).mtimeMs < DAY_MS
  if (fresh) return path
  if (process.env.OM_OFFLINE === '1') return existsSync(path) ? path : null
  const res = await fetch(src)
  if (!res.ok) throw new Error(`${cacheName}: ${res.status} ${src}`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  return path
}

export interface Gazetteer {
  names: Map<string, string>
  /** place_id -> home collection; null without an index */
  homes: Map<string, string> | null
}

/** the collections in layers.json order (`collection`, else `slug`) */
export function layerOrder(json: unknown): string[] {
  const layers = (json as { layers?: { slug?: string; collection?: string }[] } | null)?.layers
  return Array.isArray(layers) ? layers.map(l => l.collection ?? l.slug ?? '').filter(Boolean) : []
}

export async function readGazetteer(index: string, layers: string): Promise<Gazetteer> {
  const path = await localCopy(index, 'places_index.parquet')
  if (!path) return { names: new Map(), homes: null }
  const rows = (await parquetReadObjects({ file: await asyncBufferFromFile(path), columns: ['place_id', 'name', 'collection'] })) as (IndexEntry & { name: string })[]
  const lpath = await localCopy(layers, 'layers.json')
  const order = lpath ? layerOrder(JSON.parse(readFileSync(lpath, 'utf8'))) : []
  return { names: new Map(rows.map(r => [r.place_id, r.name])), homes: placeHomes(rows, order) }
}

const COLUMNS: [keyof CoverageRow, 'STRING' | 'DOUBLE' | 'INT32' | 'JSON'][] = [
  ['place_id', 'STRING'], ['place_name', 'STRING'], ['coll', 'STRING'], ['place_coll', 'STRING'], ['indicator', 'STRING'], ['time_grain', 'STRING'],
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
  const flag = (k: string, d: string) => { const at = args.indexOf(k); return at >= 0 ? args[at + 1] : d }
  const index = flag('--gazetteer-index', flag('--index', INDEX_URL))
  const layers = flag('--layers', LAYERS_URL)
  const catalog = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? 'catalog'
  const manifest = JSON.parse(readFileSync(join(catalog, 'indicators.json'), 'utf8'))
  const { names, homes } = await readGazetteer(index, layers)
  const all: CoverageRow[] = []
  for (const ind of manifest.indicators as ManifestIndicator[]) {
    for (const c of ind.collections) all.push(...coverageOf(await readValues(join(catalog, c.path)), ind, names, homes))
  }
  const buf = coverageParquet(all, { 'om:manifest_version': manifest.version, 'om:created': new Date().toISOString().slice(0, 19) + 'Z' })
  writeFileSync(join(catalog, 'coverage.parquet'), Buffer.from(buf))
  const withStatus = all.filter(r => r.status != null).length
  console.log(`coverage: ${all.length} rows (${withStatus} with a status) -> ${join(catalog, 'coverage.parquet')} (${(buf.byteLength / 1024).toFixed(0)} kB)`)
  const byHome = new Map<string, Set<string>>()
  for (const r of all) byHome.set(r.place_coll ?? r.coll, (byHome.get(r.place_coll ?? r.coll) ?? new Set()).add(r.place_id))
  console.log('places by home collection: ' + [...byHome].map(([c, ps]) => `${c} ${ps.size}`).join(', ') + (homes ? '' : ' (no gazetteer index: the values collection)'))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1) })
}
