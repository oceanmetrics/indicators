import { describe, expect, it } from 'vitest'
import { afterChange, canNative, enterFull, escLeaves, exitFull, fullLabel, nativeElement, projectionSpec, PROJ_CHOICES } from './frame.ts'

describe('the projection', () => {
  it('the hash value maps to the MapLibre projection; anything not the globe is mercator', () => {
    expect(projectionSpec('globe')).toEqual({ type: 'globe' })
    expect(projectionSpec(null)).toEqual({ type: 'mercator' })
  })
  it('offers Flat first (the default) then Globe', () => {
    expect(PROJ_CHOICES).toEqual([{ proj: null, label: 'Flat' }, { proj: 'globe', label: 'Globe' }])
  })
})

describe('the full-screen button', () => {
  it('says what pressing it does', () => {
    expect([fullLabel('off'), fullLabel('native'), fullLabel('expanded')]).toEqual(['Full screen', 'Exit full screen', 'Exit full screen'])
  })
  it('Esc leaves only the expanded mode (the browser handles its own)', () => {
    expect([escLeaves('expanded', 'Escape'), escLeaves('native', 'Escape'), escLeaves('off', 'Escape'), escLeaves('expanded', 'a')]).toEqual([true, false, false, false])
  })
})

describe('the Fullscreen API on a wrapper', () => {
  const el = (ok = true) => ({ requestFullscreen: ok ? async () => {} : async () => { throw new Error('denied') } })
  it('is native only when the element has the API and the document allows it', () => {
    expect(canNative(el(), { fullscreenEnabled: true })).toBe(true)
    expect(canNative(el(), {})).toBe(true)
    expect(canNative({}, { fullscreenEnabled: true })).toBe(false)
    expect(canNative(el(), { fullscreenEnabled: false })).toBe(false)
    expect(canNative({ webkitRequestFullscreen: () => {} }, { webkitFullscreenEnabled: true })).toBe(true)
  })
  it('enters native where it can, expanded where the API is missing or refused (iPhone Safari)', async () => {
    expect(await enterFull(el(), { fullscreenEnabled: true })).toBe('native')
    expect(await enterFull({}, {})).toBe('expanded')
    expect(await enterFull(el(false), { fullscreenEnabled: true })).toBe('expanded')
  })
  it('exits native by the document; the expanded mode has nothing to call', async () => {
    let n = 0
    const doc = { fullscreenElement: {} as Element, exitFullscreen: async () => { n++ } }
    await exitFull(doc, 'expanded')
    expect(n).toBe(0)
    await exitFull(doc, 'native')
    expect(n).toBe(1)
    await exitFull({ exitFullscreen: async () => { n++ } }, 'native')
    expect(n).toBe(1)
  })
  it('the browser leaving full screen (Esc) ends native mode, not the expanded mode', () => {
    const wrapper = {} as Element
    expect(afterChange('native', wrapper, { fullscreenElement: wrapper })).toBe('native')
    expect(afterChange('native', wrapper, { fullscreenElement: null })).toBe('off')
    expect(afterChange('native', wrapper, { webkitFullscreenElement: {} as Element })).toBe('off')
    expect(afterChange('expanded', wrapper, {})).toBe('expanded')
    expect(nativeElement({ webkitFullscreenElement: wrapper })).toBe(wrapper)
  })
})
