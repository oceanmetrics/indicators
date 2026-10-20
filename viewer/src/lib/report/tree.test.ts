import { describe, expect, it } from 'vitest'
import { expandIndicators, expandPlaces } from '../../../../src/report/spec.ts'
import {
  NONE, buildIndicatorTree, buildPlaceTree, collapseToLeads, selectedIds, seriesOfCategory, toggleCategory, toggleCollection,
  toggleIndicator, togglePlace, toggleSeries,
} from './tree.ts'
import type { TreeIndicator, TreeNode, TreePlace } from './tree.ts'

const ind = (id: string, series: string, lead: boolean, onms: string | undefined, extra: Partial<TreeIndicator> = {}): TreeIndicator => ({
  id, series, lead, category: onms ? { onms } : {}, title: `${id} (title)`, short: id.split(':').pop()!, ...extra,
})
const ALL: TreeIndicator[] = [
  ind('sst:mur', 'sst', true, 'water-quality', { series_title: 'Sea surface temperature' }),
  ind('sst:oisst', 'sst', false, 'water-quality'),
  ind('chl:chl', 'chl', true, 'water-quality'),
  ind('npp:npp', 'npp', true, 'living-resources'),
  ind('obis:species', 'obis', true, 'living-resources'),
  ind('obis:records', 'obis', false, 'living-resources'),
  ind('sdg:mpa', 'sdg', true, 'response'),
  ind('odd:x', 'odd', true, undefined),
]
const TERMS = [
  { id: 'water-quality', label: 'Water quality' }, { id: 'living-resources', label: 'Living resources' }, { id: 'response', label: 'Response' },
]
const KNOWN = TERMS.map(t => t.id)
const ids = (sel: { include: string[]; exclude: string[] }) => expandIndicators(sel, ALL).map(i => i.id)
const ALL_LEADS = ['sst:mur', 'chl:chl', 'npp:npp', 'obis:species', 'sdg:mpa', 'odd:x']
const STAR = { include: ['*'], exclude: [] as string[] }

describe('toggling one indicator', () => {
  it('off: a lead included by `*` goes in exclude', () => {
    expect(toggleIndicator(STAR, ALL, 'chl:chl', false)).toEqual({ include: ['*'], exclude: ['chl:chl'] })
  })
  it('off: an indicator included by its id leaves include and is not excluded', () => {
    const s = toggleIndicator({ include: ['cat:response', 'sst:oisst'], exclude: [] }, ALL, 'sst:oisst', false)
    expect(s).toEqual({ include: ['cat:response'], exclude: [] })
  })
  it('on: an excluded lead just loses its exclude', () => {
    expect(toggleIndicator({ include: ['*'], exclude: ['chl:chl'] }, ALL, 'chl:chl', true)).toEqual(STAR)
  })
  it('on: a non-lead joins include by id', () => {
    expect(toggleIndicator(STAR, ALL, 'obis:records', true)).toEqual({ include: ['*', 'obis:records'], exclude: [] })
  })
  it('on: a non-lead under an excluded `series:x:*` swaps that rule for its other members', () => {
    const s = toggleIndicator({ include: ['series:obis'], exclude: ['series:obis:*'] }, ALL, 'obis:records', true)
    expect(ids(s)).toEqual(['obis:records'])
    expect(s.exclude).toEqual(['obis:species'])
  })
  it('does not add an id that is already included, and keeps the include order', () => {
    expect(toggleIndicator({ include: ['cat:response', 'npp:npp'], exclude: [] }, ALL, 'sdg:mpa', true)).toEqual({ include: ['cat:response', 'npp:npp'], exclude: [] })
  })
})

describe('toggling a series', () => {
  it('on: `series:<id>` joins include and an exclude of its lead goes', () => {
    expect(toggleSeries({ include: ['cat:response'], exclude: ['series:sst:*', 'x'] }, ALL, 'sst', true))
      .toEqual({ include: ['cat:response', 'series:sst'], exclude: [] })
  })
  it('on: drops an exclude of the lead id, and of `series:<id>`', () => {
    expect(toggleSeries({ include: ['*'], exclude: ['sst:mur', 'series:sst', 'series:chl'] }, ALL, 'sst', true).exclude).toEqual(['series:chl'])
  })
  it('on twice does not repeat the rule', () => {
    const once = toggleSeries({ include: ['cat:response'], exclude: [] }, ALL, 'sst', true)
    expect(toggleSeries(once, ALL, 'sst', true)).toEqual(once)
  })
  it('off: its rules and member ids leave include; the lead is excluded only when another rule still holds it', () => {
    expect(toggleSeries({ include: ['series:obis', 'series:obis:*', 'obis:records'], exclude: [] }, ALL, 'obis', false)).toEqual({ include: [NONE], exclude: [] })
    expect(toggleSeries(STAR, ALL, 'obis', false)).toEqual({ include: ['*'], exclude: ['obis:species'] })
  })
  it('off then on gives the series back', () => {
    const off = toggleSeries(STAR, ALL, 'chl', false)
    expect(ids(off)).not.toContain('chl:chl')
    expect(ids(toggleSeries(off, ALL, 'chl', true))).toContain('chl:chl')
  })
})

describe('toggling a category', () => {
  it('on: `cat:<term>` joins include, and the excludes of its leads (id, series, series:*) go', () => {
    const s = toggleCategory({ include: ['npp:npp'], exclude: ['sst:mur', 'series:chl', 'series:obis:*', 'sdg:mpa'] }, ALL, 'onms', KNOWN, 'water-quality', true)
    expect(s).toEqual({ include: ['npp:npp', 'cat:water-quality'], exclude: [] })
  })
  it('on: leaves an exclude of another category alone', () => {
    const s = toggleCategory({ include: ['*'], exclude: ['sdg:mpa'] }, ALL, 'onms', KNOWN, 'water-quality', true)
    expect(s.exclude).toEqual(['sdg:mpa'])
  })
  it('off: `cat:<term>` leaves include; a series held by `*` is excluded whole by `series:<s>:*`', () => {
    const s = toggleCategory({ include: ['*'], exclude: [] }, ALL, 'onms', KNOWN, 'living-resources', false)
    expect(s).toEqual({ include: ['*'], exclude: ['series:npp:*', 'series:obis:*'] })
    expect(ids(s)).toEqual(['sst:mur', 'chl:chl', 'sdg:mpa', 'odd:x'])
  })
  it('off: when only the category held them, nothing is excluded', () => {
    const s = toggleCategory({ include: ['cat:living-resources', 'cat:response'], exclude: [] }, ALL, 'onms', KNOWN, 'living-resources', false)
    expect(s).toEqual({ include: ['cat:response'], exclude: [] })
  })
  it('off: ids and series rules of its members leave include too', () => {
    const s = toggleCategory({ include: ['series:sst', 'sst:oisst', 'cat:response'], exclude: [] }, ALL, 'onms', KNOWN, 'water-quality', false)
    expect(s).toEqual({ include: ['cat:response'], exclude: [] })
  })
  it('"other" (a lead whose tag the vocabulary does not name) goes series by series', () => {
    expect(seriesOfCategory(ALL, 'onms', KNOWN, 'other')).toEqual(['odd'])
    expect(toggleCategory(STAR, ALL, 'onms', KNOWN, 'other', false)).toEqual({ include: ['*'], exclude: ['odd:x'] })
    expect(toggleCategory({ include: ['*'], exclude: ['odd:x'] }, ALL, 'onms', KNOWN, 'other', true)).toEqual({ include: ['*', 'series:odd'], exclude: [] })
  })
})

describe('normalising a selection', () => {
  it('drops an exclude that changes nothing, and a duplicate include', () => {
    const s = toggleIndicator({ include: ['cat:response', 'cat:response'], exclude: ['chl:chl', 'npp:npp'] }, ALL, 'odd:x', true)
    expect(s).toEqual({ include: ['cat:response', 'odd:x'], exclude: [] })
  })
  it('nothing selected is `none`, which expands to no indicator and survives an empty include', () => {
    const s = toggleIndicator({ include: ['sdg:mpa'], exclude: [] }, ALL, 'sdg:mpa', false)
    expect(s).toEqual({ include: [NONE], exclude: [] })
    expect(ids(s)).toEqual([])
  })
  it('`none` leaves include when a rule joins it', () => {
    expect(toggleIndicator({ include: [NONE], exclude: [] }, ALL, 'npp:npp', true)).toEqual({ include: ['npp:npp'], exclude: [] })
  })
  it('collapse to leads excludes every chosen non-lead and nothing else', () => {
    const s = collapseToLeads({ include: ['*', 'sst:oisst', 'series:obis:*'], exclude: [] }, ALL)
    expect(s).toEqual({ include: ['*', 'sst:oisst', 'series:obis:*'], exclude: ['sst:oisst', 'obis:records'] })
    expect(ids(s)).toEqual(ALL_LEADS)
  })
})

// coverage rows: sst (mur and oisst) in 3 places, chl in 2, npp in none, obis:records in 1, sdg in the EEZ only
const row = (place_id: string, coll: string, indicator: string) => ({ place_id, coll, indicator, last_value: 1 })
const PLACES: TreePlace[] = [
  { id: 'NMS:A', coll: 'places', name: 'Alpha' }, { id: 'NMS:B', coll: 'places', name: 'Bravo' }, { id: 'NMS:C', coll: 'places', name: 'Charlie' },
  { id: 'MRGID:1', coll: 'mr_eez', name: 'Zed EEZ' },
]
const ROWS = [
  ...['NMS:A', 'NMS:B', 'NMS:C'].flatMap(p => [row(p, 'places', 'sst:mur'), row(p, 'places', 'sst:oisst')]),
  row('NMS:A', 'places', 'chl:chl'), row('NMS:B', 'places', 'chl:chl'),
  row('NMS:A', 'places', 'obis:records'),
  row('MRGID:1', 'mr_eez', 'sdg:mpa'),
  { place_id: 'NMS:C', coll: 'places', indicator: 'npp:npp', last_value: null },
]
const flat = (ns: TreeNode[]): TreeNode[] => ns.flatMap(n => [n, ...flat(n.children), ...flat(n.more)])
const tree = (sel = STAR, places = PLACES.slice(0, 3)) => buildIndicatorTree({ indicators: ALL, vocab: 'onms', terms: TERMS, sel, rows: ROWS, places })

describe('the indicator tree', () => {
  it('coverage gates it: an indicator with no value for the chosen places is left out, with its empty series and category', () => {
    const t = tree()
    expect(t.map(c => c.key)).toEqual(['water-quality', 'living-resources'])
    expect(flat(t).filter(n => n.kind === 'indicator').map(n => n.key)).toEqual(['sst:mur', 'sst:oisst', 'chl:chl', 'obis:species', 'obis:records'])
  })
  it('counts places per node: leaves by coverageCounts, series and categories by the union', () => {
    const t = tree()
    const by = Object.fromEntries(flat(t).map(n => [n.key, n.hint]))
    expect(by['sst:mur']).toBe('3 of 3 places')
    expect(by['chl:chl']).toBe('2 of 3 places')
    expect(by['obis:records']).toBe('1 of 3 places')
    expect(by['obis']).toBe('1 of 3 places')
    expect(by['water-quality']).toBe('3 of 3 places')
  })
  it('counts against the chosen places only', () => {
    const by = Object.fromEntries(flat(tree(STAR, [PLACES[3]])).map(n => [n.key, n.hint]))
    expect(Object.keys(by)).toEqual(['response', 'sdg', 'sdg:mpa'])
    expect(by['sdg:mpa']).toBe('1 of 1 places')
  })
  it('an indicator the spec includes by id stays in the tree with no coverage', () => {
    const t = tree({ include: ['npp:npp'], exclude: [] })
    expect(flat(t).find(n => n.key === 'npp:npp')).toMatchObject({ state: 'checked', hint: '0 of 3 places' })
  })
  it('a series sits under its lead\'s category; its non-leads are under "more"', () => {
    const sst = flat(tree()).find(n => n.key === 'sst')!
    expect(sst.label).toBe('Sea surface temperature')
    expect(sst.children.map(n => n.key)).toEqual(['sst:mur'])
    expect(sst.more.map(n => n.key)).toEqual(['sst:oisst'])
  })
  it('a leaf is checked iff it is chosen; a series by its lead (mixed by another member); a category by its leads', () => {
    const s = (sel: { include: string[]; exclude: string[] }) => Object.fromEntries(flat(tree(sel)).map(n => [n.key, n.state]))
    expect(s(STAR)).toMatchObject({ 'water-quality': 'checked', sst: 'checked', 'sst:mur': 'checked', 'sst:oisst': 'unchecked', 'living-resources': 'checked' })
    expect(s({ include: ['sst:oisst'], exclude: [] })).toMatchObject({ sst: 'mixed', 'sst:oisst': 'checked', 'sst:mur': 'unchecked', 'water-quality': 'unchecked' })
    expect(s({ include: ['*'], exclude: ['chl:chl'] })).toMatchObject({ 'water-quality': 'mixed', chl: 'unchecked', sst: 'checked', 'living-resources': 'checked' })
    expect(s({ include: [NONE], exclude: [] })).toMatchObject({ 'water-quality': 'unchecked', 'living-resources': 'unchecked' })
  })
  it('puts a lead whose tag the vocabulary does not name under "Other", last', () => {
    const rows = [...ROWS, row('NMS:A', 'places', 'odd:x')]
    const t = buildIndicatorTree({ indicators: ALL, vocab: 'onms', terms: TERMS, sel: STAR, rows, places: PLACES.slice(0, 3) })
    expect(t.map(c => [c.key, c.label])).toEqual([['water-quality', 'Water quality'], ['living-resources', 'Living resources'], ['other', 'Other']])
  })
  it('a toggled selection reads back in the tree', () => {
    const sel = toggleCategory(STAR, ALL, 'onms', KNOWN, 'water-quality', false)
    expect(Object.fromEntries(tree(sel).map(c => [c.key, c.state]))).toEqual({ 'water-quality': 'unchecked', 'living-resources': 'checked' })
  })
})

describe('the place tree', () => {
  const COLLS = [{ id: 'places', title: 'Sanctuaries' }, { id: 'mr_eez', title: 'EEZs' }]
  const sel = { include: ['*'], exclude: [] as string[], context: false }
  const ptree = (s = sel, query = '') => buildPlaceTree({ places: PLACES, colls: COLLS, sel: s, query })

  it('lists collections in order and places by name, with counts', () => {
    const t = ptree()
    expect(t.map(c => [c.key, c.hint])).toEqual([['places', '3 of 3 places'], ['mr_eez', '1 of 1 places']])
    expect(t[0].children.map(p => p.label)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(t[0].children[0]).toMatchObject({ key: 'NMS:A', hint: 'NMS:A', state: 'checked' })
  })
  it('a collection is mixed when some of its places are chosen', () => {
    const t = ptree({ include: ['coll:places'], exclude: ['NMS:B'], context: false })
    expect(t.map(c => c.state)).toEqual(['mixed', 'unchecked'])
    expect(t[0].hint).toBe('2 of 3 places')
  })
  it('search narrows the leaves and drops a collection with none, but not the state', () => {
    const t = ptree(sel, 'brav')
    expect(t.map(c => c.key)).toEqual(['places'])
    expect(t[0].children.map(p => p.key)).toEqual(['NMS:B'])
    expect(t[0].state).toBe('checked')
    expect(ptree(sel, 'mrgid:1').map(c => c.key)).toEqual(['mr_eez'])
  })
  it('a place off: its id goes in exclude when `*` holds it', () => {
    expect(togglePlace(sel, PLACES, 'NMS:B', false)).toEqual({ include: ['*'], exclude: ['NMS:B'], context: false })
  })
  it('a place on: a collection place joins include by id', () => {
    expect(togglePlace({ include: ['coll:mr_eez'], exclude: [], context: true }, PLACES, 'NMS:B', true)).toEqual({ include: ['coll:mr_eez', 'NMS:B'], exclude: [], context: true })
  })
  it('a collection on: `coll:<slug>` joins include, the excludes of it and its places go', () => {
    expect(toggleCollection({ include: ['coll:mr_eez'], exclude: ['NMS:B', 'coll:places'], context: false }, PLACES, 'places', true))
      .toEqual({ include: ['coll:mr_eez', 'coll:places'], exclude: [], context: false })
  })
  it('a collection off: leaves include; `coll:<slug>` is excluded only when `*` still holds it', () => {
    expect(toggleCollection({ include: ['coll:places', 'NMS:A'], exclude: [], context: false }, PLACES, 'places', false)).toEqual({ include: [NONE], exclude: [], context: false })
    expect(toggleCollection(sel, PLACES, 'places', false)).toEqual({ include: ['*'], exclude: ['coll:places'], context: false })
    expect(expandPlaces(toggleCollection(sel, PLACES, 'places', false), PLACES).map(p => p.id)).toEqual(['MRGID:1'])
  })
  it('selectedIds reads a selection back', () => {
    expect([...selectedIds(toggleIndicator(STAR, ALL, 'odd:x', false), ALL)]).toEqual(ALL_LEADS.filter(i => i !== 'odd:x'))
  })
})
