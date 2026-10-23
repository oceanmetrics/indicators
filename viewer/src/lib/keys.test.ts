import { describe, expect, it } from 'vitest'
import { compareToggle, shortcutFor, SHORTCUTS } from './keys.ts'

describe('the keyboard', () => {
  it('l (either case) is the compare toggle, as erddap-places\' lens key', () => {
    expect(shortcutFor({ key: 'l' })).toEqual({ kind: 'compare' })
    expect(shortcutFor({ key: 'L', targetTag: 'BUTTON' })).toEqual({ kind: 'compare' })
  })
  it('no shortcut while typing, with Ctrl, Alt or Meta, or on a held key', () => {
    expect(shortcutFor({ key: 'l', targetTag: 'input' })).toBeNull()
    expect(shortcutFor({ key: 'l', targetTag: 'SELECT' })).toBeNull()
    expect(shortcutFor({ key: 'l', targetEditable: true })).toBeNull()
    expect(shortcutFor({ key: 'l', metaKey: true })).toBeNull()
    expect(shortcutFor({ key: 'l', altKey: true })).toBeNull()
    expect(shortcutFor({ key: 'l', repeat: true })).toBeNull()
    expect(shortcutFor({ key: 'k' })).toBeNull()
  })
  it('the toggle: on at the default second period, off clears t2, anom and swipe; no layer says so', () => {
    expect(compareToggle({ on: false, layer: 'grid:a:b', t2Default: '2016-07' })).toEqual({ t2: '2016-07' })
    expect(compareToggle({ on: true, layer: 'grid:a:b', t2Default: '2016-07' })).toEqual({ t2: null, anom: false, swipe: null })
    expect(compareToggle({ on: false, layer: null, t2Default: '2016-07' })).toBe('no-layer')
    expect(compareToggle({ on: false, layer: 'grid:a:b', t2Default: null })).toBeNull()
  })
  it('the Keyboard list names l first', () => {
    expect(SHORTCUTS[0].keys).toEqual(['l'])
    expect(SHORTCUTS.map(s => s.keys.join(' '))).toContain('Esc')
  })
})
