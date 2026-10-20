// the eov- paths load once, on first use, and every <Icon> shares them (src/icons/eov.svelte.ts)
import { describe, expect, it } from 'vitest'
import { eov, isEovName, loadEov } from './eov.svelte.ts'
import { EOV_NAMES } from './icon-core.ts'
import { ICON_PATHS } from './icon-paths.ts'

describe('the eov- paths load on first use', () => {
  it('are not loaded until asked for, then hold every eov- name with the map\'s own path; a second load is the first', async () => {
    expect(eov.paths).toBeNull()
    const first = loadEov()
    expect(loadEov()).toBe(first)
    await first
    for (const n of EOV_NAMES) expect(eov.paths?.[n]).toBe((ICON_PATHS as Record<string, string>)[n])
  })
  it('an eov- name is lazy; any other is up front', () => {
    expect(isEovName('eov-fish')).toBe(true)
    expect(isEovName('ui-search')).toBe(false)
  })
})
