// reading a place's rows from the catalog's values files: one fetch per file (cached per URL), the whole file parsed
// with hyparquet (the largest is ~160 kB), the rows grouped by place_id so a second place in the same file costs
// nothing. the contract's columns are kept as they are; producer columns (x_*) ride along for the downloads.
import { parquetReadObjects } from 'hyparquet'
import type { ValueRow } from '../../../src/coverage/build.ts'

export type { ValueRow }
/** a values row with any producer columns (x_*) */
export type PlaceRow = ValueRow & Record<string, unknown>

const isoDate = (v: unknown): string | null => {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}
const num = (v: unknown): number | null => (v == null ? null : Number(v))

/** hyparquet returns DATE as a Date and counts as bigint when they are integers: rows carry ISO strings and numbers */
export function normalizeValueRow(r: Record<string, unknown>): PlaceRow {
  // sd (contract 1.2) is kept only where the file has the column: a 1.1 file's rows carry no `sd` key, and the downloads follow
  return { ...r, time: isoDate(r.time), value: num(r.value), n: num(r.n), ...('sd' in r ? { sd: num(r.sd) } : {}),
    class: r.class == null ? null : String(r.class) } as PlaceRow
}

/** every row of a values file, normalized */
export async function readValues(buf: ArrayBuffer): Promise<PlaceRow[]> {
  const rows = (await parquetReadObjects({ file: buf })) as Record<string, unknown>[]
  return rows.map(normalizeValueRow)
}

export function groupByPlace(rows: PlaceRow[]): Map<string, PlaceRow[]> {
  const by = new Map<string, PlaceRow[]>()
  for (const r of rows) {
    const list = by.get(r.place_id)
    if (list) list.push(r)
    else by.set(r.place_id, [r])
  }
  return by
}

const cache = new Map<string, Promise<Map<string, PlaceRow[]>>>()

/** a values file, fetched once per URL; a failure is not cached, so a retry fetches again */
export function loadValuesFile(url: string, fetchFn: typeof fetch = fetch): Promise<Map<string, PlaceRow[]>> {
  let p = cache.get(url)
  if (!p) {
    p = (async () => {
      const res = await fetchFn(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return groupByPlace(await readValues(await res.arrayBuffer()))
    })()
    p.catch(() => { if (cache.get(url) === p) cache.delete(url) })
    cache.set(url, p)
  }
  return p
}

/** one place's rows (all grains) from one values file */
export async function loadPlaceRows(url: string, placeId: string, fetchFn: typeof fetch = fetch): Promise<PlaceRow[]> {
  return (await loadValuesFile(url, fetchFn)).get(placeId) ?? []
}

export const clearValuesCache = () => cache.clear()
