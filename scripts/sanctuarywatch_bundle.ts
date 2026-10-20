// the SanctuaryWatch bundle for one place (plan §7, Phase 4): a folder per figure (data.json, settings.json and
// settings.md, captions.md, alt.txt, and with --png the figure.png and figure.svg from the embed route) plus one
// figures.csv for the whole set. the status is assessed exactly as the coverage builder does (src/status), and the
// bundle's text and data come from src/report/sanctuarywatch.ts, which the viewer's Export uses too.
//   node --experimental-strip-types scripts/sanctuarywatch_bundle.ts --place NMS:CINMS [--catalog catalog]
//     [--out <catalog>/sanctuarywatch] [--viewer https://oceanmetrics.io/indicators/] [--png]
// --png opens <viewer>embed/#card=<place>|<indicator>&fig=1 (a still card) headless (the same component the viewer draws) and saves it;
// the daily job runs it so each figure.png keeps a stable URL under indicators/sanctuarywatch/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet'
import { assess } from '../src/status/index.ts'
import type { MethodId, Point } from '../src/status/index.ts'
import { readValues } from '../src/coverage/cli.ts'
import type { ManifestIndicator } from '../src/coverage/build.ts'
import { swFolder } from '../src/report/sanctuarywatch.ts'
import type { SwFigure } from '../src/report/sanctuarywatch.ts'
import { swBundleFiles } from '../src/report/swBundle.ts'
import { configHash, configLines } from '../viewer/src/lib/delivery.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const arg = (k: string, d?: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const PLACE = arg('--place') ?? ''
if (!/^[A-Za-z][A-Za-z0-9_]*:[A-Za-z0-9_.\-]+$/.test(PLACE)) throw new Error(`--place must be a place_id, got ${JSON.stringify(PLACE)}`)
const CATALOG = resolve(ROOT, arg('--catalog', 'catalog') as string)
const PLACE_DIR = swFolder(PLACE, 'x').replace(/__x$/, '')
const OUT = join(resolve(ROOT, arg('--out', join(CATALOG, 'sanctuarywatch')) as string), PLACE_DIR)
const VIEWER = (arg('--viewer', 'https://oceanmetrics.io/indicators/') as string).replace(/\/?$/, '/')
const PUBLIC = 'https://storage.oceanmetrics.io/indicators/sanctuarywatch/'
const IMPLEMENTED = new Set(['iea-sd', 'names-pct', 'values'])

// the light theme's tokens (oceanmetrics.css): the plugin wants colours as hex, chosen here from the theme, not typed
function lightTokens(): Record<string, string> {
  const css = readFileSync(join(ROOT, 'brand/themes/oceanmetrics.css'), 'utf8')
  const light = css.slice(0, css.indexOf('[data-theme="dark"]'))
  return Object.fromEntries([...light.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})/g)].map(m => [m[1], m[2]]))
}
const T = lightTokens()
const COLORS = { line: T['brand'], ref: T['text-body'], window: T['bg-tint'], off: T['text-strong'] }

type Ind = ManifestIndicator & {
  title: string; series: string; lead: boolean; category: Record<string, string>; citation?: string
  method: { summary: string }; dataset: { providers: { name: string; roles: string[]; url?: string }[] }
}
const manifest = JSON.parse(readFileSync(join(CATALOG, 'indicators.json'), 'utf8'))
const onms = new Map<string, string>(manifest.vocabularies.onms.terms.map((t: { id: string; label: string }) => [t.id, t.label]))

// the place's name as coverage carries it (the gazetteer's)
const cov = (await parquetReadObjects({ file: await asyncBufferFromFile(join(CATALOG, 'coverage.parquet')), columns: ['place_id', 'place_name'] })) as { place_id: string; place_name: string }[]
const name = cov.find(r => r.place_id === PLACE)?.place_name ?? PLACE

// one figure per continuous series lead with year values for the place
const figures: SwFigure[] = []
for (const ind of manifest.indicators as Ind[]) {
  if (ind.kind !== 'continuous' || !ind.lead) continue
  for (const c of ind.collections) {
    const rows = (await readValues(join(CATALOG, c.path))).filter(r => r.place_id === PLACE && r.time_grain === 'year')
    const points: Point[] = rows.filter(r => r.time != null).map(r => ({ t: r.time as string, v: r.value })).sort((a, b) => a.t.localeCompare(b.t))
    if (points.filter(p => p.v != null).length === 0) continue
    const method: MethodId = IMPLEMENTED.has(ind.status_method) ? (ind.status_method as MethodId) : 'values'
    const ctx = { title: ind.short, place: name, unit: ind.unit_label ?? '', decimals: ind.decimals ?? 2 }
    const a = assess(points, method, { grain: 'year', recent: ind.recent, minPeriods: ind.min_periods }, ctx)
    const producer = ind.dataset.providers.find(p => p.roles.includes('producer')) ?? ind.dataset.providers[0]
    figures.push({
      indicator: { id: ind.id, title: ind.title, short: ind.short, unit: ind.unit_label ?? '', decimals: ind.decimals ?? 2, citation: ind.citation ?? null, method: ind.method.summary },
      place: { id: PLACE, name },
      points, method, recent: ind.recent, result: a.result, sentence: a.sentence, alt: a.alt,
      program: { title: producer?.name ?? ind.producer.name, url: producer?.url },
      permalink: `${VIEWER}#view=place&place=${PLACE}&coll=${c.coll}&ind=${ind.id}`,
      configHash: configHash(configLines(ind as never, { id: PLACE, name, coll: c.coll }, manifest.version)),
      manifestVersion: manifest.version,
      tab: onms.get(ind.category.onms) ?? '',
      pngUrl: `${PUBLIC}${PLACE_DIR}/${swFolder(PLACE, ind.id)}/figure.png`,
    })
  }
}
if (!figures.length) throw new Error(`no continuous lead indicator has year values for ${PLACE}`)

// ---- files ----
// the text files are src/report/swBundle.ts's, the same ones the viewer's Export menu zips
mkdirSync(OUT, { recursive: true })
for (const f of swBundleFiles(figures, COLORS, 'External')) {
  const file = join(OUT, f.path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, f.text)
}

// ---- figure.png and figure.svg from the embed route ----
if (args.includes('--png')) {
  const { default: puppeteer } = await import('puppeteer-core')
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, defaultViewport: { width: 760, height: 520, deviceScaleFactor: 2 },
  })
  const page = await browser.newPage()
  for (const f of figures) {
    const dir = join(OUT, swFolder(PLACE, f.indicator.id))
    await page.goto('about:blank')
    await page.goto(`${VIEWER}embed/?theme=light#card=${PLACE}|${f.indicator.id}&fig=1`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('[data-state=done]', { timeout: 30000 })
    await (await page.$('[data-state=done]'))!.screenshot({ path: join(dir, 'figure.png') })
    const svg = await page.evaluate(() => document.querySelector('[data-state=done] svg')?.outerHTML ?? '')
    if (svg) writeFileSync(join(dir, 'figure.svg'), svg)
  }
  await browser.close()
}
console.log(`${figures.length} figures for ${name} (${PLACE}) -> ${OUT}`)
