// the credit lines under the map: the basemap (its style's own attribution), the layer that draws the places, the layer
// under them, and the indicator's dataset.
// plain strings, so a test can pin them.
import type { Indicator } from '../data.ts'
import type { GazLayer } from './gazetteer.ts'

/** a style's own attribution (every source's, once each), as the credit line says it: tags dropped, entities read */
export function styleCredit(style: { sources?: Record<string, { attribution?: string } | unknown> } | null | undefined): string {
  const seen = new Set<string>()
  for (const src of Object.values(style?.sources ?? {})) {
    const a = (src as { attribution?: unknown })?.attribution
    if (typeof a !== 'string') continue
    const text = a.replace(/<[^>]*>/g, '').replace(/&copy;/g, '©').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
    if (text) seen.add(text)
  }
  return seen.size ? `Basemap: ${[...seen].join('; ')}` : ''
}

/** the places layer's own credit (Marine Regions' for `mr_*`, which it draws from its own WMS) */
export function layerCredit(layer: Pick<GazLayer, 'title' | 'attribution'> | null): string {
  return layer ? `Places: ${layer.attribution || layer.title}` : ''
}

/**
 * the credit of the places the parts draw: each group's own attribution once (a set shares a source between groups), with the
 * link text of its source in brackets; "Places: ..." or nothing
 */
export function partsCredit(layers: readonly Pick<GazLayer, 'title' | 'attribution' | 'source_link'>[]): string {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const l of layers) {
    const text = (l.attribution || l.title).replace(/\.+$/, '')
    if (seen.has(text)) continue
    seen.add(text)
    lines.push(text + (l.source_link ? ` (${l.source_link.title})` : ''))
  }
  return lines.length ? `Places: ${lines.join('. ')}` : ''
}

/** the dataset, the organisations that produce or license it, and its licence */
export function dataCredit(ind: Pick<Indicator, 'dataset'>): string {
  const who = ind.dataset.providers.filter(p => p.roles.some(r => r === 'producer' || r === 'licensor')).map(p => p.name)
  const own = ind.dataset.license
  // the dataset's own licence; the catalog's (CC BY 4.0) is for the values and says nothing about the dataset. "other"
  // and "various" (OBIS: each source dataset has its own) name no licence, so none is claimed
  const lic = own && !['other', 'various'].includes(own.toLowerCase()) ? own : ''
  return `Data: ${ind.dataset.title}${who.length ? ` (${who.join('; ')})` : ''}${lic ? `, ${lic}` : ''}`
}

/** the layer under the map: its own credit line, else its title; nothing without a layer */
export function slotCredit(slot: { title: string; credit?: string } | null): string {
  return slot ? `Layer: ${slot.credit || slot.title}` : ''
}
