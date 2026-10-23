// "Watch these places": the report's own selection rules handed to the alerts form (oceanmetrics.io/alerts/ reads
// ?place=<id>, or ?pi= &px= &ii= &ix= with ?title=; static/js/alerts.js of the site). the layout and style keys are left out: they
// do not change what is watched. a live report and its subscription then pick up what is published later.
import { rulesParams } from '@oceanmetrics/catalog/report'
import type { ReportSpec } from './spec.ts'

export const ALERTS_HREF = 'https://oceanmetrics.io/alerts/'

const href = (kv: [string, string][]) => ALERTS_HREF + '?' + new URLSearchParams(kv)

/** the alerts form for a report: `pi px ii ix` (the places always named, the other keys only when they differ from the
 *  default), `title` when the report has one; a selection of one place id and nothing else is `place=<id>` */
export function watchHref(spec: ReportSpec): string {
  const { include, exclude } = spec.places
  const kv = rulesParams({ places: spec.places, indicators: spec.indicators }).filter(([k]) => k !== 'pi')
  const title: [string, string][] = spec.title ? [['title', spec.title]] : []
  if (include.length === 1 && !exclude.length && !kv.length && /^[\w.-]+:[\w.:-]+$/.test(include[0]) && !/^(coll|set):/.test(include[0]))
    return href([['place', include[0]], ...title])
  return href([['pi', include.join(',')], ...kv, ...title])
}

/** the alerts form for one place */
export const watchPlaceHref = (id: string, name?: string) => href([['place', id], ...(name ? [['title', name] as [string, string]] : [])])
