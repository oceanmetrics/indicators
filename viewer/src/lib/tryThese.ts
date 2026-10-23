// Help ▾ → "Try these": five views that show what the Map and the Place view can do, in the hash grammar of the shoot script
// (viewer/scripts/shoot.mjs: LAYER_ONE, COMPARE, the anomaly, RANGE, the Place view). Ben 2026-10-23 could not find the layer
// under the map or Then vs Now without asking. the same five are on oceanmetrics.io /docs/ "Maps" (oceanmetrics.github.io
// `data/examples.json`); change both together.

export interface TryThis {
  id: string
  /** the menu row (the one-sentence description of each is on /docs/ "Maps": the entry chunk is at its budget) */
  label: string
  /** the view's hash, without `#` */
  hash: string
}

const SST = 'view=map&ind=erddap:dhw_5km:CRW_SST:mean'
const MUR = 'layer=grid:jplMURSST41mday:sst'
const ONE = `${SST}&pi=coll:places&grain=month&t=2024-07&${MUR}&place=NMS:CINMS`

export const TRY_THESE: readonly TryThis[] = [
  { id: 'layer', label: 'SST under the sanctuaries',
    hash: ONE },
  { id: 'compare', label: 'Then vs Now: July 2016 against July 2024',
    hash: `${ONE}&t2=2016-07` },
  { id: 'anomaly', label: 'The difference per cell',
    hash: `${ONE}&t2=2016-07&anom=1` },
  { id: 'range', label: 'Against a ten-year mean',
    hash: `${SST}&pi=NMS:CINMS&place=NMS:CINMS&grain=month&t=2024-07&${MUR}&t2=2003-2012` },
  { id: 'place', label: 'One place: Florida Keys',
    hash: 'view=place&place=NMS:FKNMS' },
]

/** the link of an example: the hash on this page, or a full url on another base (`https://oceanmetrics.io/indicators/`) */
export const tryHref = (t: Pick<TryThis, 'hash'>, base = '') => `${base}#${t.hash}`
