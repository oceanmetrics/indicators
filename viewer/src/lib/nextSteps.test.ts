import { describe, expect, it } from 'vitest'
import type { CoverageRow } from '../../../src/coverage/build.ts'
import type { Indicator } from './data.ts'
import { indexCoverage } from './matrix.ts'
import {
  canComputeNow, computeHref, computedGroups, datasetCoverage, erddapPlacesHref, erddapVariable, requestHref,
} from './nextSteps.ts'

const ind = (o: Partial<Indicator> & { id: string }): Indicator => ({
  title: o.id, short: o.id, kind: 'continuous', category: {}, series: o.id, lead: true, min_periods: 10, status_grain: 'year',
  status_method: 'iea-sd', recent: 5, time_grains: ['year', 'month'], method: { kind: 'k', summary: '' }, producer: { name: 'erddap-places' },
  dataset: { id: 'dhw_5km', title: 'D', providers: [] }, collections: [], ...o,
}) as Indicator

describe('erddapPlacesHref', () => {
  it('writes the place, dataset and variable the erddap-places URL grammar reads, colons kept', () => {
    expect(erddapPlacesHref('NERRS:WEL', 'dhw_5km', 'CRW_SST'))
      .toBe('https://oceanmetrics.io/erddap-places/#place=NERRS:WEL&dataset=dhw_5km&variable=CRW_SST')
  })
  it('a place id with a space or other characters is percent-encoded (a space is %20)', () => {
    expect(erddapPlacesHref('BOEM:OCS-A 0506', 'jplMURSST41', 'analysed_sst'))
      .toBe('https://oceanmetrics.io/erddap-places/#place=BOEM:OCS-A%200506&dataset=jplMURSST41&variable=analysed_sst')
    expect(erddapPlacesHref('ONMS:florida-keys-national-marine-sanctuary:northern-section', 'd', 'v&x'))
      .toBe('https://oceanmetrics.io/erddap-places/#place=ONMS:florida-keys-national-marine-sanctuary:northern-section&dataset=d&variable=v%26x')
  })
})

describe('requestHref', () => {
  it('pre-fills the indicator-request issue form: template, title and the form fields place, collection, indicator', () => {
    expect(requestHref({ placeId: 'NERRS:WEL', placeName: 'Wells', collection: 'noaa_nerrs', indicatorId: 'erddap:dhw_5km:CRW_SST:mean', short: 'SST' }))
      .toBe('https://github.com/oceanmetrics/indicators/issues/new?template=indicator-request.yml&title=Request:%20SST%20for%20Wells&place=NERRS:WEL&collection=noaa_nerrs&indicator=erddap:dhw_5km:CRW_SST:mean')
  })
  it('encodes spaces, ampersands and parentheses in the names and ids', () => {
    expect(requestHref({ placeId: 'BOEM:OCS-A 0506', placeName: 'British EEZ (Pitcairn) & co', collection: 'mr_eez', indicatorId: 'sdg:14.5.1', short: 'MPA cover' }))
      .toBe('https://github.com/oceanmetrics/indicators/issues/new?template=indicator-request.yml&title=Request:%20MPA%20cover%20for%20British%20EEZ%20(Pitcairn)%20%26%20co&place=BOEM:OCS-A%200506&collection=mr_eez&indicator=sdg:14.5.1')
  })
  it('carries no email address or other private field', () => {
    expect(requestHref({ placeId: 'a:b', placeName: 'n', collection: 'c', indicatorId: 'i', short: 's' })).not.toMatch(/@|email/)
  })
})

describe('the compute-now link', () => {
  const sst = ind({ id: 'erddap:dhw_5km:CRW_SST:mean', variable: 'CRW_SST' })
  const place = { id: 'NERRS:WEL', name: 'Wells', coll: 'noaa_nerrs' }
  it('an erddap-places indicator links to its dataset and variable', () => {
    expect(computeHref(sst, place)).toBe('https://oceanmetrics.io/erddap-places/#place=NERRS:WEL&dataset=dhw_5km&variable=CRW_SST')
  })
  it('the variable falls back to the third part of the id', () => {
    expect(erddapVariable({ id: 'erddap:dhw_5km:CRW_BAA:share' })).toBe('CRW_BAA')
    expect(erddapVariable({ id: 'sdg:14.5.1' })).toBeNull()
  })
  it('another producer has no compute-now link', () => {
    const obis = ind({ id: 'obis:species', producer: { name: 'obisindicators' } })
    expect(canComputeNow(obis)).toBe(false)
    expect(computeHref(obis, place)).toBeNull()
  })
})

describe('computedGroups: where an indicator has values', () => {
  const row = (place_id: string, place_coll: string, last_value: number | null) =>
    ({ place_id, place_name: place_id, coll: 'places', place_coll, indicator: 'a', time_grain: 'year', last_value }) as unknown as CoverageRow
  const idx = indexCoverage([row('NMS:A', 'places', 1), row('NMS:B', 'places', 2), row('NMS:C', 'places', null), row('MRGID:1', 'mr_eez', 3), row('NERRS:W', 'noaa_nerrs', null)])
  it('the groups with a value, with how many places, in the group order', () => {
    expect(computedGroups(idx, ind({ id: 'a' }))).toEqual([{ coll: 'places', places: 2 }, { coll: 'mr_eez', places: 1 }])
  })
  it('an indicator with no value anywhere has no groups', () => {
    expect(computedGroups(idx, ind({ id: 'zzz' }))).toEqual([])
  })
})

describe('datasetCoverage', () => {
  it('says the years and grains the manifest lists, nothing when it has no range', () => {
    expect(datasetCoverage({ time_range: ['1998-01-01', '2025-09-01'], time_grains: ['year', 'month'] })).toBe('The dataset covers 1998–2025, at year and month grain.')
    expect(datasetCoverage({ time_grains: ['year'] })).toBeNull()
  })
})
