// the report's Export > SanctuaryWatch bundle: a ZIP of the folders scripts/sanctuarywatch_bundle.ts writes, for every place x
// indicator of the report that has a year-grain iea-sd or names-pct status, plus figures.csv. the text files are
// src/report/swBundle.ts's (the same functions the job uses); figure.svg is the report's own chart (figureSvg.ts: chart.ts's
// geometry with colours resolved from the light theme) and figure.png that svg drawn at 2x in a canvas. `planSwBundle` is
// plain (which figures, which are left out and why, the files); `buildSwZip` adds the browser's part: the palette, the PNGs, the
// archive. the status, sentence and alt text are the card model's (@oceanmetrics/status).
import type { ReportSpec } from '../../../../src/report/spec.ts'
import { specId } from '../../../../src/report/spec.ts'
import { swFolder } from '../../../../src/report/sanctuarywatch.ts'
import type { SwFigure } from '../../../../src/report/sanctuarywatch.ts'
import { swBundleFiles } from '../../../../src/report/swBundle.ts'
import type { SwColors } from '../../../../src/report/swBundle.ts'
import { zipStore } from '../../../../src/report/zip.ts'
import type { ZipFile } from '../../../../src/report/zip.ts'
import type { Catalog, Indicator } from '../data.ts'
import { configHash, configLines } from '../delivery.ts'
import type { Place } from '../matrix.ts'
import { clipYears, seriesOf } from '../place.ts'
import { cellKey, modelFor } from './cells.ts'
import type { CellResult } from './cells.ts'
import { figureSvg, PALETTE_TOKENS } from './figureSvg.ts'
import type { FigurePalette } from './figureSvg.ts'
import { recentFor } from './scorecard.ts'

/** the figure size of the bundle: the SVG's own units; the PNG is drawn at twice this */
export const FIGURE_SIZE = { width: 760, height: 420 }

export interface SwSkip { place: string; indicator: string; why: string }
export interface SwPlan {
  figures: SwFigure[]
  skipped: SwSkip[]
  /** the folder and the zip's name stem: `sanctuarywatch_<place id>` for one place, else the report id */
  stem: string
}

export interface SwContext {
  catalog: Pick<Catalog, 'manifest'>
  spec: ReportSpec
  /** the address of a place x indicator in the Place view, absolute */
  permalink: (place: Place, ind: Indicator) => string
}

const EXPORTED = new Set(['iea-sd', 'names-pct'])

/** the figure of one place x indicator, or why it has none */
export function swFigureFor(ind: Indicator, place: Place, result: CellResult | undefined, ctx: SwContext): SwFigure | { why: string } {
  if (!result) return { why: 'its values did not arrive' }
  if (result.s === 'error') return { why: `its values did not load (${result.msg})` }
  const m = result.model
  if (m.kind !== 'continuous') return { why: 'not a continuous series' }
  if (!EXPORTED.has(m.method)) return { why: `its status method is ${m.method}; the bundle holds iea-sd and names-pct` }
  if (m.grain !== 'year') return { why: `its status is at the ${m.grain} grain; the bundle holds year grain` }
  const points = clipYears(seriesOf(result.rows, 'year'), ctx.spec.time.from, ctx.spec.time.to)
  if (!m.result || points.every(p => p.v == null)) return { why: 'no year values' }
  const manifest = ctx.catalog.manifest
  const producer = ind.dataset.providers.find(p => p.roles.includes('producer')) ?? ind.dataset.providers[0]
  const onms = manifest.vocabularies.onms.terms.find(t => t.id === ind.category.onms)
  return {
    indicator: { id: ind.id, title: ind.title, short: ind.short, unit: ind.unit_label ?? '', decimals: ind.decimals ?? 2, citation: ind.citation ?? null, method: ind.method.summary },
    place: { id: place.id, name: place.name },
    points, method: m.method, recent: recentFor(ind, ctx.spec), result: m.result, sentence: m.sentence, alt: m.alt,
    program: { title: producer?.name ?? ind.producer.name, url: producer?.url },
    permalink: ctx.permalink(place, ind),
    configHash: configHash(configLines(ind, place, manifest.version)),
    manifestVersion: manifest.version,
    tab: onms?.label ?? '',
  }
}

/** which figures the report has, in the order of its places then indicators, and which pairs are left out */
export function planSwBundle(places: Place[], inds: Indicator[], results: Map<string, CellResult>, ctx: SwContext): SwPlan {
  const figures: SwFigure[] = []
  const skipped: SwSkip[] = []
  for (const place of places) {
    for (const ind of inds) {
      const r = swFigureFor(ind, place, results.get(cellKey(place, ind)), ctx)
      if ('why' in r) skipped.push({ place: place.name, indicator: ind.short, why: r.why })
      else figures.push(r)
    }
  }
  const stem = places.length === 1
    ? `sanctuarywatch_${swFolder(places[0].id, 'x').replace(/__x$/, '')}`
    : `sanctuarywatch_${specId(ctx.spec, ctx.catalog.manifest.version)}`
  return { figures, skipped, stem }
}

// ---- the browser's part ----

const hexOf = (value: string): string => {
  const g = document.createElement('canvas').getContext('2d')
  if (!g) return value
  g.fillStyle = 'black'
  g.fillStyle = value
  return g.fillStyle
}

/** the light theme's colours, read from its tokens through a hidden element that carries data-theme="light" */
export function lightPalette(): { palette: FigurePalette; colors: SwColors } {
  const probe = document.createElement('div')
  probe.dataset.theme = 'light'
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'
  document.body.appendChild(probe)
  try {
    const cs = getComputedStyle(probe)
    const get = (t: string) => cs.getPropertyValue(t).trim()
    const palette = Object.fromEntries(Object.entries(PALETTE_TOKENS).map(([k, t]) => [k, k === 'font' ? get(t) || 'monospace' : hexOf(get(t))])) as unknown as FigurePalette
    return { palette, colors: { line: hexOf(get('--brand')), ref: palette.text, window: palette.band, off: palette.strong } }
  } finally {
    probe.remove()
  }
}

/** an SVG drawn at `scale` times its size in a canvas, as PNG bytes; null when the browser cannot */
export async function svgToPng(svg: string, width: number, height: number, scale = 2): Promise<Uint8Array | null> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const c = document.createElement('canvas')
    c.width = width * scale
    c.height = height * scale
    const g = c.getContext('2d')
    if (!g) return null
    g.drawImage(img, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/png'))
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

export interface SwZip {
  blob: Blob
  name: string
  figures: number
  /** figures whose PNG the browser could not draw (the folder holds the SVG) */
  noPng: number
}

/** the archive of a plan: the text files, then each figure's svg and png in its folder, under one folder named for the stem */
export async function buildSwZip(plan: SwPlan): Promise<SwZip> {
  const { palette, colors } = lightPalette()
  const files: ZipFile[] = swBundleFiles(plan.figures, colors, 'Interactive').map(f => ({ path: `${plan.stem}/${f.path}`, data: f.text }))
  let noPng = 0
  for (const f of plan.figures) {
    const dir = `${plan.stem}/${swFolder(f.place.id, f.indicator.id)}`
    const svg = figureSvg({ points: f.points, result: f.result, method: f.method, title: `${f.indicator.short} · ${f.place.name}`, unit: f.indicator.unit ?? '', alt: f.alt, recent: f.recent }, palette, FIGURE_SIZE)
    files.push({ path: `${dir}/figure.svg`, data: svg })
    const png = await svgToPng(svg, FIGURE_SIZE.width, FIGURE_SIZE.height, 2)
    if (png) files.push({ path: `${dir}/figure.png`, data: png })
    else noPng++
  }
  return { blob: new Blob([zipStore(files) as BlobPart], { type: 'application/zip' }), name: `${plan.stem}.zip`, figures: plan.figures.length, noPng }
}

