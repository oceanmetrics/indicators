// keyboard check of the viewer, keys only: Tab reaches a Matrix cell, Enter opens its drawer, Esc closes it and focus
// returns to the cell; Tab reaches a place link, Enter opens the Place view, and its controls are reachable by Tab.
// a second pass on the flipped matrix (#axes=t): the same cell round trip, and Tab + Enter on a remove button.
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
  return e ? { tag: e.tagName, cls: e.className?.toString() ?? '', label: e.getAttribute('aria-label') ?? e.textContent?.trim().slice(0, 60), href: e.getAttribute('href'), kind: e.dataset?.kind, role: e.getAttribute('role') } : null
})
const tabUntil = async (pred, max = 600) => {
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
  await page.waitForFunction(() => !document.querySelector('table.matrix'), { timeout: 10000 }).catch(() => {})
  const ctl = await tabUntil(f => f.tag === 'BUTTON', 40)
  check(!!ctl, `Tab reaches a Place view control${ctl ? ` ("${ctl.f.label}")` : ''}`)
}

// the flipped matrix: indicators in rows, places in columns
await page.goto('about:blank')   // a fresh load: a hash-only change would keep the page, and the focus, as it was
await page.goto(`${URL_BASE}?theme=light#axes=t`, { waitUntil: 'networkidle0' })
await page.waitForSelector('.lens[data-state=done]', { timeout: 30000 })
const flipped = await page.evaluate(() => !!document.querySelector('table.matrix.flipped'))
check(flipped, 'the hash axes=t flips the matrix (indicators in rows)')
// the place headers come first in Tab order; the skip button jumps over them
const skip = await tabUntil(f => f.tag === 'BUTTON' && f.label === 'Skip to the first cell', 80)
check(!!skip, `flipped: Tab reaches "Skip to the first cell"${skip ? ` (${skip.presses} presses)` : ''}`)
if (skip) {
  await page.keyboard.press('Enter')
  const f = await focused()
  check(f?.tag === 'BUTTON' && /\bcell\b/.test(f.cls), 'flipped: the skip button puts focus on the first cell')
}
const cell2 =await tabUntil(f => f.tag === 'BUTTON' && /\bcell\b/.test(f.cls))
check(!!cell2, `flipped: Tab reaches a Matrix cell${cell2 ? ` (${cell2.presses} presses: "${cell2.f.label}")` : ''}`)
if (cell2) {
  await page.keyboard.press('Enter')
  check(await page.waitForSelector('[role=dialog]', { timeout: 5000 }).then(() => true, () => false), 'flipped: Enter opens the drawer')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[role=dialog]', { hidden: true, timeout: 5000 })
  check((await focused())?.label === cell2.f.label, 'flipped: focus returns to the same cell')
}
// Tab to the first remove button of a kind, press Enter: the hash gets xp= (place) or xi= (indicator), focus stays on a button
for (const [kind, key] of [['place', 'xp='], ['indicator', 'xi=']]) {
  await page.goto('about:blank')   // a fresh load: a hash-only change would keep the page, and the focus, as it was
  await page.goto(`${URL_BASE}?theme=light#axes=t`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.lens[data-state=done]', { timeout: 30000 })
  await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur())
  const rm = await tabUntil(f => f.tag === 'BUTTON' && f.kind === kind && /^Remove .* from the matrix$/.test(f.label ?? ''), 1500)
  check(!!rm, `flipped: Tab reaches a ${kind} remove button${rm ? ` ("${rm.f.label}")` : ''}`)
  if (rm) {
    await page.keyboard.press('Enter')
    await page.waitForFunction(k => location.hash.includes(k), { timeout: 5000 }, key).catch(() => {})
    const hash = await page.evaluate(() => location.hash)
    check(hash.includes(key), `Enter removes it: the hash has ${key} (${hash})`)
    const f = await focused()
    check(!!f && f.tag === 'BUTTON' && f.kind === kind, 'focus moves to the next remove button, not lost to the page')
  }
}

// the Report view: Tab reaches Edit, Enter opens the builder, Tab reaches a tree checkbox (role=checkbox), Space toggles it
// and the hash changes (every report is a permalink)
await page.goto('about:blank')
await page.goto(`${URL_BASE}?theme=light#view=report&pi=coll:places&layout=scorecard`, { waitUntil: 'networkidle0' })
await page.waitForSelector('.lens[data-state=done] .rv', { timeout: 30000 })
const edit = await tabUntil(f => f.tag === 'BUTTON' && f.label === 'Edit', 80)
check(!!edit, `report: Tab reaches the Edit button${edit ? ` (${edit.presses} presses)` : ''}`)
if (edit) {
  await page.keyboard.press('Enter')
  check(await page.waitForSelector('.builder', { timeout: 5000 }).then(() => true, () => false), 'report: Enter opens the builder')
  const box = await tabUntil(f => f.role === 'checkbox', 60)
  check(!!box, `report: Tab reaches a tree checkbox${box ? ` ("${box.f.label}")` : ''}`)
  if (box) {
    const before = await page.evaluate(() => ({ hash: location.hash, on: document.activeElement.getAttribute('aria-checked') }))
    await page.keyboard.press('Space')
    await page.waitForFunction(h => location.hash !== h, { timeout: 5000 }, before.hash).catch(() => {})
    const after = await page.evaluate(() => ({ hash: location.hash, on: document.activeElement?.getAttribute('aria-checked') }))
    check(after.hash !== before.hash, `report: Space toggles it and the hash changes (${before.hash} -> ${after.hash})`)
    check(after.on !== before.on, `report: aria-checked follows (${before.on} -> ${after.on})`)
  }
}

await browser.close()
console.log(fails.length ? `${fails.length} keyboard check(s) failed` : 'keyboard checks passed')
process.exit(fails.length ? 1 : 0)
