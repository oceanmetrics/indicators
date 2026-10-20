// screenshots of the Matrix with the real catalog: docs/shots/matrix_<brand>_<theme>[_390].png and the drawer.
// headless Chrome through puppeteer-core, against the dev server (started here when nothing answers on the port).
//   node viewer/scripts/shoot.mjs [--url http://localhost:5181/] [--only matrix_mbon_dark]
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(ROOT, 'docs/shots')
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const URL_BASE = arg('--url', 'http://localhost:5181/')
const ONLY = arg('--only', '')

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 2 }
const TALL = { width: 1440, height: 1500, deviceScaleFactor: 2 }
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const FKNMS_SST = 'cell=NMS:FKNMS|erddap:dhw_5km:CRW_SST:mean'

const SHOTS = [
  ['matrix_oceanmetrics_light', 'oceanmetrics', 'light', DESKTOP, ''],
  ['matrix_oceanmetrics_dark', 'oceanmetrics', 'dark', DESKTOP, ''],
  ['matrix_mbon_light', 'mbon', 'light', DESKTOP, ''],
  ['matrix_mbon_dark', 'mbon', 'dark', DESKTOP, ''],
  ['matrix_oceanmetrics_light_390', 'oceanmetrics', 'light', PHONE, ''],
  ['matrix_oceanmetrics_dark_390', 'oceanmetrics', 'dark', PHONE, ''],
  ['drawer_oceanmetrics_light', 'oceanmetrics', 'light', TALL, FKNMS_SST],
  ['drawer_oceanmetrics_dark_dive', 'oceanmetrics', 'dark', TALL, FKNMS_SST + '&depth=dive&vocab=eov'],
  ['drawer_oceanmetrics_dark_390', 'oceanmetrics', 'dark', PHONE, FKNMS_SST],
  ['matrix_oceanmetrics_light_eov_dive', 'oceanmetrics', 'light', DESKTOP, 'vocab=eov&depth=dive'],
]

async function alive(url) { try { return (await fetch(url)).ok } catch { return false } }

let server
if (!(await alive(URL_BASE))) {
  server = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'ignore' })
  for (let i = 0; i < 60 && !(await alive(URL_BASE)); i++) await new Promise(r => setTimeout(r, 500))
}

mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
try {
  for (const [name, brand, theme, vp, hash] of SHOTS) {
    if (ONLY && !name.includes(ONLY)) continue
    const page = await browser.newPage()
    await page.setViewport(vp)
    const errors = []
    page.on('pageerror', e => errors.push(String(e)))
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    await page.goto(`${URL_BASE}?brand=${brand}&theme=${theme}${hash ? '#' + hash : ''}`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('.lens[data-state=done]', { timeout: 30000 })
    await page.evaluate(() => document.fonts.ready)
    await new Promise(r => setTimeout(r, 400))
    await page.screenshot({ path: resolve(OUT, name + '.png'), fullPage: !hash.includes('cell=') })
    // a page-level sideways scroll is a layout bug at any width
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    console.log(name, overflow > 0 ? `PAGE OVERFLOW ${overflow}px` : 'ok', errors.length ? errors : '')
    await page.close()
  }
} finally {
  await browser.close()
  server?.kill()
}
