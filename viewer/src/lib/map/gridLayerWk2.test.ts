// the week 2 rules of the grid layer: the cells sliced in the legend, the palette, the cell readout, the patient fetch and
// the words of a failure (erddap-places parity rows 17, 19, 20, 30, 37, 82)
import { describe, expect, it } from 'vitest'
import { RAMPS } from '@oceanmetrics/map'
import { cellCountLine, cellReadout, cellRows, latLonText, palOf, patientFetch, problemText, rampChoices, readoutPlace } from './gridLayer.ts'

describe('the cells sliced, in the legend (row 19)', () => {
  const pp = [{ id: 'NMS:CINMS', cells: 2345, boundary: 210 }, { id: 'NMS:MBNMS', cells: 61234, boundary: 1890 }, { id: 'NMS:TBNMS', cells: 0, boundary: 0 }]
  it('the total, the places with cells, the boundary cells, and those with data at each period', () => {
    expect(cellCountLine(pp, [{ period: '2024-07', counts: { cells: 63579, withValue: 63001, boundary: 2100 } }, { period: '2016-07', counts: { cells: 63579, withValue: 62950, boundary: 2100 } }]))
      .toBe('Cells: 63,579 sliced in 2 places (2,100 on a boundary) · with data: 63,001 at 2024-07, 62,950 at 2016-07')
  })
  it('before the slice is in: the mask alone; one place is singular; nothing before the mask', () => {
    expect(cellCountLine(pp.slice(0, 1), [{ period: '2024-07', counts: null }])).toBe('Cells: 2,345 sliced in 1 place (210 on a boundary)')
    expect(cellCountLine(null, [])).toBeNull()
  })
  it('the rows per place: the largest first, a place with none said', () => {
    const name = (id: string) => ({ 'NMS:CINMS': 'Channel Islands', 'NMS:MBNMS': 'Monterey Bay', 'NMS:TBNMS': 'Thunder Bay' })[id] ?? id
    expect(cellRows(pp, name)).toEqual([
      { id: 'NMS:MBNMS', name: 'Monterey Bay', cells: '61,234', boundary: '1,890' },
      { id: 'NMS:CINMS', name: 'Channel Islands', cells: '2,345', boundary: '210' },
      { id: 'NMS:TBNMS', name: 'Thunder Bay', cells: 'none', boundary: '0' },
    ])
  })
})

describe('the palette (rows 30, 82)', () => {
  it('pal is a ramp of the map package, or reversed; anything else is the default (null)', () => {
    expect(palOf('viridis', RAMPS)).toBe('viridis')
    expect(palOf('spectral_r', RAMPS)).toBe('spectral_r')
    expect(palOf('nope', RAMPS)).toBeNull()
    expect(palOf('Viridis', RAMPS)).toBeNull()
    expect(palOf(null, RAMPS)).toBeNull()
  })
  it('the choices: the default named first, then the ramps by kind, each also reversed (a cyclic ramp once)', () => {
    const c = rampChoices('thermal', RAMPS)
    expect(c[0]).toEqual({ value: '', label: 'Default (thermal)' })
    expect(c[1]).toEqual({ value: 'viridis', label: 'viridis', group: 'Sequential' })
    expect(c[2]).toEqual({ value: 'viridis_r', label: 'viridis, reversed', group: 'Sequential' })
    expect(c).toContainEqual({ value: 'spectral_r', label: 'Spectral, reversed', group: 'Diverging' })
    expect(c.filter(o => o.value.startsWith('phase'))).toEqual([{ value: 'phase', label: 'phase', group: 'Cyclic' }])
    // the groups come in one run each, as the select draws them
    const groups = c.slice(1).map(o => o.group)
    expect([...new Set(groups)]).toEqual(['Sequential', 'Diverging', 'Cyclic'])
    expect(c.length).toBe(1 + 2 * (Object.keys(RAMPS).length - 1) + 1)
  })
})

describe('the cell readout (rows 17, 37)', () => {
  const cell = { lat: 34.125, lon: -120.125, weight: 1 }
  it('one slice: the value with its unit and the period, then the centre', () => {
    expect(cellReadout({ cell, units: '°C', now: { period: '2024-07', value: 18.4321 } })).toEqual(['18.43 °C in 2024-07', '34.13° N, 120.13° W'])
  })
  it('a boundary cell says how much of it is inside the place; a cell without data says so', () => {
    expect(cellReadout({ cell: { ...cell, weight: 0.4 }, units: null, now: { period: '2024', value: null } })).toEqual(['no data in 2024', '34.13° N, 120.13° W · 40 % inside'])
  })
  it('compare: both periods and the difference t2 - t (the anomaly\'s sign), named by its periods', () => {
    expect(cellReadout({ cell, units: '°C', now: { period: '2024-07', value: 18.5 }, then: { period: '2016-07', value: 17.25 } }))
      .toEqual(['2016-07: 17.25 °C', '2024-07: 18.50 °C', '2016-07 − 2024-07: −1.25 °C', '34.13° N, 120.13° W'])
    expect(cellReadout({ cell, units: '°C', now: { period: '2024-07', value: 18.5 }, then: { period: 'mean of 2003-07..2012-07', value: null } })[2])
      .toBe('mean of 2003-07..2012-07 − 2024-07: no data')
  })
  it('a centre in the 0..360 frame (PMNM east of 180) reads as a west longitude', () => {
    expect(latLonText(25.5, 190.25)).toBe('25.50° N, 169.75° W')
    expect(latLonText(-14.25, 189.5)).toBe('14.25° S, 170.50° W')
  })
  it('the box sits beside the pointer, flipped near the right and bottom edges', () => {
    expect(readoutPlace(100, 80, 1000, 600)).toEqual({ left: 100, top: 80, flipX: false, flipY: false })
    expect(readoutPlace(700.4, 500, 1000, 600)).toEqual({ left: 700, top: 500, flipX: true, flipY: true })
  })
})

describe('a server that drops requests (row 20: the places page\'s patientFetch)', () => {
  const answers = (...codes: number[]) => {
    const asked: number[] = []
    const f = (async () => { const c = codes[Math.min(asked.length, codes.length - 1)]; asked.push(c); return new Response('x', { status: c }) }) as typeof fetch
    return { f, asked }
  }
  it('asks again after a 404 or a 5xx until it gets an answer', async () => {
    const a = answers(404, 503, 200)
    expect((await patientFetch(a.f, 6, 0)('https://e/x')).status).toBe(200)
    expect(a.asked).toEqual([404, 503, 200])
  })
  it('another 4xx is the server\'s answer: returned at once', async () => {
    const a = answers(400, 200)
    expect((await patientFetch(a.f, 6, 0)('https://e/x')).status).toBe(400)
    expect(a.asked).toEqual([400])
  })
  it('the last answer after every try; a network error after every try is thrown', async () => {
    const b = answers(404)
    expect((await patientFetch(b.f, 3, 0)('https://e/x')).status).toBe(404)
    expect(b.asked).toEqual([404, 404, 404])
    const f = (async () => { throw new TypeError('Failed to fetch') }) as typeof fetch
    await expect(patientFetch(f, 2, 0)('https://e/x')).rejects.toThrow('Failed to fetch')
  })
  it('an aborted request stops at once', async () => {
    const ctl = new AbortController()
    ctl.abort()
    const a = answers(404)
    await expect(patientFetch(a.f, 6, 0)('https://e/x', { signal: ctl.signal })).rejects.toThrow()
    expect(a.asked).toEqual([])
  })
})

describe('a failure in the legend\'s words', () => {
  it('the engine\'s ERDDAP error: the host and the status, not the server\'s page', () => {
    expect(problemText(new Error('404 Not Found from ERDDAP: <html>Error {\n code=404;\n message="Not Found: Currently unknown datasetID"}</html>'), 'erddap.oceanmetrics.io'))
      .toBe('erddap.oceanmetrics.io answered HTTP 404 Not Found')
  })
  it('regression: an axis request\'s url holds numbers; the status is the one after it (it read "HTTP 123" on 2026-10-23)', () => {
    expect(problemText(new Error('https://erddap.oceanmetrics.io/erddap/griddap/jplMURSST41mday.json?longitude%5B(-120.123):1:(-119.456)%5D: 404 Not Found'), 'h'))
      .toBe('erddap.oceanmetrics.io did not answer (HTTP 404)')
    expect(problemText(new Error('https://e.org/erddap/info/x/index.json?y=500: no answer'), 'h')).toBe('e.org did not answer')
  })
  it('a url in the message: its host; an unreachable host keeps its own words; a long message is cut', () => {
    expect(problemText(new Error('HTTP 404 for https://erddap.example.org/erddap/griddap/x.parquet?sst'), 'h')).toBe('erddap.example.org did not answer (HTTP 404)')
    expect(problemText(new Error('erddap.oceanmetrics.io did not answer (no response within 30 s, 2 tries)'), 'h')).toBe('erddap.oceanmetrics.io did not answer (no response within 30 s, 2 tries)')
    expect(problemText(new Error('x'.repeat(200)), 'h')).toHaveLength(158)
  })
})
