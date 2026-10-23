// the Map's empty state (no layer under the map): the "Layer under the map" select shown prominently with a one-click
// default, MUR SST at the latest month, and the hint that Compare then opens Then vs Now (Ben 2026-10-23: he could not find
// the layer or Then vs Now without asking). MUR SST has no indicator in the manifest, so `layerChoices` alone would list it
// only "From the link": the default gets its own name in the select. plain rules; MapView only draws them.
import type { LayerChoice } from './gridLayer.ts'

/** the one-click layer: MUR SST, monthly (no `t` of its own: the Map's period, else the dataset's latest) */
export const DEFAULT_LAYER = 'grid:jplMURSST41mday:sst'
export const DEFAULT_LAYER_CHOICE: LayerChoice = { value: DEFAULT_LAYER, label: 'Sea surface temperature, monthly (MUR SST)', group: 'JPL MUR SST v4.1' }

export const EMPTY_LAYER_LINE = 'Add a layer under the map: sea surface temperature, chlorophyll, …'
export const COMPARE_HINT = 'Then turn on Compare for Then vs Now: the same layer at two periods, with a swipe.'

/**
 * the select's choices with the default named: an entry "From the link" for it is replaced by the named one, and when it is
 * not listed at all it is added after none
 */
export function withDefaultLayer(choices: readonly LayerChoice[]): LayerChoice[] {
  const rest = choices.filter(c => c.value !== DEFAULT_LAYER || c.group !== 'From the link')
  if (rest.some(c => c.value === DEFAULT_LAYER)) return rest
  const i = rest.findIndex(c => c.value === '')
  return [...rest.slice(0, i + 1), DEFAULT_LAYER_CHOICE, ...rest.slice(i + 1)]
}
