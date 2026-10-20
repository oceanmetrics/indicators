// a store-only ZIP writer (PKZIP appnote 6.3.x: no compression, no zip64, UTF-8 names): enough for the SanctuaryWatch bundle's
// handful of small text files and PNGs, with no dependency. plain functions, no DOM, so a test reads the archive back.

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** the CRC-32 of the bytes (IEEE 802.3, as zip and gzip use) */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipFile {
  /** the path inside the archive, `/` separated, no leading slash */
  path: string
  data: Uint8Array | string
}

/** MS-DOS time and date words of a moment (local time, two-second steps, years from 1980) */
export function dosDateTime(d: Date): { time: number; date: number } {
  const y = Math.max(1980, d.getFullYear())
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

const enc = new TextEncoder()
const u16 = (v: DataView, o: number, n: number) => v.setUint16(o, n, true)
const u32 = (v: DataView, o: number, n: number) => v.setUint32(o, n >>> 0, true)

/** the archive of the files, in the order given, each stored (method 0) with its CRC-32 */
export function zipStore(files: ZipFile[], when: Date = new Date()): Uint8Array {
  if (files.length > 0xffff) throw new Error('zip: more than 65535 files')
  const { time, date } = dosDateTime(when)
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.path)
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data
    if (data.length >= 0xffffffff || offset >= 0xffffffff) throw new Error('zip: over 4 GB')
    const crc = crc32(data)
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0); u16(lv, 10, time); u16(lv, 12, date)
    u32(lv, 14, crc); u32(lv, 18, data.length); u32(lv, 22, data.length); u16(lv, 26, name.length); u16(lv, 28, 0)
    local.set(name, 30)
    const cd = new Uint8Array(46 + name.length)
    const cv = new DataView(cd.buffer)
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0); u16(cv, 12, time); u16(cv, 14, date)
    u32(cv, 16, crc); u32(cv, 20, data.length); u32(cv, 24, data.length); u16(cv, 28, name.length)
    u32(cv, 42, offset)
    cd.set(name, 46)
    parts.push(local, data)
    central.push(cd)
    offset += local.length + data.length
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  u32(ev, 0, 0x06054b50); u16(ev, 8, files.length); u16(ev, 10, files.length); u32(ev, 12, cdSize); u32(ev, 16, offset)
  const out = new Uint8Array(offset + cdSize + 22)
  let at = 0
  for (const p of [...parts, ...central, end]) { out.set(p, at); at += p.length }
  return out
}
