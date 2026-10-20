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

/** the dataset, the organisations that produce or license it, and its licence */
export function dataCredit(ind: Pick<Indicator, 'dataset'>): string {
  const who = ind.dataset.providers.filter(p => p.roles.some(r => r === 'producer' || r === 'licensor')).map(p => p.name)
  const own = ind.dataset.license
  // the dataset's own licence; the catalog's (CC BY 4.0) is for the values and says nothing about the dataset
  const lic = own && own.toLowerCase() !== 'other' ? own : ''
  return `Data: ${ind.dataset.title}${who.length ? ` (${who.join('; ')})` : ''}${lic ? `, ${lic}` : ''}`
}
