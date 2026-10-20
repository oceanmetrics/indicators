// the viewer's size budget (README "Size budget"): gzip sizes of the built JS and CSS. raise a budget only with the
// reason written in the README. the Map view's chunk and the shared MapCanvas chunk (MapLibre, pmtiles and the map components, with MapLibre's own
// stylesheet) is loaded only when the Map is opened, so it has its own budget and the rest of the app keeps its own.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = new URL('../viewer/dist/assets/', import.meta.url).pathname
// cssReport is the Report view's own lazy styles (its layouts and the two maps it holds), budgeted apart so the rest keeps its 15 kB
const BUDGET = { jsEntry: 110_000, jsRest: 200_000, jsMap: 330_000, css: 15_000, cssMap: 15_000, cssReport: 8_000 }   // bytes, gzip

const files = readdirSync(DIST)
const gz = f => gzipSync(readFileSync(join(DIST, f)), { level: 9 }).length
// MapCanvas is shared by the Map view and the report's two maps (the locator and the Map sheet), so MapLibre sits in its own chunk;
// MapTable is the Map view's table, which the Map sheet shows too
const isMap = f => f.startsWith('MapView-') || f.startsWith('MapCanvas-') || f.startsWith('MapTable-')
const isReport = f => ['ReportView-', 'LocatorMap-', 'MapSheet-', 'PrintableMap-'].some(p => f.startsWith(p))
const js = files.filter(f => f.endsWith('.js')).map(f => ({ f, gz: gz(f) }))
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
  ['JS but map', sum(js.filter(x => !isMap(x.f))), BUDGET.jsRest],
  ['map JS', sum(js.filter(x => isMap(x.f))), BUDGET.jsMap],
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
process.exit(over ? 1 : 0)
