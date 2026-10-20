// indicator families on the Map: the OBIS indicators are one metric (records, species, Shannon …) for one EOV class
// (all taxa, fish, hard corals …), `obis:<metric>[:<eov>]`, 72 in all. the Map shows them as one choice, "OBIS
// biodiversity", with a metric and an EOV switch, as the CoastWatch OBIS explorer did (plan, "Live CoastWatch OBIS").
// the labels come from the manifest: the metric is the short name without its "(…)", the EOV the title after its comma.
import type { Indicator } from '../data.ts'

const OBIS = /^obis:([a-z0-9_]+)(?::([a-z0-9-]+))?$/
export const FAMILY_LABEL = 'OBIS biodiversity'
export const FAMILY_DEFAULT = 'obis:species'

export interface Choice { id: string; label: string }
export interface Family {
  metric: string
  /** the EOV slug, or 'all' for all taxa */
  eov: string
  metrics: Choice[]
  eovs: Choice[]
}

const parts = (id: string) => { const m = OBIS.exec(id); return m ? { metric: m[1], eov: m[2] ?? 'all' } : null }
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const isFamily = (id: string) => OBIS.test(id)

/** the indicator id of a metric and an EOV */
export function familyId(metric: string, eov: string): string {
  return eov === 'all' ? `obis:${metric}` : `obis:${metric}:${eov}`
}

/** the family of an OBIS indicator, with the metrics and EOVs that exist among `available` (manifest order), or null */
export function familyOf(ind: Indicator, available: Indicator[]): Family | null {
  const me = parts(ind.id)
  if (!me) return null
  const metrics: Choice[] = [], eovs: Choice[] = []
  for (const i of available) {
    const p = parts(i.id)
    if (!p) continue
    if (p.eov === 'all' && !metrics.some(c => c.id === p.metric)) metrics.push({ id: p.metric, label: i.short.replace(/\s*\([^)]*\)\s*$/, '') })
    if (p.metric === me.metric && !eovs.some(c => c.id === p.eov)) eovs.push({ id: p.eov, label: cap(i.title.split(', ').pop() ?? p.eov) })
  }
  // all taxa first, then the EOVs in manifest order
  eovs.sort((a, b) => Number(b.id === 'all') - Number(a.id === 'all'))
  return { metric: me.metric, eov: me.eov, metrics, eovs }
}

/** the indicator picker's options with the OBIS family folded into one option (its value the current OBIS id) */
export function foldFamily<T extends { value: string; label: string; group?: string }>(options: T[], current: string | null): T[] {
  const out: T[] = []
  let folded = false
  for (const o of options) {
    if (!isFamily(o.value)) { out.push(o); continue }
    if (folded) continue
    folded = true
    out.push({ ...o, value: current && isFamily(current) ? current : FAMILY_DEFAULT, label: FAMILY_LABEL })
  }
  return out
}
