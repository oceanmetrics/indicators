// the paper's figure and table of "what is computed where" (PPG-26-197, Phase 7): from the catalog's manifest and
// coverage, one row per indicator series (its lead named, its members counted), one column per place collection.
// a cell says how many of the collection's places have values, the years they span, and whether a status is given.
// colours come from brand/themes/dataviz.css (light), never typed here.
//   node scripts/paper_matrix.mjs [--catalog catalog] [--out docs/paper]
// writes computed_where.csv (one row per indicator × collection), computed_where.svg and computed_where.png (2x)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parquetReadObjects } from 'hyparquet'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const CATALOG = resolve(ROOT, arg('--catalog', 'catalog'))
const OUT = resolve(ROOT, arg('--out', 'docs/paper'))
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

// ---- inputs ----
const manifest = JSON.parse(readFileSync(join(CATALOG, 'indicators.json'), 'utf8'))
const buf = readFileSync(join(CATALOG, 'coverage.parquet'))
const coverage = await parquetReadObjects({ file: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) })

// the light theme's map tokens and the page ink (dataviz.css, oceanmetrics.css): the figure is for print
function tokens(file) {
  const css = readFileSync(join(ROOT, 'brand/themes', file), 'utf8')
  const light = css.slice(0, css.indexOf('[data-theme="dark"]'))
  return Object.fromEntries([...light.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})/g)].map(m => [m[1], m[2]]))
}
const T = { ...tokens('oceanmetrics.css'), ...tokens('dataviz.css') }

// ---- the table: one row per indicator × collection ----
const COLL_TITLES = { places: 'Sanctuaries and other places', mr_eez: 'Exclusive Economic Zones', mr_high_seas: 'High seas' }
const year = d => (d ? String(d).slice(0, 4) : '')
const placesIn = new Map()   // coll -> set of place ids with any coverage row
for (const r of coverage) {
  if (!placesIn.has(r.coll)) placesIn.set(r.coll, new Set())
  placesIn.get(r.coll).add(r.place_id)
}
const colls = [...placesIn.keys()].sort((a, b) => placesIn.get(b).size - placesIn.get(a).size)

const rows = []
for (const ind of manifest.indicators) {
  for (const coll of colls) {
    const mine = coverage.filter(r => r.indicator === ind.id && r.coll === coll)
    if (!mine.length) continue
    const withValue = new Set(mine.filter(r => r.last_value != null).map(r => r.place_id))
    const withStatus = new Set(mine.filter(r => r.status != null).map(r => r.place_id))
    const t0 = mine.map(r => r.t0).filter(Boolean).map(String).sort()[0] ?? ''
    const t1 = mine.map(r => r.t1).filter(Boolean).map(String).sort().at(-1) ?? ''
    rows.push({
      series: ind.series, indicator: ind.id, short: ind.short, lead: ind.lead, producer: ind.producer.name,
      names: ind.category.names ?? '', onms: ind.category.onms ?? '', eov: ind.category.eov ?? '',
      coll, places: placesIn.get(coll).size, with_values: withValue.size, with_status: withStatus.size,
      t0: year(t0), t1: year(t1), status_method: ind.status_method,
    })
  }
}
const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s }
const COLS = ['series', 'indicator', 'short', 'lead', 'producer', 'names', 'onms', 'eov', 'coll', 'places', 'with_values', 'with_status', 't0', 't1', 'status_method']
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'computed_where.csv'), [COLS.join(','), ...rows.map(r => COLS.map(c => csvCell(r[c])).join(','))].join('\n') + '\n')

// ---- the figure: series × collections, grouped by NaMES theme ----
const THEMES = manifest.vocabularies.names.terms.map(t => [t.id, t.label])
const series = []
for (const [theme, label] of THEMES) {
  // a series sits under its lead's theme, once
  const leadOf = sid => { const m = manifest.indicators.filter(i => i.series === sid); return m.find(i => i.lead) ?? m[0] }
  const ids = [...new Set(manifest.indicators.map(i => i.series))].filter(sid => leadOf(sid).category.names === theme)
  const list = ids.map(s => {
    const members = manifest.indicators.filter(i => i.series === s)
    const lead = members.find(i => i.lead) ?? members[0]
    const cells = colls.map(coll => {
      const rs = rows.filter(r => r.series === s && r.coll === coll)
      if (!rs.length) return null
      const lr = rs.find(r => r.indicator === lead.id) ?? rs[0]
      return { share: lr.with_values / lr.places, n: lr.with_values, of: lr.places, t0: Math.min(...rs.map(r => +r.t0 || 9999)), t1: Math.max(...rs.map(r => +r.t1 || 0)), status: rs.some(r => r.with_status > 0) }
    })
    return { s, lead, members: members.length, producer: lead.producer.name, cells }
  }).filter(x => x.cells.some(Boolean))
  if (list.length) series.push({ theme: label, list })
}

const W_LABEL = 300, W_CELL = 190, H_ROW = 34, H_HEAD = 64, H_THEME = 30, PAD = 16
const width = PAD * 2 + W_LABEL + colls.length * W_CELL
const nRows = series.reduce((n, g) => n + g.list.length, 0)
const height = PAD * 2 + H_HEAD + series.length * H_THEME + nRows * H_ROW + 56
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
// share of places with values -> one of the five sequential steps
const step = share => T[`map-seq-${Math.min(5, Math.max(1, Math.ceil(share * 5)))}`]
const ink = share => (share > 0.6 ? T['bg-surface'] : T['text-strong'])

let y = PAD
const out = []
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif">`)
out.push(`<rect width="100%" height="100%" fill="${T['bg-surface']}"/>`)
out.push(`<text x="${PAD}" y="${y + 18}" font-size="15" font-weight="600" fill="${T['text-strong']}">What is computed where</text>`)
out.push(`<text x="${PAD}" y="${y + 38}" font-size="11.5" fill="${T['text-body']}">Indicator series (lead, members) by place collection: places with values, years, and • where a status is given. Manifest ${esc(manifest.version)}.</text>`)
colls.forEach((c, k) => {
  const x = PAD + W_LABEL + k * W_CELL
  out.push(`<text x="${x + 8}" y="${y + H_HEAD - 10}" font-size="12" font-weight="600" fill="${T['text-strong']}">${esc(COLL_TITLES[c] ?? c)}</text>`)
  out.push(`<text x="${x + 8}" y="${y + H_HEAD + 4}" font-size="10.5" fill="${T['text-body']}">${placesIn.get(c).size} place${placesIn.get(c).size === 1 ? "" : "s"}</text>`)
})
y += H_HEAD + 12
for (const g of series) {
  out.push(`<text x="${PAD}" y="${y + 20}" font-size="11" font-weight="600" letter-spacing="0.08em" fill="${T['label-color'] ?? T['text-body']}">${esc(g.theme.toUpperCase())}</text>`)
  y += H_THEME
  for (const r of g.list) {
    out.push(`<text x="${PAD}" y="${y + 15}" font-size="12" fill="${T['text-strong']}">${esc(r.lead.short)}${r.members > 1 ? ` <tspan fill="${T['text-body']}">+${r.members - 1}</tspan>` : ''}</text>`)
    out.push(`<text x="${PAD}" y="${y + 28}" font-size="9.5" fill="${T['text-body']}">${esc(r.producer)}</text>`)
    r.cells.forEach((c, k) => {
      const x = PAD + W_LABEL + k * W_CELL
      if (!c) { out.push(`<rect x="${x + 4}" y="${y + 3}" width="${W_CELL - 8}" height="${H_ROW - 6}" rx="4" fill="none" stroke="${T['border-strong']}" stroke-dasharray="3 3"/>`); return }
      out.push(`<rect x="${x + 4}" y="${y + 3}" width="${W_CELL - 8}" height="${H_ROW - 6}" rx="4" fill="${step(c.share)}"/>`)
      out.push(`<text x="${x + 12}" y="${y + 21}" font-size="11" fill="${ink(c.share)}">${c.n}/${c.of}${c.t0 < 9999 ? ` · ${c.t0}–${c.t1}` : ''}${c.status ? ' •' : ''}</text>`)
    })
    y += H_ROW
  }
}
out.push(`<text x="${PAD}" y="${height - PAD - 22}" font-size="10" fill="${T['text-body']}">Fill: share of the collection's places with values (fifths). Dashed: not computed.</text>`)
out.push(`<text x="${PAD}" y="${height - PAD - 8}" font-size="10" fill="${T['text-body']}">Source: the oceanmetrics/indicators catalog; values CC BY 4.0, with the upstream credit in the manifest.</text>`)
out.push('</svg>')
const svg = out.join('\n')
writeFileSync(join(OUT, 'computed_where.svg'), svg)

// ---- PNG at 2x through Chrome ----
try {
  const { default: puppeteer } = await import('puppeteer-core')
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width, height, deviceScaleFactor: 2 } })
  const page = await browser.newPage()
  await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`)
  await page.screenshot({ path: join(OUT, 'computed_where.png'), clip: { x: 0, y: 0, width, height } })
  await browser.close()
} catch (e) {
  console.warn(`no PNG (${e.message}); the SVG and CSV are written`)
}
console.log(`${rows.length} indicator × collection rows, ${nRows} series rows, ${colls.length} collections -> ${OUT}`)
