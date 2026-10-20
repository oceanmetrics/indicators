// a name from the manifest or the matrix rules -> an icon of the generated set, or null when the set lacks it
import { ICON_PATHS } from '../../../src/icons/index.ts'
import type { IconName } from '../../../src/icons/index.ts'

export function asIcon(name: string | null | undefined): IconName | null {
  return name && name in ICON_PATHS ? (name as IconName) : null
}
