// the Small multiples layout's rules, in plain functions: which panels a report has and how they are rowed, the y range a
// row shares, and the words under a panel. a panel is a place x indicator drawn small; the chart geometry is chart.ts
// and the status is the card model's (src/status), so nothing here computes either.
import { fmt, periodLabel } from '../../../../../src/status/index.ts'
import { overlayOf } from '../../chart.ts'
import type { Indicator } from '../../data.ts'
import type { Place } from '../../matrix.ts'
import type { CardModel } from '../../place.ts'

export type Axes = 'places' | 'indicators'

export interface Panel { place: Place; ind: Indicator }

export interface PanelRow {
  key: string
  title: string
  /** what the row is one of: one indicator across places (the Matrix's rows), or one place across indicators */
  by: 'indicator' | 'place'
  panels: Panel[]
}

/**
 * the rows of panels. `axes` 'indicators' puts the indicators in rows and the places along them (the Matrix's default);
 * 'places' puts the places in rows. a pair the `has` predicate refuses (no value for it) gets no panel and a row with no
 * panel is dropped.
 */
export function panelRows(places: Place[], inds: Indicator[], axes: Axes, has: (p: Place, i: Indicator) => boolean = () => true): PanelRow[] {
  const rows: PanelRow[] = axes === 'indicators'
    ? inds.map(i => ({ key: i.id, title: i.short, by: 'indicator' as const, panels: places.filter(p => has(p, i)).map(p => ({ place: p, ind: i })) }))
    : places.map(p => ({ key: p.id, title: p.name, by: 'place' as const, panels: inds.filter(i => has(p, i)).map(i => ({ place: p, ind: i })) }))
  return rows.filter(r => r.panels.length > 0)
}

/**
 * the y range every panel of a row is drawn on: the data and the long-term band of all of them. only a row of one
 * indicator shares an axis (a row of one place mixes units), and only when the spec asks for it (`ys` is shared, the
 * default); null leaves each panel its own.
 */
export function sharedDomain(by: PanelRow['by'], yaxis: 'shared' | 'free', models: (CardModel | null | undefined)[]): [number, number] | null {
  if (by !== 'indicator' || yaxis !== 'shared') return null
  const ys: number[] = []
  for (const m of models) {
    if (!m || m.kind !== 'continuous') continue
    for (const p of m.series) if (p.v != null) ys.push(p.v)
    const o = overlayOf(m.result)
    if (o) ys.push(o.lo, o.hi)
  }
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null
}

/** the last value of a panel in words: "26.0 °C · 2024", or "no value" */
export function lastText(model: Pick<CardModel, 'last' | 'grain'>, ind: Pick<Indicator, 'unit_label' | 'decimals'>): string {
  if (!model.last || model.last.v == null || !model.grain) return 'no value'
  const unit = ind.unit_label ? ` ${ind.unit_label}` : ''
  return `${fmt(model.last.v, ind.decimals ?? 2)}${unit} · ${periodLabel(model.last.t, model.grain)}`
}
