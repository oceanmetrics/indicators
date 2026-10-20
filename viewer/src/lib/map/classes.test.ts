// the Map view's rules on small synthetic fixtures: exact classes, legends and statuses. the coverage rows are built
// by the coverage builder itself from the same values, so a model made from coverage alone and one made from the
// values file must agree at the latest period.
import { describe, expect, it } from 'vitest'
import { coverageOf } from '../../../../src/coverage/build.ts'
import type { CoverageRow, ManifestIndicator, ValueRow } from '../../../../src/coverage/build.ts'
import type { Indicator } from '../data.ts'
import { groupByPlace } from '../valuesData.ts'
import type { PlaceRow } from '../valuesData.ts'
import {
  departureClass, mapGrain, mapModel, mapModes, periodStart, periodToT, placeTokens, quantileClasses, rampSteps, recordClass,
  shareClass, tableOrder,
} from './classes.ts'
import type { MapOpts } from './classes.ts'

// ---- fixtures ----

const cont = (over: Partial<Indicator> = {}): Indicator => ({
  id: 'x:t', title: 'Temperature', short: 'Temp', unit_label: '°C', decimals: 1, kind: 'continuous', category: {}, series: 's',
  lead: true, min_periods: 10, status_grain: 'year', status_method: 'iea-sd', recent: 5, time_grains: ['year'],
  method: { kind: 'k', summary: '' }, producer: { name: 'p' }, dataset: { id: 'd', title: 'D', providers: [] },
  collections: [{ coll: 'c', places: 0, rows: 0, path: 'values/x.parquet' }], ...over,
}) as Indicator

const row = (place: string, year: number, value: number | null, cls: string | null = null): PlaceRow => ({
  place_id: place, coll: 'c', indicator: 'x:t', time_grain: 'year', time: `${year}-01-01`, class: cls, value, n: 1, unit: '',
}) as PlaceRow

/** years from..to with the value function */
const years = (place: string, from: number, to: number, f: (y: number) => number): PlaceRow[] =>
  Array.from({ length: to - from + 1 }, (_, i) => row(place, from + i, f(from + i)))

const asManifest = (i: Indicator) => i as unknown as ManifestIndicator
const covOf = (rows: PlaceRow[], ind: Indicator, names: Record<string, string> = {}): CoverageRow[] =>
  coverageOf(rows as ValueRow[], asManifest(ind), new Map(Object.entries(names)))

const opts = (o: Partial<MapOpts> = {}): MapOpts => ({ color: null, t: null, method: null, cls: null, ...o })

// A and B alternate 8 and 12 over 20 years (mean 10, sample SD 2.0520); A ends on 12, B on 8. C has 5 years only.
// D is flat at 10 until 2014 and then climbs from 22 by 2 a year: within its record in 2014, above it and rising at the end.
const alt = (place: string, endsHigh: boolean) => years(place, 2000, 2019, y => ((y % 2 === 1) === endsHigh ? 12 : 8))
const A = alt('A', true)
const B = alt('B', false)
const C = years('C', 2015, 2019, () => 7)
const D = years('D', 2000, 2019, y => (y <= 2014 ? 10 + (y % 2 ? 0.5 : -0.5) : 20 + 2 * (y - 2014)))
const NAMES = { A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta' }
const ALL = [...A, ...B, ...C, ...D]

// ---- the small rules ----

describe('quantile classes', () => {
  it('splits ten distinct values into five classes of two', () => {
    expect(quantileClasses([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4])
  })
  it('fewer distinct values give fewer classes, numbered from 0', () => {
    expect(quantileClasses([1, 1, 1, 2])).toEqual([0, 0, 0, 1])
    expect(quantileClasses([5, 5, 5])).toEqual([0, 0, 0])
    expect(quantileClasses([])).toEqual([])
  })
})

describe('the sequential ramp', () => {
  it('k classes use k of the five steps, spread over the ramp', () => {
    expect(rampSteps(1)).toEqual([3])
    expect(rampSteps(2)).toEqual([1, 5])
    expect(rampSteps(3)).toEqual([1, 3, 5])
    expect(rampSteps(4)).toEqual([1, 2, 4, 5])
    expect(rampSteps(5)).toEqual([1, 2, 3, 4, 5])
    expect(rampSteps(0)).toEqual([])
  })
})

describe('the fixed bins', () => {
  it('departure: at or beyond 1 SD, (0.5, 1), and the open middle', () => {
    const k = (z: number) => departureClass(z)
    expect([k(-3), k(-1), k(-0.99), k(-0.5), k(-0.49), k(0), k(0.49), k(0.5), k(0.99), k(1), k(3)]).toEqual([0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 4])
  })
  it('record length: <5, 5-9, 10-19, 20-29, 30+', () => {
    expect([4, 5, 9, 10, 19, 20, 29, 30, 99].map(recordClass)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
  })
  it('share: 20 % steps, 100 % in the last', () => {
    expect([0, 0.19, 0.2, 0.39, 0.4, 0.6, 0.8, 1].map(shareClass)).toEqual([0, 0, 1, 1, 2, 3, 4, 4])
  })
})

describe('periods', () => {
  it('a hash t names the start of its period at the grain', () => {
    expect(periodStart('2024', 'year')).toBe('2024-01-01')
    expect(periodStart('2024-07', 'month')).toBe('2024-07-01')
    expect(periodStart('2024', 'month')).toBe('2024-01-01')
    expect(periodStart('2024-07', 'year')).toBe('2024-01-01')
    expect(periodStart('2024', 'decade')).toBe('2020-01-01')
    expect(periodStart('2024-07-15', 'day')).toBe('2024-07-15')
    expect(periodStart('soon', 'year')).toBeNull()
  })
  it('a period start is written back as the hash writes it', () => {
    expect(periodToT('2024-01-01', 'year')).toBe('2024')
    expect(periodToT('2024-07-01', 'month')).toBe('2024-07')
  })
})

describe('which modes apply', () => {
  const some = [{ status: 'above' as const }]
  it('a continuous indicator with a status method offers five, and opens on status when a place has one', () => {
    expect(mapModes(cont(), some)).toEqual({ modes: ['value', 'departure', 'status', 'trend', 'record'], default: 'status' })
    expect(mapModes(cont(), [{ status: null }]).default).toBe('value')
  })
  it('status_method values offers value and record only', () => {
    expect(mapModes(cont({ status_method: 'values' }), some)).toEqual({ modes: ['value', 'record'], default: 'value' })
  })
  it('a status method that is not implemented counts as values, as the coverage builder does', () => {
    expect(mapModes(cont({ status_method: 'anomaly' }), some).modes).toEqual(['value', 'record'])
  })
  it('a categorical indicator offers class, share and record', () => {
    expect(mapModes(cont({ kind: 'categorical' }), some)).toEqual({ modes: ['class', 'share', 'record'], default: 'class' })
  })
  it('a mode the indicator does not offer falls back to its default', () => {
    const ind = cont({ status_method: 'values' })
    const m = mapModel(ind, covOf(A, ind), null, opts({ color: 'status' }))
    expect(m.color).toBe('value')
  })
})

// ---- value, status, trend ----

describe('value mode', () => {
  const ind = cont()
  const cov = covOf(ALL, ind, NAMES)
  it('classes the latest values by quantile and labels each class with its range and unit', () => {
    const m = mapModel(ind, cov, null, opts({ color: 'value' }))
    // latest values: A 12, B 8, C 7, D 30 -> four distinct values
    const by = Object.fromEntries(m.items.map(i => [i.name, i]))
    expect(by.Charlie.value).toBe(7)
    expect(by.Delta.valueText).toBe('30.0 °C')
    expect(m.items.map(i => i.k)).toEqual([2, 1, 0, 3])
    expect(m.legend.map(l => l.label)).toEqual(['7.0 °C', '8.0 °C', '12.0 °C', '30.0 °C'])
    expect(m.legend.map(l => l.token)).toEqual(['--map-seq-1', '--map-seq-2', '--map-seq-4', '--map-seq-5'])
    expect(m.legend.map(l => l.count)).toEqual([1, 1, 1, 1])
  })
  it('a place with no value has no class and says why', () => {
    const e = [...cov, ...covOf([row('E', 2019, null)], ind, { E: 'Echo' })]
    const echo = mapModel(ind, e, null, opts({ color: 'value' })).items.find(i => i.placeId === 'E')!
    expect(echo.k).toBeNull()
    expect(echo.label).toBe('no year value')
    expect(echo.valueText).toBeNull()
  })
  it('the same value at a past period needs the values file', () => {
    expect(mapModel(ind, cov, null, opts({ color: 'value', t: '2010' })).pending).toBe(true)
    const m = mapModel(ind, cov, groupByPlace(ALL), opts({ color: 'value', t: '2018' }))
    expect(m.pending).toBe(false)
    expect(m.period).toBe('2018-01-01')
    expect(Object.fromEntries(m.items.map(i => [i.placeId, i.value]))).toEqual({ A: 8, B: 12, C: 7, D: 28 })
  })
  it('a place with no row at the period has no class and says which period', () => {
    const m = mapModel(ind, cov, groupByPlace(ALL), opts({ color: 'value', t: '2005' }))
    const c = m.items.find(i => i.placeId === 'C')!
    expect(c.k).toBeNull()
    expect(c.label).toBe('no value in 2005')
  })
  it('the periods are those of the values file, oldest first', () => {
    const m = mapModel(ind, cov, groupByPlace(ALL), opts({ color: 'value' }))
    expect(m.periods[0]).toBe('2000-01-01')
    expect(m.periods[m.periods.length - 1]).toBe('2019-01-01')
    expect(m.periods).toHaveLength(20)
    expect(mapModel(ind, cov, null, opts()).periods).toEqual(['2019-01-01'])
  })
})

describe('status and trend', () => {
  const ind = cont()
  const cov = covOf(ALL, ind, NAMES)
  const byId = (m: ReturnType<typeof mapModel>) => Object.fromEntries(m.items.map(i => [i.placeId, i]))

  it('at the latest period the map says what the coverage row says, from coverage alone and from the values file', () => {
    for (const values of [null, groupByPlace(ALL)]) {
      const m = mapModel(ind, cov, values, opts({ color: 'status' }))
      for (const it of m.items) {
        const r = cov.find(c => c.place_id === it.placeId && c.time_grain === 'year')!
        expect(it.status, it.placeId).toBe(r.status)
        expect(it.trend, it.placeId).toBe(r.trend)
      }
    }
  })
  it('colours by status, with glyphs, in the order below, within, above', () => {
    const m = mapModel(ind, cov, null, opts({ color: 'status' }))
    expect(m.legend.map(l => [l.token, l.glyph, l.label])).toEqual([
      ['--map-st-below', 'st-below', 'Below its own record'],
      ['--map-st-within', 'st-within', 'Within its own record'],
      ['--map-st-above', 'st-above', 'Above its own record'],
    ])
    const by = byId(m)
    expect(by.D.status).toBe('above')
    expect(by.D.k).toBe(2)
    expect(by.A.k).toBe(1)
  })
  it('a place with too short a record has no status, and the reason is the builder’s', () => {
    const c = byId(mapModel(ind, cov, null, opts({ color: 'status' }))).C
    expect(c.k).toBeNull()
    expect(c.label).toBe('5 years of record, fewer than the 10 a status needs')
  })
  it('trend uses its own legend', () => {
    const m = mapModel(ind, cov, null, opts({ color: 'trend' }))
    expect(m.legend.map(l => [l.token, l.glyph])).toEqual([['--map-tr-down', 'tr-down'], ['--map-tr-flat', 'tr-flat'], ['--map-tr-up', 'tr-up']])
    expect(byId(m).D.trend).toBe('up')
    expect(byId(m).D.k).toBe(2)
  })
  it('as of a past period the series is cut there: D was within its record in 2014 and above it in 2019', () => {
    const past = mapModel(ind, cov, groupByPlace(ALL), opts({ color: 'status', t: '2014' }))
    expect(byId(past).D.status).toBe('within')
    expect(byId(past).D.k).toBe(1)
    expect(byId(past).C.k).toBeNull()   // C has no row in 2014
    expect(mapModel(ind, cov, groupByPlace(ALL), opts({ color: 'status', t: '2019' })).items.find(i => i.placeId === 'D')!.status).toBe('above')
  })
  it('another method needs the values file and is computed by the same module', () => {
    expect(mapModel(ind, cov, null, opts({ color: 'status', method: 'names-pct' })).pending).toBe(true)
    const m = mapModel(ind, cov, groupByPlace(ALL), opts({ color: 'status', method: 'names-pct' }))
    expect(m.pending).toBe(false)
    expect(m.method).toBe('names-pct')
    // the same record read by percentiles: D's last five years sit inside its 10th to 90th percentiles
    expect(byId(m).D.status).toBe('within')
  })
})

describe('departure mode', () => {
  const ind = cont()
  const cov = covOf(ALL, ind, NAMES)
  it('is (value - its long-term mean) / its sample SD, binned; a short record gets no class', () => {
    for (const values of [null, groupByPlace(ALL)]) {
      const m = mapModel(ind, cov, values, opts({ color: 'departure' }))
      const by = Object.fromEntries(m.items.map(i => [i.placeId, i]))
      // mean 10, sample SD sqrt(80/19) = 2.0520: A ends on 12 (z 0.975), B on 8 (z -0.975)
      expect(by.A.z).toBeCloseTo(2 / Math.sqrt(80 / 19), 10)
      expect(by.A.k).toBe(3)
      expect(by.B.k).toBe(1)
      expect(by.A.label).toBe('0.5 to 1 SD above its own mean')
      expect(by.C.k).toBeNull()
      expect(by.C.label).toBe('5 years of record, fewer than the 10 a status needs')
      expect(by.D.k).toBe(4)
    }
    const m = mapModel(ind, cov, null, opts({ color: 'departure' }))
    expect(m.legend.map(l => l.token)).toEqual(['--map-div-1', '--map-div-2', '--map-div-3', '--map-div-4', '--map-div-5'])
    expect(m.legend[0].label).toBe('1 SD or more below its own mean')
  })
  it('uses the whole record even when the period shown is earlier', () => {
    // 2018: A is 8 against the mean of the whole record (10), not of the record to 2018
    const m = mapModel(ind, cov, groupByPlace(ALL), opts({ color: 'departure', t: '2018' }))
    expect(m.items.find(i => i.placeId === 'A')!.z).toBeCloseTo(-2 / Math.sqrt(80 / 19), 10)
  })
  it('a flat record has no departure', () => {
    const flat = years('F', 2000, 2019, () => 5)
    const m = mapModel(ind, covOf(flat, ind), groupByPlace(flat), opts({ color: 'departure' }))
    expect(m.items[0].k).toBeNull()
    expect(m.items[0].label).toBe('no variation in its record')
  })
})

describe('record mode', () => {
  const ind = cont()
  const cov = covOf(ALL, ind, NAMES)
  it('bins the periods of record at the status grain', () => {
    const m = mapModel(ind, cov, null, opts({ color: 'record' }))
    const by = Object.fromEntries(m.items.map(i => [i.placeId, i]))
    expect(by.A.k).toBe(3)   // 20 years
    expect(by.C.k).toBe(1)   // 5 years
    expect(by.C.label).toBe('5 to 9 years')
    expect(m.legend.map(l => l.label)).toEqual(['Fewer than 5 years', '5 to 9 years', '10 to 19 years', '20 to 29 years', '30 years or more'])
    expect(m.legend.map(l => l.count)).toEqual([0, 1, 0, 3, 0])
  })
  it('counts the periods up to the one shown', () => {
    const m = mapModel(ind, cov, groupByPlace(ALL), opts({ color: 'record', t: '2009' }))
    expect(m.items.find(i => i.placeId === 'A')!.k).toBe(2)   // 10 years, 2000-2009
  })
})

describe('a status method of values', () => {
  it('maps values and record length, and no place has a status', () => {
    const ind = cont({ status_method: 'values' })
    const rows = [row('A', 2025, 28), row('B', 2025, 64)]
    const m = mapModel(ind, covOf(rows, ind), null, opts())
    expect(m.color).toBe('value')
    expect(m.modes).toEqual(['value', 'record'])
    expect(m.items.every(i => i.status == null)).toBe(true)
    expect(m.legend).toHaveLength(2)
  })
})

describe('an indicator whose record is not at its status grain', () => {
  it('is read at the grain that has values, with no status', () => {
    const ind = cont()
    const monthly: PlaceRow[] = ['2025-01-01', '2025-02-01'].map((t, i) => ({ ...row('M', 2025, 3 + i), time_grain: 'month', time: t }) as PlaceRow)
    const cov = covOf(monthly, ind)
    expect(mapGrain(ind, cov)).toBe('month')
    const m = mapModel(ind, cov, null, opts({ color: 'status' }))
    expect(m.grain).toBe('month')
    expect(m.modes).toEqual(['value', 'record'])
    expect(m.color).toBe('value')
    expect(m.items[0].value).toBe(4)
    expect(m.items[0].periodText).toBe('2025-02')
    const past = mapModel(ind, cov, groupByPlace(monthly), opts({ t: '2025-01' }))
    expect(past.items[0].value).toBe(3)
  })
  it('the status grain wins when any place has a value there', () => {
    const ind = cont()
    expect(mapGrain(ind, covOf(A, ind))).toBe('year')
  })
  it('a chosen grain wins when a place has a value at it, and is read with values only', () => {
    const ind = cont()
    const decades: PlaceRow[] = [2000, 2010].map((y, i) => ({ ...row('D', y, 10 + i), time_grain: 'decade', time: `${y}-01-01` }) as PlaceRow)
    const cov = covOf([...A, ...decades], ind)
    expect([mapGrain(ind, cov, 'decade'), mapGrain(ind, cov, 'month')]).toEqual(['decade', 'year'])
    const m = mapModel(ind, cov, groupByPlace(decades), opts({ grain: 'decade', color: 'status', t: '2000' }))
    expect([m.grain, m.color, m.modes.join(',')]).toEqual(['decade', 'value', 'value,record'])
    expect(m.items.find(i => i.placeId === 'D')?.value).toBe(10)
  })
})

// ---- categorical ----

const catInd = cont({ kind: 'categorical', status_method: 'values', unit_label: 'share', classes: { a: 'Alpha sea', b: 'Bravo sea', c: 'Charlie sea', d: 'Delta sea', e: 'Echo sea' } })
const crow = (place: string, year: number, cls: string, v: number): PlaceRow => row(place, year, v, cls)
const CAT: PlaceRow[] = [
  crow('P1', 2019, 'a', 0.7), crow('P1', 2019, 'b', 0.3),
  crow('P2', 2019, 'a', 0.5), crow('P2', 2019, 'c', 0.5),
  crow('P3', 2019, 'b', 0.9), crow('P3', 2019, 'a', 0.1),
  crow('P4', 2019, 'c', 0.6), crow('P4', 2019, 'd', 0.4),
  crow('P5', 2019, 'd', 0.55), crow('P5', 2019, 'e', 0.45),
  crow('P1', 2018, 'b', 1),
]

describe('categorical indicators', () => {
  const cov = covOf(CAT, catInd)
  it('class: the three most frequent largest classes get a hue, the rest are other', () => {
    const m = mapModel(catInd, cov, null, opts())
    expect(m.color).toBe('class')
    // largest classes: P1 a, P2 a (tie 0.5 -> a before c), P3 b, P4 c, P5 d -> a 2, b 1, c 1, d 1
    expect(m.legend.map(l => [l.token, l.label, l.count])).toEqual([
      ['--map-cat-1', 'Alpha sea', 2], ['--map-cat-2', 'Bravo sea', 1], ['--map-cat-3', 'Charlie sea', 1], ['--map-cat-other', 'Other classes', 1],
    ])
    expect(m.items.map(i => i.k)).toEqual([0, 0, 1, 2, 3])
    expect(m.items[0].label).toBe('Alpha sea 70 %')
  })
  it('the same answer from coverage alone and from the values file', () => {
    const a = mapModel(catInd, cov, null, opts())
    const b = mapModel(catInd, cov, groupByPlace(CAT), opts())
    expect(b.items.map(i => i.k)).toEqual(a.items.map(i => i.k))
    expect(b.legend).toEqual(a.legend)
  })
  it('an ordinal indicator is ramped in class order instead of given hues', () => {
    const ord = { ...catInd, ordinal: true }
    const m = mapModel(ord, covOf(CAT, ord), null, opts())
    expect(m.legend.map(l => [l.label, l.token])).toEqual([
      ['Alpha sea', '--map-seq-1'], ['Bravo sea', '--map-seq-2'], ['Charlie sea', '--map-seq-4'], ['Delta sea', '--map-seq-5'],
    ])
    expect(m.items.map(i => i.k)).toEqual([0, 0, 1, 2, 3])
  })
  it('share: the share of one class, a class absent from a place counts 0; needs the values file', () => {
    expect(mapModel(catInd, cov, null, opts({ color: 'share' })).pending).toBe(true)
    const m = mapModel(catInd, cov, groupByPlace(CAT), opts({ color: 'share', cls: 'a' }))
    expect(m.cls).toBe('a')
    expect(m.items.map(i => i.value)).toEqual([0.7, 0.5, 0.1, 0, 0])
    expect(m.items.map(i => i.k)).toEqual([3, 2, 0, 0, 0])
    expect(m.items[0].valueText).toBe('70 %')
    expect(m.legend.map(l => l.label)).toEqual(['0–20 %', '20–40 %', '40–60 %', '60–80 %', '80–100 %'])
    expect(m.classChoices[0]).toEqual({ cls: 'a', label: 'Alpha sea' })
  })
  it('share defaults to the most frequent class', () => {
    expect(mapModel(catInd, cov, groupByPlace(CAT), opts({ color: 'share' })).cls).toBe('a')
  })
  it('a past period reads that year’s classes', () => {
    const m = mapModel(catInd, cov, groupByPlace(CAT), opts({ t: '2018' }))
    expect(m.items.find(i => i.placeId === 'P1')!.label).toBe('Bravo sea 100 %')
    expect(m.items.find(i => i.placeId === 'P2')!.k).toBeNull()
  })
})

// ---- helpers over a model ----

describe('placeTokens and tableOrder', () => {
  const ind = cont()
  const m = mapModel(ind, covOf(ALL, ind, NAMES), null, opts({ color: 'status' }))
  it('maps each classed place to its token and leaves the others out', () => {
    expect([...placeTokens(m).entries()].sort()).toEqual([['A', '--map-st-within'], ['B', '--map-st-within'], ['D', '--map-st-above']])
  })
  it('orders by class, then value, with unclassed places last', () => {
    expect(tableOrder(m.items).map(i => i.placeId)).toEqual(['B', 'A', 'D', 'C'])
  })
})

// ---- a place group reads every values collection that holds its places ----

describe('the Map of a place group', () => {
  const ind = cont()
  // E is in the values collection `c2` and home group `g`; A is in `c` with home group `g` too; B is in `c` with home group `h`
  const withColl = (rows: CoverageRow[], coll: string, place_coll: string) => rows.map(r => ({ ...r, coll, place_coll }))
  const cov = [
    ...withColl(covOf(A, ind, NAMES), 'c', 'g'),
    ...withColl(covOf(years('E', 2000, 2019, y => 5 + (y % 2)), ind, { E: 'Echo' }), 'c2', 'g'),
    ...withColl(covOf(B, ind, NAMES), 'c', 'h'),
  ]
  it('a group holds its places from every values collection, and none of another group', () => {
    const m = mapModel(ind, cov, null, opts({ group: 'g' }))
    expect(m.items.map(i => i.placeId)).toEqual(['A', 'E'])
    expect(mapModel(ind, cov, null, opts({ group: 'h' })).items.map(i => i.placeId)).toEqual(['B'])
  })
  it('no group (and no collection) is every place, as before', () => {
    expect(mapModel(ind, cov, null, opts()).items.map(i => i.placeId)).toEqual(['A', 'B', 'E'])
  })
  it('a coverage table built before place_coll groups by the values collection', () => {
    const old = cov.map(r => ({ ...r, place_coll: undefined }))
    expect(mapModel(ind, old, null, opts({ group: 'c2' })).items.map(i => i.placeId)).toEqual(['E'])
  })
})
