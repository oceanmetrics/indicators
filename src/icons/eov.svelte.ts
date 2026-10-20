// the eov- paths (traced from the GOOS EOV badges: most of the icon set's weight) load the first time an eov- glyph is
// drawn, as a chunk of their own, so the viewer's first load carries only icon-core.ts. every <Icon> shares the one load.
import type { IconName } from './icon-paths.ts'

let paths = $state.raw<Readonly<Record<string, string>> | null>(null)
let pending: Promise<void> | null = null

/** the eov- paths once loaded, else null */
export const eov = { get paths() { return paths } }

/** load the eov- paths (once; later calls share the first) */
export function loadEov(): Promise<void> {
  pending ??= import('./icon-paths-eov.ts').then(m => { paths = m.EOV_PATHS }).catch(e => { pending = null; throw e })
  return pending
}

/** an eov- name (its path may not be loaded yet) */
export const isEovName = (name: string): name is IconName => name.startsWith('eov-')
