// the Matrix's selection as a report spec ("Report" button of the Matrix toolbar). the Matrix keeps what it shows as
// collection chips, a search, removed places and indicators, and the leads-only switch; the report keeps rules.
import { DEFAULT_SPEC, expandPlaces, matchIndicators } from '../../../../src/report/spec.ts'
import type { ReportSpec } from '../../../../src/report/spec.ts'
import type { Indicator } from '../data.ts'
import type { ViewState } from '../hash.ts'
import { groupRows } from '../matrix.ts'
import type { CoverageIndex } from '../matrix.ts'

type MatrixSelection = Pick<ViewState, 'colls' | 'q' | 'hidePlaces' | 'hideInds' | 'addInds' | 'leads'>

/** more places than this and the Cards layout is not the one to open with */
export const CARDS_MAX_PLACES = 3

/**
 * places: `coll:<c>` for each chosen collection (or `*`) less the removed places; a search narrows them to the places
 * it finds, listed by id. indicators: `*` (the leads), or every series whole (`series:<s>:*`) when leads-only is off,
 * plus the indicators added beyond the leads, less the removed ones. Scorecard for more than 3 places, else Cards.
 */
export function matrixToSpec(view: MatrixSelection, ctx: { idx: CoverageIndex; indicators: Indicator[] }): ReportSpec {
  const shown = groupRows(ctx.idx, view.colls, view.q, view.hidePlaces).flatMap(g => g.places)
  const searched = view.q.trim() !== ''
  const places: ReportSpec['places'] = searched
    ? { include: shown.length ? shown.map(p => p.id) : ['none'], exclude: [], context: false }
    : { include: view.colls.length ? view.colls.map(c => `coll:${c}`) : ['*'], exclude: [...new Set(view.hidePlaces)], context: false }
  // `coll:<slug>` also matches a place read from a values collection of that name (an old link's meaning), so a place the
  // Matrix groups elsewhere (Pitcairn: under mr_eez, with rows in `places`) is excluded when it is not on display
  if (!searched) {
    const on = new Set(shown.map(p => p.id))
    const stray = expandPlaces(places, ctx.idx.places).map(p => p.id).filter(id => !on.has(id))
    places.exclude = [...new Set([...places.exclude, ...stray])]
  }
  const series = [...new Set(ctx.indicators.map(i => i.series))]
  const include = view.leads ? ['*', ...view.addInds] : series.map(s => `series:${s}:*`)
  const held = new Set(include.flatMap(r => matchIndicators(r, ctx.indicators)).map(i => i.id))
  return {
    ...DEFAULT_SPEC,
    places,
    indicators: {
      include: [...new Set(include)],
      // a removed indicator that the rules would not show anyway needs no exclude
      exclude: [...new Set(view.hideInds)].filter(id => held.has(id)),
    },
    layout: shown.length > CARDS_MAX_PLACES ? 'scorecard' : 'cards',
  }
}
