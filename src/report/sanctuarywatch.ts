// the SanctuaryWatch bundle (plan §7): one figure's files for the Graphic Data plugin (ioos/sanctuarywatch_graphicdata,
// checked at cc7e1932, plugin 1.7.1). plain functions, no DOM: the viewer's Export and the Node figure job write the
// same files. what the plugin needs, and why each choice:
// - data.json is the plugin's columnar schema, `{"metadata": {...}, "data": {"<col>": [...]}}`
//   (validateJson, admin/exopite-simple-options/fields/upload.php:280); missing values are null, never "NA",
//   because its percentile lines do not skip "NA".
// - the long-term mean and ± 1 SD (iea-sd) or median and 10th/90th percentiles (names-pct) ride along as data
//   columns, drawn as dashed lines 2–4, and the plugin's own Mean/StdDev/Percentiles stay off: the plugin uses the
//   population SD, the status the sample SD (R's sd(), as ecoidx), so its own lines would not match the caption.
// - settings are the plugin's `figure_interactive_arguments` pairs, in the order its tutorial figure uses
//   (example_files/tutorial/figure_details.json), plus the same values in words for an editor (settings.md).
// - figures.csv uses the columns of the plugin's staging spreadsheet (docs/planning_companion).
// - every colour comes in through `colors`, resolved by the caller from the theme tokens (hex lives only in
//   brand/themes): the line, the reference lines, the evaluation window, and `off` for the colour fields of the
//   options left off (the plugin's form wants a colour there even then).
import type { MethodId, Point, StatusResult } from '@oceanmetrics/status'

export interface SwFigure {
  indicator: { id: string; title: string; short: string; unit?: string; decimals?: number; citation?: string | null; method?: string }
  place: { id: string; name: string }
  /** the series at year grain, oldest first (period starts `YYYY-01-01`) */
  points: Point[]
  method: MethodId
  result: StatusResult
  sentence: string
  alt: string
  recent: number
  /** the monitoring program credited (the dataset's producer) and its link */
  program: { title: string; url?: string }
  /** the report permalink (the data link: it offers CSV and Parquet) */
  permalink: string
  configHash: string
  manifestVersion: string
  /** the ONMS section the figure belongs to, suggested as the modal tab */
  tab?: string
  /** a stable figure PNG URL, for the External route */
  pngUrl?: string
}

const yearOf = (t: string) => Number(t.slice(0, 4))
const round = (v: number | null, d = 6) => (v == null ? null : Number(v.toFixed(d)))

/** the reference lines of a method as constant columns, so they survive any re-save in the plugin */
function refColumns(f: SwFigure): Record<string, (number | null)[]> {
  const n = f.points.length
  const col = (v: number | null) => Array(n).fill(round(v))
  const r = f.result
  if (f.method === 'iea-sd' && r.ltMean != null && r.ltSd != null) {
    return { mean: col(r.ltMean), mean_plus_1sd: col(r.ltMean + r.ltSd), mean_minus_1sd: col(r.ltMean - r.ltSd) }
  }
  if (f.method === 'names-pct' && r.ltMean != null && r.p10 != null && r.p90 != null) {
    return { median: col(r.ltMean), p90: col(r.p90), p10: col(r.p10) }
  }
  return {}
}

/** data.json: the series as columns, the reference lines as constant columns, the provenance in metadata */
export function swDataJson(f: SwFigure): { metadata: Record<string, string>; data: Record<string, (number | null)[]> } {
  return {
    metadata: {
      indicator: f.indicator.id,
      title: f.indicator.title,
      unit: f.indicator.unit ?? '',
      place_id: f.place.id,
      place: f.place.name,
      status_method: f.method,
      status: f.result.status ?? 'none',
      trend: f.result.trend ?? 'none',
      recent_window: f.result.recentFrom && f.result.recentTo ? `${yearOf(f.result.recentFrom)}-${yearOf(f.result.recentTo)}` : '',
      source: f.indicator.citation ?? '',
      config_hash: f.configHash,
      manifest: f.manifestVersion,
      permalink: f.permalink,
    },
    data: {
      year: f.points.map(p => yearOf(p.t)),
      value: f.points.map(p => round(p.v)),
      ...refColumns(f),
    },
  }
}

/** the plugin's figure_interactive_arguments for the line chart, as [key, value] pairs in its own order */
export function swSettings(f: SwFigure, colors: { line: string; ref: string; window: string; off: string }): [string, string][] {
  const refs = Object.keys(refColumns(f))
  const r = f.result
  const window = r.recentFrom && r.recentTo && f.method !== 'values'
  const out: [string, string][] = [
    ['graphType', 'Plotly line graph (time series)'], ['showGrid', 'on'], ['graphTicks', 'on'],
    ['XAxisTitle', 'Year'], ['XAxisLowBound', ''], ['XAxisHighBound', ''],
    ['YAxisTitle', f.indicator.unit ? `${f.indicator.short} (${f.indicator.unit})` : f.indicator.short],
    ['YAxisLowBound', ''], ['YAxisHighBound', ''],
    ['NumberOfLines', String(1 + refs.length)], ['XAxisFormat', 'YYYY'],
    ['EvaluationPeriod', window ? 'on' : ''],
    ['EvaluationPeriodStartDate', window ? String(yearOf(r.recentFrom!)) : ''],
    ['EvaluationPeriodEndDate', window ? String(yearOf(r.recentTo!)) : ''],
    ['EvaluationPeriodFillColor', colors.window],
    ['EvaluationPeriodText', window ? `Last ${f.recent} years` : ''],
    ['EventMarkers', ''],
    ['XAxis', 'year'],
  ]
  const line = (k: number, field: string, title: string, color: string, type: string, marker: string, legend: string) => out.push(
    [`Line${k}`, field], [`Line${k}Title`, title], [`Line${k}Color`, color], [`Line${k}LineType`, type],
    [`Line${k}MarkerType`, marker], [`Line${k}MarkerSize`, marker === 'none' ? '0' : '6'], [`Line${k}Legend`, legend],
    [`Line${k}ConnectGaps`, ''], [`Line${k}Mean`, ''], [`Line${k}MeanField`, 'auto'], [`Line${k}StdDev`, ''],
    [`Line${k}StdDevInputValues`, 'auto'], [`Line${k}StdDevColor`, colors.off], [`Line${k}ErrorBars`, ''],
    [`Line${k}ErrorBarsInputValues`, 'auto'], [`Line${k}ErrorBarsColor`, colors.off], [`Line${k}Percentiles`, ''],
  )
  line(1, 'value', f.indicator.short, colors.line, 'solid', 'circle', 'on')
  const titles: Record<string, string> = {
    mean: 'Long-term mean', mean_plus_1sd: '+1 SD', mean_minus_1sd: '−1 SD', median: 'Median', p90: '90th percentile', p10: '10th percentile',
  }
  refs.forEach((c, i) => line(i + 2, c, titles[c], colors.ref, i === 0 ? 'dash' : 'dot', 'none', i === 0 ? 'on' : ''))
  return out
}

/** settings.md: what an editor sets in the figure form, the same values as the pairs */
export function swSettingsMd(f: SwFigure, pairs: [string, string][]): string {
  const get = (k: string) => pairs.find(p => p[0] === k)?.[1] ?? ''
  const lines = Number(get('NumberOfLines'))
  const rows = [
    `# ${f.indicator.short} · ${f.place.name}: figure settings`,
    '',
    '1. Figure type: **Interactive**. Upload `data.json`.',
    `2. Graph type: **${get('graphType')}**; X axis column **${get('XAxis')}**, format ${get('XAxisFormat')}; Y axis title "${get('YAxisTitle')}".`,
    `3. Number of lines: **${lines}**.`,
    `   - Line 1: column \`value\`, title "${get('Line1Title')}", solid with markers, legend on.`,
  ]
  for (let k = 2; k <= lines; k++) rows.push(`   - Line ${k}: column \`${get(`Line${k}`)}\`, title "${get(`Line${k}Title`)}", ${get(`Line${k}LineType`)} without markers${get(`Line${k}Legend`) ? ', legend on' : ''}.`)
  rows.push(`   - Leave Mean, Std Dev and Percentiles off on every line: the reference lines are data columns (the status uses the sample SD; the plugin's own lines use the population SD).`)
  if (get('EvaluationPeriod')) rows.push(`4. Evaluation period: on, ${get('EvaluationPeriodStartDate')} to ${get('EvaluationPeriodEndDate')}, text "${get('EvaluationPeriodText')}".`)
  rows.push('', 'Then Preview, then Save: the public page shows only the chart saved with the figure.', '')
  return rows.join('\n')
}

/** captions.md: the short caption is the status sentence; the long one says how to read, the method and the sources */
export function swCaptions(f: SwFigure): { short: string; long: string; md: string } {
  const short = f.sentence
  const how = f.method === 'iea-sd'
    ? `The dashed line is the long-term mean of ${f.place.name}'s own record and the dotted lines are ± 1 standard deviation; the shaded band is the last ${f.recent} years.`
    : f.method === 'names-pct'
      ? `The dashed line is the median of ${f.place.name}'s own record and the dotted lines its 10th and 90th percentiles; the shaded band is the last ${f.recent} years.`
      : 'The values as published, without a status.'
  const end = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : t.trim() + '.')
  const long = [
    how,
    `Status and trend are relative to the place's own record (${f.method}); they are statistical and say nothing about better or worse.`,
    f.indicator.method ? end(`Method: ${f.indicator.method}`) : '',
    f.indicator.citation ? end(`Source: ${f.indicator.citation}`) : '',
    `Configuration ${f.configHash}, manifest ${f.manifestVersion}. Data and permalink: ${f.permalink}`,
  ].filter(Boolean).join(' ')
  const md = `# Captions\n\n## Short\n\n${short}\n\n## Extended\n\n${long}\n`
  return { short, long, md }
}

// ---- figures.csv ----

export const STAGING_COLUMNS = [
  'Lead person', 'Figure Title', 'Corresponding Scene', 'Corresponding Icon', 'Corresponding Modal Tab', 'Figure Order',
  'Monitoring Program Title', 'Monitoring Program Link', 'Data Title', 'Data Link', 'Figure Type', 'Figure title',
  'Static Figure Image File', 'Short Figure Caption', 'Extended Figure Caption', 'Data Point of Contact',
  'Internal Communication/Notes',
] as const

const csvCell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s)

/** one figure's row of the staging spreadsheet; scene and icon are left for site staff */
export function swStagingRow(f: SwFigure, order: number, type: 'Interactive' | 'External'): string[] {
  const cap = swCaptions(f)
  return [
    '', `${f.indicator.short} · ${f.place.name}`, '', '', f.tab ?? '', String(order),
    f.program.title, f.program.url ?? '', `${f.indicator.title}, ${f.place.name} (Ocean Metrics Indicators)`, f.permalink,
    type === 'Interactive' ? 'interactive figure (upload json)' : 'external image (insert link)', '',
    type === 'External' ? f.pngUrl ?? '' : '', cap.short, cap.long, '',
    `indicator ${f.indicator.id}; place ${f.place.id}; config ${f.configHash}; manifest ${f.manifestVersion}`,
  ]
}

/** figures.csv for a set of figures (RFC 4180: quoted where needed; this sheet is for people, not the importer) */
export function swFiguresCsv(rows: string[][]): string {
  return [STAGING_COLUMNS as readonly string[], ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** the bundle's folder name for a figure: `<place>__<indicator>`, safe on every file system */
export function swFolder(placeId: string, indicatorId: string): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_')
  return `${safe(placeId)}__${safe(indicatorId)}`
}
