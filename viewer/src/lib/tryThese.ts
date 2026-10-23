// Help ▾ → "Try these": five views that show what the Map and the Place view can do, in the hash grammar of the shoot script
// (viewer/scripts/shoot.mjs: LAYER_ONE, COMPARE, the anomaly, RANGE, the Place view). Ben 2026-10-23 could not find the layer
// under the map or Then vs Now without asking. the same five are on oceanmetrics.io /docs/ "Maps" (oceanmetrics.github.io
// `data/examples.json`); change both together.

export interface TryThis {
  id: string
  /** the menu row */
  label: string
  /** one sentence: what the view shows */
  sentence: string
  /** the view's hash, without `#` */
  hash: string
}

const SST = 'view=map&ind=erddap:dhw_5km:CRW_SST:mean'
const MUR = 'layer=grid:jplMURSST41mday:sst'

export const TRY_THESE: readonly TryThis[] = [
  { id: 'layer', label: 'SST under the sanctuaries',
    sentence: 'Monthly sea surface temperature (MUR SST) under the sanctuaries, with the period scrubber to move through time.',
    hash: `${SST}&pi=coll:places&grain=month&t=2024-07&${MUR}&place=NMS:CINMS` },
  { id: 'compare', label: 'Then vs Now: July 2016 against July 2024',
    sentence: 'The same layer at two periods side by side, with a swipe between Then and Now.',
    hash: `${SST}&pi=coll:places&grain=month&t=2024-07&${MUR}&place=NMS:CINMS&t2=2016-07` },
  { id: 'anomaly', label: 'The difference per cell',
    sentence: 'Then vs Now as one map: July 2024 minus July 2016 in every cell, on a diverging scale.',
    hash: `${SST}&pi=coll:places&grain=month&t=2024-07&${MUR}&place=NMS:CINMS&t2=2016-07&anom=1` },
  { id: 'range', label: 'Against a ten-year mean',
    sentence: 'Channel Islands in July 2024 against the mean of July 2003 to 2012 as Then.',
    hash: `${SST}&pi=NMS:CINMS&place=NMS:CINMS&grain=month&t=2024-07&${MUR}&t2=2003-2012` },
  { id: 'place', label: 'One place: Florida Keys',
    sentence: 'Every indicator of one sanctuary, with its status and trend relative to its own record.',
    hash: 'view=place&place=NMS:FKNMS' },
]

/** the link of an example: the hash on this page, or a full url on another base (`https://oceanmetrics.io/indicators/`) */
export const tryHref = (t: Pick<TryThis, 'hash'>, base = '') => `${base}#${t.hash}`
