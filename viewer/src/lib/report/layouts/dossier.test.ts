import { describe, expect, it } from 'vitest'
import type { Indicator } from '../../data.ts'
import type { Place } from '../../matrix.ts'
import { dossierSections, figureCaption, reproduceOf } from './dossier.ts'

const P = (id: string): Place => ({ id: `NMS:${id}`, name: `Place ${id}`, coll: 'places' })
const I = (id: string): Indicator => ({ id, short: id, status_method: 'iea-sd', status_grain: 'year', recent: 5, min_periods: 10 }) as Indicator
const [A, B] = [P('A'), P('B')]
const [SST, CHL] = [I('sst'), I('chl')]

describe('dossierSections', () => {
  it('a section per place, each figure numbered across the whole dossier', () => {
    const s = dossierSections([A, B], [SST, CHL])
    expect(s.map(x => [x.place.id, x.entries.map(e => `${e.ind.id}#${e.figure}`)])).toEqual([['NMS:A', ['sst#1', 'chl#2']], ['NMS:B', ['sst#3', 'chl#4']]])
  })
  it('a pair with no value has no entry and numbering does not skip; a place with none has no section', () => {
    const has = (p: Place, i: Indicator) => !(p.id === 'NMS:A' && i.id === 'sst') && !(p.id === 'NMS:B' && i.id === 'chl') && true
    expect(dossierSections([A, B], [SST, CHL], has).map(x => x.entries.map(e => `${e.ind.id}#${e.figure}`))).toEqual([['chl#1'], ['sst#2']])
    expect(dossierSections([A], [SST], () => false)).toEqual([])
  })
})

describe('reproduceOf', () => {
  const r = reproduceOf(SST, A, '2026.10.20', 'https://x/values/sst/data.parquet')
  it('the configuration pins place, indicator, method, window and manifest; its hash is 12 hex digits and changes with the manifest', () => {
    expect(r.config).toEqual(['place_id: NMS:A', 'indicator: sst', 'status_method: iea-sd', 'status_grain: year', 'recent: 5', 'min_periods: 10', 'manifest: 2026.10.20'])
    expect(r.hash).toMatch(/^[0-9a-f]{12}$/)
    expect(reproduceOf(SST, A, '2026.10.21', null).hash).not.toBe(r.hash)
  })
  it('the query reads this place from the values file', () => {
    expect(r.snippet).toBe("SELECT time_grain, time, value, n FROM read_parquet('https://x/values/sst/data.parquet') WHERE place_id = 'NMS:A' ORDER BY time_grain, time;")
  })
  it('no values file gives no query', () => {
    expect(reproduceOf(SST, A, '2026.10.20', null)).toMatchObject({ valuesUrl: null, snippet: null })
  })
})

describe('figureCaption', () => {
  it('numbers the status sentence', () => {
    expect(figureCaption(3, 'SST in Place A was within 1 SD of its mean.')).toBe('Figure 3. SST in Place A was within 1 SD of its mean.')
  })
})
