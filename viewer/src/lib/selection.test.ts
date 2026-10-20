import { describe, expect, it } from 'vitest'
import { groupSelection, includeIndicator, includePlace, isDefaultIndicators, isDefaultPlaces, leadsOnly, migrateSelectionKeys, namedIndicators, selectionOf, setLeadsOnly, withSelection } from './selection.ts'
import { DEFAULT_SPEC } from '../../../src/report/spec.ts'

const kv = (s: string) => new Map(s.split('&').filter(Boolean).map(p => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)] as [string, string] }))
const obj = (m: Map<string, string>) => Object.fromEntries(m)

describe('the selection of a state', () => {
  it('is the spec\'s places and indicators; withSelection changes them and keeps the Report\'s own keys', () => {
    const s = { spec: { ...DEFAULT_SPEC, layout: 'scorecard' as const } }
    expect(selectionOf(s)).toEqual({ places: DEFAULT_SPEC.places, indicators: DEFAULT_SPEC.indicators })
    const t = withSelection(s, { indicators: { include: ['all'], exclude: [] } })
    expect(t.spec.layout).toBe('scorecard')
    expect(t.spec.indicators.include).toEqual(['all'])
    expect(t.spec.places).toEqual(DEFAULT_SPEC.places)
  })
  it('the default places are the sanctuaries and the default indicators each series lead', () => {
    expect(isDefaultPlaces(DEFAULT_SPEC.places)).toBe(true)
    expect(isDefaultPlaces({ include: ['coll:places'], exclude: ['NMS:A'], context: false })).toBe(false)
    expect(isDefaultIndicators({ include: ['*'], exclude: [] })).toBe(true)
    expect(isDefaultIndicators({ include: ['all'], exclude: [] })).toBe(false)
  })
  it('groupSelection is one group or set, the indicators kept', () => {
    const sel = { places: DEFAULT_SPEC.places, indicators: { include: ['all'], exclude: ['x:y'] } }
    expect(groupSelection(sel, 'mr_eez')).toEqual({ places: { include: ['coll:mr_eez'], exclude: [], context: false }, indicators: sel.indicators })
    expect(groupSelection(sel, 'set:political').places.include).toEqual(['set:political'])
  })
})

describe('the leads switch', () => {
  it('leads only is the default; `all` turns it off', () => {
    expect(leadsOnly({ include: ['*'], exclude: [] })).toBe(true)
    expect(leadsOnly({ include: ['*', 'sdg:x'], exclude: [] })).toBe(true)
    expect(leadsOnly({ include: ['all'], exclude: [] })).toBe(false)
  })
  it('switching leads off makes it `all` and keeps the excludes; switching on goes back to the leads', () => {
    expect(setLeadsOnly({ include: ['*', 'sdg:x'], exclude: ['a:b'] }, false)).toEqual({ include: ['all'], exclude: ['a:b'] })
    expect(setLeadsOnly({ include: ['all'], exclude: ['a:b'] }, true)).toEqual({ include: ['*'], exclude: ['a:b'] })
    expect(setLeadsOnly({ include: ['cat:water-quality', 'all'], exclude: [] }, true)).toEqual({ include: ['cat:water-quality'], exclude: [] })
  })
  it('the indicators named by id (added by hand) are the include entries that are not rules', () => {
    expect(namedIndicators({ include: ['*', 'cat:x', 'series:y:*', 'sdg:x', 'erddap:a:b:c'], exclude: [] })).toEqual(['sdg:x', 'erddap:a:b:c'])
  })
})

describe('keeping a link\'s own place or indicator in the selection', () => {
  const place = { id: 'MRGID:1', coll: 'mr_eez' }
  const IND = [{ id: 'sst', series: 'sst', lead: true, category: {} }, { id: 'sst2', series: 'sst', lead: false, category: {} }]
  it('a place already selected leaves the selection alone', () => {
    const p = { include: ['coll:mr_eez'], exclude: [], context: false }
    expect(includePlace(p, place)).toBe(p)
  })
  it('a place outside the selection joins include by id, and leaves exclude', () => {
    expect(includePlace(DEFAULT_SPEC.places, place)).toEqual({ include: ['coll:places', 'MRGID:1'], exclude: [], context: false })
    expect(includePlace({ include: ['coll:mr_eez'], exclude: ['MRGID:1'], context: false }, place).exclude).toEqual([])
    expect(includePlace({ include: ['none'], exclude: [], context: false }, place).include).toEqual(['MRGID:1'])
  })
  it('an indicator outside the selection joins include by id', () => {
    expect(includeIndicator({ include: ['*'], exclude: [] }, IND[0], IND)).toEqual({ include: ['*'], exclude: [] })
    expect(includeIndicator({ include: ['*'], exclude: [] }, IND[1], IND)).toEqual({ include: ['*', 'sst2'], exclude: [] })
    expect(includeIndicator({ include: ['*'], exclude: ['sst'] }, IND[0], IND)).toEqual({ include: ['*', 'sst'], exclude: [] })
  })
})

describe('migrating the old selection keys', () => {
  it('colls and coll (Map only) become pi rules; xp and xi become px and ix; the old keys are dropped', () => {
    expect(obj(migrateSelectionKeys(kv('colls=a,set:b&xp=p1,p2&xi=i1')))).toEqual({ pi: 'coll:a,set:b', px: 'p1,p2', ix: 'i1' })
    expect(obj(migrateSelectionKeys(kv('view=map&coll=mr_eez&ind=x')))).toEqual({ view: 'map', ind: 'x', pi: 'coll:mr_eez', ii: '*,x' })
    // a Place view\'s coll is its group, not a selection
    expect(obj(migrateSelectionKeys(kv('view=place&place=NMS:A&coll=places')))).toEqual({ view: 'place', place: 'NMS:A', coll: 'places' })
  })
  it('ai joins the leads in ii; leads=0 makes ii=all whatever ai says', () => {
    expect(obj(migrateSelectionKeys(kv('ai=a,b')))).toEqual({ ii: '*,a,b' })
    expect(obj(migrateSelectionKeys(kv('leads=0&ai=a')))).toEqual({ ii: 'all' })
    expect(obj(migrateSelectionKeys(kv('ii=cat:x&ai=a')))).toEqual({ ii: 'cat:x,a' })
  })
  it('the new keys win over colls; a hash with no selection key is unchanged', () => {
    expect(obj(migrateSelectionKeys(kv('colls=a&pi=coll:b')))).toEqual({ pi: 'coll:b' })
    expect(obj(migrateSelectionKeys(kv('vocab=eov&depth=dive')))).toEqual({ vocab: 'eov', depth: 'dive' })
  })
})
