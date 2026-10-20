// the viewer's size budget (README "Size budget"): gzip sizes of the built JS and CSS. raise a budget only with the
// reason written in the README.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = new URL('../viewer/dist/assets/', import.meta.url).pathname
const BUDGET = { jsEntry: 110_000, jsTotal: 200_000, css: 15_000 }   // bytes, gzip

const files = readdirSync(DIST)
const gz = f => gzipSync(readFileSync(join(DIST, f)), { level: 9 }).length
const js = files.filter(f => f.endsWith('.js')).map(f => ({ f, gz: gz(f) }))
const css = files.filter(f => f.endsWith('.css')).map(f => ({ f, gz: gz(f) }))
const entry = js.find(x => x.f.startsWith('index-')) ?? js.sort((a, b) => b.gz - a.gz)[0]
const total = js.reduce((s, x) => s + x.gz, 0)
const cssTotal = css.reduce((s, x) => s + x.gz, 0)
const rows = [
  ['entry JS', entry?.gz ?? 0, BUDGET.jsEntry],
  ['all JS', total, BUDGET.jsTotal],
  ['CSS', cssTotal, BUDGET.css],
]
let over = false
for (const [name, got, max] of rows) {
  const ok = got <= max
  over ||= !ok
  console.log(`${ok ? 'ok  ' : 'OVER'} ${name.padEnd(9)} ${(got / 1000).toFixed(1).padStart(6)} kB gzip (budget ${max / 1000} kB)`)
}
process.exit(over ? 1 : 0)
