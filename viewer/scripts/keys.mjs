// keyboard check of the viewer, keys only: Tab reaches a Matrix cell, Enter opens its drawer, Esc closes it and focus
// returns to the cell; Tab reaches a place link, Enter opens the Place view, and its controls are reachable by Tab.
//   node viewer/scripts/keys.mjs [--url https://oceanmetrics.io/indicators/]
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const URL_BASE = arg('--url', 'http://localhost:5181/')

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1440, height: 900 } })
const page = await browser.newPage()
const fails = []
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what) }
const focused = () => page.evaluate(() => {
  const e = document.activeElement
  return e ? { tag: e.tagName, cls: e.className?.toString() ?? '', label: e.getAttribute('aria-label') ?? e.textContent?.trim().slice(0, 60), href: e.getAttribute('href') } : null
})
const tabUntil = async (pred, max = 200) => {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    const f = await focused()
    if (f && pred(f)) return { f, presses: i + 1 }
  }
  return null
}

await page.goto(`${URL_BASE}?theme=light`, { waitUntil: 'networkidle0' })
await page.waitForSelector('.lens[data-state=done]', { timeout: 30000 })

// a Matrix cell, its drawer, Esc, focus back
const cell = await tabUntil(f => f.tag === 'BUTTON' && /\bcell\b/.test(f.cls))
check(!!cell, `Tab reaches a Matrix cell${cell ? ` (${cell.presses} presses: "${cell.f.label}")` : ''}`)
if (cell) {
  await page.keyboard.press('Enter')
  const open = await page.waitForSelector('[role=dialog]', { timeout: 5000 }).then(() => true, () => false)
  check(open, 'Enter opens the drawer (role=dialog)')
  const inDialog = await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))
  check(inDialog, 'focus moves into the drawer')
  await page.keyboard.press('Escape')
  const closed = await page.waitForSelector('[role=dialog]', { hidden: true, timeout: 5000 }).then(() => true, () => false)
  check(closed, 'Esc closes the drawer')
  const back = await focused()
  check(back?.label === cell.f.label, 'focus returns to the same cell')
}

// a place link, the Place view, its controls
const link = await tabUntil(f => f.tag === 'A' && /view=place/.test(f.href ?? ''))
check(!!link, `Tab reaches a place link${link ? ` ("${link.f.label}")` : ''}`)
if (link) {
  await page.keyboard.press('Enter')
  const ok = await page.waitForFunction(() => location.hash.includes('view=place') && document.querySelector('.lens[data-state=done]'), { timeout: 20000 }).then(() => true, () => false)
  check(ok, 'Enter opens the Place view')
  const ctl = await tabUntil(f => f.tag === 'BUTTON', 40)
  check(!!ctl, `Tab reaches a Place view control${ctl ? ` ("${ctl.f.label}")` : ''}`)
}

await browser.close()
console.log(fails.length ? `${fails.length} keyboard check(s) failed` : 'keyboard checks passed')
process.exit(fails.length ? 1 : 0)
