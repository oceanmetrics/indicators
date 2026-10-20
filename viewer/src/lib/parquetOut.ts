// the Parquet download of one place's rows of one indicator: the contract's columns with `time` as a DATE, plus any
// producer columns. kept in its own module so hyparquet-writer is a lazy chunk: it loads on the first click only.
import { parquetWriteBuffer, schemaFromColumnData } from 'hyparquet-writer'
import { CONTRACT_COLUMNS, extraColumns, sortRows } from './place.ts'
import type { PlaceRow } from './valuesData.ts'

type Basic = 'STRING' | 'DOUBLE'
const TYPES: Record<string, Basic> = { place_id: 'STRING', coll: 'STRING', indicator: 'STRING', time_grain: 'STRING', class: 'STRING', value: 'DOUBLE', n: 'DOUBLE', unit: 'STRING' }

/** `meta` goes into the file's key-value metadata (om:place_id, om:indicator, om:citation ...) */
export function placeParquet(rows: PlaceRow[], meta: Record<string, string> = {}): ArrayBuffer {
  const sorted = sortRows(rows)
  const extras = extraColumns(rows)
  const col = (name: string) => sorted.map(r => (r as Record<string, unknown>)[name] ?? null)
  const columnData = [
    ...CONTRACT_COLUMNS.map(name => name === 'time'
      ? { name, data: sorted.map(r => (r.time ? new Date(r.time + 'T00:00:00Z') : null)) }
      : { name, type: TYPES[name], data: col(name) as never }),
    ...extras.map(name => {
      const data = col(name)
      const numeric = data.every(v => v == null || typeof v === 'number' || typeof v === 'bigint')
      return { name, type: (numeric ? 'DOUBLE' : 'STRING') as Basic, data: (numeric ? data.map(v => (v == null ? null : Number(v))) : data.map(v => (v == null ? null : String(v)))) as never }
    }),
  ]
  const schema = schemaFromColumnData({ columnData, schemaOverrides: { time: { name: 'time', type: 'INT32', converted_type: 'DATE', repetition_type: 'OPTIONAL' } } })
  // the schema carries the types: a column may not state its own as well
  return parquetWriteBuffer({
    columnData: columnData.map(({ name, data }) => ({ name, data })),
    schema,
    kvMetadata: Object.entries(meta).map(([key, value]) => ({ key, value })),
  })
}
