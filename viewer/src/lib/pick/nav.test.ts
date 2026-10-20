import { describe, expect, it } from 'vitest'
import { nextIndex } from './nav.ts'

describe('arrow keys in a picker', () => {
  it('Down and Up move one step and stop at the ends', () => {
    expect(nextIndex(0, 3, 'ArrowDown')).toBe(1)
    expect(nextIndex(2, 3, 'ArrowDown')).toBe(2)
    expect(nextIndex(1, 3, 'ArrowUp')).toBe(0)
    expect(nextIndex(0, 3, 'ArrowUp')).toBe(0)
  })
  it('Home and End jump to the ends; other keys and an empty list do nothing', () => {
    expect(nextIndex(1, 4, 'Home')).toBe(0)
    expect(nextIndex(1, 4, 'End')).toBe(3)
    expect(nextIndex(1, 4, 'Enter')).toBeNull()
    expect(nextIndex(0, 0, 'ArrowDown')).toBeNull()
  })
})
