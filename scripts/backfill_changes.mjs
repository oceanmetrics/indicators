// the change files of the past, from the bucket's object versions (build week 5, step 1): oceanmetrics.io-public has
// versioning on, so every published coverage.parquet is still there. each consecutive pair of versions is diffed with
// the same diffCoverage the daily build runs (src/coverage/changes.ts), the change rows of a date (the newer version's
// LastModified, UTC) merged into one file, and the files written as a build would write them (changeFiles: the change
// files, latest.json, the Atom feeds and their index), into <out>/changes/ and <out>/feeds/. a daily step that failed
// is recovered the same way. uses the host's AWS profile; nothing is uploaded unless --publish.
//   node --experimental-strip-types scripts/backfill_changes.mjs [out] [--manifest <indicators.json path or url>] [--publish | --dry-run]
// --publish (or --dry-run) then runs scripts/publish_changes.sh <out>.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { countKinds } from '@oceanmetrics/catalog/changes'
import { changeFiles, dayRows, feedPlaces, PUBLISHED_BASE, readCoverage } from '../src/coverage/changes.ts'

const BUCKET = process.env.INDICATORS_BUCKET_NAME ?? 'oceanmetrics.io-public'
const KEY = 'indicators/coverage.parquet'
const CACHE = 'cache/coverage-versions'

const args = process.argv.slice(2)
const flag = (k, d) => { const at = args.indexOf(k); return at >= 0 ? args[at + 1] : d }
const out = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? 'catalog-backfill'
const aws = (...a) => execFileSync('aws', a, { encoding: 'utf8', maxBuffer: 64 << 20 })

// ---- the versions, oldest first ----
const listed = JSON.parse(aws('s3api', 'list-object-versions', '--bucket', BUCKET, '--prefix', KEY, '--output', 'json'))
const versions = (listed.Versions ?? []).filter(v => v.Key === KEY).sort((a, b) => a.LastModified.localeCompare(b.LastModified))
if (versions.length < 2) throw new Error(`${versions.length} version(s) of s3://${BUCKET}/${KEY}: nothing to diff`)
mkdirSync(CACHE, { recursive: true })
const local = v => {
  const path = join(CACHE, `${v.VersionId.replace(/[^A-Za-z0-9_-]/g, '_')}.parquet`)
  if (!existsSync(path)) aws('s3api', 'get-object', '--bucket', BUCKET, '--key', KEY, '--version-id', v.VersionId, path)
  return path
}

// ---- the manifest: the sentences' titles and units, the place sets ----
const src = flag('--manifest', `${PUBLISHED_BASE}indicators.json`)
const manifest = /^https?:/.test(src) ? await (await fetch(src)).json() : JSON.parse(readFileSync(src, 'utf8'))

// ---- the pairs ----
const days = new Map()
let prev = await readCoverage(local(versions[0]))
let next = prev
for (let i = 1; i < versions.length; i++) {
  next = await readCoverage(local(versions[i]))
  const date = new Date(versions[i].LastModified).toISOString().slice(0, 10)
  const rows = dayRows(prev, next, date, manifest, days.get(date))
  const c = countKinds(rows.slice((days.get(date) ?? []).length))
  console.log(`${versions[i - 1].LastModified} -> ${versions[i].LastModified}: new ${c.new}, status ${c.status}, period ${c.period}`)
  days.set(date, rows)
  prev = next
}

const checkedAt = new Date().toISOString().slice(0, 19) + 'Z'
const files = changeFiles({ days, write: [...days.keys()], manifest, places: feedPlaces(next, manifest), checkedAt })
for (const [p, content] of files) {
  mkdirSync(dirname(join(out, p)), { recursive: true })
  writeFileSync(join(out, p), content)
}
for (const [d, rows] of [...days].sort()) {
  const c = countKinds(rows)
  console.log(`changes/${d}: ${rows.length} rows (new ${c.new}, status ${c.status}, period ${c.period})${rows.length ? '' : ', no file'}`)
}
console.log(`${files.size} files -> ${out}/ (${[...files.keys()].filter(f => f.startsWith('feeds/')).length - 1} feeds)`)

if (args.includes('--publish') || args.includes('--dry-run')) {
  execFileSync('scripts/publish_changes.sh', [out, ...(args.includes('--dry-run') ? ['--dry-run'] : [])], { stdio: 'inherit' })
}
