// the viewer's size budget (README "Size budget"): gzip sizes of the built JS and CSS. raise a budget only with the
// reason written in the README. the Map view's chunk and the shared MapCanvas chunk (MapLibre, pmtiles and the map components, with MapLibre's own
// stylesheet) is loaded only when the Map is opened, so it has its own budget and the rest of the app keeps its own. the
// lazy engine chunk (gridSource.ts: @oceanmetrics/engine, Apache Arrow, the mask, the GeoParquet codecs; loaded when a
// grid slot asks for its first slice) has its own line too. outside every line, and printed: DuckDB-WASM's worker scripts
// and wasm (fetched by the engine's worker), the workers (.mjs), and the map package's COG protocol chunks (on the first
// cog:// request, which no kind registered here makes). chunks are told apart by Vite's manifest (build.manifest): a
// chunk belongs to a lazy root when only that root's static imports reach it.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = new URL('../viewer/dist/assets/', import.meta.url).pathname
// cssReport is the Report view's own lazy styles (its layouts and the two maps it holds), budgeted apart so the rest keeps its 15 kB
// jsRest was 200 kB until 2026-10-23: raised to 205 kB for the shared card rules of @oceanmetrics/catalog and the Matrix's summary, sorts,
// fold and pager (README "Size budget")
const BUDGET = { jsEntry: 110_000, jsRest: 205_000, jsMap: 330_000, jsEngine: 160_000, css: 15_000, cssMap: 15_000, cssReport: 8_000 }   // bytes, gzip

const files = readdirSync(DIST)
const manifest = JSON.parse(readFileSync(join(DIST, '..', '.vite', 'manifest.json'), 'utf8'))
const fileOf = k => manifest[k].file.replace(/^assets\//, '')
// the static closure of a manifest key (its chunk and everything it imports, not what it import()s)
const closure = (k, seen = new Set()) => { if (seen.has(k) || !manifest[k]) return seen; seen.add(k); for (const i of manifest[k].imports ?? []) closure(i, seen); return seen }
const roots = Object.keys(manifest).filter(k => manifest[k].isEntry || manifest[k].isDynamicEntry)
const reachedBy = new Map()   // file -> the roots whose static closure holds it
for (const r of roots) for (const k of closure(r)) { const f = fileOf(k); reachedBy.set(f, [...(reachedBy.get(f) ?? []), r]) }
const onlyFrom = test => f => { const rs = reachedBy.get(f) ?? []; return rs.length > 0 && rs.every(test) }
const isEngine = onlyFrom(r => r.endsWith('src/lib/map/gridSource.ts'))
const isCog = onlyFrom(r => /maplibre-cog-protocol|geotiff/.test(r))
const isDuck = f => f.startsWith('duckdb-')
const gz = f => gzipSync(readFileSync(join(DIST, f)), { level: 9 }).length
// MapCanvas is shared by the Map view and the report's two maps (the locator and the Map sheet), so MapLibre sits in its own chunk;
// MapTable is the Map view's table, which the Map sheet shows too
const isMap = f => f.startsWith('MapView-') || f.startsWith('MapCanvas-') || f.startsWith('MapTable-')
const isReport = f => ['ReportView-', 'LocatorMap-', 'MapSheet-', 'PrintableMap-'].some(p => f.startsWith(p))
const all = files.filter(f => f.endsWith('.js')).map(f => ({ f, gz: gz(f) }))
const outside = all.filter(x => isDuck(x.f) || isCog(x.f))
const js = all.filter(x => !outside.includes(x))
const css = files.filter(f => f.endsWith('.css')).map(f => ({ f, gz: gz(f) }))
const sum = xs => xs.reduce((s, x) => s + x.gz, 0)
// the entry is what index.html loads up front: its module script and its modulepreloads (the viewer has two pages, the
// app and embed/, so Vite splits what they share into chunks of their own). any base: ./assets/ or /indicators/assets/
const html = readFileSync(join(DIST, '..', 'index.html'), 'utf8')
const upfront = new Set([...html.matchAll(/(?:src|href)="[^"]*\/assets\/([^"\/]+\.js)"/g)].map(m => m[1]))
if (!upfront.size) throw new Error('size budget: found no script in viewer/dist/index.html')
const entry = { gz: sum(js.filter(x => upfront.has(x.f))) }
const rows = [
  ['entry JS', entry?.gz ?? 0, BUDGET.jsEntry],
  ['JS but map', sum(js.filter(x => !isMap(x.f) && !isEngine(x.f))), BUDGET.jsRest],
  ['map JS', sum(js.filter(x => isMap(x.f))), BUDGET.jsMap],
  ['engine JS', sum(js.filter(x => isEngine(x.f))), BUDGET.jsEngine],
  ['CSS but map', sum(css.filter(x => !isMap(x.f) && !isReport(x.f))), BUDGET.css],
  ['report CSS', sum(css.filter(x => isReport(x.f))), BUDGET.cssReport],
  ['map CSS', sum(css.filter(x => isMap(x.f))), BUDGET.cssMap],
]
let over = false
for (const [name, got, max] of rows) {
  const ok = got <= max
  over ||= !ok
  console.log(`${ok ? 'ok  ' : 'OVER'} ${name.padEnd(12)} ${(got / 1000).toFixed(1).padStart(6)} kB gzip (budget ${max / 1000} kB)`)
}
// outside every line: what loads only on demand, or in a worker
const kb = n => `${(n / 1000).toFixed(1)} kB`
const raw = f => statSync(join(DIST, f)).size
const wasm = files.filter(f => f.endsWith('.wasm'))
const workers = files.filter(f => f.endsWith('.mjs'))
console.log(`     (not budgeted) DuckDB-WASM workers ${kb(sum(outside.filter(x => isDuck(x.f))))} gzip, wasm ${wasm.map(f => `${f.split('-')[0] + '-' + f.split('-')[1]} ${kb(gz(f))}`).join(', ')} gzip; ` +
  `workers (.mjs) ${kb(workers.reduce((s, f) => s + gz(f), 0))}; COG protocol chunks ${kb(sum(outside.filter(x => isCog(x.f))))} (never requested: no cog slot); raw wasm ${kb(wasm.reduce((s, f) => s + raw(f), 0))}`)
process.exit(over ? 1 : 0)
