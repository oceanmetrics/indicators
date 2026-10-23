import { describe, expect, it } from 'vitest'
import { expandIndicators, expandPlaces } from '@oceanmetrics/catalog/report'
import {
  NONE, collapseToLeads, selectedIds, seriesOfCategory, toggleCategory, toggleCollection,
  toggleIndicator, togglePlace, toggleSeries, toggleSet,
} from './tree.ts'
import type { TreeIndicator, TreePlace } from './tree.ts'

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

const PLACES: TreePlace[] = [
  { id: 'NMS:A', coll: 'places', name: 'Alpha' }, { id: 'NMS:B', coll: 'places', name: 'Bravo' }, { id: 'NMS:C', coll: 'places', name: 'Charlie' },
  { id: 'MRGID:1', coll: 'mr_eez', name: 'Zed EEZ' },
]

describe('ticking places', () => {
  const sel = { include: ['*'], exclude: [] as string[], context: false }
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
  it('a group off with the sanctuaries only chosen leaves nothing chosen, which is `none`', () => {
    expect(togglePlace({ include: ['coll:places'], exclude: [], context: false }, PLACES, 'NMS:A', false)).toEqual({ include: ['coll:places'], exclude: ['NMS:A'], context: false })
    expect(toggleCollection({ include: ['coll:places'], exclude: [], context: false }, PLACES, 'places', false)).toEqual({ include: [NONE], exclude: [], context: false })
  })
  it('selectedIds reads a selection back', () => {
    expect([...selectedIds(toggleIndicator(STAR, ALL, 'odd:x', false), ALL)]).toEqual(ALL_LEADS.filter(i => i !== 'odd:x'))
  })
})

describe('ticking a place set', () => {
  const SETS = [{ id: 'political', groups: ['mr_eez', 'fao_high_seas'] }]
  const ALLP: TreePlace[] = [...PLACES, { id: 'FAO:HS1', coll: 'fao_high_seas', name: 'High seas 1' }, { id: 'FAO:HS2', coll: 'fao_high_seas', name: 'High seas 2' }]
  const base = { include: ['coll:places'], exclude: [] as string[], context: false }
  const ids = (sel: typeof base) => expandPlaces(sel, ALLP, SETS).map(p => p.id)
  it('on: set:<id> joins include and the places of its groups are chosen; the excludes of its groups and places go', () => {
    const s = toggleSet({ ...base, exclude: ['MRGID:1', 'coll:fao_high_seas'] }, ALLP, SETS[0], true, SETS)
    expect(s).toEqual({ include: ['coll:places', 'set:political'], exclude: [], context: false })
    expect(ids(s)).toEqual(['NMS:A', 'NMS:B', 'NMS:C', 'MRGID:1', 'FAO:HS1', 'FAO:HS2'])
  })
  it('on: the rules of its groups it holds leave include', () => {
    expect(toggleSet({ ...base, include: ['coll:places', 'coll:mr_eez', 'MRGID:1'] }, ALLP, SETS[0], true, SETS).include).toEqual(['coll:places', 'set:political'])
  })
  it('off: it and its groups leave include; the places of other rules stay', () => {
    const s = toggleSet({ ...base, include: ['coll:places', 'set:political', 'coll:mr_eez'] }, ALLP, SETS[0], false, SETS)
    expect(s).toEqual({ include: ['coll:places'], exclude: [], context: false })
  })
  it('off: when `*` still holds its places, the set is excluded', () => {
    const s = toggleSet({ ...base, include: ['*'] }, ALLP, SETS[0], false, SETS)
    expect(s).toEqual({ include: ['*'], exclude: ['set:political'], context: false })
    expect(ids(s)).toEqual(['NMS:A', 'NMS:B', 'NMS:C'])
  })
  it('a place of a chosen set off is excluded by id; a group of the set off is excluded as the group', () => {
    const on = toggleSet(base, ALLP, SETS[0], true, SETS)
    expect(togglePlace(on, ALLP, 'FAO:HS1', false, SETS).exclude).toEqual(['FAO:HS1'])
    const off = toggleCollection(on, ALLP, 'fao_high_seas', false, SETS)
    expect(off.exclude).toEqual(['coll:fao_high_seas'])
    expect(ids(off)).toEqual(['NMS:A', 'NMS:B', 'NMS:C', 'MRGID:1'])
  })
  it('an exclude of a set is not dropped as pointless', () => {
    expect(toggleCollection({ include: ['*'], exclude: ['set:political'], context: false }, ALLP, 'places', false, SETS).exclude).toEqual(['set:political', 'coll:places'])
  })
})
