// "On the map" on an OBIS card: from an indicator of the obis:* family at a place to the atlas's OBIS H3 layer (obis_h3)
// with the same EOV and indicator and the place selected. the URL rule is the atlas's (oceanmetrics/atlas
// `src/lib/state/obisPlace.ts` `placeObisUrl`, tests/obis/placeLink.test.ts) as the places Place page ports it
// (places `web/src/lib/obisLink.ts`); the token is the atlas's `p.<id>.<name>` (the gazetteer place by reference).
//
//   obis:es50:fish at NMS:CINMS  ->  https://oceanmetrics.io/atlas/?c=obis_h3&i=fish&dim.indicator=es&dim.period=all&res=auto&map=-119.75,33.725,6#pl=p.NMS%253ACINMS.Channel%2520Islands
//
// - the metric -> the atlas's `dim.indicator`: records n, species sp, shannon, simpson and es50 es. the atlas layer has no
//   hill1, hill2, bp or density: those cards carry no link (null);
// - the EOV slug of the indicator id -> the atlas item (`hard-corals` is `hardCorals`); all taxa is `all`;
// - the period is `all` unless the caller names a decade (`1990s`) or a year;
// - the camera is the place's centre at zoom 6 when the viewer has it (the viewer holds a place's centre, not its box, so a
//   large place is not framed as the Place page frames it), else none (the atlas's own opening camera);
// - the OBIS collection href rides along until the atlas catalog lists obis_h3 (the same interim as the Place page).
import { store } from '../../../src/storage.ts'

export const ATLAS_APP = 'https://oceanmetrics.io/atlas/'
/** the collection.json the atlas loads obis_h3 from, until its catalog lists the layer */
export const OBIS_COLLECTION_HREF = store('obis-h3/collection.json')

/** the metric of an `obis:<metric>[:<eov-slug>]` id -> the atlas's `dim.indicator` */
export const ATLAS_INDICATOR: Record<string, string> = { records: 'n', species: 'sp', shannon: 'shannon', simpson: 'simpson', es50: 'es' }
/** the EOV slug of an indicator id -> the atlas's item id */
export const ATLAS_ITEM: Record<string, string> = {
  fish: 'fish', 'hard-corals': 'hardCorals', mangroves: 'mangroves', 'marine-mammals': 'marineMammals', seabirds: 'seabirds', seagrasses: 'seagrasses', 'sea-turtles': 'seaTurtles',
}

/** the atlas's `g1` name encoding: `A-Za-z0-9_-` as they are, every other UTF-8 byte as `%XX` in upper case */
export function atlasEncode(s: string): string {
  let out = ''
  for (const b of new TextEncoder().encode(s)) {
    const c = String.fromCharCode(b)
    out += /[A-Za-z0-9_-]/.test(c) ? c : '%' + b.toString(16).toUpperCase().padStart(2, '0')
  }
  return out
}

/** the longest start of `name` whose encoding fits `max` characters (never half a character) */
function fitName(name: string, max: number): string {
  let out = ''
  for (const ch of name) {
    const next = out + atlasEncode(ch)
    if (next.length > max) break
    out = next
  }
  return out
}

/** the place token `p.<id>.<name>`, the id at most 120 encoded characters, the name at most 60; null for an id it refuses */
export function placeToken(id: string, name = ''): string | null {
  const enc = atlasEncode(id)
  if (!enc || enc.length > 120) return null
  return `p.${enc}.${fitName(name.trim(), 60)}`
}

const pretty = (p: URLSearchParams) => p.toString().replace(/%2C/g, ',').replace(/%3A/g, ':').replace(/%2F/g, '/')

export interface ObisAtlasPlace { id: string; name?: string; lat?: number | null; lon?: number | null }
export interface ObisAtlasOptions { period?: string; app?: string; collection?: string; zoom?: number }

/** the atlas URL for an OBIS indicator card at a place, or null when the indicator is not an OBIS one or the layer has no such indicator */
export function obisAtlasUrl(indicatorId: string, place: ObisAtlasPlace, opts: ObisAtlasOptions = {}): string | null {
  const [family, metric, slug, ...extra] = indicatorId.split(':')
  if (family !== 'obis' || !metric || extra.length) return null
  const dim = ATLAS_INDICATOR[metric]
  if (!dim) return null
  const item = slug === undefined ? 'all' : ATLAS_ITEM[slug]
  if (!item) return null
  const app = (opts.app ?? ATLAS_APP).replace(/\/*$/, '/')
  const q = new URLSearchParams()
  q.set('c', 'obis_h3')
  q.set('i', item)
  q.set('dim.indicator', dim)
  q.set('dim.period', opts.period ?? 'all')
  q.set('res', 'auto')
  const { lat, lon } = place
  if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    q.set('map', `${Math.round(lon * 1000) / 1000},${Math.round(lat * 1000) / 1000},${opts.zoom ?? 6}`)
  }
  const collection = opts.collection ?? OBIS_COLLECTION_HREF
  if (collection) q.set('collection', collection)
  const tok = placeToken(place.id, place.name ?? '')
  return `${app}?${pretty(q)}${tok ? '#' + pretty(new URLSearchParams({ pl: tok })) : ''}`
}
