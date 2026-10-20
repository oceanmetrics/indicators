import { describe, expect, it } from 'vitest'
import { FAMILY_LABEL, familyId, familyOf, foldFamily, isFamily } from './family.ts'
import type { Indicator } from '../data.ts'

const ind = (id: string, short: string, title: string) => ({ id, short, title }) as Indicator
const OBIS = [
  ind('obis:records', 'Records (all)', 'OBIS records, all taxa'),
  ind('obis:records:fish', 'Records (fish)', 'OBIS records, fish'),
  ind('obis:species', 'Species (all)', 'OBIS species richness, all taxa'),
  ind('obis:species:fish', 'Species (fish)', 'OBIS species richness, fish'),
  ind('obis:species:hard-corals', 'Species (hard corals)', 'OBIS species richness, hard corals'),
]

describe('the OBIS family on the Map', () => {
  it('names the metric and the EOV, with the choices that exist', () => {
    expect(familyOf(OBIS[3], OBIS)).toEqual({
      metric: 'species', eov: 'fish',
      metrics: [{ id: 'records', label: 'Records' }, { id: 'species', label: 'Species' }],
      eovs: [{ id: 'all', label: 'All taxa' }, { id: 'fish', label: 'Fish' }, { id: 'hard-corals', label: 'Hard corals' }],
    })
  })
  it('all taxa is the EOV of an id without one; other indicators have no family', () => {
    expect(familyOf(OBIS[0], OBIS)?.eov).toBe('all')
    expect(familyOf(ind('erddap:dhw_5km:CRW_SST:mean', 'SST', 'Sea surface temperature'), OBIS)).toBeNull()
    expect([isFamily('obis:species:fish'), isFamily('sdg:ER_MRN_MPA')]).toEqual([true, false])
  })
  it('a metric and an EOV make the id', () => {
    expect([familyId('species', 'all'), familyId('records', 'fish')]).toEqual(['obis:species', 'obis:records:fish'])
  })
  it('the picker shows the family once, as the current OBIS id or species', () => {
    const opts = [
      { value: 'erddap:dhw_5km:CRW_SST:mean', label: 'SST', group: 'Water quality' },
      ...OBIS.map(i => ({ value: i.id, label: i.short, group: 'Living resources' })),
    ]
    expect(foldFamily(opts, 'obis:records:fish')).toEqual([opts[0], { value: 'obis:records:fish', label: FAMILY_LABEL, group: 'Living resources' }])
    expect(foldFamily(opts, 'erddap:dhw_5km:CRW_SST:mean')[1].value).toBe('obis:species')
  })
})
