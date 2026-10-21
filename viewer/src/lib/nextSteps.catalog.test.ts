// the compute-now link against what erddap-places reads: for every erddap-places indicator of the real catalog (catalog/
// is git-ignored; nothing is read unless it is there), the link's dataset is the exact id of a published erddap/*
// collection that is not pending, and its variable is one of that collection's cube:variables. the link once named the
// bare dataset id, which erddap-places replaced with CRW SST without a word, while the unit tests asserted the same wrong
// string (2026-10-20). OM_OFFLINE=1 skips it, as it skips the other tests that read the published gazetteer.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Manifest } from './data.ts'
import { canComputeNow, erddapCollection, erddapVariable } from './nextSteps.ts'

const GAZETTEER = 'https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer'
const MANIFEST = resolve(__dirname, '../../../catalog/indicators.json')
const have = existsSync(MANIFEST) && !process.env.OM_OFFLINE

interface Published { status?: string; variables: string[] }

describe.skipIf(!have)('the compute-now link names a dataset and variable erddap-places has', () => {
  const published = new Map<string, Published>()
  const manifest: Manifest | null = have ? JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest : null
  const inds = (manifest?.indicators ?? []).filter(canComputeNow)

  beforeAll(async () => {
    const cat = await (await fetch(`${GAZETTEER}/catalog.json`)).json()
    const hrefs: string[] = cat.links.filter((l: { rel: string; href: string }) => l.rel === 'child' && /erddap\//.test(l.href))
      .map((l: { href: string }) => l.href.replace(/^\.\//, ''))
    await Promise.all(hrefs.map(async (h) => {
      const c = await (await fetch(`${GAZETTEER}/${h}`)).json()
      published.set(c.id, { status: c['erddap-places:status'], variables: Object.keys(c['cube:variables'] ?? {}) })
    }))
  }, 60_000)

  it('the real catalog has erddap-places indicators to check', () => {
    expect(inds.length).toBeGreaterThan(0)
    expect(published.size).toBeGreaterThan(0)
  })
  for (const ind of inds) {
    it(ind.id, () => {
      const c = published.get(erddapCollection(ind))
      expect(c, `${erddapCollection(ind)} is not a published erddap collection id`).toBeDefined()
      expect(c!.status).not.toBe('pending')
      expect(c!.variables).toContain(erddapVariable(ind))
    })
  }
})
