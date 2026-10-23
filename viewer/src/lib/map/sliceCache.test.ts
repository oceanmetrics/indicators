import { describe, expect, it } from 'vitest'
import type { SliceCell } from '@oceanmetrics/map'
import { sharedSlices } from './sliceCache.ts'

// a source that answers when told to, and records what it was asked and whether it was aborted
function slowSource() {
  const asked: (string | null)[] = []
  const aborted: (string | null)[] = []
  const pending = new Map<string, (rows: SliceCell[]) => void>()
  return {
    asked, aborted,
    answer(t: string | null, v: number) { pending.get(t ?? 'latest')?.([{ lat: 0, lon: 0, value: v, weight: 1 }]) },
    source: {
      slice(t: string | null, signal?: AbortSignal) {
        asked.push(t)
        return new Promise<SliceCell[]>((resolve, reject) => {
          pending.set(t ?? 'latest', resolve)
          signal?.addEventListener('abort', () => { aborted.push(t); reject(new DOMException('aborted', 'AbortError')) })
        })
      },
    },
  }
}
const tick = () => new Promise(r => setTimeout(r, 0))

describe('one slice per period, shared by the two slots of the compare mode', () => {
  it('a period asked twice at once is fetched once, and asked again later comes from memory', async () => {
    const s = slowSource()
    const c = sharedSlices(s.source)
    const a = c.slice('2024-07-01'), b = c.slice('2024-07-01')
    s.answer('2024-07-01', 18)
    expect((await a)[0].value).toBe(18)
    expect(await b).toBe(await a)
    expect((await c.slice('2024-07-01'))[0].value).toBe(18)
    expect(s.asked).toEqual(['2024-07-01'])
  })
  it('one caller stopping does not cancel the fetch the other waits for (the anomaly keeps the slice at t)', async () => {
    const s = slowSource()
    const c = sharedSlices(s.source)
    const ctl = new AbortController()
    const first = c.slice('2024-07-01', ctl.signal)
    const anomaly = c.slice('2024-07-01', new AbortController().signal)
    ctl.abort()
    await expect(first).rejects.toThrow(/aborted/)
    s.answer('2024-07-01', 18)
    expect((await anomaly)[0].value).toBe(18)
    expect(s.aborted).toEqual([])
  })
  it('when every caller has stopped, the request is aborted and not kept (a scrub that left the period)', async () => {
    const s = slowSource()
    const c = sharedSlices(s.source)
    const ctl = new AbortController()
    const p = c.slice('2016-07-01', ctl.signal)
    ctl.abort()
    await expect(p).rejects.toThrow(/aborted/)
    await tick()
    expect(s.aborted).toEqual(['2016-07-01'])
    expect(c.held()).toEqual([])
    // asked again, it is fetched again
    const q = c.slice('2016-07-01')
    s.answer('2016-07-01', 16)
    expect((await q)[0].value).toBe(16)
    expect(s.asked).toEqual(['2016-07-01', '2016-07-01'])
  })
  it('keeps the last periods drawn, the least recent dropped first; null is the latest', async () => {
    const rows = (v: number): SliceCell[] => [{ lat: 0, lon: 0, value: v, weight: 1 }]
    const c = sharedSlices({ slice: async t => rows(Number((t ?? '0').slice(0, 4))) }, 2)
    await c.slice('2016-07-01'); await c.slice('2024-07-01'); await c.slice('2016-07-01'); await c.slice(null)
    expect(c.held()).toEqual(['2016-07-01', 'latest'])
  })
})
