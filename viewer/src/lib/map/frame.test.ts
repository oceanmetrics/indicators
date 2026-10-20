import { describe, expect, it } from 'vitest'
import { boxCentre, globeDiameter, globeZoom, isWorldScale, afterChange, canNative, enterFull, escLeaves, exitFull, fullLabel, nativeElement, projectionSpec, PROJ_CHOICES } from './frame.ts'

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

describe('the whole sphere in the frame', () => {
  it('the outline of the globe at the zoom is 90% of the shorter side of the frame: wide, tall and phone frames', () => {
    for (const [w, h] of [[1440, 927], [1440, 500], [390, 1344], [390, 400]]) {
      expect(globeDiameter(globeZoom(w, h), h)).toBeCloseTo(Math.min(w, h) * 0.9, 6)
    }
    expect(globeDiameter(globeZoom(1440, 927, 1), 927)).toBeCloseTo(927, 6)
  })
  it('measured on screen: a 1440 x 927 frame at zoom 2.35 drew an outline 659 px across (the model says 658)', () => {
    expect(globeDiameter(2.35, 927)).toBeGreaterThan(655)
    expect(globeDiameter(2.35, 927)).toBeLessThan(662)
  })
  it('a bigger globe needs a bigger zoom', () => {
    expect(globeZoom(1440, 900)).toBeGreaterThan(globeZoom(700, 900))
  })
  it('never below zoom 0, and a zero frame is finite', () => {
    expect(globeZoom(40, 40)).toBe(0)   // a sphere that small is under zoom 0 and stays at 0
    expect(Number.isFinite(globeZoom(0, 0))).toBe(true)
  })
  it('a box is world-scale past 90 degrees of longitude or of latitude; smaller ones keep the normal fit', () => {
    expect(isWorldScale([-180, -85, 180, 85])).toBe(true)
    expect(isWorldScale([160, 18, 294, 48])).toBe(true)
    expect(isWorldScale([-10, -80, 0, 80])).toBe(true)
    expect(isWorldScale([-125, 32, -117, 40])).toBe(false)
    expect(isWorldScale([-158, 18, -66, 60])).toBe(true)
    expect(isWorldScale([-100, 20, -11, 60])).toBe(false)
  })
  it('the centre of a box, a longitude past 180 wrapped back', () => {
    expect(boxCentre([-180, -85, 180, 85])).toEqual({ lng: 0, lat: 0 })
    expect(boxCentre([160, 18, 294, 48])).toEqual({ lng: 227 - 360, lat: 33 })
    expect(boxCentre([-125, 32, -117, 40])).toEqual({ lng: -121, lat: 36 })
  })
})
