// screenshots with the real catalog: the Matrix (matrix_<brand>_<theme>[_390].png, places as rows matrix_*_placerows*,
// the place and indicator pickers open matrix_*_places_picker and matrix_*_indicators_picker, the Select section select_*, a group
// nothing is computed for uncomputed_*, the drawer), the Place view (place_<place>_<brand>_<theme>[_390].png), the
// Map view (map_<indicator>_<color>_<theme>[_390].png; the layer under it map_layer_*, the compare mode map_compare_*, build week 2's cell
// readout, palette, Retry and year-range Then map_wk2_*; the second pass map_wk2b_*: the fit by viewport, PMNM, a period past the record), the Report view (report_*: the Scorecard, the Cards report, the
// open builder over budget, the print preview, Small multiples, the Quad plot, the Map sheet and the Dossier), the order of the rows
// and columns (order_*: the Order control open, a flat north-to-south order in both orientations, a custom order, a drag in progress with
// its drop bar and a refused drop, the move buttons on focus) and the embed route (embed_*).
// headless Chrome through puppeteer-core, against the dev server (started here when nothing answers on the port).
//   node viewer/scripts/shoot.mjs [--url http://localhost:5181/] [--only matrix_mbon_dark] [--out docs/shots/live] [--data <catalog base URL>]
// --data reads the catalog from another base (`?data=`), for example the published one while catalog/ is being rebuilt.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(ROOT, process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'docs/shots')
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const URL_BASE = arg('--url', 'http://localhost:5181/')
const ONLY = arg('--only', '')
const DATA = arg('--data', '')
const DATAQ = DATA ? `&data=${encodeURIComponent(DATA)}` : ''

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 2 }
const TALL = { width: 1440, height: 1500, deviceScaleFactor: 2 }
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
// the Place view is long: shoot its top (the header, the controls and the first cards), not the whole page
const PLACE = { width: 1440, height: 1800, deviceScaleFactor: 2 }
const PLACE_PHONE = { width: 390, height: 2000, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
// the Map view: shot when the map container says data-state=done (the map is idle with the data layer on it)
const MAP = { width: 1440, height: 1500, deviceScaleFactor: 2 }
const MAP_PHONE = { width: 390, height: 2400, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const SST = 'view=map&ind=erddap:dhw_5km:CRW_SST:mean&pi=coll:places'
const MPA = 'view=map&ind=sdg:ER_MRN_MPA&pi=coll:mr_eez&color=value'
// the layer under the map: a grid slice of the dataset at the step of t, computed in the browser. --layer swaps the dataset
// (`--layer grid:jplMURSST41mday:sst`, the oceanmetrics mirror, when PacIOOS does not answer)
const LAYER = SST + '&grain=month&t=2024-07&layer=' + arg('--layer', 'grid:dhw_5km:CRW_SST')
// the compare mode: the layer at t (July 2024) right of the swipe and at t2 (July 2016) left of it, one scale over both; anom=1 the
// difference. MUR monthly from the oceanmetrics mirror (PacIOOS has been down); 1280 wide, as the gate asks
const COMPARE = SST + '&grain=month&t=2024-07&t2=2016-07&layer=' + arg('--compare-layer', 'grid:jplMURSST41mday:sst')
const WIDE = { width: 1280, height: 1500, deviceScaleFactor: 2 }
// build week 2: the layer over one place (the retry shots), and the year-range Then over it
// (`--t 2024-01` for a layer whose July is empty there, such as IMERG's precipitation: `--compare-layer grid:IMERG_monthly_global_precip:precipitation`)
const LAYER_ONE = 'view=map&ind=erddap:dhw_5km:CRW_SST:mean&pi=NMS:CINMS&place=NMS:CINMS&grain=month&t=' + arg('--t', '2024-07') + '&layer=' + arg('--compare-layer', 'grid:jplMURSST41mday:sst')
const RANGE = LAYER_ONE + '&t2=2003-2012'
// build week 2, second pass (map_wk2b_*): a place framed by the viewport (row 24: at 390 it fills the frame's width), the year-range
// Then with the "Compare with" select whole, and the difference without the Palette select and with its Then said once; Papahanaumokuakea
// over the antimeridian with its slice (row 21); a period past the layer's record drawing its last step (rows 18, 33: IMERG ends 2025-09)
const IMERG = 'grid:IMERG_monthly_global_precip:precipitation'
const PMNM = 'view=map&ind=erddap:dhw_5km:CRW_SST:mean&pi=NMS:PMNM&place=NMS:PMNM&grain=month&t=2024-01&layer=' + IMERG
const CLAMP = 'view=map&ind=erddap:dhw_5km:CRW_SST:mean&pi=NMS:CINMS&place=NMS:CINMS&grain=month&t=2026-08&layer=' + IMERG
const FKNMS = 'view=place&place=NMS:FKNMS'
const FKNMS_SST = 'cell=NMS:FKNMS|erddap:dhw_5km:CRW_SST:mean'
// the way forward from an empty cell: Wells (a NERRS reserve) has no sea surface temperature computed (not computed yet), and the
// SDG series is not offered for a reserve; an EEZ opened on an indicator it has no values for
const WELLS = 'pi=coll:places,coll:noaa_nerrs'
const LIVE = 'pi=coll:places,coll:noaa_nerrs&cell=NERRS:WEL|erddap:dhw_5km:CRW_SST:mean'
const NA = 'pi=coll:places,coll:noaa_nerrs&cell=NERRS:WEL|sdg:ER_MRN_MPA&empty=1'
const OPENED = 'view=place&place=NMS:FKNMS&ind=erddap:dhw_5km:CRW_SST:mean'
const UNCOMPUTED = 'view=place&place=MRGID:8405&ind=erddap:IMERG_monthly_global_precip:precipitation:mean'

// the Report view: a report is tall, so a fixed window (the top of it), not the whole page
const REPORT = { width: 1440, height: 1500, deviceScaleFactor: 2 }
const REPORT_PHONE = { width: 390, height: 2000, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const PAPER = { width: 794, height: 1123, deviceScaleFactor: 2 }
const SANCT = 'view=report&layout=scorecard&title=Sanctuary%20condition'
const CINMS = 'view=report&pi=NMS:CINMS&title=One%20sanctuary%3A%20Channel%20Islands'
const OVER = 'view=report&layout=cards&title=Too%20many%20cards'
const CARD = { width: 760, height: 1000, deviceScaleFactor: 2 }
const CARD_PHONE = { width: 390, height: 1000, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const EMBED_HASH = 'card=NMS:CINMS|erddap:dhw_5km:CRW_SST:mean'
const print = async page => { await page.emulateMediaType('print') }
// a long report reads its entries as they scroll near (a dossier); the print job (Export, Print) loads them all, so here the page is walked first
const printAll = async page => {
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 150)) } window.scrollTo(0, 0) })
  await page.waitForFunction(() => !document.querySelector('.rv [aria-busy="true"]'), { timeout: 60000 })
  await page.emulateMediaType('print')
}
// the other layouts, with the real catalog: sea surface temperature for the sanctuaries, one sanctuary's indicators, the same
// indicator mapped over the sanctuaries and over the EEZs, and a dossier of one sanctuary
const SST_ID = 'erddap:dhw_5km:CRW_SST:mean'
const SMALL = `view=report&pi=coll:places&ii=${SST_ID}&layout=small-multiples&title=Sea%20surface%20temperature%2C%20the%20sanctuaries`
const QUAD = 'view=report&pi=NMS:CINMS&layout=quad&title=Channel%20Islands%3A%20where%20its%20indicators%20stand'
const MAPSHEET = `view=report&pi=coll:places&ii=${SST_ID}&layout=map-sheet&title=Sea%20surface%20temperature%2C%20the%20sanctuaries`
const MAPSHEET_EEZ = 'view=report&pi=coll:mr_eez&ii=sdg:ER_MRN_MPA&layout=map-sheet&title=Marine%20protected%20area%20cover%2C%20the%20EEZs'
const DOSSIER = 'view=report&pi=NMS:CINMS&layout=dossier&title=Channel%20Islands%20dossier'

const REMOVED = 'px=NMS:NMSAS,NMS:FKNMS&ix=erddap:IMERG_monthly_global_precip:precipitation:mean'
const scrollRight = async page => { await page.evaluate(() => { const b = document.querySelector('.box'); b.scrollLeft = b.scrollWidth }) }
// a picker's button is found by the small word above it (Places, Indicators, Place); `scope` is the section it is in ('.select' for the
// Select section, 'section.controls' for a view's own controls); the panel loads on the first open
const openPicker = (kicker, scope = '') => async page => {
  await page.evaluate(([sc, k]) => [...document.querySelectorAll(`${sc} .pk`)].find(p => p.querySelector('.mbon-label')?.textContent === k)?.querySelector('button.trig')?.click(), [scope, kicker])
  await page.waitForSelector('.pop .body input[type=search]', { timeout: 10000 })
  await new Promise(r => setTimeout(r, 300))
}
// the places picker with a collection nothing is computed for opened: the gazetteer's index is read, its places listed
const openUncomputed = label => async page => {
  await openPicker('Places', '.select')(page)
  await page.evaluate(() => document.querySelector('.pop button.disc[aria-label="Collapse National Marine Sanctuaries"]')?.click())
  await page.evaluate(l => document.querySelector(`.pop button.disc[aria-label="Expand ${l}"]`)?.click(), label)
  await page.waitForFunction(l => !!document.querySelector(`.pop li.node[data-kind=collection] .kids li.node[data-kind=place]`) && !/Loading/.test(document.querySelector('.pop')?.textContent ?? ''), { timeout: 30000 }, label).catch(() => {})
  await page.evaluate(l => document.querySelector(`.pop button.disc[aria-label="Collapse ${l}"]`)?.closest('li.node')?.scrollIntoView({ block: 'start' }), label)
  await new Promise(r => setTimeout(r, 400))
}
const NERRS_PRECIP = 'view=map&ind=erddap:IMERG_monthly_global_precip:precipitation:mean&pi=coll:noaa_nerrs&place=NERRS:WEL'
const NERRS_MEMBER = 'view=map&ind=erddap:IMERG_monthly_global_precip:precipitation:mean&pi=coll:noaa_nerrs&place=NERRS:ACE'
// full screen: a real click on the map frame's button (the Fullscreen API needs a user gesture); 'expanded' removes the API first
const fullscreen = mode => async page => {
  if (mode === 'expanded') await page.evaluate(() => { for (const k of ['fullscreenEnabled', 'webkitFullscreenEnabled']) Object.defineProperty(document, k, { value: false }) })
  await page.click('.fc .full')
  await page.waitForSelector('.layout.full', { timeout: 5000 })
  await new Promise(r => setTimeout(r, 1500))
  const got = await page.evaluate(() => ({ native: !!document.fullscreenElement, expanded: !!document.querySelector('.layout.expanded'), label: document.querySelector('.fc .full')?.textContent?.trim() }))
  console.log('  full screen:', JSON.stringify(got))
}
// the kit's Menu in the header (Help): open its panel
const openMenu = async page => {
  await page.evaluate(() => document.querySelector('header .mbon-menu button')?.click())
  await page.waitForSelector('.mbon-menu .panel', { timeout: 5000 })
}
// build week 2 (the parity rows): the cell readout under a pointer (a tap at 390), the palette, a failed slice and its Retry, the
// year-range Then. the readout: the pointer goes over the frame from (fx, fy) outward until the readout box shows (a tap until
// the legend's Cell line does)
const hoverCell = (fx, fy, tap = false) => async page => {
  const b = await page.evaluate(() => { const r = document.querySelector('.frame').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  // taps further apart and slower than a double tap (which would zoom the map)
  const step = tap ? 36 : 14, wait = tap ? 700 : 60
  for (let ring = 0; ring < (tap ? 6 : 14); ring++) {
    for (let k = 0; k < Math.max(1, ring * 6); k++) {
      const a = (2 * Math.PI * k) / Math.max(1, ring * 6)
      const x = b.x + b.w * fx + Math.cos(a) * ring * step, y = b.y + b.h * fy + Math.sin(a) * ring * step
      if (tap) await page.touchscreen.tap(x, y); else await page.mouse.move(x, y)
      await new Promise(r => setTimeout(r, wait))
      const got = await page.evaluate(() => document.querySelector('.legend .cell')?.textContent ?? '')
      if (got) {
        console.log('   readout:', got)
        return
      }
    }
  }
  console.log('   readout: none found')
}
// a failed slice: every slab request of the slice answers 404 (the mirror's own failure, made certain), until `failing.on` is off
const failing = { on: true }
const failSlabs = async page => {
  failing.on = true
  await page.setRequestInterception(true)
  page.on('request', r => {
    if (r.isInterceptResolutionHandled()) return
    if (failing.on && /\/griddap\/[^?]+\.parquet/.test(r.url())) r.respond({ status: 404, contentType: 'text/html', headers: { 'Access-Control-Allow-Origin': '*' }, body: '<html>Error {code=404; message="Not Found: Your query produced no matching results."}</html>' })
    else r.continue()
  })
}
// on a phone the legend is under the map: bring it (and its Retry) into the shot
// a phone's own height (844): the map is under the controls, so the shot scrolls it to the top of the screen
const showMap = async page => { await page.evaluate(() => document.querySelector('.frame')?.scrollIntoView({ block: 'start' })); await new Promise(r => setTimeout(r, 600)) }
const showLegend = async page => { await page.evaluate(() => document.querySelector('.legend')?.scrollIntoView({ block: 'center' })); await new Promise(r => setTimeout(r, 300)) }
// then the server answers again and Retry is pressed: the slice draws
const retryNow = async page => {
  failing.on = false
  await page.evaluate(() => [...document.querySelectorAll('.legend button')].find(b => b.textContent?.trim() === 'Retry')?.click())
  await page.waitForFunction(() => { const t = document.querySelector('.legend')?.textContent ?? ''; return !/no data:|loading the slice/.test(t) && /°C/.test(t) }, { timeout: 180000 })
  await new Promise(r => setTimeout(r, 1500))
}
const EEZ_OBIS = 'view=map&ind=obis:species&pi=coll:mr_eez'
// the political ocean: the EEZs (Marine Regions' WMS) over the high seas by FAO area (the FAO major areas' PMTiles), one scale
const NERRS_ALL = 'view=map&ind=erddap:IMERG_monthly_global_precip:precipitation:mean&pi=coll:noaa_nerrs'
const POLITICAL = 'view=map&ind=obis:species&pi=set:political&grain=decade'
// a real click at a longitude and latitude of the world view: the map opens framed on [-180, -85, 180, 85] with 24 px of padding,
// so the click is placed from the canvas size by the Web Mercator formulae. then wait for the selected place to be named
const clickAt = (lon, lat) => async page => {
  await page.evaluate(() => document.querySelector('.map canvas').scrollIntoView({ block: 'center' }))
  await new Promise(r => setTimeout(r, 300))
  const b = await page.evaluate(() => { const r = document.querySelector('.map canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  const mercY = l => Math.log(Math.tan(Math.PI / 4 + (l * Math.PI) / 360)) / (2 * Math.PI)
  const size = Math.min(b.w - 48, (b.h - 48) / (2 * mercY(85)))
  const x = b.x + b.w / 2 + (lon / 360) * size
  const y = b.y + b.h / 2 - mercY(lat) * size
  await page.mouse.click(x, y)
  await page.waitForFunction(() => document.querySelector('.pick .name')?.textContent, { timeout: 30000 })
  await page.waitForSelector('.map[data-state=done]', { timeout: 60000 })
  await new Promise(r => setTimeout(r, 800))
}

// the order: the Order control's panel, a drag in progress (a drop bar after a column; a refused drop into another group), the move
// buttons of a focused header
const openOrder = async page => {
  await page.evaluate(() => [...document.querySelectorAll('.select .pk')].find(p => p.querySelector('.mbon-label')?.textContent === 'Order')?.querySelector('button.trig')?.click())
  await page.waitForSelector('.pop[role=dialog] .om-row button', { timeout: 10000 })
  await new Promise(r => setTimeout(r, 300))
}
const dragOver = (axis, from, to, half = 'after') => async page => {
  await page.evaluate(([a, f, t, h]) => {
    const find = id => [...document.querySelectorAll('th[data-ax]')].find(e => e.dataset.ax === a && e.dataset.kind === 'item' && e.dataset.id === id)
    const src = find(f), dst = find(t)
    dst.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const dt = new DataTransfer()
    const r = dst.getBoundingClientRect()
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
    dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width * (h === 'after' ? 0.75 : 0.25), clientY: r.top + r.height * (h === 'after' ? 0.75 : 0.25) }))
  }, [axis, from, to, half])
  await new Promise(r => setTimeout(r, 200))
}
const focusMove = (axis, kind, id) => async page => {
  await page.evaluate(([a, k, i]) => [...document.querySelectorAll('th[data-ax]')].find(e => e.dataset.ax === a && e.dataset.kind === k && e.dataset.id === i)?.querySelector('button.mvb')?.focus(), [axis, kind, id])
  await new Promise(r => setTimeout(r, 300))
}
const ORDER_NS = 'pi=coll:places,coll:mr_eez&ps=ns&pg=0'
const ORDER_CUSTOM = 'pi=coll:places,coll:noaa_nerrs&ps=custom&po=g:places,NMS:FKNMS,NMS:CINMS'

// build week 3, the Matrix: the summary line, a sort by the count below, an OBIS series folded and open, page 2 of the political set;
// both themes at 1280 (one device pixel, so the PNGs stay small) and 390 (matrix_wk3_<what>_<theme>_<width>)
const M1280 = { width: 1280, height: 900, deviceScaleFactor: 1 }
const M390 = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
// the header counts show on hover (always on a touch screen): the sort shot hovers the first place's header; the fold shots scroll the
// grid to the series' row
const hoverFirstPlace = async page => { await page.hover('th[data-ax=places][data-kind=item]'); await new Promise(r => setTimeout(r, 300)) }
const toFold = async page => {
  await page.evaluate(() => {
    const b = document.querySelector('.box'), f = b?.querySelector('button.fold')?.closest('tr'), h = b?.querySelector('thead')
    // the row's top just under the sticky header rows, with the band of its group above it in view
    if (b && f && h) b.scrollTop = f.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop - h.getBoundingClientRect().height - 48
  })
  await new Promise(r => setTimeout(r, 300))
}
const WK3 = [
  ['summary', ''],
  ['sort_below', 'ps=below&is=below', hoverFirstPlace],
  ['fold_closed', 'pi=set:political&ii=*,series:obis-fish:*', toFold],
  ['fold_open', 'pi=set:political&ii=*,series:obis-fish:*&unfold=obis-fish', toFold],
  ['page2', 'pi=set:political&page=2'],
]
const SHOTS = [
  ...WK3.flatMap(([what, hash, act]) => ['light', 'dark'].flatMap(theme => [
    [`matrix_wk3_${what}_${theme}_1280`, 'oceanmetrics', theme, M1280, hash, act],
    [`matrix_wk3_${what}_${theme}_390`, 'oceanmetrics', theme, M390, hash, act],
  ])),
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
  // places as rows (the default is indicators in rows, places in columns)
  ['matrix_oceanmetrics_light_placerows', 'oceanmetrics', 'light', DESKTOP, 'axes=p'],
  ['matrix_oceanmetrics_dark_placerows', 'oceanmetrics', 'dark', DESKTOP, 'axes=p'],
  ['matrix_oceanmetrics_light_placerows_390', 'oceanmetrics', 'light', PHONE, 'axes=p'],
  // the pickers open: places (groups, "n of N", the gazetteer links, not computed yet) and indicators (a place and an indicator removed)
  ['matrix_oceanmetrics_light_places_picker', 'oceanmetrics', 'light', DESKTOP, REMOVED, openPicker('Places', '.select')],
  ['matrix_oceanmetrics_dark_places_picker', 'oceanmetrics', 'dark', DESKTOP, REMOVED, openPicker('Places', '.select')],
  ['matrix_mbon_light_places_picker', 'mbon', 'light', DESKTOP, REMOVED, openPicker('Places', '.select')],
  ['matrix_oceanmetrics_light_places_picker_390', 'oceanmetrics', 'light', PHONE, REMOVED, openPicker('Places', '.select')],
  ['matrix_oceanmetrics_dark_places_picker_390', 'oceanmetrics', 'dark', PHONE, REMOVED, openPicker('Places', '.select')],
  ['matrix_oceanmetrics_light_indicators_picker', 'oceanmetrics', 'light', DESKTOP, REMOVED, openPicker('Indicators', '.select')],
  ['matrix_oceanmetrics_dark_indicators_picker', 'oceanmetrics', 'dark', DESKTOP, REMOVED, openPicker('Indicators', '.select')],
  ['matrix_mbon_dark_indicators_picker', 'mbon', 'dark', DESKTOP, REMOVED, openPicker('Indicators', '.select')],
  ['matrix_oceanmetrics_light_indicators_picker_390', 'oceanmetrics', 'light', PHONE, REMOVED, openPicker('Indicators', '.select')],
  // place groups, the legend, the ways forward from an empty cell, and the Place view opened on an indicator
  ['matrix_oceanmetrics_light_groups', 'oceanmetrics', 'light', DESKTOP, WELLS, scrollRight],
  ['matrix_oceanmetrics_dark_groups', 'oceanmetrics', 'dark', DESKTOP, WELLS],
  ['matrix_oceanmetrics_light_groups_390', 'oceanmetrics', 'light', PHONE, WELLS],
  ['legend_oceanmetrics_light', 'oceanmetrics', 'light', DESKTOP, ''],
  ['legend_mbon_dark', 'mbon', 'dark', DESKTOP, ''],
  ['legend_oceanmetrics_light_390', 'oceanmetrics', 'light', PHONE, ''],
  ['drawer_live_oceanmetrics_light', 'oceanmetrics', 'light', TALL, LIVE],
  ['drawer_live_oceanmetrics_dark', 'oceanmetrics', 'dark', TALL, LIVE],
  ['drawer_live_mbon_light', 'mbon', 'light', TALL, LIVE],
  ['drawer_live_oceanmetrics_light_390', 'oceanmetrics', 'light', PHONE, LIVE],
  ['drawer_na_oceanmetrics_light', 'oceanmetrics', 'light', TALL, NA],
  ['drawer_na_oceanmetrics_dark_390', 'oceanmetrics', 'dark', PHONE, NA],
  ['place_obis_onthemap_CINMS_oceanmetrics_light', 'oceanmetrics', 'light', PLACE, 'view=place&place=NMS:CINMS&ind=obis:es50'],
  ['place_opened_FKNMS_oceanmetrics_light', 'oceanmetrics', 'light', PLACE, OPENED],
  ['place_opened_FKNMS_oceanmetrics_dark', 'oceanmetrics', 'dark', PLACE, OPENED],
  ['place_opened_FKNMS_oceanmetrics_light_390', 'oceanmetrics', 'light', PLACE_PHONE, OPENED],
  ['place_uncomputed_EEZ_oceanmetrics_light', 'oceanmetrics', 'light', PLACE, UNCOMPUTED],
  ['place_uncomputed_EEZ_oceanmetrics_dark', 'oceanmetrics', 'dark', PLACE, UNCOMPUTED],
  ['place_uncomputed_EEZ_mbon_light', 'mbon', 'light', PLACE, UNCOMPUTED],
  ['place_uncomputed_EEZ_oceanmetrics_light_390', 'oceanmetrics', 'light', PLACE_PHONE, UNCOMPUTED],
  ['map_sst_status_oceanmetrics_light', 'oceanmetrics', 'light', MAP, SST + '&color=status'],
  ['map_sst_status_oceanmetrics_dark', 'oceanmetrics', 'dark', MAP, SST + '&color=status'],
  ['map_sst_status_oceanmetrics_light_390', 'oceanmetrics', 'light', MAP_PHONE, SST + '&color=status'],
  ['map_sst_departure_oceanmetrics_light', 'oceanmetrics', 'light', MAP, SST + '&color=departure'],
  // the layer under the map: a grid slice computed in the browser (DuckDB-WASM) at a month of 2024
  ['map_layer_sst_oceanmetrics_light', 'oceanmetrics', 'light', MAP, LAYER],
  ['map_layer_sst_oceanmetrics_dark', 'oceanmetrics', 'dark', MAP, LAYER],
  ['map_layer_sst_oceanmetrics_light_390', 'oceanmetrics', 'light', MAP_PHONE, LAYER],
  // framed on one place, where the slice's cells show: the dataset's own lattice inside the place, the class on the outline
  ['map_layer_sst_cinms_oceanmetrics_light', 'oceanmetrics', 'light', MAP, LAYER + '&place=NMS:CINMS'],
  ['map_layer_sst_cinms_oceanmetrics_dark', 'oceanmetrics', 'dark', MAP, LAYER + '&place=NMS:CINMS'],
  ['map_layer_sst_fknms_oceanmetrics_dark', 'oceanmetrics', 'dark', MAP, LAYER + '&place=NMS:FKNMS'],
  ['map_layer_sst_cinms_oceanmetrics_dark_390', 'oceanmetrics', 'dark', MAP_PHONE, LAYER + '&place=NMS:CINMS'],
  ['map_compare_sst_oceanmetrics_light', 'oceanmetrics', 'light', WIDE, COMPARE],
  ['map_compare_sst_oceanmetrics_dark', 'oceanmetrics', 'dark', WIDE, COMPARE],
  ['map_compare_sst_oceanmetrics_light_390', 'oceanmetrics', 'light', MAP_PHONE, COMPARE],
  ['map_compare_sst_oceanmetrics_dark_390', 'oceanmetrics', 'dark', MAP_PHONE, COMPARE],
  // closer: the swipe through the Channel Islands, and the difference (anom=1) there
  ['map_compare_sst_cinms_oceanmetrics_light', 'oceanmetrics', 'light', WIDE, COMPARE + '&place=NMS:CINMS'],
  ['map_compare_sst_cinms_oceanmetrics_dark', 'oceanmetrics', 'dark', WIDE, COMPARE + '&place=NMS:CINMS'],
  // the basemap kept on CARTO's own style by the hash (bm=carto: no GEBCO tiers)
  ['map_layer_sst_cinms_carto_oceanmetrics_light', 'oceanmetrics', 'light', MAP, LAYER + '&place=NMS:CINMS&bm=carto'],
  ['map_compare_sst_cinms_anom_oceanmetrics_dark', 'oceanmetrics', 'dark', WIDE, COMPARE + '&place=NMS:CINMS&anom=1'],
  ['map_compare_sst_cinms_globe_oceanmetrics_dark', 'oceanmetrics', 'dark', WIDE, COMPARE + '&place=NMS:CINMS&proj=globe&swipe=0.35'],
  ['map_compare_sst_cinms_anom_oceanmetrics_light_390', 'oceanmetrics', 'light', MAP_PHONE, COMPARE + '&place=NMS:CINMS&anom=1'],
  // build week 2: the cell readout (both periods and the difference), at 1280 by a hover and at 390 by a tap
  ['map_wk2_hover_cinms_oceanmetrics_light', 'oceanmetrics', 'light', WIDE, COMPARE + '&place=NMS:CINMS', hoverCell(0.3, 0.33)],
  ['map_wk2_hover_cinms_oceanmetrics_dark', 'oceanmetrics', 'dark', WIDE, COMPARE + '&place=NMS:CINMS', hoverCell(0.65, 0.36)],
  ['map_wk2_hover_cinms_anom_oceanmetrics_dark', 'oceanmetrics', 'dark', WIDE, COMPARE + '&place=NMS:CINMS&anom=1', hoverCell(0.45, 0.36)],
  ['map_wk2_hover_layer_cinms_oceanmetrics_light', 'oceanmetrics', 'light', WIDE, COMPARE.replace(/&t2=[^&]+/, '') + '&place=NMS:CINMS', hoverCell(0.45, 0.36)],
  ['map_wk2_hover_cinms_oceanmetrics_light_390', 'oceanmetrics', 'light', MAP_PHONE, LAYER_ONE + '&t2=2016-07', hoverCell(0.35, 0.4, true)],
  ['map_wk2_hover_cinms_oceanmetrics_dark_390', 'oceanmetrics', 'dark', MAP_PHONE, LAYER_ONE + '&t2=2016-07', hoverCell(0.6, 0.4, true)],
  // the palette: Spectral reversed (erddap-places' red = warm) on the swipe, the legend's ramp with it (one place sliced, and at 390
  // the tap, so the mirror is asked for two slabs a shot)
  ['map_wk2_palette_cinms_oceanmetrics_light', 'oceanmetrics', 'light', WIDE, LAYER_ONE + '&t2=2016-07&pal=spectral_r'],
  ['map_wk2_palette_cinms_oceanmetrics_dark', 'oceanmetrics', 'dark', WIDE, LAYER_ONE + '&t2=2016-07&pal=viridis'],
  ['map_wk2_palette_cinms_oceanmetrics_light_390', 'oceanmetrics', 'light', MAP_PHONE, LAYER_ONE + '&t2=2016-07&pal=spectral_r'],
  ['map_wk2_palette_cinms_oceanmetrics_dark_390', 'oceanmetrics', 'dark', MAP_PHONE, LAYER_ONE + '&t2=2016-07&pal=viridis'],
  // a failed slice (every slab answers 404 here) and its Retry; then the server answers and Retry draws it
  ['map_wk2_retry_oceanmetrics_light', 'oceanmetrics', 'light', WIDE, LAYER_ONE, null, failSlabs],
  ['map_wk2_retry_oceanmetrics_dark', 'oceanmetrics', 'dark', WIDE, LAYER_ONE, null, failSlabs],
  ['map_wk2_retry_oceanmetrics_light_390', 'oceanmetrics', 'light', MAP_PHONE, LAYER_ONE, showLegend, failSlabs],
  ['map_wk2_retry_oceanmetrics_dark_390', 'oceanmetrics', 'dark', MAP_PHONE, LAYER_ONE, showLegend, failSlabs],
  ['map_wk2_retried_oceanmetrics_light', 'oceanmetrics', 'light', WIDE, LAYER_ONE, retryNow, failSlabs],
  // the year-range Then: t2=2003-2012, the mean of July 2003..2012 (one place sliced, so ten slices stay light on the mirror)
  ['map_wk2_range_cinms_oceanmetrics_light', 'oceanmetrics', 'light', WIDE, RANGE],
  ['map_wk2_range_cinms_oceanmetrics_dark', 'oceanmetrics', 'dark', WIDE, RANGE],
  ['map_wk2_range_cinms_oceanmetrics_light_390', 'oceanmetrics', 'light', MAP_PHONE, RANGE],
  ['map_wk2_range_cinms_oceanmetrics_dark_390', 'oceanmetrics', 'dark', MAP_PHONE, RANGE],
  ['map_wk2_range_cinms_anom_oceanmetrics_dark', 'oceanmetrics', 'dark', WIDE, RANGE + '&anom=1'],
  ['map_wk2b_fit_cinms_oceanmetrics_light_390', 'oceanmetrics', 'light', PHONE, LAYER_ONE, showMap],
  ['map_wk2b_fit_cinms_oceanmetrics_dark_390', 'oceanmetrics', 'dark', PHONE, LAYER_ONE, showMap],
  ['map_wk2b_fit_cinms_oceanmetrics_light', 'oceanmetrics', 'light', WIDE, LAYER_ONE],
  ['map_wk2b_range_cinms_oceanmetrics_light_390', 'oceanmetrics', 'light', MAP_PHONE, RANGE],
  ['map_wk2b_range_cinms_anom_oceanmetrics_dark', 'oceanmetrics', 'dark', WIDE, RANGE + '&anom=1'],
  ['map_wk2b_range_cinms_anom_oceanmetrics_light_390', 'oceanmetrics', 'light', MAP_PHONE, RANGE + '&anom=1'],
  ['map_wk2b_pmnm_oceanmetrics_light', 'oceanmetrics', 'light', WIDE, PMNM],
  ['map_wk2b_pmnm_oceanmetrics_dark_390', 'oceanmetrics', 'dark', PHONE, PMNM, showMap],
  ['map_wk2b_pmnm_globe_oceanmetrics_dark', 'oceanmetrics', 'dark', WIDE, PMNM + '&proj=globe'],
  ['map_wk2b_clamp_cinms_oceanmetrics_light', 'oceanmetrics', 'light', WIDE, CLAMP],
  ['map_sdg1451_value_oceanmetrics_light', 'oceanmetrics', 'light', MAP, MPA],
  ['map_sdg1451_value_oceanmetrics_dark', 'oceanmetrics', 'dark', MAP, MPA],
  // OBIS, the CoastWatch OBIS replacement: species of fish per EEZ, by year and by decade
  ['map_obis_fish_year_oceanmetrics_light', 'oceanmetrics', 'light', MAP, 'view=map&ind=obis:species:fish&pi=coll:mr_eez'],
  ['map_obis_fish_decade_mbon_dark', 'mbon', 'dark', MAP, 'view=map&ind=obis:species:fish&pi=coll:mr_eez&grain=decade&t=2010'],
  // the Map's indicator chooser (the selection's indicators), the reserves (Wells coloured, the others faint)
  ['map_indicators_picker_oceanmetrics_light', 'oceanmetrics', 'light', MAP, SST + '&color=status', openPicker('Indicators', 'section.controls')],
  ['map_indicators_picker_oceanmetrics_dark_390', 'oceanmetrics', 'dark', PHONE, SST + '&color=status', openPicker('Indicators', 'section.controls')],
  ['map_nerrs_wells_oceanmetrics_light', 'oceanmetrics', 'light', MAP, NERRS_PRECIP],
  ['map_nerrs_wells_oceanmetrics_dark', 'oceanmetrics', 'dark', MAP, NERRS_PRECIP],
  ['map_nerrs_member_oceanmetrics_light', 'oceanmetrics', 'light', MAP, NERRS_MEMBER],
  ['map_nerrs_member_mbon_dark_390', 'mbon', 'dark', MAP_PHONE, NERRS_MEMBER],
  ['map_eez_obis_oceanmetrics_light', 'oceanmetrics', 'light', MAP, EEZ_OBIS],
  // the political set: EEZs over the high seas by FAO area, coloured by OBIS species richness (all taxa, latest decade)
  ['map_political_species_oceanmetrics_light', 'oceanmetrics', 'light', MAP, POLITICAL],
  ['map_political_species_oceanmetrics_dark', 'oceanmetrics', 'dark', MAP, POLITICAL],
  ['map_political_species_mbon_light', 'mbon', 'light', MAP, POLITICAL],
  ['map_political_species_oceanmetrics_light_390', 'oceanmetrics', 'light', MAP_PHONE, POLITICAL],
  ['map_political_species_oceanmetrics_dark_390', 'oceanmetrics', 'dark', MAP_PHONE, POLITICAL],
  // the political set on the globe: the whole sphere in the frame, centred
  ['map_political_globe_oceanmetrics_light', 'oceanmetrics', 'light', MAP, POLITICAL + '&proj=globe'],
  ['map_political_globe_oceanmetrics_dark_390', 'oceanmetrics', 'dark', MAP_PHONE, POLITICAL + '&proj=globe'],
  // a click on the high seas (south-east Pacific, FAO 87) selects the piece, not the FAO area; a click inside an EEZ (Easter Island)
  // selects the EEZ, though the FAO area lies below it
  ['map_political_click_highseas_oceanmetrics_light', 'oceanmetrics', 'light', MAP, POLITICAL, clickAt(-105, -45)],
  ['map_political_click_highseas_oceanmetrics_dark_390', 'oceanmetrics', 'dark', MAP_PHONE, POLITICAL, clickAt(-105, -45)],
  ['map_political_click_eez_oceanmetrics_light', 'oceanmetrics', 'light', MAP, POLITICAL, clickAt(-109, -27)],
  ['matrix_sets_picker_oceanmetrics_dark', 'oceanmetrics', 'dark', DESKTOP, '', openPicker('Places', '.select')],
  // the NERRs at continental zoom: Wells coloured, the 29 others as faint outlines and small hollow circles
  ['map_nerrs_continental_oceanmetrics_light', 'oceanmetrics', 'light', MAP, NERRS_ALL],
  ['map_nerrs_continental_oceanmetrics_dark', 'oceanmetrics', 'dark', MAP, NERRS_ALL],
  // the Place view's pickers
  ['place_place_picker_oceanmetrics_light', 'oceanmetrics', 'light', PLACE, FKNMS, openPicker('Place')],
  ['place_place_picker_oceanmetrics_dark_390', 'oceanmetrics', 'dark', PLACE_PHONE, FKNMS, openPicker('Place')],
  ['place_indicator_picker_oceanmetrics_light', 'oceanmetrics', 'light', PLACE, FKNMS, openPicker('Indicators')],
  // the Select section above the tabs: the same selection on the Matrix, the Map and the Report; the whole gazetteer in the place picker
  ['select_matrix_oceanmetrics_light', 'oceanmetrics', 'light', DESKTOP, ''],
  ['select_map_oceanmetrics_dark', 'oceanmetrics', 'dark', MAP, SST + '&color=status'],
  ['select_report_mbon_light', 'mbon', 'light', REPORT, SANCT],
  ['select_matrix_oceanmetrics_light_390', 'oceanmetrics', 'light', PHONE, ''],
  ['select_map_oceanmetrics_light_390', 'oceanmetrics', 'light', MAP_PHONE, SST + '&color=status'],
  ['select_report_oceanmetrics_dark_390', 'oceanmetrics', 'dark', REPORT_PHONE, SANCT],
  ['select_places_picker_gazetteer_oceanmetrics_light', 'oceanmetrics', 'light', DESKTOP, '', openUncomputed('Marine National Monuments')],
  ['select_places_picker_gazetteer_oceanmetrics_dark_390', 'oceanmetrics', 'dark', PHONE, '', openUncomputed('Marine National Monuments')],
  // a group nothing is computed for: a column of "not computed yet" cells per place, and a group too large to list shows its first 300
  ['uncomputed_monuments_oceanmetrics_light', 'oceanmetrics', 'light', DESKTOP, 'pi=coll:noaa_marine_monuments'],
  ['uncomputed_monuments_oceanmetrics_dark_390', 'oceanmetrics', 'dark', PHONE, 'pi=coll:noaa_marine_monuments'],
  ['uncomputed_nerrs_mbon_light', 'mbon', 'light', DESKTOP, 'pi=coll:noaa_nerrs&axes=p'],
  ['uncomputed_large_group_oceanmetrics_light', 'oceanmetrics', 'light', DESKTOP, 'pi=coll:protectedseas_mpa'],
  ['uncomputed_drawer_oceanmetrics_light', 'oceanmetrics', 'light', TALL, 'pi=coll:noaa_marine_monuments&cell=MC:monuments:alice-springs|erddap:dhw_5km:CRW_SST:mean'],
  // the Map of a selection of several groups, and of some places of one
  ['map_selection_groups_oceanmetrics_light', 'oceanmetrics', 'light', MAP, 'view=map&ind=erddap:IMERG_monthly_global_precip:precipitation:mean&pi=coll:places,coll:noaa_nerrs'],
  ['map_selection_places_oceanmetrics_light', 'oceanmetrics', 'light', MAP, 'view=map&ind=obis:species&pi=MRGID:5668,MRGID:8456,NMS:CINMS&grain=decade'],
  // the order of the rows and columns: the control open, a flat north-to-south order (places in columns, then as rows), a custom order, a drag
  ['order_panel_oceanmetrics_light', 'oceanmetrics', 'light', DESKTOP, '', openOrder],
  ['order_panel_oceanmetrics_dark', 'oceanmetrics', 'dark', DESKTOP, ORDER_NS, openOrder],
  ['order_panel_mbon_light', 'mbon', 'light', DESKTOP, ORDER_CUSTOM, openOrder],
  ['order_panel_oceanmetrics_light_390', 'oceanmetrics', 'light', PHONE, ORDER_NS, openOrder],
  ['order_panel_oceanmetrics_dark_390', 'oceanmetrics', 'dark', PHONE, '', openOrder],
  ['order_northsouth_oceanmetrics_light', 'oceanmetrics', 'light', DESKTOP, ORDER_NS],
  ['order_northsouth_oceanmetrics_dark', 'oceanmetrics', 'dark', DESKTOP, ORDER_NS],
  ['order_northsouth_placerows_oceanmetrics_light', 'oceanmetrics', 'light', DESKTOP, ORDER_NS + '&axes=p'],
  ['order_northsouth_placerows_mbon_dark', 'mbon', 'dark', DESKTOP, ORDER_NS + '&axes=p'],
  ['order_northsouth_oceanmetrics_light_390', 'oceanmetrics', 'light', PHONE, ORDER_NS],
  ['order_northsouth_placerows_oceanmetrics_dark_390', 'oceanmetrics', 'dark', PHONE, ORDER_NS + '&axes=p'],
  ['order_custom_oceanmetrics_light', 'oceanmetrics', 'light', DESKTOP, ORDER_CUSTOM],
  ['order_custom_placerows_oceanmetrics_dark', 'oceanmetrics', 'dark', DESKTOP, ORDER_CUSTOM + '&axes=p'],
  ['order_custom_oceanmetrics_dark_390', 'oceanmetrics', 'dark', PHONE, ORDER_CUSTOM],
  ['order_drag_oceanmetrics_light', 'oceanmetrics', 'light', DESKTOP, 'pi=coll:places,coll:noaa_nerrs', dragOver('places', 'NMS:NMSAS', 'NMS:CHNMS')],
  ['order_drag_refused_oceanmetrics_dark', 'oceanmetrics', 'dark', DESKTOP, 'pi=coll:places,coll:noaa_nerrs&axes=p', dragOver('places', 'NMS:NMSAS', 'NERRS:ACE')],
  ['order_drag_placerows_oceanmetrics_light', 'oceanmetrics', 'light', DESKTOP, 'pi=coll:places&axes=p', dragOver('places', 'NMS:CBNMS', 'NMS:FKNMS')],
  ['order_move_buttons_oceanmetrics_light', 'oceanmetrics', 'light', DESKTOP, '', focusMove('places', 'item', 'NMS:CINMS')],
  ['order_move_buttons_placerows_oceanmetrics_dark', 'oceanmetrics', 'dark', DESKTOP, 'axes=p', focusMove('places', 'item', 'NMS:CINMS')],
  ['order_move_group_oceanmetrics_light', 'oceanmetrics', 'light', DESKTOP, 'pi=coll:places,coll:noaa_nerrs&axes=p', focusMove('places', 'group', 'places')],
  // the order in the Report (a Scorecard of the sanctuaries north to south, its indicators in the vocabulary's order) and the Map's table
  ['order_report_scorecard_oceanmetrics_light', 'oceanmetrics', 'light', REPORT, 'view=report&layout=scorecard&pi=coll:places&ps=ns&pg=0&is=vocab'],
  ['order_report_scorecard_oceanmetrics_dark_390', 'oceanmetrics', 'dark', REPORT_PHONE, 'view=report&layout=scorecard&pi=coll:places&ps=ns&pg=0&is=vocab'],
  ['order_map_table_oceanmetrics_light', 'oceanmetrics', 'light', MAP, SST + '&color=status&ps=ns&pg=0'],
  // the Report view
  ['report_scorecard_oceanmetrics_light', 'oceanmetrics', 'light', REPORT, SANCT],
  ['report_scorecard_oceanmetrics_dark', 'oceanmetrics', 'dark', REPORT, SANCT],
  ['report_scorecard_oceanmetrics_light_390', 'oceanmetrics', 'light', REPORT_PHONE, SANCT],
  ['report_cards_CINMS_oceanmetrics_light', 'oceanmetrics', 'light', REPORT, CINMS],
  ['report_cards_CINMS_oceanmetrics_light_390', 'oceanmetrics', 'light', REPORT_PHONE, CINMS],
  ['report_builder_overbudget_oceanmetrics_light', 'oceanmetrics', 'light', REPORT, OVER],
  ['report_print_CINMS_oceanmetrics_light', 'oceanmetrics', 'light', PAPER, CINMS, print],
  // the other layouts
  ['report_smallmultiples_oceanmetrics_light', 'oceanmetrics', 'light', REPORT, SMALL],
  ['report_smallmultiples_oceanmetrics_dark', 'oceanmetrics', 'dark', REPORT, SMALL],
  ['report_smallmultiples_oceanmetrics_light_390', 'oceanmetrics', 'light', REPORT_PHONE, SMALL],
  ['report_smallmultiples_oceanmetrics_dark_390', 'oceanmetrics', 'dark', REPORT_PHONE, SMALL],
  ['report_smallmultiples_free_oceanmetrics_light', 'oceanmetrics', 'light', REPORT, SMALL + '&ys=free'],
  ['report_quad_CINMS_oceanmetrics_light', 'oceanmetrics', 'light', REPORT, QUAD],
  ['report_quad_CINMS_oceanmetrics_dark', 'oceanmetrics', 'dark', REPORT, QUAD],
  ['report_quad_CINMS_oceanmetrics_light_390', 'oceanmetrics', 'light', REPORT_PHONE, QUAD],
  ['report_quad_CINMS_oceanmetrics_dark_390', 'oceanmetrics', 'dark', REPORT_PHONE, QUAD],
  ['report_mapsheet_sst_oceanmetrics_light', 'oceanmetrics', 'light', REPORT, MAPSHEET],
  ['report_mapsheet_sst_oceanmetrics_dark', 'oceanmetrics', 'dark', REPORT, MAPSHEET],
  ['report_mapsheet_sst_oceanmetrics_light_390', 'oceanmetrics', 'light', REPORT_PHONE, MAPSHEET],
  ['report_mapsheet_eez_oceanmetrics_light', 'oceanmetrics', 'light', REPORT, MAPSHEET_EEZ],
  ['report_dossier_CINMS_oceanmetrics_light', 'oceanmetrics', 'light', REPORT, DOSSIER],
  ['report_dossier_CINMS_oceanmetrics_dark', 'oceanmetrics', 'dark', REPORT, DOSSIER],
  ['report_dossier_CINMS_oceanmetrics_light_390', 'oceanmetrics', 'light', REPORT_PHONE, DOSSIER],
  ['report_dossier_print_CINMS_oceanmetrics_light', 'oceanmetrics', 'light', PAPER, DOSSIER, printAll],
  ['report_print_smallmultiples_oceanmetrics_light', 'oceanmetrics', 'light', PAPER, SMALL, print],
  // the embed route: one card, no chrome
  ['embed_card_oceanmetrics_light', 'oceanmetrics', 'light', CARD, EMBED_HASH],
  ['embed_card_oceanmetrics_dark', 'oceanmetrics', 'dark', CARD, EMBED_HASH],
  ['embed_card_oceanmetrics_light_390', 'oceanmetrics', 'light', CARD_PHONE, EMBED_HASH],
  // the CoastWatch-OBIS embed: the political set, species richness by decade
  ['embed_map_political_mbon_light', 'mbon', 'light', { width: 900, height: 1100, deviceScaleFactor: 1 }, POLITICAL],
  // the Matrix of the set: its groups, places as rows
  ['matrix_political_oceanmetrics_light', 'oceanmetrics', 'light', DESKTOP, 'pi=set:political&axes=p'],
  // the globe (proj=globe): the political set (a WMS layer over a derived vector layer), a vector group with its hollow circles, the embed
  ['map_globe_political_oceanmetrics_light', 'oceanmetrics', 'light', MAP, POLITICAL + '&proj=globe'],
  ['map_globe_political_mbon_dark', 'mbon', 'dark', MAP, POLITICAL + '&proj=globe'],
  ['map_globe_political_oceanmetrics_dark_390', 'oceanmetrics', 'dark', MAP_PHONE, POLITICAL + '&proj=globe'],
  ['map_globe_nerrs_oceanmetrics_light', 'oceanmetrics', 'light', MAP, NERRS_ALL + '&proj=globe'],
  ['map_globe_sst_oceanmetrics_dark', 'oceanmetrics', 'dark', MAP, SST + '&color=status&proj=globe'],
  ['embed_map_globe_mbon_light', 'mbon', 'light', { width: 900, height: 1100, deviceScaleFactor: 1 }, POLITICAL + '&proj=globe'],
  // full screen: the map with its legend, by the browser's Fullscreen API (a real click grants it) and by the expanded fallback (the API removed, as on an iPhone)
  ['map_full_political_oceanmetrics_light', 'oceanmetrics', 'light', DESKTOP, POLITICAL, fullscreen('native')],
  ['map_full_political_mbon_dark', 'mbon', 'dark', DESKTOP, POLITICAL, fullscreen('native')],
  ['map_full_globe_oceanmetrics_dark', 'oceanmetrics', 'dark', DESKTOP, POLITICAL + '&proj=globe', fullscreen('native')],
  ['map_full_expanded_oceanmetrics_light_390', 'oceanmetrics', 'light', PHONE, POLITICAL, fullscreen('expanded')],
  ['map_full_expanded_mbon_dark_390', 'mbon', 'dark', PHONE, POLITICAL, fullscreen('expanded')],
  // the pickers in dark mode: the panel stands off the page (both brands, desktop and 390 px)
  ['matrix_mbon_dark_places_picker', 'mbon', 'dark', DESKTOP, REMOVED, openPicker('Places')],
  ['matrix_mbon_dark_places_picker_390', 'mbon', 'dark', PHONE, REMOVED, openPicker('Places')],
  ['matrix_mbon_light_indicators_picker', 'mbon', 'light', DESKTOP, REMOVED, openPicker('Indicators')],
  ['matrix_oceanmetrics_dark_indicators_picker_390', 'oceanmetrics', 'dark', PHONE, REMOVED, openPicker('Indicators')],
  ['help_menu_oceanmetrics_dark', 'oceanmetrics', 'dark', DESKTOP, '', openMenu],
  ['help_menu_mbon_dark', 'mbon', 'dark', DESKTOP, '', openMenu],
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
  for (const [name, brand, theme, vp, hash, act, pre] of SHOTS) {
    // `--only <part>` takes every shot whose name holds it; `--only <name>$` that one shot
    if (ONLY && !(ONLY.endsWith('$') ? name === ONLY.slice(0, -1) : name.includes(ONLY))) continue
    const page = await browser.newPage()
    await page.setViewport(vp)
    if (pre) await pre(page)
    const errors = []
    page.on('pageerror', e => errors.push(String(e)))
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if (m.text().startsWith('[om]')) console.log('  ', m.text()) })
    const embed = name.startsWith('embed_')
    await page.goto(`${URL_BASE}${embed ? 'embed/' : ''}?brand=${brand}&theme=${theme}${DATAQ}${hash ? '#' + hash : ''}`, { waitUntil: 'networkidle0', timeout: 120000 })
    await page.waitForSelector(embed ? 'main.embed[data-state=done]' : '.lens[data-state=done]', { timeout: 30000 })
    // a report is ready when its layout is drawn and no card or recomputation is still waiting
    if (hash.includes('view=report')) {
      await page.waitForSelector('.rv table, .rv article.card, .rv .heads, .rv .sm, .rv .qp, .rv .ms, .rv .dos, .rv [role=status]', { timeout: 30000 })
      // no card, panel or entry is still reading its values, no status is being recomputed, and every map (the locator, the Map sheet) is drawn
      await page.waitForFunction(() => !document.querySelector('.rv [aria-busy="true"]') && ![...document.querySelectorAll('.rv .note')].some(n => /Recomputing/.test(n.textContent ?? ''))
        && !document.querySelector('.rv .qp [role=status], .rv .sm [role=status]') && [...document.querySelectorAll('.rv .map')].every(m => m.dataset.state === 'done'), { timeout: 60000 })
    }
    // a Place view is ready when it has cards and none is still loading
    if (hash.includes('view=map')) await page.waitForSelector('.map[data-state=done]', { timeout: 60000 })
    // the layer under the map: its collection is read, then the engine boots, the polygons and axes arrive and the slice is
    // computed; the legend says "loading the slice" until it is drawn (or says why not), then the map is idle again
    if (hash.includes('layer=')) {
      const t0 = Date.now()
      await page.waitForFunction(() => { const t = document.querySelector('.legend')?.textContent ?? ''; return /Layer:|Compare:|Difference:/.test(t) && !/loading the slice/.test(t) }, { timeout: 300000 })
      console.log('   layer legend settled in', Date.now() - t0, 'ms:', await page.evaluate(() => [...document.querySelectorAll('.legend .note')].map(n => n.textContent).join(' | ')))
      // the mirror drops a dataset for minutes at a time: a shot that is not about a failure presses Retry (the legend's own
      // button) until the slice is in, a few times, and says so when it never is
      for (let k = 0; !pre && k < 6 && await page.evaluate(() => /no data:/.test(document.querySelector('.legend')?.textContent ?? '')); k++) {
        await new Promise(r => setTimeout(r, 30000))
        await page.evaluate(() => [...document.querySelectorAll('.legend button')].find(b => b.textContent?.trim() === 'Retry')?.click())
        await new Promise(r => setTimeout(r, 1000))
        await page.waitForFunction(() => { const t = document.querySelector('.legend')?.textContent ?? ''; return !/loading the slice/.test(t) }, { timeout: 300000 })
        console.log('   retried:', await page.evaluate(() => /no data:/.test(document.querySelector('.legend')?.textContent ?? '') ? 'still no data' : 'the slice is in'))
      }
      if (!pre && await page.evaluate(() => /no data:/.test(document.querySelector('.legend')?.textContent ?? ''))) console.log('   STILL NO DATA: shoot', name, 'again:', await page.evaluate(() => (document.querySelector('.legend')?.textContent ?? '').match(/no data: [^·]*/g)?.join(' | ')))
      await new Promise(r => setTimeout(r, 500))
      await page.waitForSelector('.map[data-state=done]', { timeout: 90000 })
    }
    if (hash.includes('view=place')) await page.waitForFunction(() => document.querySelector('article.card') && !document.querySelector('article.card[aria-busy="true"]'), { timeout: 30000 })
    await page.evaluate(() => document.fonts.ready)
    // the globe asks for more tiles after the map first says it is idle: give it a few seconds
    if (hash.includes('proj=globe')) await new Promise(r => setTimeout(r, 6000))
    await new Promise(r => setTimeout(r, 400))
    if (act) { await act(page); await new Promise(r => setTimeout(r, 200)) }
    // the legend is shot on its own
    const legend = name.startsWith('legend_') ? await page.$('#legend') : null
    if (legend) await legend.screenshot({ path: resolve(OUT, name + '.png') })
    // a full-page shot resizes the viewport, so the map (62dvh) asks for new tiles: a layer's slow WMS tiles would be missing from it
    // a hover shot is taken by the protocol itself: puppeteer's screenshot makes the page see the pointer leave (a mouseout), which
    // clears the readout it is meant to show
    else if (name.includes('_hover')) {
      const cdp = await page.createCDPSession()
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(resolve(OUT, name + '.png'), Buffer.from(data, 'base64'))
    }
    else await page.screenshot({ path: resolve(OUT, name + '.png'), fullPage: !name.includes('_full') && !hash.includes('cell=') && !hash.includes('view=place') && !hash.includes('view=report') && !hash.includes('layer=') && !embed })
    // a page-level sideways scroll is a layout bug at any width
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    console.log(name, overflow > 0 ? `PAGE OVERFLOW ${overflow}px` : 'ok', errors.length ? errors : '')
    await page.close()
  }
} finally {
  await browser.close()
  server?.kill()
}
