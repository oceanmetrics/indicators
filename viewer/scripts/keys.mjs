// keyboard check of the viewer, keys only: Tab reaches a Matrix cell, Enter opens its drawer, Esc closes it and focus
// returns to the cell; Tab reaches a place link, Enter opens the Place view, and its controls are reachable by Tab.
// the first pass is places as rows (#axes=p), the second the default, indicators as rows with places in columns: the same cell round
// trip, and Tab + Enter on a remove button; then the Place view's breadcrumb returns to the cell it came from. at the end, the order:
// Alt+arrow and the Move buttons move a header, a drag onto another header of its group does, grouping off lifts the limit, and the Order control.
//   node viewer/scripts/keys.mjs [--url https://oceanmetrics.io/indicators/] [--data <catalog base URL>]
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const URL_BASE = arg('--url', 'http://localhost:5181/')
const DATA = arg('--data', '')
// the query every page opens with: the light theme, and the catalog base when asked for
const Q = '?theme=light' + (DATA ? `&data=${encodeURIComponent(DATA)}` : '')

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

await page.goto(`${URL_BASE}${Q}#axes=p`, { waitUntil: 'networkidle0' })
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

// the default matrix: indicators in rows, places in columns
await page.goto('about:blank')   // a fresh load: a hash-only change would keep the page, and the focus, as it was
await page.goto(`${URL_BASE}${Q}`, { waitUntil: 'networkidle0' })
await page.waitForSelector('.lens[data-state=done]', { timeout: 30000 })
const indRows = await page.evaluate(() => !!document.querySelector('table.matrix.indrows'))
check(indRows, 'the default matrix has indicators in rows')
// the place headers come first in Tab order; the skip button jumps over them
const skip = await tabUntil(f => f.tag === 'BUTTON' && f.label === 'Skip to the first cell', 80)
check(!!skip, `Tab reaches "Skip to the first cell"${skip ? ` (${skip.presses} presses)` : ''}`)
if (skip) {
  await page.keyboard.press('Enter')
  const f = await focused()
  check(f?.tag === 'BUTTON' && /\bcell\b/.test(f.cls), 'the skip button puts focus on the first cell')
}
const cell2 =await tabUntil(f => f.tag === 'BUTTON' && /\bcell\b/.test(f.cls))
check(!!cell2, `Tab reaches a Matrix cell${cell2 ? ` (${cell2.presses} presses: "${cell2.f.label}")` : ''}`)
if (cell2) {
  await page.keyboard.press('Enter')
  check(await page.waitForSelector('[role=dialog]', { timeout: 5000 }).then(() => true, () => false), 'Enter opens the drawer')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[role=dialog]', { hidden: true, timeout: 5000 })
  check((await focused())?.label === cell2.f.label, 'focus returns to the same cell')
}
// the way there and back: a cell -> its drawer -> "Open in place view" (the Place view opens on that indicator: its card
// first, focus on its heading) -> the breadcrumb's Matrix link (the drawer reopens on the cell) -> Esc -> focus on the cell
await page.goto('about:blank')
await page.goto(`${URL_BASE}${Q}`, { waitUntil: 'networkidle0' })
await page.waitForSelector('.lens[data-state=done]', { timeout: 30000 })
const cell3 = await tabUntil(f => f.tag === 'BUTTON' && /\bcell\b/.test(f.cls))
if (cell3) {
  await page.keyboard.press('Enter')
  await page.waitForSelector('[role=dialog]', { timeout: 5000 })
  const toPlace = await tabUntil(f => f.tag === 'A' && /view=place/.test(f.href ?? '') && /ind=/.test(f.href ?? ''), 60)
  check(!!toPlace, 'the drawer has "Open in place view" with ind= in its link')
  if (toPlace) {
    await page.keyboard.press('Enter')
    await page.waitForSelector('.pv .you article.card h4', { timeout: 30000 })
    await new Promise(r => setTimeout(r, 600))
    const onHead = await page.evaluate(() => document.activeElement?.tagName === 'H4' && !!document.activeElement.closest('.you'))
    check(onHead, 'the Place view opens on the indicator: its card is first and focus is on its heading')
    check(await page.evaluate(() => !!document.querySelector('nav.crumb')), 'the Place view has a breadcrumb')
    await page.evaluate(() => document.querySelector('nav.crumb a.back')?.focus())
    await page.keyboard.press('Enter')
    check(await page.waitForSelector('[role=dialog]', { timeout: 8000 }).then(() => true, () => false), 'the breadcrumb Matrix link reopens the drawer on the cell')
    check(await page.evaluate(() => location.hash.includes('cell=') && !location.hash.includes('view=place')), 'the Matrix hash has cell=')
    await page.keyboard.press('Escape')
    await page.waitForSelector('[role=dialog]', { hidden: true, timeout: 5000 })
    check((await focused())?.label === cell3.f.label, 'Esc returns focus to the cell the reader started from')
  }
}

// Tab to the first remove button of a kind, press Enter: the hash gets px= (place) or ix= (indicator), focus stays on a button
for (const [kind, key] of [['place', 'px='], ['indicator', 'ix=']]) {
  await page.goto('about:blank')   // a fresh load: a hash-only change would keep the page, and the focus, as it was
  await page.goto(`${URL_BASE}${Q}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.lens[data-state=done]', { timeout: 30000 })
  await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur())
  const rm = await tabUntil(f => f.tag === 'BUTTON' && f.kind === kind && /^Remove .* from the matrix$/.test(f.label ?? ''), 1500)
  check(!!rm, `Tab reaches a ${kind} remove button${rm ? ` ("${rm.f.label}")` : ''}`)
  if (rm) {
    await page.keyboard.press('Enter')
    await page.waitForFunction(k => location.hash.includes(k), { timeout: 5000 }, key).catch(() => {})
    const hash = await page.evaluate(() => location.hash)
    check(hash.includes(key), `Enter removes it: the hash has ${key} (${hash})`)
    const f = await focused()
    check(!!f && f.tag === 'BUTTON' && f.kind === kind, 'focus moves to the next remove button, not lost to the page')
  }
}

// the Report view: Tab reaches Edit, Enter opens the builder (preset, layout, style: no trees, the Select section above the tabs chooses)
await page.goto('about:blank')
await page.goto(`${URL_BASE}${Q}#view=report&pi=coll:places&layout=scorecard`, { waitUntil: 'networkidle0' })
await page.waitForSelector('.lens[data-state=done] .rv', { timeout: 30000 })
const edit = await tabUntil(f => f.tag === 'BUTTON' && f.label === 'Edit', 80)
check(!!edit, `report: Tab reaches the Edit button${edit ? ` (${edit.presses} presses)` : ''}`)
if (edit) {
  await page.keyboard.press('Enter')
  check(await page.waitForSelector('.builder', { timeout: 5000 }).then(() => true, () => false), 'report: Enter opens the builder')
  check(await page.evaluate(() => !document.querySelector('.builder [role=checkbox]')), 'report: the builder has no selection tree of its own')
}

// the pickers, keys only: Tab to the button, Enter opens the panel (focus in its search box), arrows move through the tree or the
// results, Space or Enter chooses, Esc closes and focus returns to the button
const fresh = async hash => {
  await page.goto('about:blank')
  await page.goto(`${URL_BASE}${Q}${hash}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.lens[data-state=done]', { timeout: 30000 })
  await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur())
}
const openWith = async (re, what) => {
  const t = await tabUntil(f => f.tag === 'BUTTON' && /\btrig\b/.test(f.cls) && re.test(f.label ?? ''), 300)
  check(!!t, `${what}: Tab reaches its button${t ? ` ("${t.f.label}")` : ''}`)
  if (!t) return null
  await page.keyboard.press('Enter')
  check(await page.waitForSelector('.pop[role=dialog] input[type=search]', { timeout: 10000 }).then(() => true, () => false), `${what}: Enter opens the panel`)
  check(await page.evaluate(() => document.activeElement?.matches('.pop input[type=search]')), `${what}: focus is in the search box`)
  return t
}
const closeWithEsc = async (t, what) => {
  await page.keyboard.press('Escape')
  check(await page.waitForSelector('.pop', { hidden: true, timeout: 5000 }).then(() => true, () => false), `${what}: Esc closes the panel`)
  // the button's words follow the selection, so it is the same button, not the same words
  check(/\btrig\b/.test((await focused())?.cls ?? '') && (await page.evaluate(() => !document.activeElement?.closest('.pop'))), `${what}: focus returns to its button`)
}
const hashChanged = (was, k) => page.waitForFunction((w, key) => location.hash !== w && location.hash.includes(key), { timeout: 5000 }, was, k).then(() => true, () => false)

// Matrix, places: search "channel", arrow to the result, Enter takes it off the selection (px=)
await fresh('')
let was = await page.evaluate(() => location.hash)
let t = await openWith(/places?\b/, 'places picker')
if (t) {
  await page.keyboard.type('channel')
  await page.keyboard.press('ArrowDown')
  check(await page.evaluate(() => document.activeElement?.matches('.pop button.cb')), 'places picker: ArrowDown moves from the search box to the first group in the results')
  await page.keyboard.press('ArrowDown')   // the first result under it
  await page.keyboard.press('Enter')
  check(await hashChanged(was, 'px='), `places picker: Enter on a result toggles it (${await page.evaluate(() => location.hash)})`)
  await closeWithEsc(t, 'places picker')
}
// Matrix, indicators: arrow to the first box in the tree, Space unticks it (ix=)
await fresh('')
was = await page.evaluate(() => location.hash)
t = await openWith(/indicators?\b/, 'indicators picker')
if (t) {
  await page.keyboard.press('Tab')   // the first control after the search box (the vocabulary switch)
  const box = await tabUntil(f => f.role === 'checkbox', 12)
  check(!!box, `indicators picker: Tab reaches a tree checkbox${box ? ` ("${box.f.label}")` : ''}`)
  await page.keyboard.press('Space')
  check(await hashChanged(was, 'ix='), `indicators picker: Space unticks it (${await page.evaluate(() => location.hash)})`)
  await closeWithEsc(t, 'indicators picker')
}
// the Select section is above every tab but the Place view's: the same two pickers, with the same keys, on the Map and the Report
for (const [view, hash] of [['map', '#view=map&ind=erddap:dhw_5km:CRW_SST:mean'], ['report', '#view=report&layout=scorecard']]) {
  await fresh(hash)
  check(await page.evaluate(() => !!document.querySelector('section.select')), `${view}: the Select section is there`)
  was = await page.evaluate(() => location.hash)
  t = await openWith(/places?\b/, `${view}: places picker`)
  if (t) {
    await page.keyboard.type('channel')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    check(await hashChanged(was, 'px='), `${view}: places picker: Enter on a result toggles it (${await page.evaluate(() => location.hash)})`)
    await closeWithEsc(t, `${view}: places picker`)
  }
}
// the place set is the first row of the places picker: Enter on it writes pi=...set:political; Esc closes and focus returns to the button
await fresh('#view=map&ind=obis:species&pi=coll:mr_eez')
was = await page.evaluate(() => location.hash)
t = await openWith(/Exclusive Economic Zones/, 'set picker')
if (t) {
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  check(await hashChanged(was, 'set:political'), `set picker: Enter on the place set (${await page.evaluate(() => location.hash)})`)
  await closeWithEsc(t, 'set picker')
}
// the Map's own indicator chooser lists the selection's indicators; "another indicator" opens the Select section's picker
await fresh('#view=map&ind=erddap:dhw_5km:CRW_SST:mean')
was = await page.evaluate(() => location.hash)
t = await openWith(/SST/, 'map indicator chooser')
if (t) {
  // the tree opens its categories and series: arrow down to an indicator other than the one shown (its key has a colon), then Enter
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('ArrowDown')
    const at = await page.evaluate(() => ({ key: document.activeElement?.getAttribute('data-key') ?? '', closed: document.activeElement?.getAttribute('aria-expanded') === 'false' }))
    if (/:/.test(at.key) && at.key !== 'erddap:dhw_5km:CRW_SST:mean') break
    if (at.closed) await page.keyboard.press('Enter')   // a closed series: open it, the next ArrowDown reaches its first indicator
  }
  await page.keyboard.press('Enter')
  check(await hashChanged(was, 'ind='), `map indicator chooser: Enter chooses an indicator (${await page.evaluate(() => location.hash)})`)
  check(await page.waitForSelector('.pop', { hidden: true, timeout: 5000 }).then(() => true, () => false), 'map indicator chooser: choosing closes the panel')
  check(/trig/.test((await focused())?.cls ?? ''), 'map indicator chooser: focus returns to its button')
}
await fresh('#view=map&ind=erddap:dhw_5km:CRW_SST:mean')
t = await openWith(/SST/, 'map indicator chooser (another)')
if (t) {
  const other = await tabUntil(f => f.tag === 'BUTTON' && /^Another indicator/.test(f.label ?? ''), 80)
  check(!!other, 'map indicator chooser: Tab reaches "Another indicator"')
  if (other) {
    await page.keyboard.press('Enter')
    check(await page.waitForFunction(() => document.querySelector('.pop input[type=search]') && !!document.querySelector('.select .pop'), { timeout: 5000 }).then(() => true, () => false), '"Another indicator" opens the Select section\'s indicator picker')
  }
}
// Place view, place: type "channel", ArrowDown, Enter goes to that place
await fresh('#view=place&place=NMS:FKNMS')
await page.waitForSelector('.pv .controls', { timeout: 30000 })
was = await page.evaluate(() => location.hash)
t = await openWith(/Florida Keys/, 'place picker')
if (t) {
  await page.keyboard.type('channel')
  await page.keyboard.press('ArrowDown')   // the group the match is in
  await page.keyboard.press('ArrowDown')   // the match
  await page.keyboard.press('Enter')
  check(await hashChanged(was, 'place=NMS:CINMS'), `place picker: Enter on a result opens that place (${await page.evaluate(() => location.hash)})`)
}

// Map frame: Tab to Globe, Enter writes proj=globe, Tab back to Flat drops it; Tab to Full screen, Enter goes full screen
// (the label says Exit full screen, the wrapper holds the legend), Enter again leaves and focus stays on the button
await fresh('#view=map&ind=obis:species&coll=set:political&grain=decade')
await page.waitForSelector('.map[data-state=done]', { timeout: 60000 })
const label = () => page.evaluate(() => document.querySelector('.fc .full')?.textContent?.trim())
const globe = await tabUntil(f => f.tag === 'BUTTON' && /Globe/.test(f.label ?? ''), 300)
check(!!globe, 'map frame: Tab reaches the Globe button')
if (globe) {
  await page.keyboard.press('Enter')
  check(await hashChanged('', 'proj=globe'), `map frame: Enter on Globe writes proj=globe (${await page.evaluate(() => location.hash)})`)
  await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift')
  await page.keyboard.press('Enter')
  check(await page.waitForFunction(() => !location.hash.includes('proj='), { timeout: 5000 }).then(() => true, () => false), 'map frame: Enter on Flat drops proj')
  const full = await tabUntil(f => f.tag === 'BUTTON' && /\bfull\b/.test(f.cls), 6)
  check(!!full && (await label()) === 'Full screen', 'map frame: Tab reaches the button, which says Full screen')
  await page.keyboard.press('Enter')
  check(await page.waitForSelector('.layout.full', { timeout: 5000 }).then(() => true, () => false), 'map frame: Enter goes full screen')
  check((await label()) === 'Exit full screen', 'map frame: the button now says Exit full screen')
  check(await page.evaluate(() => { const l = document.querySelector('.layout.full'); return !!l?.querySelector('#map-legend-h') && !!l.querySelector('.map') }), 'map frame: the full-screen wrapper holds the map and its legend')
  await page.keyboard.press('Enter')
  check(await page.waitForSelector('.layout.full', { hidden: true, timeout: 5000 }).then(() => true, () => false), 'map frame: Enter on the button leaves full screen')
  check(/\bfull\b/.test((await focused())?.cls ?? ''), 'map frame: focus stays on the button')
}
// the expanded fallback (no Fullscreen API, as on an iPhone): Enter expands, Esc leaves, focus on the button
await fresh('#view=map&ind=obis:species&coll=set:political&grain=decade')
await page.waitForSelector('.map[data-state=done]', { timeout: 60000 })
await page.evaluate(() => { for (const k of ['fullscreenEnabled', 'webkitFullscreenEnabled']) Object.defineProperty(document, k, { value: false }) })
const exp = await tabUntil(f => f.tag === 'BUTTON' && /\bfull\b/.test(f.cls), 300)
if (exp) {
  await page.keyboard.press('Enter')
  check(await page.waitForSelector('.layout.expanded', { timeout: 5000 }).then(() => true, () => false), 'expanded fallback: Enter expands the wrapper to the viewport')
  await page.keyboard.press('Escape')
  check(await page.waitForSelector('.layout.full', { hidden: true, timeout: 5000 }).then(() => true, () => false), 'expanded fallback: Esc leaves')
  check(/\bfull\b/.test((await focused())?.cls ?? ''), 'expanded fallback: focus is on the button')
} else check(false, 'expanded fallback: Tab reaches the button')

// ---- the order: move a header with the keys (Alt+arrow anywhere in it, a plain arrow on its Move button), drag it, a group, both orientations ----
const said = () => page.evaluate(() => document.querySelector('p[role=status].mbon-sr-only')?.textContent ?? '')
const heads = (sel) => page.evaluate(s => [...document.querySelectorAll(s)].map(e => e.dataset.id), sel)
const waitHash = (re) => page.waitForFunction(r => new RegExp(r).test(location.hash), { timeout: 5000 }, re.source).then(() => true, () => false)
const moveBtn = async (axis, kind, id) => page.evaluate(([a, k, i]) => {
  const th = [...document.querySelectorAll('th[data-ax]')].find(e => e.dataset.ax === a && e.dataset.kind === k && e.dataset.id === i)
  th?.querySelector('button.mvb')?.focus()
  return !!th
}, [axis, kind, id])

// default matrix (indicators in rows, places in columns): a place column, plain arrow on its Move button
await fresh('')
const cols0 = await heads('thead th[data-ax=places][data-kind=item]')
check(cols0.length > 3, `order: the place columns are headers you can move (${cols0.length})`)
const [first, second] = cols0
check(await moveBtn('places', 'item', first), 'order: the first place column has a Move button')
await page.keyboard.press('ArrowRight')
check(await waitHash(/ps=custom/), `order: ArrowRight on a place's Move button moves it later: ps=custom (${await page.evaluate(() => location.hash)})`)
const cols1 = await heads('thead th[data-ax=places][data-kind=item]')
check(cols1[0] === second && cols1[1] === first, 'order: the column moved one place to the right')
check(/Moved .* after /.test(await said()), `order: the move is announced ("${await said()}")`)
check(await page.evaluate(f => document.activeElement?.matches('button.mvb') && document.activeElement.closest('th')?.dataset.id === f, first), 'order: focus stays on the moved header\'s Move button')
// Alt+arrow from the header's link goes back; the first place cannot go earlier
await page.evaluate(f => [...document.querySelectorAll('th[data-ax=places][data-kind=item]')].find(e => e.dataset.id === f)?.querySelector('a.pn')?.focus(), first)
await page.keyboard.down('Alt'); await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Alt')
await page.waitForFunction(([a, b]) => { const h = [...document.querySelectorAll('thead th[data-ax=places][data-kind=item]')].map(e => e.dataset.id); return h[0] === a && h[1] === b }, { timeout: 5000 }, [first, second]).catch(() => {})
check((await heads('thead th[data-ax=places][data-kind=item]'))[0] === first, 'order: Alt+ArrowLeft on the place link moves it back')
check(await page.evaluate(f => document.activeElement?.matches('a.pn') && document.activeElement.closest('th')?.dataset.id === f, first), 'order: focus stays on the link')
await page.keyboard.down('Alt'); await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Alt')
check(/already first/.test(await said()), `order: the first place cannot go earlier, and it says so ("${await said()}")`)

// an indicator row (up and down)
await fresh('')
const rows0 = await heads('tbody th[data-ax=indicators][data-kind=item]')
check(await moveBtn('indicators', 'item', rows0[0]), 'order: the first indicator row has a Move button')
await page.keyboard.press('ArrowDown')
check(await waitHash(/is=custom/), `order: ArrowDown on an indicator's Move button moves it down: is=custom (${await page.evaluate(() => location.hash)})`)
const rows1 = await heads('tbody th[data-ax=indicators][data-kind=item]')
check(rows1[1] === rows0[0] && rows1[0] === rows0[1], 'order: the row moved one place down')
// the last indicator of a group cannot move into the next group: ArrowDown stays put and says why
const groupOf = id => page.evaluate(i => { const th = [...document.querySelectorAll('tbody th[data-ax=indicators][data-kind=item]')].find(e => e.dataset.id === i); let r = th?.closest('tr'); while (r && !r.classList.contains('band')) r = r.previousElementSibling; return r?.querySelector('th')?.dataset.id }, id)
const lastOfFirst = await page.evaluate(() => { const bands = [...document.querySelectorAll('tbody tr.band')]; const r = bands[1]?.previousElementSibling; return r?.querySelector('th[data-ax]')?.dataset.id })
if (lastOfFirst) {
  const g0 = await groupOf(lastOfFirst)
  await moveBtn('indicators', 'item', lastOfFirst)
  await page.keyboard.press('ArrowDown')
  check((await groupOf(lastOfFirst)) === g0 && /already last/.test(await said()), `order: an indicator stays in its group ("${await said()}")`)
}

// a group (a whole category of indicators), plain arrow on its Move button
await fresh('')
const groups0 = await heads('tbody tr.band th[data-ax=indicators][data-kind=group]')
if (groups0.length > 1) {
  await moveBtn('indicators', 'group', groups0[0])
  await page.keyboard.press('ArrowDown')
  check(await waitHash(/is=custom/) && /io=g:/.test(await page.evaluate(() => location.hash)), `order: ArrowDown on a group's Move button moves the whole group (${await page.evaluate(() => location.hash)})`)
  const groups1 = await heads('tbody tr.band th[data-ax=indicators][data-kind=group]')
  check(groups1[1] === groups0[0], 'order: the group moved below the next one')
}

// places as rows: ArrowUp/Down on a place row; a group of places moves too (two groups in the selection)
await fresh('#axes=p&pi=coll:places,coll:noaa_nerrs')
const prow = await heads('tbody th[data-ax=places][data-kind=item]')
await moveBtn('places', 'item', prow[1])
await page.keyboard.press('ArrowUp')
check(await waitHash(/ps=custom/), `order: ArrowUp on a place row moves it up (${await page.evaluate(() => location.hash)})`)
check((await heads('tbody th[data-ax=places][data-kind=item]'))[0] === prow[1], 'order: the place row moved up')
const pg0 = await heads('tbody tr.band th[data-ax=places][data-kind=group]')
check(pg0.length === 2, `order: two place groups (${pg0.join(', ')})`)
await moveBtn('places', 'group', pg0[0])
await page.keyboard.press('ArrowDown')
check((await heads('tbody tr.band th[data-ax=places][data-kind=group]'))[0] === pg0[1], 'order: the place group moved below the other')

// drag and drop (synthetic drag events with a real DataTransfer): a column onto another column of its group, a refused drop into another group
const drag = (axis, kind, from, to, half) => page.evaluate(([a, k, f, t, h]) => {
  const find = id => [...document.querySelectorAll('th[data-ax]')].find(e => e.dataset.ax === a && e.dataset.kind === k && e.dataset.id === id)
  const src = find(f), dst = find(t)
  if (!src || !dst) return 'missing'
  const dt = new DataTransfer()
  const r = dst.getBoundingClientRect()
  const pos = { clientX: r.left + (h === 'after' ? r.width * 0.75 : r.width * 0.25), clientY: r.top + (h === 'after' ? r.height * 0.75 : r.height * 0.25), bubbles: true, cancelable: true, dataTransfer: dt }
  src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
  dst.dispatchEvent(new DragEvent('dragover', pos))
  const mark = dst.dataset.drop
  if (mark === 'no') { src.dispatchEvent(new DragEvent('dragend', { bubbles: true })); return 'no' }
  dst.dispatchEvent(new DragEvent('drop', pos))
  src.dispatchEvent(new DragEvent('dragend', { bubbles: true }))
  return mark
}, [axis, kind, from, to, half])
await fresh('#pi=coll:places,coll:noaa_nerrs')
const dcols = await heads('thead th[data-ax=places][data-kind=item]')
const dres = await drag('places', 'item', dcols[0], dcols[2], 'after')
check(dres === 'after', `drag: a column over another one shows a drop bar after it (${dres})`)
await waitHash(/ps=custom/)
const dafter = await heads('thead th[data-ax=places][data-kind=item]')
check(dafter[2] === dcols[0], `drag: dropping a column after another moves it (${dcols[0]} is now third)`)
const lastCol = dcols[dcols.length - 1]
const refused = await drag('places', 'item', dafter[0], lastCol, 'before')
check(refused === 'no', `drag: a place cannot be dropped into another group (${refused})`)
// grouping off: anything goes anywhere
await fresh('#pi=coll:places,coll:noaa_nerrs&pg=0')
check(await page.evaluate(() => !document.querySelector('tr.groups')), 'order: grouping off draws no group row')
const fcols = await heads('thead th[data-ax=places][data-kind=item]')
const fres = await drag('places', 'item', fcols[fcols.length - 1], fcols[0], 'before')
check(fres === 'before', `drag: with grouping off a place goes anywhere (${fres})`)
await waitHash(/ps=custom/)
check((await heads('thead th[data-ax=places][data-kind=item]'))[0] === fcols[fcols.length - 1], 'drag: the place from the last column is now first')

// the Order control in the Select section: Tab to it, Enter opens its panel, a sort key writes ps=, Esc returns focus
await fresh('#pi=coll:places,coll:mr_eez')
was = await page.evaluate(() => location.hash)
t = await tabUntil(f => f.tag === 'BUTTON' && /\btrig\b/.test(f.cls) && /^(A to Z|Places:|Indicators:)/.test(f.label ?? ''), 300)
check(!!t, `order control: Tab reaches its button${t ? ` ("${t.f.label}")` : ''}`)
if (t) {
  await page.keyboard.press('Enter')
  check(await page.waitForSelector('.pop[role=dialog]', { timeout: 10000 }).then(() => true, () => false), 'order control: Enter opens the panel')
  const ns = await tabUntil(f => f.tag === 'BUTTON' && f.label === 'North to south', 20)
  check(!!ns, 'order control: Tab reaches "North to south"')
  if (ns) {
    await page.keyboard.press('Enter')
    check(await hashChanged(was, 'ps=ns'), `order control: Enter writes ps=ns (${await page.evaluate(() => location.hash)})`)
  }
  await closeWithEsc(t, 'order control')
}
// every view carries the order: the Matrix, Map and Report tabs keep ps=ns
check(await page.evaluate(() => [...document.querySelectorAll('nav.views a')].every(a => /ps=ns/.test(a.getAttribute('href') ?? ''))), 'order: the Matrix, Map and Report tabs carry ps=ns')

await browser.close()
console.log(fails.length ? `${fails.length} keyboard check(s) failed` : 'keyboard checks passed')
process.exit(fails.length ? 1 : 0)
