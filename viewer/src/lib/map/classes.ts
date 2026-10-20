// the Map view's rules, in plain functions: which colouring modes an indicator offers, the periods a slider walks,
// and for each place its value, status, trend and class under a mode. a status or trend is never computed here:
// assess() in src/status does it, on the place's series cut at the period shown, with the options the coverage
// builder uses, so at the latest period the map and the coverage row cannot disagree. the colours are token names
// (`--map-seq-3`); the components resolve them against the theme.
import { assess, fmt, grainNoun, periodLabel } from '../../../../src/status/index.ts'
import type { Grain, MethodId, Status, Trend } from '../../../../src/status/index.ts'
import { quantile7 } from '../../../../src/status/stats.ts'
import type { CoverageRow } from '../../../../src/coverage/build.ts'
import type { IconName } from '../../../../src/icons/index.ts'
import type { Indicator } from '../data.ts'
import type { MapColor } from '../hash.ts'
import { STATUS_WORDS, TREND_WORDS } from '../matrix.ts'
import { defaultMethod, seriesOf } from '../place.ts'
import type { PlaceRow } from '../valuesData.ts'

export interface MapOpts {
  /** the collection drawn; every collection of the indicator when null */
  coll?: string | null
  color: MapColor | null
  /** the period shown ("2024", "2024-07"); null = each place's latest */
  t: string | null
  /** the status method; the indicator's own when null */
  method: MethodId | null
  /** the class `share` maps; the most frequent class when null */
  cls: string | null
}

export interface LegendEntry {
  k: number
  /** the CSS custom property that colours it (`--map-seq-2`) */
  token: string
  label: string
  /** the shape that says it without colour (status and trend) */
  glyph?: IconName
  /** places in this class */
  count: number
}

export interface MapItem {
  placeId: string
  name: string
  value: number | null
  /** the value with its unit, or null */
  valueText: string | null
  /** the period the value is of (an ISO date), and as a reader says it */
  period: string | null
  periodText: string | null
  /** the index into the legend, null when the place has no class under this mode */
  k: number | null
  /** the class label, or why there is none */
  label: string
  status: Status | null
  trend: Trend | null
  /** departure from the place's own mean, in SD (departure mode) */
  z?: number | null
}

export interface MapModel {
  color: MapColor
  modes: MapColor[]
  method: MethodId
  grain: Grain
  /** every period (ISO date) the slider can show, oldest first; just the latest until the values file has loaded */
  periods: string[]
  /** the period shown: the one asked for, else the latest */
  period: string | null
  /** true when the request waits for the values file (a past period, a method, shares) */
  pending: boolean
  items: MapItem[]
  legend: LegendEntry[]
  /** the token of the outline of a place with no class */
  none: string
  noneLabel: string
  /** categorical: the class `share` maps, and the classes to choose from (most frequent first) */
  cls: string | null
  classChoices: { cls: string; label: string }[]
}

export const NONE_TOKEN = '--map-none'
const seq = (i: number) => `--map-seq-${i}`

// ---- modes ----

export const MODE_LABELS: Record<MapColor, string> = {
  value: 'Value', departure: 'Departure from its mean', status: 'Status', trend: 'Trend',
  record: 'Length of record', class: 'Largest class', share: 'Share of a class',
}

/** the colourings an indicator offers, and the one it opens with */
export function mapModes(ind: Indicator, coverage: Pick<CoverageRow, 'status'>[], grain: Grain = ind.status_grain): { modes: MapColor[]; default: MapColor } {
  if (ind.kind === 'categorical') return { modes: ['class', 'share', 'record'], default: 'class' }
  // a status exists at the status grain only
  if (defaultMethod(ind) === 'values' || grain !== ind.status_grain) return { modes: ['value', 'record'], default: 'value' }
  return {
    modes: ['value', 'departure', 'status', 'trend', 'record'],
    default: coverage.some(r => r.status != null) ? 'status' : 'value',
  }
}

// ---- periods ----

const GRAIN_FALLBACK: Grain[] = ['year', 'month', 'decade', 'day', 'all']

/**
 * the grain the map reads: the indicator's status grain, or, when no place has a value there (an indicator whose
 * record is monthly), the first other grain that does, as the Matrix picks a cell's row
 */
export function mapGrain(ind: Pick<Indicator, 'status_grain'>, coverage: Pick<CoverageRow, 'time_grain' | 'last_value' | 'last_class'>[]): Grain {
  const has = (g: Grain) => coverage.some(r => r.time_grain === g && (r.last_value != null || r.last_class != null))
  return [ind.status_grain, ...GRAIN_FALLBACK].find(has) ?? ind.status_grain
}

/** a hash `t` ("2024", "2024-07") as the start of the period it names at a grain ("2024-01-01"); null if it is not a date */
export function periodStart(t: string, grain: Grain): string | null {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(t)
  if (!m) return null
  const y = m[1], mo = m[2] ?? '01', d = m[3] ?? '01'
  switch (grain) {
    case 'decade': return `${String(Math.floor(Number(y) / 10) * 10).padStart(4, '0')}-01-01`
    case 'year': return `${y}-01-01`
    case 'month': return `${y}-${mo}-01`
    default: return `${y}-${mo}-${d}`
  }
}

/** a period start as the hash writes it: "2024" for a year, "2024-07" for a month */
export function periodToT(start: string, grain: Grain): string {
  return grain === 'month' ? start.slice(0, 7) : grain === 'day' ? start.slice(0, 10) : start.slice(0, 4)
}

// ---- classes ----

/** which of the five sequential steps `k` classes use, 1-based: all five, then spread over the ramp */
export function rampSteps(k: number): number[] {
  if (k <= 0) return []
  if (k === 1) return [3]
  return Array.from({ length: k }, (_, j) => Math.round((j * 4) / (k - 1)) + 1)
}

/** quantile classes: the class index (0..) of each value, with the classes that hold no value dropped */
export function quantileClasses(values: number[], n = 5): number[] {
  if (values.length === 0) return []
  const cuts = Array.from({ length: n - 1 }, (_, j) => quantile7(values, (j + 1) / n))
  const raw = values.map(v => cuts.filter(c => v > c).length)
  const used = [...new Set(raw)].sort((a, b) => a - b)
  return raw.map(r => used.indexOf(r))
}

export function departureClass(z: number): number {
  return z <= -1 ? 0 : z <= -0.5 ? 1 : z < 0.5 ? 2 : z < 1 ? 3 : 4
}
export function recordClass(n: number): number {
  return n < 5 ? 0 : n < 10 ? 1 : n < 20 ? 2 : n < 30 ? 3 : 4
}
export function shareClass(v: number): number {
  return v < 0.2 ? 0 : v < 0.4 ? 1 : v < 0.6 ? 2 : v < 0.8 ? 3 : 4
}

const DEPARTURE_LABELS = [
  '1 SD or more below its own mean', '0.5 to 1 SD below its own mean', 'Within 0.5 SD of its own mean',
  '0.5 to 1 SD above its own mean', '1 SD or more above its own mean',
]
const SHARE_LABELS = ['0–20 %', '20–40 %', '40–60 %', '60–80 %', '80–100 %']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ---- one place under a mode ----

interface P {
  id: string
  name: string
  /** the coverage row at the status grain */
  cov: CoverageRow | null
  /** the place's rows from the values file, once loaded */
  rows: PlaceRow[] | null
}

interface Cell {
  value: number | null
  period: string | null
  /** why there is no value */
  why: string | null
}

const unitText = (ind: Indicator, v: number | null) => {
  if (v == null) return null
  const u = ind.unit_label ?? ''
  return `${fmt(v, ind.decimals ?? 2)}${u ? ' ' + u : ''}`
}

function continuousCell(p: P, at: string | null, grain: Grain): Cell | 'pending' {
  if (at == null) {
    const r = p.cov
    return r && r.last_value != null
      ? { value: r.last_value, period: r.last_time, why: null }
      : { value: null, period: null, why: r?.why ?? `no ${grain} value` }
  }
  if (!p.rows) return 'pending'
  const pt = seriesOf(p.rows, grain).find(x => x.t === at)
  return pt ? { value: pt.v, period: at, why: null } : { value: null, period: null, why: `no value in ${periodLabel(at, grain)}` }
}

/** the status and trend of the series cut at the cell's period (as of it), by the method asked for */
function statusOf(ind: Indicator, p: P, cell: Cell, method: MethodId, grain: Grain): { status: Status | null; trend: Trend | null; why: string | null } | 'pending' {
  if (method === 'values') return { status: null, trend: null, why: 'shown as values, with no status' }
  if (cell.value == null || cell.period == null) return { status: null, trend: null, why: cell.why }
  if (p.rows) {
    const series = seriesOf(p.rows, grain).filter(x => x.t <= (cell.period as string))
    const r = assess(series, method, { grain, recent: ind.recent, minPeriods: ind.min_periods }, { title: ind.short, place: p.name }).result
    return { status: r.status, trend: r.trend, why: r.why }
  }
  if (method === defaultMethod(ind) && p.cov) return { status: p.cov.status, trend: p.cov.trend, why: p.cov.why }
  return 'pending'
}

/** the place's long-term mean and sample SD over its whole record (iea-sd's definitions) */
function longTerm(ind: Indicator, p: P, grain: Grain): { mean: number | null; sd: number | null; why: string | null } | 'pending' {
  if (p.rows) {
    const r = assess(seriesOf(p.rows, grain), 'iea-sd', { grain, recent: ind.recent, minPeriods: ind.min_periods }, { title: ind.short, place: p.name }).result
    return { mean: r.ltMean, sd: r.ltSd, why: r.why }
  }
  if (defaultMethod(ind) === 'iea-sd' && p.cov) return { mean: p.cov.lt_mean, sd: p.cov.lt_sd, why: p.cov.why }
  return 'pending'
}

interface CatCell {
  cls: string | null
  value: number | null
  period: string | null
  /** every class of the period with its share (null until the values file has loaded) */
  shares: Map<string, number> | null
  why: string | null
}

function categoricalCell(p: P, at: string | null, grain: Grain): CatCell | 'pending' {
  const none = (why: string): CatCell => ({ cls: null, value: null, period: null, shares: null, why })
  const period = at ?? p.cov?.last_time ?? null
  if (p.rows && period) {
    const rows = p.rows.filter(r => r.time_grain === grain && r.time === period && r.value != null && r.class != null)
    if (rows.length === 0) return none(`no value in ${periodLabel(period, grain)}`)
    const top = [...rows].sort((a, b) => (b.value as number) - (a.value as number) || (a.class as string).localeCompare(b.class as string))[0]
    return { cls: top.class, value: top.value, period, shares: new Map(rows.map(r => [r.class as string, r.value as number])), why: null }
  }
  if (at != null) return 'pending'
  const r = p.cov
  if (!r || r.last_class == null) return none(r?.why ?? `no ${grain} value`)
  return { cls: r.last_class, value: r.last_value, period: r.last_time, shares: null, why: null }
}

/** periods with a value at the status grain across the places, oldest first */
function periodsOf(places: P[], grain: Grain): string[] {
  const s = new Set<string>()
  for (const p of places) {
    if (p.rows) for (const r of p.rows) { if (r.time_grain === grain && r.time && r.value != null) s.add(r.time) }
    else if (p.cov?.last_time) s.add(p.cov.last_time)
  }
  return [...s].sort()
}

// ---- the model ----

/**
 * the map of one indicator in one collection: a class (or none, with the reason) for every place that has coverage,
 * and the legend that explains the classes. `values` are the indicator's rows by place once the values file has
 * loaded (null before): until then the latest period is read from the coverage rows, which the values reproduce.
 */
export function mapModel(ind: Indicator, coverage: CoverageRow[], values: Map<string, PlaceRow[]> | null, opts: MapOpts): MapModel {
  const mine = coverage.filter(r => r.indicator === ind.id && (!opts.coll || r.coll === opts.coll))
  const grain = mapGrain(ind, mine)
  const byPlace = new Map<string, CoverageRow[]>()
  for (const r of mine) byPlace.set(r.place_id, [...(byPlace.get(r.place_id) ?? []), r])
  const places: P[] = [...byPlace.entries()].map(([id, rs]) => {
    const cov = rs.find(r => r.time_grain === grain) ?? null
    return { id, name: rs[0].place_name || id, cov, rows: values ? values.get(id) ?? [] : null }
  }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))

  const { modes, default: dflt } = mapModes(ind, mine, grain)
  const color: MapColor = opts.color && modes.includes(opts.color) ? opts.color : dflt
  // a status exists at the status grain only: any other grain shows its values
  const method: MethodId = grain === ind.status_grain ? opts.method ?? defaultMethod(ind) : 'values'
  const periods = periodsOf(places, grain)
  const at = opts.t ? periodStart(opts.t, grain) : null
  const period = at ?? periods[periods.length - 1] ?? null
  const periodText = (p: string | null) => (p ? periodLabel(p, grain) : null)

  let pending = at != null && !values
  const items: MapItem[] = []
  const legend: LegendEntry[] = []
  const noneLabel = 'No value'
  const base = (p: P, cell: { value: number | null; period: string | null }): MapItem => ({
    placeId: p.id, name: p.name, value: cell.value, valueText: unitText(ind, cell.value), period: cell.period,
    periodText: periodText(cell.period), k: null, label: noneLabel, status: null, trend: null,
  })
  const set = (it: MapItem, k: number | null, why: string | null) => {
    it.k = k
    if (k == null) it.label = why ?? noneLabel
  }
  let cls: string | null = null
  let classChoices: { cls: string; label: string }[] = []

  if (ind.kind === 'categorical') {
    // ---- categorical: the largest class, its share, the length of record ----
    const cells = places.map(p => ({ p, c: categoricalCell(p, at, grain) }))
    const label = (c: string) => ind.classes?.[c] ?? c
    const counts = new Map<string, number>()
    for (const { c } of cells) if (c !== 'pending' && c.cls) counts.set(c.cls, (counts.get(c.cls) ?? 0) + 1)
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c)
    classChoices = ranked.map(c => ({ cls: c, label: label(c) }))
    cls = opts.cls && ind.classes && opts.cls in ind.classes ? opts.cls : opts.cls && counts.has(opts.cls) ? opts.cls : ranked[0] ?? null
    for (const { p, c } of cells) {
      if (c === 'pending') { pending = true; items.push(base(p, { value: null, period: null })); continue }
      const it = base(p, { value: c.value, period: c.period })
      items.push(it)
      if (color === 'record') {
        const n = p.rows ? new Set(p.rows.filter(r => r.time_grain === grain && r.value != null && r.time && (!c.period || r.time <= c.period)).map(r => r.time)).size : p.cov?.n_periods ?? 0
        set(it, c.period ? recordClass(n) : null, c.why)
      } else if (color === 'share') {
        if (!c.period) { set(it, null, c.why); continue }
        if (!c.shares) { pending = true; set(it, null, 'loading'); continue }
        const v = cls ? c.shares.get(cls) ?? 0 : 0
        it.value = v; it.valueText = `${fmt(v * 100, 0)} %`
        set(it, shareClass(v), null)
      } else {
        set(it, null, c.why)   // `class`: the index is filled in below, once the legend is known
      }
    }
    if (color === 'share') {
      SHARE_LABELS.forEach((l, k) => legend.push({ k, token: seq(k + 1), label: l, count: 0 }))
    } else if (color === 'record') {
      const noun = grainNoun(grain, 2)
      const ls = [`Fewer than 5 ${noun}`, `5 to 9 ${noun}`, `10 to 19 ${noun}`, `20 to 29 ${noun}`, `30 ${noun} or more`]
      ls.forEach((l, k) => legend.push({ k, token: seq(k + 1), label: l, count: 0 }))
    } else {
      const kOf = new Map<string, number>()
      if (ind.ordinal) {
        const order = Object.keys(ind.classes ?? {}).filter(c => counts.has(c))
        const steps = rampSteps(order.length)
        order.forEach((c, k) => { kOf.set(c, k); legend.push({ k, token: seq(steps[k]), label: label(c), count: 0 }) })
      } else {
        ranked.forEach((c, k) => kOf.set(c, Math.min(k, 3)))
        ranked.slice(0, 3).forEach((c, k) => legend.push({ k, token: `--map-cat-${k + 1}`, label: label(c), count: 0 }))
        if (ranked.length > 3) legend.push({ k: 3, token: '--map-cat-other', label: 'Other classes', count: 0 })
      }
      items.forEach((it, i) => {
        const c = cells[i].c
        if (c === 'pending' || !c.cls) return
        it.k = kOf.get(c.cls) ?? null
        it.label = `${label(c.cls)}${c.value != null ? ` ${fmt(c.value * 100, 0)} %` : ''}`
      })
    }
  } else {
    // ---- continuous ----
    const cells = places.map(p => ({ p, c: continuousCell(p, at, grain) }))
    for (const { p, c } of cells) {
      if (c === 'pending') { items.push(base(p, { value: null, period: null })); continue }
      const it = base(p, c)
      items.push(it)
      const needsStatus = color === 'status' || color === 'trend'
      const s = statusOf(ind, p, c, method, grain)
      if (s === 'pending') { if (needsStatus) pending = true } else { it.status = s.status; it.trend = s.trend }
      if (c.value == null) { set(it, null, c.why); continue }
      if (color === 'status' || color === 'trend') {
        if (s === 'pending') { set(it, null, 'loading'); continue }
        const v = color === 'status' ? s.status : s.trend
        const order: string[] = color === 'status' ? ['below', 'within', 'above'] : ['down', 'flat', 'up']
        set(it, v ? order.indexOf(v) : null, s.why ?? (method === 'values' ? 'shown as values, with no status' : 'no status'))
      } else if (color === 'departure') {
        const lt = longTerm(ind, p, grain)
        if (lt === 'pending') { pending = true; set(it, null, 'loading'); continue }
        if (lt.mean == null || lt.sd == null || !Number.isFinite(lt.sd)) { set(it, null, lt.why ?? 'record too short'); continue }
        if (lt.sd === 0) { set(it, null, 'no variation in its record'); continue }
        it.z = (c.value - lt.mean) / lt.sd
        set(it, departureClass(it.z), null)
      } else if (color === 'record') {
        const n = c.period && p.rows
          ? seriesOf(p.rows, grain).filter(x => x.t <= (c.period as string)).length
          : p.cov?.n_periods ?? 0
        set(it, recordClass(n), null)
      }
    }
    if (color === 'value') {
      const have = items.filter(it => it.value != null)
      const ks = quantileClasses(have.map(it => it.value as number))
      have.forEach((it, i) => { it.k = ks[i] })
      const nk = ks.length ? Math.max(...ks) + 1 : 0
      const steps = rampSteps(nk)
      const dec = ind.decimals ?? 2
      const u = ind.unit_label ?? ''
      for (let k = 0; k < nk; k++) {
        const vs = have.filter(it => it.k === k).map(it => it.value as number)
        const lo = fmt(Math.min(...vs), dec), hi = fmt(Math.max(...vs), dec)
        legend.push({ k, token: seq(steps[k]), label: `${lo === hi ? lo : `${lo} to ${hi}`}${u ? ' ' + u : ''}`, count: vs.length })
      }
    } else if (color === 'departure') {
      DEPARTURE_LABELS.forEach((l, k) => legend.push({ k, token: `--map-div-${k + 1}`, label: l, count: 0 }))
    } else if (color === 'status') {
      const g: Status[] = ['below', 'within', 'above']
      g.forEach((s, k) => legend.push({ k, token: `--map-st-${s}`, label: cap(STATUS_WORDS[s]), glyph: `st-${s}`, count: 0 }))
    } else if (color === 'trend') {
      const g: Trend[] = ['down', 'flat', 'up']
      g.forEach((t, k) => legend.push({ k, token: `--map-tr-${t}`, label: `Trend ${TREND_WORDS[t]}`, glyph: `tr-${t}`, count: 0 }))
    } else if (color === 'record') {
      const noun = grainNoun(grain, 2)
      const ls = [`Fewer than 5 ${noun}`, `5 to 9 ${noun}`, `10 to 19 ${noun}`, `20 to 29 ${noun}`, `30 ${noun} or more`]
      ls.forEach((l, k) => legend.push({ k, token: seq(k + 1), label: l, count: 0 }))
    }
  }

  // counts from the items; every class label is the legend's, except a categorical class (its share rides along)
  for (const l of legend) l.count = items.filter(it => it.k === l.k).length
  if (color !== 'class') for (const it of items) if (it.k != null && legend[it.k]) it.label = legend[it.k].label

  return { color, modes, method, grain, periods, period, pending, items, legend, none: NONE_TOKEN, noneLabel, cls, classChoices }
}

/** place_id -> the token that colours it; places with no class are absent (the map outlines them in `none`) */
export function placeTokens(m: Pick<MapModel, 'items' | 'legend'>): Map<string, string> {
  const out = new Map<string, string>()
  for (const it of m.items) if (it.k != null && m.legend[it.k]) out.set(it.placeId, m.legend[it.k].token)
  return out
}

/** the table's order: by class, then value, places with no class last (then by name) */
export function tableOrder(items: MapItem[]): MapItem[] {
  return [...items].sort((a, b) =>
    (a.k == null ? 1 : 0) - (b.k == null ? 1 : 0) || (a.k ?? 0) - (b.k ?? 0) ||
    (a.value ?? 0) - (b.value ?? 0) || a.name.localeCompare(b.name))
}
