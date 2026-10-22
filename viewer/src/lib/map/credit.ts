// the credit lines under the map: the basemap, the layer that draws the places, and the indicator's dataset.
// plain strings, so a test can pin them.
import type { Indicator } from '../data.ts'
import type { GazLayer } from './gazetteer.ts'

export const ESRI_TILES = {
  light: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  dark: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
}

export function basemapCredit(dark: boolean): string {
  return `Basemap: Esri ${dark ? 'Dark' : 'Light'} Gray Canvas (Esri, HERE, Garmin, FAO, NOAA, USGS)`
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
