import { describe, expect, it } from 'vitest'
import { onPrintPrep, runPrintPrep } from './printHooks.ts'

describe('print hooks', () => {
  it('runs every registered hook and waits for the slow one', async () => {
    const log: string[] = []
    const off1 = onPrintPrep(async () => { log.push('a') })
    const off2 = onPrintPrep(async () => { await new Promise(r => setTimeout(r, 20)); log.push('b') })
    await runPrintPrep()
    expect(log.sort()).toEqual(['a', 'b'])
    off1(); off2()
  })
  it('a removed hook no longer runs', async () => {
    let n = 0
    const off = onPrintPrep(async () => { n++ })
    off()
    await runPrintPrep()
    expect(n).toBe(0)
  })
  it('a hook that throws does not stop the others or the print', async () => {
    let ok = false
    const off1 = onPrintPrep(async () => { throw new Error('no map') })
    const off2 = onPrintPrep(async () => { ok = true })
    await expect(runPrintPrep()).resolves.toBeUndefined()
    expect(ok).toBe(true)
    off1(); off2()
  })
  it('gives up on a hook that never finishes after the time limit', async () => {
    const off = onPrintPrep(() => new Promise<void>(() => {}))
    const t0 = Date.now()
    await runPrintPrep(40)
    expect(Date.now() - t0).toBeLessThan(1000)
    off()
  })
})
