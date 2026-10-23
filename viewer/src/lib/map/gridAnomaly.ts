// `t2 - t` per cell in the engine: the two slices go into DuckDB-WASM as tables (the engine's `insertRows`), the
// difference is `anomalySql` (compare.ts), the tables are dropped. loaded with the engine chunk (gridSource.ts); the tests
// run it on the node DuckDB-WASM the browser's engine is.
import type { Engine } from '@oceanmetrics/engine'
import type { SliceCell } from '@oceanmetrics/map'
import { anomalySql } from './compare.ts'

let seq = 0

/** one row per cell of `now` (the slice at t2): its value less the value of the same cell in `then` (the slice at t), null where either has none */
export async function anomalyRows(engine: Pick<Engine, 'insertRows' | 'exec'>, then: readonly SliceCell[], now: readonly SliceCell[]): Promise<SliceCell[]> {
  if (!now.length) return []
  if (!then.length) return now.map(c => ({ ...c, value: null }))
  const n = ++seq
  const a = `anom_then_${n}`, b = `anom_now_${n}`
  const plain = (cs: readonly SliceCell[]) => cs.map(c => ({ lat: c.lat, lon: c.lon, weight: c.weight, value: c.value }))
  try {
    await engine.insertRows(plain(then), a)
    await engine.insertRows(plain(now), b)
    const rows = await engine.exec(anomalySql(a, b), 'anomaly')
    return rows.map(r => ({
      lat: Number(r.lat), lon: Number(r.lon), weight: Number(r.weight),
      value: r.value === null || r.value === undefined || Number.isNaN(Number(r.value)) ? null : Number(r.value),
    }))
  } finally {
    await engine.exec(`DROP TABLE IF EXISTS ${a}; DROP TABLE IF EXISTS ${b}`, 'anomaly:drop').catch(() => {})
  }
}
