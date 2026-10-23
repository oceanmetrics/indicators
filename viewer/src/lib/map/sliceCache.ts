// one slice per period, shared: the slot at `t` and the compare slot (the slice at `t2`, or `t2 - t`, which reads the
// slice at `t` too) ask the same source, and a period asked twice is fetched once. a fetch runs while anyone still waits
// for it: each caller's own signal lets it stop waiting, and only when every caller has stopped is the request aborted
// (so a scrub that leaves a period cancels it, as `gridSlot`'s own abort did, but the anomaly does not lose the slice at
// `t` because the first slot moved on). the last `keep` periods drawn stay in memory.
import type { SliceCell, SliceSource } from '@oceanmetrics/map'

const abortError = (signal: AbortSignal) => signal.reason ?? new DOMException('aborted', 'AbortError')

export interface SharedSlices extends SliceSource {
  /** the periods held, oldest first ("latest" for t null) */
  held(): string[]
}

export function sharedSlices(source: SliceSource, keep = 6): SharedSlices {
  const done = new Map<string, SliceCell[]>()
  const flying = new Map<string, { p: Promise<SliceCell[]>; ctl: AbortController; users: number }>()
  const keyOf = (t: string | null) => t ?? 'latest'
  return {
    held: () => [...done.keys()],
    async slice(t, signal) {
      if (signal?.aborted) throw abortError(signal)
      const k = keyOf(t)
      const hit = done.get(k)
      if (hit) {
        done.delete(k)
        done.set(k, hit)
        return hit
      }
      let f = flying.get(k)
      if (!f) {
        const ctl = new AbortController()
        const p = source.slice(t, ctl.signal).then(rows => {
          if (flying.get(k)?.p === p) flying.delete(k)
          if (!ctl.signal.aborted) {
            done.set(k, rows)
            while (done.size > keep) done.delete(done.keys().next().value!)
          }
          return rows
        }, e => {
          if (flying.get(k)?.p === p) flying.delete(k)
          throw e
        })
        p.catch(() => {})
        f = { p, ctl, users: 0 }
        flying.set(k, f)
      }
      const mine = f
      mine.users++
      if (!signal) return mine.p
      return new Promise<SliceCell[]>((resolve, reject) => {
        const stop = () => {
          mine.users--
          if (mine.users <= 0 && flying.get(k) === mine) { flying.delete(k); mine.ctl.abort(abortError(signal)) }
          reject(abortError(signal))
        }
        signal.addEventListener('abort', stop, { once: true })
        mine.p.then(r => { signal.removeEventListener('abort', stop); resolve(r) }, e => { signal.removeEventListener('abort', stop); reject(e) })
      })
    },
  }
}
