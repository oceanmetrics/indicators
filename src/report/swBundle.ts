// the SanctuaryWatch bundle's text files, assembled once for both writers: scripts/sanctuarywatch_bundle.ts (the daily job, to
// disk) and the viewer's Export menu (a ZIP in the browser). a figure's folder is `swFolder(place, indicator)` holding
// data.json, settings.json, settings.md, captions.md and alt.txt; the figure.svg and figure.png are drawn by the caller
// (the viewer rasterises its own chart, the job screenshots the embed route); one figures.csv lists the set. all of it
// comes from sanctuarywatch.ts, so the two writers cannot drift.
import { swCaptions, swDataJson, swFiguresCsv, swFolder, swSettings, swSettingsMd, swStagingRow } from './sanctuarywatch.ts'
import type { SwFigure } from './sanctuarywatch.ts'

export interface SwColors { line: string; ref: string; window: string; off: string }
export interface SwFile { path: string; text: string }

/** the text files of one figure, named as they sit in its folder */
export function swFigureFiles(f: SwFigure, colors: SwColors): { name: string; text: string }[] {
  const pairs = swSettings(f, colors)
  return [
    { name: 'data.json', text: JSON.stringify(swDataJson(f), null, 1) + '\n' },
    { name: 'settings.json', text: JSON.stringify(pairs) + '\n' },
    { name: 'settings.md', text: swSettingsMd(f, pairs) },
    { name: 'captions.md', text: swCaptions(f).md },
    { name: 'alt.txt', text: f.alt + '\n' },
  ]
}

/**
 * every text file of a bundle, paths relative to its root: `<place>__<indicator>/<file>` for each figure, in order, then
 * `figures.csv`. `type` is how the staging sheet says the figure is delivered: an uploaded data.json (Interactive) or a link
 * to a published PNG (External, which needs `pngUrl` on each figure).
 */
export function swBundleFiles(figures: SwFigure[], colors: SwColors, type: 'Interactive' | 'External'): SwFile[] {
  const files: SwFile[] = []
  const rows: string[][] = []
  figures.forEach((f, k) => {
    const dir = swFolder(f.place.id, f.indicator.id)
    for (const x of swFigureFiles(f, colors)) files.push({ path: `${dir}/${x.name}`, text: x.text })
    rows.push(swStagingRow(f, k + 1, type))
  })
  files.push({ path: 'figures.csv', text: swFiguresCsv(rows) })
  return files
}
