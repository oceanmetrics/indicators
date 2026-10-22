import { describe, expect, it } from 'vitest'
import { brushWindow, clampWindow, defaultWindow, fractionOf, indexAt, keyWindow, panWindow, windowStart, zoomWindow } from './timeWindow.ts'

describe('the window a grain opens with', () => {
  it('is a year of months, a decade of years, three decades, a month of days', () => {
    expect(defaultWindow('month', 500)).toBe(12)
    expect(defaultWindow('year', 40)).toBe(10)
    expect(defaultWindow('decade', 10)).toBe(3)
    expect(defaultWindow('day', 1000)).toBe(30)
  })
  it('never reaches past the record and is one step at least', () => {
    expect(defaultWindow('month', 5)).toBe(4)
    expect(defaultWindow('year', 1)).toBe(1)
    expect(clampWindow(0, 10)).toBe(1)
    expect(clampWindow(50, 10)).toBe(9)
  })
})

describe('[t - w, t]', () => {
  it('starts w steps before t, not before the first period', () => {
    expect(windowStart(20, 12)).toBe(8)
    expect(windowStart(5, 12)).toBe(0)
  })
  it('maps the track to indices and back', () => {
    expect(indexAt(0, 11)).toBe(0)
    expect(indexAt(1, 11)).toBe(10)
    expect(indexAt(0.44, 11)).toBe(4)
    expect(indexAt(1.5, 11)).toBe(10)
    expect(fractionOf(5, 11)).toBe(0.5)
    expect(fractionOf(0, 1)).toBe(1)
  })
})

describe('pan, brush, zoom, keys', () => {
  it('pan moves t with the width kept, inside the record', () => {
    expect(panWindow(20, 12, -3, 100)).toBe(17)
    expect(panWindow(20, 12, -30, 100)).toBe(12)
    expect(panWindow(95, 12, 10, 100)).toBe(99)
  })
  it('a brush from a to b sets t to the later end and w to the steps between', () => {
    expect(brushWindow(30, 10, 100)).toEqual({ t: 30, w: 20 })
    expect(brushWindow(10, 10, 100)).toEqual({ t: 10, w: 1 })
    expect(brushWindow(-5, 200, 100)).toEqual({ t: 99, w: 99 })
  })
  it('the wheel widens down and narrows up, a step at least, anchored at t', () => {
    expect(zoomWindow(12, 100, 500)).toBe(14)
    expect(zoomWindow(12, -100, 500)).toBe(10)
    expect(zoomWindow(1, -100, 500)).toBe(1)
    expect(zoomWindow(12, 1, 500)).toBe(13)
    expect(zoomWindow(12, 0, 500)).toBe(12)
    expect(zoomWindow(400, 1000, 100)).toBe(99)
  })
  it('arrows move t, Shift+arrows resize, Home/End jump, PageUp/PageDown move by a window', () => {
    expect(keyWindow('ArrowLeft', false, 10, 4, 20)).toEqual({ t: 9, w: 4 })
    expect(keyWindow('ArrowRight', true, 10, 4, 20)).toEqual({ t: 10, w: 5 })
    expect(keyWindow('Home', false, 10, 4, 20)).toEqual({ t: 0, w: 4 })
    expect(keyWindow('End', false, 10, 4, 20)).toEqual({ t: 19, w: 4 })
    expect(keyWindow('PageDown', false, 10, 4, 20)).toEqual({ t: 6, w: 4 })
    expect(keyWindow('ArrowRight', false, 19, 4, 20)).toEqual({ t: 19, w: 4 })
    expect(keyWindow('a', false, 10, 4, 20)).toBeNull()
  })
})
