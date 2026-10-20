// one Scorecard cell: the glyphs, the last value and the accessible name of a place x indicator. the status is read from
// the coverage row (src/coverage, built with src/status) when the spec asks what the indicator's own default already
// is; when the spec's method, window, baseline or years differ, it is recomputed from the place's values with assess()
// in src/status, as the Place view does. nothing here computes a status.
import { assess } from '../../../../src/status/index.ts'
import type { MethodId, StatusResult } from '../../../../src/status/index.ts'
import { DEFAULT_SPEC, exceptionRank } from '../../../../src/report/spec.ts'
import type { ReportSpec } from '../../../../src/report/spec.ts'
import type { CoverageRow } from '../../../../src/coverage/build.ts'
import type { Indicator } from '../data.ts'
import { cellAria, cellModel, classText, periodText, valueText } from '../matrix.ts'
import type { CellKind, Place, StatusIcon, TrendIcon } from '../matrix.ts'
import { clipYears, defaultMethod, seriesOf } from '../place.ts'
import type { ValueRow } from '../valuesData.ts'

export interface ScoreCell {
  kind: CellKind
  statusIcon: StatusIcon | null
  trendIcon: TrendIcon | null
  stateIcon: 'cell-na' | 'cell-live' | null
  /** the last value with its unit, the top class of a categorical one, or "" */
  value: string
  /** the period of that value */
  period: string
  /** the accessible name and the title: place, indicator, value, status and trend in words */
  aria: string
  /** exceptionRank of the status and trend shown: 0 out of range, 1 a trend, 2 in range, 3 none */
  rank: number
}

/**
 * the status method the spec asks of an indicator. the spec's default (`iea-sd`) means "each indicator's own"; another
 * method is asked of every indicator that has a status method. an indicator whose own method is `values` (SDG latest
 * year, class shares) never gets a status, whatever the spec says.
 */
export function methodFor(ind: Pick<Indicator, 'status_method'>, spec: ReportSpec): MethodId | null {
  if (defaultMethod(ind) === 'values') return null
  return spec.style.status === DEFAULT_SPEC.style.status ? defaultMethod(ind) : spec.style.status
}

/** the recent window the spec asks of an indicator: its own unless the spec changed the default of 5 */
export function recentFor(ind: Pick<Indicator, 'recent'>, spec: ReportSpec): number {
  return spec.style.recent === DEFAULT_SPEC.style.recent ? ind.recent : spec.style.recent
}

/** does the spec ask for something the coverage row does not already hold? (then the place's values are needed) */
export function needsRecompute(ind: Indicator, row: CoverageRow | null, spec: ReportSpec): boolean {
  if (ind.kind !== 'continuous' || !row || row.last_value == null || row.time_grain !== ind.status_grain) return false
  const m = methodFor(ind, spec)
  if (!m) return false
  return m !== defaultMethod(ind) || recentFor(ind, spec) !== ind.recent || spec.style.baseline != null || spec.time.from != null || spec.time.to != null
}

/** the status of a place's values under the spec's style (src/status assess), on the years the spec keeps */
export function recomputeStatus(ind: Indicator, place: Place, rows: Pick<ValueRow, 'time_grain' | 'time' | 'value'>[], spec: ReportSpec): StatusResult {
  const series = clipYears(seriesOf(rows, ind.status_grain), spec.time.from, spec.time.to)
  const ctx = { title: ind.short, place: place.name, unit: ind.unit_label ?? '', decimals: ind.decimals ?? 2 }
  const opts = { grain: ind.status_grain, recent: recentFor(ind, spec), minPeriods: ind.min_periods, baseline: spec.style.baseline }
  return assess(series, methodFor(ind, spec) ?? defaultMethod(ind), opts, ctx).result
}

/** the cell for a coverage row, or for the same row under a recomputed status */
export function scoreCell(ind: Indicator, place: Place, row: CoverageRow | null, result: StatusResult | null = null): ScoreCell {
  // a recomputed status replaces the row's, so the glyphs and the words come from one model
  const r: CoverageRow | null = row && result
    ? { ...row, status: result.status, trend: result.trend, status_method: result.method === 'values' ? null : result.method } as CoverageRow
    : row
  const m = cellModel(ind, place, r)
  const stat = m.kind === 'value' && r ? { status: r.status, trend: r.trend } : { status: null, trend: null }
  return {
    kind: m.kind,
    statusIcon: m.statusIcon,
    trendIcon: m.trendIcon,
    stateIcon: m.stateIcon,
    value: m.kind === 'value' && r ? valueText(ind, r) : m.kind === 'class' && r ? classText(ind, r) : '',
    period: (m.kind === 'value' || m.kind === 'class') && r ? periodText(r) : '',
    aria: cellAria(ind, place, m),
    rank: exceptionRank(stat.status, stat.trend),
  }
}
