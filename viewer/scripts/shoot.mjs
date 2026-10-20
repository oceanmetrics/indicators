// screenshots of the Matrix, the Place view and the Map view with the real catalog: docs/shots/matrix_<brand>_<theme>[_390].png,
// the flipped matrix (matrix_*_flipped*), the Add or restore menu (matrix_*_addmenu), the drawer,
// place_<place>_<brand>_<theme>[_390].png and map_<indicator>_<color>_<theme>[_390].png.
// headless Chrome through puppeteer-core, against the dev server (started here when nothing answers on the port).
//   node viewer/scripts/shoot.mjs [--url http://localhost:5181/] [--only matrix_mbon_dark] [--out docs/shots/live]
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(ROOT, process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'docs/shots')
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const URL_BASE = arg('--url', 'http://localhost:5181/')
const ONLY = arg('--only', '')

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 2 }
const TALL = { width: 1440, height: 1500, deviceScaleFactor: 2 }
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
// the Place view is long: shoot its top (the header, the controls and the first cards), not the whole page
const PLACE = { width: 1440, height: 1800, deviceScaleFactor: 2 }
const PLACE_PHONE = { width: 390, height: 2000, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
// the Map view: shot when the map container says data-state=done (the map is idle with the data layer on it)
const MAP = { width: 1440, height: 1500, deviceScaleFactor: 2 }
const MAP_PHONE = { width: 390, height: 2400, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const SST = 'view=map&ind=erddap:dhw_5km:CRW_SST:mean&coll=places'
const MPA = 'view=map&ind=sdg:ER_MRN_MPA&coll=mr_eez&color=value'
const FKNMS = 'view=place&place=NMS:FKNMS'
const FKNMS_SST = 'cell=NMS:FKNMS|erddap:dhw_5km:CRW_SST:mean'

const REMOVED = 'xp=NMS:NMSAS,NMS:FKNMS&xi=erddap:IMERG_monthly_global_precip:precipitation:mean'
const openMenu = async page => { await page.click('details.add > summary') }

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
  ['place_FKNMS_oceanmetrics_light', 'oceanmetrics', 'light', PLACE, FKNMS],
  ['place_FKNMS_oceanmetrics_dark', 'oceanmetrics', 'dark', PLACE, FKNMS],
  ['place_CINMS_mbon_light', 'mbon', 'light', PLACE, 'view=place&place=NMS:CINMS'],
  ['place_FKNMS_oceanmetrics_light_390', 'oceanmetrics', 'light', PLACE_PHONE, FKNMS],
  ['place_FKNMS_oceanmetrics_dark_390', 'oceanmetrics', 'dark', PLACE_PHONE, FKNMS],
  ['place_eez_oceanmetrics_light', 'oceanmetrics', 'light', PLACE, 'view=place&place=MRGID:8371'],
  ['place_FKNMS_oceanmetrics_light_eov', 'oceanmetrics', 'light', PLACE, FKNMS + '&vocab=eov'],
  // the flipped matrix: indicators in rows, places in columns
  ['matrix_oceanmetrics_light_flipped', 'oceanmetrics', 'light', DESKTOP, 'axes=t'],
  ['matrix_oceanmetrics_dark_flipped', 'oceanmetrics', 'dark', DESKTOP, 'axes=t'],
  ['matrix_oceanmetrics_light_flipped_390', 'oceanmetrics', 'light', PHONE, 'axes=t'],
  // the Add or restore menu open, with a place and an indicator removed
  ['matrix_oceanmetrics_light_addmenu', 'oceanmetrics', 'light', DESKTOP, REMOVED, openMenu],
  ['map_sst_status_oceanmetrics_light', 'oceanmetrics', 'light', MAP, SST + '&color=status'],
  ['map_sst_status_oceanmetrics_dark', 'oceanmetrics', 'dark', MAP, SST + '&color=status'],
  ['map_sst_status_oceanmetrics_light_390', 'oceanmetrics', 'light', MAP_PHONE, SST + '&color=status'],
  ['map_sst_departure_oceanmetrics_light', 'oceanmetrics', 'light', MAP, SST + '&color=departure'],
  ['map_sdg1451_value_oceanmetrics_light', 'oceanmetrics', 'light', MAP, MPA],
  ['map_sdg1451_value_oceanmetrics_dark', 'oceanmetrics', 'dark', MAP, MPA],
]

async function alive(url) { try { return (await fetch(url)).ok } catch { return false } }

let server
if (!(await alive(URL_BASE))) {
  server = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'ignore' })
  for (let i = 0; i < 60 && !(await alive(URL_BASE)); i++) await new Promise(r => setTimeout(r, 500))
}

mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] })
try {
  for (const [name, brand, theme, vp, hash, act] of SHOTS) {
    if (ONLY && !name.includes(ONLY)) continue
    const page = await browser.newPage()
    await page.setViewport(vp)
    const errors = []
    page.on('pageerror', e => errors.push(String(e)))
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    await page.goto(`${URL_BASE}?brand=${brand}&theme=${theme}${hash ? '#' + hash : ''}`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('.lens[data-state=done]', { timeout: 30000 })
    // a Place view is ready when it has cards and none is still loading
    if (hash.includes('view=map')) await page.waitForSelector('.map[data-state=done]', { timeout: 60000 })
    if (hash.includes('view=place')) await page.waitForFunction(() => document.querySelector('article.card') && !document.querySelector('article.card[aria-busy="true"]'), { timeout: 30000 })
    await page.evaluate(() => document.fonts.ready)
    await new Promise(r => setTimeout(r, 400))
    if (act) { await act(page); await new Promise(r => setTimeout(r, 200)) }
    await page.screenshot({ path: resolve(OUT, name + '.png'), fullPage: !hash.includes('cell=') && !hash.includes('view=place') })
    // a page-level sideways scroll is a layout bug at any width
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    console.log(name, overflow > 0 ? `PAGE OVERFLOW ${overflow}px` : 'ok', errors.length ? errors : '')
    await page.close()
  }
} finally {
  await browser.close()
  server?.kill()
}
