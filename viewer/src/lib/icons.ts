// a name from the manifest or the matrix rules -> an icon of the generated set, or null when the set lacks it
import { CORE_PATHS, EOV_NAMES } from '../../../src/icons/index.ts'
import type { IconName } from '../../../src/icons/index.ts'

export function asIcon(name: string | null | undefined): IconName | null {
  return name && (name in CORE_PATHS || EOV_NAMES.includes(name)) ? (name as IconName) : null
}
