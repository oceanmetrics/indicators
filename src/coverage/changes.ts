// npm run changes:build -- [catalog] [--prev <published coverage.parquet url or path>] [--published <indicators base url or folder | none>] [--date YYYY-MM-DD]
// the change feed (build week 5, step 1): diffs the built <catalog>/coverage.parquet against the PUBLISHED one (the build
// wipes its folder, so nothing local remembers the last build) with @oceanmetrics/catalog/changes, and writes
//   <catalog>/changes/<date>.json and .parquet   the day's change rows (only when there are any; merged with the day's
//                                                published file, so a re-run on the same day adds only what is new)
//   <catalog>/changes/latest.json                every build: checked_at, the last non-empty file, the last 30 files
//   <catalog>/feeds/{all,coll=<slug>,set=<id>,place=<id>}.xml and feeds/index.json   the Atom feeds over the last 30 files
//                                                (the opening day's `new` rows folded per place: foldOpened)
// every row, latest.json and feeds/index.json are validated against their schemas (@oceanmetrics/catalog/validate)
// before anything is written. scripts/publish_changes.sh uploads them (called by publish_catalog.sh). the pure part,
// changeFiles(), is shared with scripts/backfill_changes.mjs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects, parquetSchema } from 'hyparquet'
import { parquetWriteBuffer } from 'hyparquet-writer'
import { atomFeed, CHANGE_KINDS, countKinds, diffCoverage, feedsFor, feedsIndex, mergeChanges } from '@oceanmetrics/catalog/changes'
import type { ChangeRow, DiffRow, FeedsPlaces } from '@oceanmetrics/catalog/changes'
import type { IndicatorsManifest } from '@oceanmetrics/catalog'
import { validate } from '@oceanmetrics/catalog/validate'

export const PUBLISHED_BASE = 'https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/indicators/'
/** the change files latest.json lists, and the feeds read */
export const RECENT_FILES = 30
/** the coverage columns a diff reads */
export const DIFF_COLUMNS = ['place_id', 'place_name', 'coll', 'place_coll', 'indicator', 'time_grain', 'last_time', 'last_value', 'status_method', 'status'] as const

export interface ChangesLatest {
  date: string | null
  checked_at: string
  manifest_version?: string
  counts: Record<'status' | 'new' | 'period', number>
  hrefs: { json: string | null; parquet: string | null; feeds: string }
  recent: { date: string; href: string; counts: Record<'status' | 'new' | 'period', number> }[]
}

// ---- the pure part ----

/** the places the feeds are for: every place with a coverage row, its name and home collection; the manifest's sets */
export function feedPlaces(rows: Pick<DiffRow, 'place_id' | 'place_name' | 'coll' | 'place_coll'>[], manifest: Pick<IndicatorsManifest, 'place_sets'>): FeedsPlaces {
  const places = new Map<string, { id: string; name: string | null; coll: string }>()
  for (const r of rows) if (!places.has(r.place_id)) places.set(r.place_id, { id: r.place_id, name: r.place_name ?? null, coll: r.place_coll ?? r.coll })
  return { places: [...places.values()], sets: (manifest.place_sets ?? []).map(s => ({ id: s.id, title: s.title, groups: s.groups })) }
}

const PARQUET_COLUMNS: [keyof ChangeRow, 'STRING' | 'DOUBLE'][] = [
  ['seen', 'STRING'], ['place_id', 'STRING'], ['place_name', 'STRING'], ['coll', 'STRING'], ['place_coll', 'STRING'], ['indicator', 'STRING'],
  ['kind', 'STRING'], ['time_grain', 'STRING'], ['from_status', 'STRING'], ['to_status', 'STRING'], ['from_time', 'STRING'], ['to_time', 'STRING'],
  ['value', 'DOUBLE'], ['unit', 'STRING'], ['sentence', 'STRING'],
]

/** a change file as Parquet (the same rows as the JSON, for analysis) */
export function changesParquet(rows: ChangeRow[], meta: Record<string, string>): Uint8Array {
  return new Uint8Array(parquetWriteBuffer({
    columnData: PARQUET_COLUMNS.map(([name, type]) => ({ name, type, data: rows.map(r => (r[name] ?? null)) as never })),
    kvMetadata: Object.entries(meta).map(([key, value]) => ({ key, value })),
  }))
}

/**
 * the day the catalog opened: its first full build made every cell `new` (16,871 rows on 2026-10-20). in the feeds only,
 * that day's `new` rows fold to one entry per place and values collection ("catalog opened"), so a place's feed opens
 * with one line instead of dozens; the change file (json and parquet) keeps every row.
 */
export const CATALOG_OPENED = '2026-10-20'

/** the feed rows: the opening day's `new` rows folded per place (an entry with no indicator links the place's view) */
export function foldOpened(rows: ChangeRow[], opened = CATALOG_OPENED): ChangeRow[] {
  const folds = new Map<string, ChangeRow[]>()
  const out: (ChangeRow | string)[] = []
  for (const r of rows) {
    if (r.seen !== opened || r.kind !== 'new') { out.push(r); continue }
    const k = `${r.place_id}\u0000${r.coll}`
    if (!folds.has(k)) { folds.set(k, []); out.push(k) }
    folds.get(k)!.push(r)
  }
  return out.map(x => {
    if (typeof x !== 'string') return x
    const rs = folds.get(x)!
    const n = new Set(rs.map(r => r.indicator)).size
    return {
      ...rs[0], indicator: '', value: null, unit: null,
      sentence: `Catalog opened: ${n} indicator${n === 1 ? '' : 's'} in ${rs[0].place_name || rs[0].place_id} ${n === 1 ? 'has its' : 'have their'} first values (the first full build, ${opened}).`,
    }
  })
}

const fail = (what: string, errors: string[]) => { if (errors.length) throw new Error(`${what} does not validate: ${errors.slice(0, 5).join('; ')}`) }

export interface ChangeFilesOptions {
  /** every known change file, date -> rows (the published recent ones and the new ones) */
  days: Map<string, ChangeRow[]>
  /** the dates whose change files are written (the others are already published) */
  write: string[]
  manifest: Pick<IndicatorsManifest, 'version' | 'indicators' | 'place_sets'>
  places: FeedsPlaces
  /** this build's time, RFC 3339 */
  checkedAt: string
}

/** the files of a build, path under the catalog -> content: the change files to write, latest.json and the feeds */
export function changeFiles(o: ChangeFilesOptions): Map<string, string | Uint8Array> {
  const out = new Map<string, string | Uint8Array>()
  const dates = [...o.days.keys()].filter(d => o.days.get(d)!.length).sort().reverse().slice(0, RECENT_FILES)
  for (const d of o.write) {
    const rows = o.days.get(d) ?? []
    if (!rows.length) continue
    rows.forEach((r, i) => fail(`changes/${d}.json row ${i}`, validate('changes-row', r).errors))
    out.set(`changes/${d}.json`, JSON.stringify(rows) + '\n')
    out.set(`changes/${d}.parquet`, changesParquet(rows, { 'om:manifest_version': o.manifest.version, 'om:schema': 'https://oceanmetrics.io/schemas/changes-row/v1.0.0/schema.json' }))
  }
  const zero = Object.fromEntries(CHANGE_KINDS.map(k => [k, 0])) as ChangesLatest['counts']
  const last = dates[0] ?? null
  const latest: ChangesLatest = {
    date: last, checked_at: o.checkedAt, manifest_version: o.manifest.version,
    counts: last ? countKinds(o.days.get(last)!) : zero,
    hrefs: { json: last ? `changes/${last}.json` : null, parquet: last ? `changes/${last}.parquet` : null, feeds: 'feeds/index.json' },
    recent: dates.map(d => ({ date: d, href: `changes/${d}.json`, counts: countKinds(o.days.get(d)!) })),
  }
  fail('changes/latest.json', validate('changes-latest', latest).errors)
  // the feeds read the recent files, newest first
  const rows = foldOpened(dates.flatMap(d => o.days.get(d)!))
  const feeds = feedsFor(rows, o.places)
  const newest = (rs: ChangeRow[]) => rs.reduce<string | null>((m, r) => (m == null || r.seen > m ? r.seen : m), null)
  const allNewest = newest(rows)
  for (const f of feeds) {
    const n = newest(f.rows) ?? allNewest
    out.set(`feeds/${f.file}`, atomFeed(f.rows, {
      title: f.title, id: f.feedId, link: f.link, self: f.href, updated: n ? `${n}T00:00:00Z` : o.checkedAt,
      subtitle: f.rows.length ? undefined : 'No change seen yet.',
    }))
  }
  const index = feedsIndex(feeds, o.checkedAt)
  fail('feeds/index.json', validate('feeds-index', index).errors)
  out.set('feeds/index.json', JSON.stringify(index) + '\n')
  out.set('changes/latest.json', JSON.stringify(latest, null, 2) + '\n')
  return out
}

/** the day's rows: the published file of the day merged with the new diff (a re-run adds only what is new) */
export function dayRows(prev: DiffRow[], next: DiffRow[], date: string, manifest: Pick<IndicatorsManifest, 'indicators'>, published: ChangeRow[] = []): ChangeRow[] {
  return mergeChanges(published, diffCoverage(prev, next, { seen: date, manifest }))
}

// ---- reading ----

const isoDate = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v))

/** the diff's columns of a coverage table; an old one without `place_name` or `place_coll` (before 2026-10-20 07:03) reads them as absent */
export async function readCoverage(src: string | ArrayBuffer): Promise<DiffRow[]> {
  const file = typeof src === 'string' ? await asyncBufferFromFile(src) : src
  const metadata = await parquetMetadataAsync(file)
  const have = new Set(parquetSchema(metadata).children.map(c => c.element.name))
  const rows = (await parquetReadObjects({ file, metadata, columns: DIFF_COLUMNS.filter(c => have.has(c)) })) as Record<string, unknown>[]
  return rows.map(r => ({ ...(r as unknown as DiffRow), last_time: isoDate(r.last_time), last_value: r.last_value == null ? null : Number(r.last_value) }))
}

async function fetchOk(url: string): Promise<Response | null> {
  const res = await fetch(url)
  if (res.status === 404 || res.status === 403) return null   // S3 answers 403 for a missing key without list rights
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res
}

/** the published latest.json and its recent change files (date -> rows), from a url or a local folder; empty for `none` */
export async function readPublished(base: string): Promise<{ latest: ChangesLatest | null; days: Map<string, ChangeRow[]> }> {
  const days = new Map<string, ChangeRow[]>()
  if (base === 'none') return { latest: null, days }
  const b = base.endsWith('/') ? base : base + '/'
  const json = async (p: string): Promise<unknown> => {
    if (!/^https?:/.test(b)) return existsSync(b + p) ? JSON.parse(readFileSync(b + p, 'utf8')) : null
    const res = await fetchOk(b + p)
    return res ? res.json() : null
  }
  const latest = (await json('changes/latest.json')) as ChangesLatest | null
  for (const f of latest?.recent ?? []) {
    const rows = (await json(f.href)) as ChangeRow[] | null
    if (rows) days.set(f.date, rows)
  }
  return { latest, days }
}

// ---- the CLI ----

export interface RunOptions { catalog: string; prev: string; published: string; date: string; checkedAt: string }

export async function run(o: RunOptions): Promise<{ files: string[]; rows: ChangeRow[] }> {
  const manifest = JSON.parse(readFileSync(join(o.catalog, 'indicators.json'), 'utf8')) as IndicatorsManifest
  const next = await readCoverage(join(o.catalog, 'coverage.parquet'))
  let prev: DiffRow[]
  if (/^https?:/.test(o.prev)) {
    const res = await fetchOk(o.prev)
    if (!res) throw new Error(`no published coverage at ${o.prev}: nothing to diff against (a first build writes no change file)`)
    prev = await readCoverage(await res.arrayBuffer())
  } else prev = await readCoverage(o.prev)
  const { days } = await readPublished(o.published)
  const rows = dayRows(prev, next, o.date, manifest, days.get(o.date))
  days.set(o.date, rows)
  const files = changeFiles({ days, write: [o.date], manifest, places: feedPlaces(next, manifest), checkedAt: o.checkedAt })
  for (const [p, content] of files) {
    const path = join(o.catalog, p)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  return { files: [...files.keys()], rows }
}

async function main() {
  const args = process.argv.slice(2)
  const flag = (k: string, d: string) => { const at = args.indexOf(k); return at >= 0 ? args[at + 1] : d }
  const catalog = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? 'catalog'
  const published = flag('--published', PUBLISHED_BASE)
  const now = new Date()
  const { files, rows } = await run({
    catalog, published, prev: flag('--prev', `${published === 'none' ? PUBLISHED_BASE : published.replace(/\/?$/, '/')}coverage.parquet`),
    date: flag('--date', now.toISOString().slice(0, 10)), checkedAt: now.toISOString().slice(0, 19) + 'Z',
  })
  const c = countKinds(rows)
  console.log(`changes: ${rows.length} rows today (status ${c.status}, new ${c.new}, period ${c.period}); ${files.filter(f => f.startsWith('feeds/')).length - 1} feeds -> ${catalog}/changes, ${catalog}/feeds`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1) })
}
