import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '@oceanmetrics/engine'
import type { Duck } from '@oceanmetrics/engine'
import type { SliceCell } from '@oceanmetrics/map'
import { anomalyRows } from './gridAnomaly.ts'

// the engine the browser runs, on DuckDB-WASM's node-blocking bundle (as platform's engine tests do)
const require = createRequire(import.meta.url)
async function nodeDuck(): Promise<Duck> {
  const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
  const dist = dirname(require.resolve('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs'))
  const db = await duckdb.createDuckDB(
    { mvp: { mainModule: join(dist, 'duckdb-mvp.wasm'), mainWorker: '' }, eh: { mainModule: join(dist, 'duckdb-eh.wasm'), mainWorker: '' } },
    new duckdb.VoidLogger(), duckdb.NODE_RUNTIME,
  )
  await db.instantiate()
  return { db, conn: db.connect() }
}

// a 2 x 2 patch of a 0.25° grid at two periods: t (July 2024) and t2 (July 2016). the NE cell has no data at t, the SW
// cell none at t2; the SE cell's weight is 0.5 (a partial cell on the place's edge)
const cell = (lat: number, lon: number, value: number | null, weight = 1): SliceCell => ({ lat, lon, value, weight })
const T: SliceCell[] = [cell(34.125, -120.125, 18.25), cell(34.125, -119.875, 18.5, 0.5), cell(34.375, -120.125, 17.75), cell(34.375, -119.875, null)]
const T2: SliceCell[] = [cell(34.125, -120.125, null), cell(34.125, -119.875, 17.25, 0.5), cell(34.375, -120.125, 18.5), cell(34.375, -119.875, 16)]

describe('the anomaly t2 - t per cell, in the engine (DuckDB-WASM)', () => {
  it('one row per cell of the t2 slice, its own centre and weight, t2 - t exactly, null where either period has no data', async () => {
    const engine = new Engine(nodeDuck)
    expect(await anomalyRows(engine, T, T2)).toEqual([
      cell(34.125, -120.125, null),
      cell(34.125, -119.875, -1.25, 0.5),
      cell(34.375, -120.125, 0.75),
      cell(34.375, -119.875, null),
    ])
  })
  it('a cell of t2 that t lacks is null; the two tables are dropped after', async () => {
    const engine = new Engine(nodeDuck)
    const rows = await anomalyRows(engine, T.slice(0, 1), [cell(34.125, -120.125, 19), cell(40, -70, 5)])
    expect(rows).toEqual([cell(34.125, -120.125, 0.75), cell(40, -70, null)])
    const left = await engine.exec("SELECT count(*) AS n FROM information_schema.tables WHERE table_name LIKE 'anom_%'")
    expect(left[0].n).toBe(0)
  })
  it('no cells at t2 is no rows; no cells at t is every cell null, with no query', async () => {
    const asks: string[] = []
    const fake = { insertRows: async () => { asks.push('insert') }, exec: async () => { asks.push('exec'); return [] } }
    expect(await anomalyRows(fake as never, T, [])).toEqual([])
    expect(await anomalyRows(fake as never, [], T2.slice(1, 2))).toEqual([cell(34.125, -119.875, null, 0.5)])
    expect(asks).toEqual([])
  })
})
