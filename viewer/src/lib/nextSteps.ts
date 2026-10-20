// the way forward from a cell with no value, in plain functions (the component is NextSteps.svelte): where to compute an
// indicator for a place now (erddap-places, for the erddap indicators), where to ask for it (the repo's issue form,
// pre-filled), which place groups the indicator is computed for, and what the dataset covers.
import type { Indicator } from './data.ts'
import { pickRow } from './matrix.ts'
import type { CoverageIndex, Place } from './matrix.ts'
import { SOURCE_HREF } from './credits.ts'

export const ERDDAP_PLACES_HREF = 'https://oceanmetrics.io/erddap-places/'

// ids keep their colons (NMS:CINMS), spaces are %20 (erddap-places reads + and %20 as a space)
const enc = (s: string) => encodeURIComponent(s).replace(/%3A/gi, ':')

/** the erddap-places Statistics lens for a place and one variable of a dataset (its URL grammar: place, dataset, variable) */
export function erddapPlacesHref(placeId: string, dataset: string, variable: string): string {
  return `${ERDDAP_PLACES_HREF}#place=${enc(placeId)}&dataset=${enc(dataset)}&variable=${enc(variable)}`
}

export interface RequestInput {
  /** a request for one place and one indicator names all of placeId, placeName, indicatorId and short; one for a whole collection names only the collection (and its title) */
  placeId?: string
  placeName?: string
  /** the gazetteer collection of the place, or the collection asked for */
  collection: string
  /** the collection's title, for the issue title of a collection-only request */
  collectionTitle?: string
  indicatorId?: string
  /** the indicator's short title, for the issue title */
  short?: string
}

/**
 * the indicator-request issue form, pre-filled (GitHub reads the form's input ids, title and template from the query).
 * a request for a whole collection carries `collection` only: a maintainer reviews what to compute there.
 */
export function requestHref(r: RequestInput): string {
  const title = r.placeId
    ? `Request: ${r.short} for ${r.placeName}`
    : `Request: indicators for ${r.collectionTitle ?? r.collection}`
  const fields = [
    r.placeId ? `place=${enc(r.placeId)}` : '', `collection=${enc(r.collection)}`, r.indicatorId ? `indicator=${enc(r.indicatorId)}` : '',
  ].filter(Boolean)
  return `${SOURCE_HREF}/issues/new?template=indicator-request.yml&title=${enc(title)}&${fields.join('&')}`
}

/**
 * the ERDDAP variable of an erddap-places indicator: the third part of `erddap:<dataset>:<variable>:<stat>`. never the
 * manifest's `variable`, which is the quantity measured across producers (`sst` for CRW_SST, `dic` for dissic).
 */
export function erddapVariable(ind: Pick<Indicator, 'id'>): string | null {
  const parts = ind.id.split(':')
  return parts[0] === 'erddap' && parts.length >= 4 ? parts[2] : null
}

/** erddap-places can compute this indicator for any place in the gazetteer */
export const canComputeNow = (ind: Pick<Indicator, 'producer'>) => ind.producer.name === 'erddap-places'

/** the "compute it now" link of an indicator for a place, or null when erddap-places does not make it */
export function computeHref(ind: Indicator, place: Place): string | null {
  const variable = erddapVariable(ind)
  return canComputeNow(ind) && variable ? erddapPlacesHref(place.id, ind.dataset.id, variable) : null
}

export interface GroupCount {
  coll: string
  /** places in the group with a value for the indicator */
  places: number
}

/** the place groups the indicator has a value for, with how many places, in the index's group order */
export function computedGroups(idx: CoverageIndex, ind: Indicator): GroupCount[] {
  const n = new Map<string, number>()
  for (const p of idx.places) if (pickRow(idx, p.id, ind)?.last_value != null) n.set(p.coll, (n.get(p.coll) ?? 0) + 1)
  return idx.colls.filter(c => n.has(c)).map(c => ({ coll: c, places: n.get(c) as number }))
}

/** what the dataset covers, from the manifest: the time range (the manifest has no spatial extent) */
export function datasetCoverage(ind: Pick<Indicator, 'time_range' | 'time_grains'>): string | null {
  if (!ind.time_range) return null
  return `The dataset covers ${ind.time_range[0].slice(0, 4)}\u2013${ind.time_range[1].slice(0, 4)}, at ${ind.time_grains.join(' and ')} grain.`
}

/** what "compute it now" does: the values in the reader's browser only; the cell does not change */
export const COMPUTE_NOTE = 'Compute it now: the values appear in your browser; nothing is saved, so this cell stays empty.'
/** what a request does: the values join the catalog and the cell fills, with no promise of a message */
export const REQUEST_NOTE =
  'Ask to add it: the values join the catalog and this cell fills for everyone. Small requests run by themselves, usually within the hour; the issue gets a comment with the link.'
/** the sentence for an indicator no producer here computes on request */
export const MAINTAINER_NOTE = 'A maintainer will look at the request and reply on the issue.'
