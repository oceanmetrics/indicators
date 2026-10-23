// the change-feed CLI (src/coverage/changes.ts) on a fixture pair: the exact files, a same-day re-run, a quiet day
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parquetWriteBuffer } from 'hyparquet-writer'
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet'
import { validate } from '@oceanmetrics/catalog/validate'
import { DIFF_COLUMNS, run } from './changes.ts'

type Row = Record<(typeof DIFF_COLUMNS)[number], string | number | null>
const r = (place_id: string, indicator: string, time_grain: string, last_time: string | null, last_value: number | null, status: string | null = null, status_method: string | null = null): Row =>
  ({ place_id, place_name: place_id === 'NMS:A' ? 'Alpha Sanctuary' : 'Eez One', coll: place_id.startsWith('NMS') ? 'places' : 'mr_eez', place_coll: place_id.startsWith('NMS') ? 'places' : 'mr_eez', indicator, time_grain, last_time, last_value, status_method, status })
const BEFORE = [
  r('NMS:A', 'erddap:sst:mean', 'year', '2024-01-01', 15.2, 'within', 'iea-sd'),
  r('MRGID:1', 'erddap:sst:mean', 'year', '2024-01-01', 20.1, 'within', 'iea-sd'),
]
const AFTER = [
  r('NMS:A', 'erddap:sst:mean', 'year', '2025-01-01', 16.05, 'above', 'iea-sd'),
  r('NMS:A', 'obis:records', 'year', '2024-01-01', 120, null, 'values'),
  r('MRGID:1', 'erddap:sst:mean', 'year', '2024-01-01', 20.1, 'within', 'iea-sd'),
]
const MANIFEST = {
  version: '2026.10.23',
  indicators: [
    { id: 'erddap:sst:mean', title: 'Sea surface temperature', kind: 'continuous', series: 'sst', lead: true, status_grain: 'year', status_method: 'iea-sd', unit_label: '°C', decimals: 1 },
    { id: 'obis:records', title: 'OBIS records', kind: 'continuous', series: 'obis', lead: true, status_grain: 'year', status_method: 'values', unit_label: 'records', decimals: 0 },
  ],
  place_sets: [{ id: 'political', title: 'Political boundaries', groups: ['mr_eez'] }],
}

const parquet = (rows: Row[]) => Buffer.from(parquetWriteBuffer({
  columnData: DIFF_COLUMNS.map(name => ({ name, type: name === 'last_value' ? 'DOUBLE' : 'STRING', data: rows.map(x => x[name]) as never })),
}))
function catalog(rows: Row[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'om-changes-'))
  writeFileSync(join(dir, 'coverage.parquet'), parquet(rows))
  writeFileSync(join(dir, 'indicators.json'), JSON.stringify(MANIFEST))
  return dir
}
function prevFile(rows: Row[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'om-prev-'))
  writeFileSync(join(dir, 'coverage.parquet'), parquet(rows))
  return join(dir, 'coverage.parquet')
}
const tree = (dir: string, sub: string): string[] => existsSync(join(dir, sub)) ? readdirSync(join(dir, sub)).sort().map(f => `${sub}/${f}`) : []
const json = (dir: string, p: string) => JSON.parse(readFileSync(join(dir, p), 'utf8'))
const opts = (cat: string, prev: string, published = 'none', checkedAt = '2026-10-23T08:21:40Z') => ({ catalog: cat, prev, published, date: '2026-10-23', checkedAt })

describe('changes:build on a fixture pair', () => {
  it('writes the exact files: the day\'s change file (json, parquet), latest.json, a feed per place, collection and set, and the index', async () => {
    const cat = catalog(AFTER)
    const { rows } = await run(opts(cat, prevFile(BEFORE)))
    expect(rows.map(x => `${x.place_id} ${x.indicator} ${x.kind}`)).toEqual(['NMS:A erddap:sst:mean status', 'NMS:A obis:records new'])
    expect(tree(cat, 'changes')).toEqual(['changes/2026-10-23.json', 'changes/2026-10-23.parquet', 'changes/latest.json'])
    expect(tree(cat, 'feeds')).toEqual([
      'feeds/all.xml', 'feeds/coll=mr_eez.xml', 'feeds/coll=places.xml', 'feeds/index.json', 'feeds/place=MRGID:1.xml', 'feeds/place=NMS:A.xml', 'feeds/set=political.xml',
    ])
    const day = json(cat, 'changes/2026-10-23.json')
    expect(day.map((x: { sentence: string }) => x.sentence)).toEqual([
      'Sea surface temperature in Alpha Sanctuary is now above its own record (2025); it was within its own record.',
      'OBIS records in Alpha Sanctuary has its first value: 120 records for 2024.',
    ])
    const pq = await parquetReadObjects({ file: await asyncBufferFromFile(join(cat, 'changes/2026-10-23.parquet')) })
    expect(pq.map(x => [x.place_id, x.kind, x.to_status, x.value])).toEqual([['NMS:A', 'status', 'above', 16.05], ['NMS:A', 'new', null, 120]])
    expect(json(cat, 'changes/latest.json')).toEqual({
      date: '2026-10-23', checked_at: '2026-10-23T08:21:40Z', manifest_version: '2026.10.23', counts: { status: 1, new: 1, period: 0 },
      hrefs: { json: 'changes/2026-10-23.json', parquet: 'changes/2026-10-23.parquet', feeds: 'feeds/index.json' },
      recent: [{ date: '2026-10-23', href: 'changes/2026-10-23.json', counts: { status: 1, new: 1, period: 0 } }],
    })
    expect(validate('changes-latest', json(cat, 'changes/latest.json')).errors).toEqual([])
    const idx = json(cat, 'feeds/index.json')
    expect(validate('feeds-index', idx).errors).toEqual([])
    expect(idx.feeds.map((f: { id: string; entries: number }) => `${f.id} ${f.entries}`)).toEqual(['all 2', 'places 2', 'mr_eez 0', 'political 0', 'NMS:A 2', 'MRGID:1 0'])
    const cinms = readFileSync(join(cat, 'feeds/place=NMS:A.xml'), 'utf8')
    expect(cinms).toContain('<id>tag:oceanmetrics.io,2026:changes/2026-10-23/NMS:A/places/erddap:sst:mean/status</id>')
    expect(readFileSync(join(cat, 'feeds/place=MRGID:1.xml'), 'utf8')).toContain('<subtitle>No change seen yet.</subtitle>')
  })

  it('a same-day re-run against the published files adds nothing and writes the same change file and feeds', async () => {
    const first = catalog(AFTER)
    await run(opts(first, prevFile(BEFORE)))
    // the publish moved coverage.parquet: the re-run diffs the new build against it, and reads the day's published file
    const again = catalog(AFTER)
    const { rows } = await run(opts(again, join(first, 'coverage.parquet'), first, '2026-10-23T09:00:00Z'))
    expect(rows).toHaveLength(2)
    for (const p of ['changes/2026-10-23.json', 'feeds/all.xml', 'feeds/place=NMS:A.xml'])
      expect(readFileSync(join(again, p), 'utf8')).toBe(readFileSync(join(first, p), 'utf8'))
    expect(json(again, 'changes/latest.json').checked_at).toBe('2026-10-23T09:00:00Z')
    expect(json(again, 'changes/latest.json').counts).toEqual({ status: 1, new: 1, period: 0 })
  })

  it('a quiet day writes latest.json and the feeds only, and keeps the last change file as the pointer', async () => {
    const quiet = catalog(AFTER)
    const { files, rows } = await run({ ...opts(quiet, prevFile(AFTER), 'none'), date: '2026-10-24' })
    expect(rows).toEqual([])
    expect(files.filter(f => f.startsWith('changes/'))).toEqual(['changes/latest.json'])
    expect(json(quiet, 'changes/latest.json')).toMatchObject({ date: null, counts: { status: 0, new: 0, period: 0 }, hrefs: { json: null, parquet: null }, recent: [] })
    // with the published history: the pointer stays on the last non-empty day
    const published = catalog(AFTER)
    await run(opts(published, prevFile(BEFORE)))
    const next = catalog(AFTER)
    await run({ ...opts(next, prevFile(AFTER), published), date: '2026-10-24' })
    expect(tree(next, 'changes')).toEqual(['changes/latest.json'])
    expect(json(next, 'changes/latest.json')).toMatchObject({ date: '2026-10-23', hrefs: { json: 'changes/2026-10-23.json' }, recent: [{ date: '2026-10-23' }] })
    expect(json(next, 'feeds/index.json').feeds[0].entries).toBe(2)
  })

  it('an old coverage table without place_name or place_coll still diffs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'om-old-'))
    const cols = DIFF_COLUMNS.filter(c => c !== 'place_name' && c !== 'place_coll')
    writeFileSync(join(dir, 'coverage.parquet'), Buffer.from(parquetWriteBuffer({
      columnData: cols.map(name => ({ name, type: name === 'last_value' ? 'DOUBLE' : 'STRING', data: BEFORE.map(x => x[name]) as never })),
    })))
    const cat = catalog(AFTER)
    const { rows } = await run(opts(cat, join(dir, 'coverage.parquet')))
    expect(rows).toHaveLength(2)
  })
})
