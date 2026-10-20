// the status registry: the ONE implementation of every status method, imported by the coverage builder (Node) and
// the viewer (browser). nothing else computes a status, a trend, a status sentence or an alt text.
import { completeGrid, nextPeriod } from './grid.ts'
import { ieaSd } from './ieaSd.ts'
import { namesPct } from './namesPct.ts'
import { altText, sentence } from './text.ts'
import { values } from './values.ts'
import type { MethodId, Point, StatusOptions, StatusResult, TextContext } from './types.ts'

export * from './types.ts'
export { completeGrid, nextPeriod, periodLabel, periodX, spanLabel, grainNoun } from './grid.ts'
export { categoricalAlt, categoricalSentence, collapseRuns, fmt, noValues } from './text.ts'
export { QUADRANT_SHORT, QUADRANT_WORDS, quadAlt, quadPoint, quadrantOf, quadWhy, quadWords } from './quad.ts'
export type { QuadLabelled, QuadPoint, Quadrant } from './quad.ts'
export { ieaSd, namesPct, values }

export const STATUS_METHODS: Record<MethodId, (s: Point[], o: StatusOptions) => StatusResult> = {
  'iea-sd': ieaSd,
  'names-pct': namesPct,
  values,
}

export interface Assessment {
  result: StatusResult
  sentence: string
  alt: string
}

/**
 * a series' status by `method`: the series is first completed to the calendar grid at its grain (so the recent
 * window is the last `recent` periods, missing ones included as nulls), then the method runs, then the words.
 */
export function assess(series: Point[], method: MethodId, opts: StatusOptions, ctx: TextContext): Assessment {
  const fn = STATUS_METHODS[method]
  if (!fn) throw new Error(`unknown status method ${method}`)
  const grid = completeGrid(series, opts.grain)
  const result = fn(grid, opts)
  const vals = grid.filter(p => p.v != null)
  const last = vals[vals.length - 1] ?? null
  const recent = opts.recent ?? 5
  const next = (t: string) => nextPeriod(t, opts.grain)
  return {
    result,
    sentence: sentence(result, ctx, opts.grain, recent, opts.baseline, last),
    alt: altText(result, grid, ctx, opts.grain, next, recent, opts.baseline),
  }
}
