import { describe, expect, it } from 'vitest'
import { parquetReadObjects } from 'hyparquet'
import { cardModel, coveredIndicators, defaultMethod, fileName, grainsOf, groupCards, indexCoverage, placeCitation, placeCoverage, placeCsv, primaryGrain, seriesOf, toggleGrains } from './place.ts'
import { placeParquet } from './parquetOut.ts'
import { groupByPlace, normalizeValueRow } from './valuesData.ts'
import type { PlaceRow } from './valuesData.ts'
import type { Indicator, Vocab } from './data.ts'
import type { CoverageRow } from '../../../src/coverage/build.ts'

const ind = (o: Partial<Indicator>): Indicator => ({
  id: 'x:y', title: 'Sea surface temperature (X)', short: 'SST', kind: 'continuous', category: { onms: 'water-quality' }, series: 'sst', lead: true,
  min_periods: 10, status_grain: 'year', status_method: 'iea-sd', recent: 5, time_grains: ['year', 'month'], unit_label: '°C', decimals: 1,
  method: { kind: 'k', summary: 's' }, producer: { name: 'p' }, dataset: { id: 'd', title: 'D', providers: [] }, collections: [{ coll: 'places', places: 1, rows: 1, path: 'p' }],
  ...o,
}) as Indicator

const row = (o: Partial<PlaceRow>): PlaceRow => ({ place_id: 'P:1', coll: 'places', indicator: 'x:y', time_grain: 'year', time: '2020-01-01', class: null, value: 1, n: 1, unit: 'degree_C', ...o }) as PlaceRow
const years = (vals: (number | null)[], from = 2005) => vals.map((v, i) => row({ time: `${from + i}-01-01`, value: v }))
const VALS = [10, 12, 10, 12, 10, 12, 10, 12, 10, 12, 20, 20, 20, 20, 20]

describe('a place’s coverage', () => {
  const cov = (o: Partial<CoverageRow>) => ({ place_id: 'P:1', place_name: 'Place One', coll: 'places', indicator: 'x:y', time_grain: 'year', ...o }) as CoverageRow
  it('takes every row of the place, from every values collection that holds it: one place, grouped by place_coll', () => {
    const r = placeCoverage([cov({ place_coll: 'mr_eez' }), cov({ place_id: 'Q:2' }), cov({ coll: 'mr_eez', place_coll: 'mr_eez', indicator: 'z:w' })], 'P:1')
    expect(r.place).toEqual({ id: 'P:1', name: 'Place One', coll: 'mr_eez', valuesColls: ['mr_eez', 'places'] })
    expect(r.colls).toEqual(['mr_eez', 'places'])
    expect(r.rows.map(x => x.indicator)).toEqual(['x:y', 'z:w'])
  })
  it('without place_coll (an older coverage table) the group is the values collection; an unknown place is null', () => {
    expect(placeCoverage([cov({})], 'P:1').place?.coll).toBe('places')
    expect(placeCoverage([cov({})], 'NOPE:1')).toEqual({ place: null, colls: [], rows: [] })
  })
  it('the covered indicators are those with a coverage row, in manifest order', () => {
    const inds = [ind({ id: 'a:1' }), ind({ id: 'b:2' }), ind({ id: 'c:3' })]
    const idx = indexCoverage([cov({ indicator: 'c:3' }), cov({ indicator: 'a:1' })])
    expect(coveredIndicators(idx, 'P:1', inds).map(i => i.id)).toEqual(['a:1', 'c:3'])
  })
})

describe('cards grouped by vocabulary and series', () => {
  const vocabs = {
    onms: { title: 'ONMS', terms: [{ id: 'water-quality', label: 'Water quality' }, { id: 'habitat', label: 'Habitat' }] },
    names: { title: 'NaMES', terms: [{ id: 'physical-chemical', label: 'Physical-chemical' }] },
    eov: { title: 'EOV', terms: [] },
  } as unknown as Record<'onms' | 'names' | 'eov', Vocab>
  const inds = [
    ind({ id: 'a:more', series: 's1', lead: false, category: { onms: 'water-quality', names: 'physical-chemical' } }),
    ind({ id: 'a:lead', series: 's1', lead: true, series_title: 'Series one', category: { onms: 'water-quality', names: 'physical-chemical' } }),
    ind({ id: 'b:solo', series: 's2', lead: true, category: { onms: 'habitat' } }),
    ind({ id: 'c:orphan', series: 's3', lead: false, category: { onms: 'habitat' } }),
  ]
  it('terms in vocabulary order, a series’ lead first and the others behind it', () => {
    const g = groupCards(inds, vocabs, 'onms')
    expect(g.map(x => x.term.id)).toEqual(['water-quality', 'habitat'])
    expect(g[0].series).toHaveLength(1)
    expect(g[0].series[0]).toMatchObject({ series: 's1', title: 'Series one' })
    expect(g[0].series[0].lead.id).toBe('a:lead')
    expect(g[0].series[0].more.map(i => i.id)).toEqual(['a:more'])
  })
  it('a series without its lead here is led by its first indicator', () => {
    const habitat = groupCards(inds, vocabs, 'onms')[1]
    expect(habitat.series.map(s => [s.lead.id, s.more.length])).toEqual([['b:solo', 0], ['c:orphan', 0]])
  })
  it('regrouping by another vocabulary moves the cards and leaves an Other group for untagged ones', () => {
    const g = groupCards(inds, vocabs, 'names')
    expect(g.map(x => x.term.id)).toEqual(['physical-chemical', 'other'])
    expect(g[1].series.map(s => s.lead.id)).toEqual(['b:solo', 'c:orphan'])
  })
})

describe('grains and series', () => {
  it('the primary grain is the status grain when the place has rows there, else the first with a time axis', () => {
    expect(primaryGrain(ind({}), ['year', 'month'])).toBe('year')
    expect(primaryGrain(ind({}), ['month'])).toBe('month')
    expect(primaryGrain(ind({}), ['all', 'decade'])).toBe('decade')
    expect(primaryGrain(ind({}), ['all'])).toBeNull()
  })
  it('the toggle offers months next to a year-grain card, and nothing next to a month-only one', () => {
    expect(toggleGrains(ind({}), ['year', 'month'])).toEqual(['year', 'month'])
    expect(toggleGrains(ind({}), ['year'])).toEqual(['year'])
    expect(toggleGrains(ind({}), ['month'])).toEqual(['month'])
    expect(grainsOf([{ time_grain: 'month' }, { time_grain: 'year' }, { time_grain: 'month' }])).toEqual(['year', 'month'])
  })
  it('seriesOf keeps the grain’s periods with a value, in time order', () => {
    const rows = [row({ time: '2021-01-01', value: 2 }), row({ time: '2020-01-01', value: 1 }), row({ time: '2022-01-01', value: null }), row({ time_grain: 'month', time: '2020-03-01', value: 9 })]
    expect(seriesOf(rows, 'year')).toEqual([{ t: '2020-01-01', v: 1 }, { t: '2021-01-01', v: 2 }])
  })
  it('an unimplemented status method is shown as values', () => {
    expect(defaultMethod({ status_method: 'iea-sd' })).toBe('iea-sd')
    expect(defaultMethod({ status_method: 'anomaly' })).toBe('values')
  })
})

describe('a card’s model', () => {
  const rows = years(VALS)
  it('the default is the manifest’s method: status, trend, sentence and alt text from @oceanmetrics/status', () => {
    const m = cardModel(ind({}), 'Test Place', rows)
    expect(m.method).toBe('iea-sd')
    expect(m.status).toBe('above')
    expect(m.trend).toBe('flat')
    expect(m.sentence).toBe('SST in Test Place over the last 5 years (2015–2019) was more than 1 SD above its 2005–2019 mean, and changed by less than 1 SD.')
    expect(m.alt).toContain('The mean over the whole record is 14.0, and 1 SD either side spans 9.5 to 18.5.')
    expect(m.result).toMatchObject({ ltMean: 14, recentMean: 20, recentFrom: '2015-01-01', recentTo: '2019-01-01' })
    expect(m.stat).toMatchObject({ status_method: 'iea-sd', lt_mean: 14, time_grain: 'year' })
    expect(m.series).toHaveLength(15)
  })
  it('names-pct recomputes the status, the sentence and the overlay in place', () => {
    const m = cardModel(ind({}), 'Test Place', rows, { method: 'names-pct' })
    expect(m.method).toBe('names-pct')
    expect(m.status).toBe('within')
    expect(m.sentence).toBe('SST in Test Place over the last 5 years (2015–2019) was between the 10th and 90th percentiles of its 2005–2019 record, and changed by less than 1 SD.')
    expect(m.result?.p90).not.toBeNull()
  })
  it('a report\'s window, baseline and years change what the card assesses (and leave the default alone)', () => {
    const base = cardModel(ind({}), 'Test Place', rows)
    expect(cardModel(ind({}), 'Test Place', rows, {})).toEqual(base)
    expect(cardModel(ind({}), 'Test Place', rows, { recent: 3 }).result).toMatchObject({ recentFrom: '2017-01-01', recentTo: '2019-01-01' })
    expect(cardModel(ind({}), 'Test Place', rows, { baseline: [2005, 2014] }).result).toMatchObject({ ltMean: 11 })
    const cut = cardModel(ind({}), 'Test Place', rows, { from: 2008, to: 2016 })
    expect([cut.series[0].t, cut.series[cut.series.length - 1].t]).toEqual(['2008-01-01', '2016-01-01'])
  })
  it('values has no status', () => {
    const m = cardModel(ind({}), 'Test Place', rows, { method: 'values' })
    expect(m.status).toBeNull()
    expect(m.sentence).toBe('SST in Test Place: 20.0 °C in 2019.')
    expect(m.result?.ltMean).toBeNull()
  })
  it('too short a record gives no status and says why (regression: never an invented status)', () => {
    const m = cardModel(ind({}), 'Test Place', years([1, 2, 3]))
    expect(m.status).toBeNull()
    expect(m.sentence).toContain('no status relative to its own record')
    expect(m.stat?.why).toContain('fewer than the 10')
  })
  it('the month grain shows values only, whatever the method', () => {
    const months = Array.from({ length: 24 }, (_, i) => row({ time_grain: 'month', time: `${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`, value: i }))
    const m = cardModel(ind({}), 'Test Place', [...rows, ...months], { grain: 'month', method: 'iea-sd' })
    expect(m.grain).toBe('month')
    expect(m.method).toBe('values')
    expect(m.status).toBeNull()
    expect(m.sentence).toBe('SST in Test Place: 23.0 °C in 2021-12.')
    expect(m.grains).toEqual(['year', 'month'])
    expect(m.series).toHaveLength(24)
  })
  it('a place with months only opens at months', () => {
    const m = cardModel(ind({}), 'Test Place', [row({ time_grain: 'month', time: '2020-01-01', value: 5 })])
    expect(m.grain).toBe('month')
    expect(m.grains).toEqual(['month'])
    expect(m.method).toBe('values')
  })
  it('no rows is an empty card with a sentence', () => {
    const m = cardModel(ind({}), 'Test Place', [])
    expect(m.kind).toBe('empty')
    expect(m.sentence).toBe('SST in Test Place: no values.')
  })
  it('a categorical indicator gets class shares, the top class sentence and no status', () => {
    const c = ind({ kind: 'categorical', status_method: 'values', short: 'Bleaching alert', classes: { '0': 'No Stress', '1': 'Watch' } })
    const rs = ['2019-01-01', '2020-01-01'].flatMap((t, i) => [row({ time: t, class: '0', value: i ? 0.7 : 0.6 }), row({ time: t, class: '1', value: i ? 0.3 : 0.4 })])
    const m = cardModel(c, 'Test Place', rs)
    expect(m.kind).toBe('categorical')
    expect(m.status).toBeNull()
    expect(m.sentence).toBe('Bleaching alert in Test Place: No Stress over 70% of the area in 2020.')
    expect(m.stack!.classes.map(x => x.label)).toEqual(['No Stress', 'Watch'])
    expect(m.alt).toContain('classes: No Stress, Watch')
  })
})

describe('downloads', () => {
  it('file names replace ":" and keep the rest', () => {
    expect(fileName('NMS:FKNMS', 'erddap:dhw_5km:CRW_SST:mean', 'csv')).toBe('NMS-FKNMS_erddap-dhw_5km-CRW_SST-mean.csv')
    expect(fileName('MRGID:8371', 'sdg:ER_MRN_MPA', 'parquet')).toBe('MRGID-8371_sdg-ER_MRN_MPA.parquet')
  })
  const rows = [
    row({ time_grain: 'month', time: '2020-02-01', value: 2.5, n: 29 }),
    row({ time: '2020-01-01', value: 1, n: 12, unit: 'a,b', x_basis: 'x "q"' }),
    row({ time_grain: 'all', time: null, value: null, n: null }),
  ]
  it('CSV is plain: a header, the contract columns then producer columns, grains in file order, quoted when needed', () => {
    expect(placeCsv(rows)).toBe([
      'place_id,coll,indicator,time_grain,time,class,value,n,unit,x_basis',
      'P:1,places,x:y,year,2020-01-01,,1,12,"a,b","x ""q"""',
      'P:1,places,x:y,month,2020-02-01,,2.5,29,degree_C,',
      'P:1,places,x:y,all,,,,,degree_C,',
      '',
    ].join('\n'))
  })
  it('CSV of nothing is just the header', () => {
    expect(placeCsv([])).toBe('place_id,coll,indicator,time_grain,time,class,value,n,unit\n')
  })
  it('Parquet round-trips the rows, with time as a date and the producer column', async () => {
    const buf = placeParquet(rows, { 'om:place_id': 'P:1' })
    const back = (await parquetReadObjects({ file: buf })).map(normalizeValueRow)
    expect(back).toHaveLength(3)
    expect(back[0]).toMatchObject({ place_id: 'P:1', time_grain: 'year', time: '2020-01-01', value: 1, n: 12, unit: 'a,b', x_basis: 'x "q"' })
    expect(back[2]).toMatchObject({ time_grain: 'all', time: null, value: null, n: null })
  })
  it('the citation gets the place in its Values clause, or a clause of its own', () => {
    const c = 'Producer. Dataset. https://x. Values: Ocean Metrics Indicators, manifest 2026.10.20, x:y, CC BY 4.0, https://oceanmetrics.io/indicators/'
    expect(placeCitation({ id: 'x:y', citation: c }, 'NMS:FKNMS')).toBe('Producer. Dataset. https://x. Values: Ocean Metrics Indicators, manifest 2026.10.20, x:y, place NMS:FKNMS, CC BY 4.0, https://oceanmetrics.io/indicators/')
    expect(placeCitation({ id: 'x:y' }, 'NMS:FKNMS')).toBe('Values: Ocean Metrics Indicators, x:y, place NMS:FKNMS.')
  })
})

describe('reading values', () => {
  it('normalizes dates and bigint counts, and groups by place', () => {
    const r = normalizeValueRow({ place_id: 'A:1', time: new Date('2020-03-01T00:00:00Z'), value: 1.5, n: 3n, class: null })
    expect(r).toMatchObject({ time: '2020-03-01', n: 3, value: 1.5, class: null })
    const by = groupByPlace([r, { ...r, place_id: 'B:2' }, r])
    expect([...by.keys()]).toEqual(['A:1', 'B:2'])
    expect(by.get('A:1')).toHaveLength(2)
  })
})
