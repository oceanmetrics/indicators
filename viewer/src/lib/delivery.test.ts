import { describe, expect, it } from 'vitest'
import type { Indicator } from './data.ts'
import { configHash, configLines, duckdbSnippet, valuesUrl } from '@oceanmetrics/catalog/cards'
import { badgeUrl, licenceText, producerCredits } from './delivery.ts'
import { EOV_GLYPH_CREDIT, GOOS_CREDIT, MDI_CREDIT } from './credits.ts'

const ind = (o: Partial<Indicator>): Indicator => ({
  id: 'erddap:d:v:mean', status_method: 'iea-sd', status_grain: 'year', recent: 5, min_periods: 10, license: 'CC-BY-4.0',
  producer: { name: 'erddap-places', url: 'https://example.org/ep' }, dataset: { id: 'd', title: 'D', providers: [], license: 'CC0-1.0' },
  collections: [{ coll: 'places', places: 1, rows: 1, path: 'values/indicator=erddap:d:v:mean/coll=places/data.parquet' }], ...o,
}) as Indicator

// the values url, the DuckDB one-liner and the configuration hash are @oceanmetrics/catalog's: these are consumer checks that the
// viewer's indicators (data.ts) give what the viewer gave before the switch, and that the hash of a known place never changes
describe('delivery', () => {
  it('the values URL is the catalog base plus the manifest path of the place collection', () => {
    expect(valuesUrl('https://s/x/', ind({}), 'places')).toBe('https://s/x/values/indicator=erddap:d:v:mean/coll=places/data.parquet')
    expect(valuesUrl('https://s/x/', ind({}), 'mr_eez')).toBeNull()
  })
  it('the DuckDB one-liner quotes the URL and the place id', () => {
    expect(duckdbSnippet('https://s/a.parquet', "NMS:O'K")).toBe(
      "SELECT time_grain, time, value, n FROM read_parquet('https://s/a.parquet') WHERE place_id = 'NMS:O''K' ORDER BY time_grain, time;")
  })
  it('the configuration hash is stable, 12 hex digits, and changes with any line', () => {
    const lines = configLines(ind({}), 'NMS:A', '2026.10.20')
    expect(lines[0]).toBe('place_id: NMS:A')
    const h = configHash(lines)
    expect(h).toMatch(/^[0-9a-f]{12}$/)
    expect(configHash(lines)).toBe(h)
    expect(configHash(configLines(ind({}), 'NMS:B', '2026.10.20'))).not.toBe(h)
    expect(configHash(configLines(ind({}), 'NMS:A', '2026.10.21'))).not.toBe(h)
  })
  it('regression: the hash of a known place is the one the package pins (b195ca2a85ab, 3889c27c6041), so a published config hash never moves', () => {
    expect(configHash(['place_id: NMS:A', 'indicator: erddap:sst'])).toBe('b195ca2a85ab')
    expect(configHash(configLines(ind({ id: 'erddap:sst' }), 'NMS:A', '2026.10.22'))).toBe('3889c27c6041')
  })
  it('the licence line names both licences only when they differ', () => {
    expect(licenceText(ind({}))).toBe('values CC-BY-4.0; source data CC0-1.0')
    expect(licenceText(ind({ license: 'CC0-1.0' }))).toBe('CC0-1.0')
  })
  it('a dataset licence of "other" or "various" is not printed as a licence', () => {
    for (const l of ['other', 'various']) {
      const i = ind({})
      expect(licenceText({ ...i, dataset: { ...i.dataset, license: l } })).toBe("values CC-BY-4.0; source data under the provider's own terms")
    }
  })
  it('data credits: per producer, provider names once, without ours and without NA', () => {
    const mk = (producer: string, names: [string, string[]][]) => ind({ producer: { name: producer }, dataset: { id: 'd', title: 'D', providers: names.map(([name, roles]) => ({ name, roles })) } })
    const c = producerCredits({ indicators: [
      mk('erddap-places', [['NASA', ['producer', 'licensor']], ['Ocean Metrics LLC', ['processor', 'host']], ['PacIOOS', ['host']], ['USF', ['processor']]]),
      mk('erddap-places', [['NASA', ['producer']]]),
      mk('sdg', [['NA', ['producer']], ['UN Statistics Division', ['host']]]),
    ] })
    expect(c.map(x => [x.producer, x.providers])).toEqual([['erddap-places', ['NASA', 'PacIOOS']], ['sdg', ['UN Statistics Division']]])
  })
  it('the GOOS badge path is the 64 px WebP of the EOV id', () => {
    expect(badgeUrl('./', 'sea-surface-temperature')).toBe('./goos-eov/webp/64/sea-surface-temperature.webp')
  })
  it('the credit lines are verbatim', () => {
    expect(GOOS_CREDIT).toBe('Credit: Global Ocean Observing System (GOOS)')
    expect(MDI_CREDIT).toBe('Icons: Material Design Icons (Pictogrammers, Apache-2.0)')
    expect(EOV_GLYPH_CREDIT).toContain('adapted from the GOOS EOV icons (Martín Míguez et al. 2026, Front. Mar. Sci., CC BY): traced, monochrome, rescaled'.replace('adapted', 'Adapted'))
  })
})
