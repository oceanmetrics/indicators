// the zip writer is tested by reading its archives back with a small independent reader (central directory first, as unzip
// does) and, where the system has `unzip`, by the real tool.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crc32, dosDateTime, zipStore } from './zip.ts'

const dec = new TextDecoder()

/** read a store-only archive: the entries (name, bytes, stored crc) from its central directory */
function readZip(z: Uint8Array) {
  const v = new DataView(z.buffer, z.byteOffset, z.byteLength)
  const eocd = z.length - 22
  expect(v.getUint32(eocd, true)).toBe(0x06054b50)
  const n = v.getUint16(eocd + 10, true)
  let at = v.getUint32(eocd + 16, true)
  const out: { name: string; data: Uint8Array; crc: number; flags: number }[] = []
  for (let i = 0; i < n; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50)
    const method = v.getUint16(at + 10, true), crc = v.getUint32(at + 16, true), size = v.getUint32(at + 24, true)
    const nameLen = v.getUint16(at + 28, true), extra = v.getUint16(at + 30, true), comment = v.getUint16(at + 32, true), local = v.getUint32(at + 42, true)
    const name = dec.decode(z.subarray(at + 46, at + 46 + nameLen))
    expect(method).toBe(0)
    expect(v.getUint32(local, true)).toBe(0x04034b50)
    const ln = v.getUint16(local + 26, true), le = v.getUint16(local + 28, true)
    out.push({ name, data: z.subarray(local + 30 + ln + le, local + 30 + ln + le + size), crc, flags: v.getUint16(at + 8, true) })
    at += 46 + nameLen + extra + comment
  }
  return out
}

describe('crc32', () => {
  it('matches the known check values', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array(0))).toBe(0)
    expect(crc32(new TextEncoder().encode('a'))).toBe(0xe8b7be43)
  })
})

describe('dosDateTime', () => {
  it('packs local time in two-second steps and the date from 1980', () => {
    const { time, date } = dosDateTime(new Date(2026, 9, 20, 16, 5, 31))
    expect(time).toBe((16 << 11) | (5 << 5) | 15)
    expect(date).toBe(((2026 - 1980) << 9) | (10 << 5) | 20)
  })
})

describe('zipStore', () => {
  const files = [
    { path: 'figures.csv', data: 'a,b\r\n1,2\r\n' },
    { path: 'NMS_CINMS__sst/data.json', data: '{"x":[1,2,null]}\n' },
    { path: 'NMS_CINMS__sst/figure.png', data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 255, 128]) },
    { path: 'NMS_CINMS__sst/alt.txt', data: 'Température − 2 °C\n' },
  ]
  const z = zipStore(files, new Date(2026, 9, 20, 12, 0, 0))
  it('holds every file, in order, byte for byte, with the right CRC', () => {
    const r = readZip(z)
    expect(r.map(e => e.name)).toEqual(files.map(f => f.path))
    for (const [i, e] of r.entries()) {
      const want = typeof files[i].data === 'string' ? new TextEncoder().encode(files[i].data as string) : (files[i].data as Uint8Array)
      expect([...e.data]).toEqual([...want])
      expect(e.crc).toBe(crc32(want))
    }
  })
  it('flags the names as UTF-8', () => {
    expect(readZip(z).every(e => (e.flags & 0x0800) !== 0)).toBe(true)
    expect(readZip(zipStore([{ path: 'é/ü.txt', data: 'x' }]))[0].name).toBe('é/ü.txt')
  })
  it('an empty archive is the 22-byte end record', () => {
    expect(zipStore([]).length).toBe(22)
  })
  it('the system unzip accepts it and extracts the same text', () => {
    const has = spawnSync('unzip', ['-v']).status === 0
    if (!has) return
    const dir = mkdtempSync(join(tmpdir(), 'om-zip-'))
    const file = join(dir, 'a.zip')
    writeFileSync(file, z)
    expect(execFileSync('unzip', ['-tq', file]).toString()).toContain('No errors detected')
    expect(execFileSync('unzip', ['-p', file, 'figures.csv']).toString()).toBe('a,b\r\n1,2\r\n')
    expect(readFileSync(file).length).toBe(z.length)
  })
})
