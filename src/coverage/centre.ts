// the centre of a place's bounding box, for ordering places north to south or west to east. one implementation: the coverage
// builder (Node) writes it as `lat` and `lon` on every coverage row, and the viewer computes the same for the gazetteer's places
// that are not in coverage (viewer/src/lib/gazetteerPlaces.ts), so both give the same number for the same bbox.
// - latitude: the middle of ymin and ymax.
// - longitude: the middle of xmin and xmax, after unwrapping a bbox that crosses the antimeridian. the gazetteer index writes
//   such a bbox with its east beyond 180 (`167.6 .. 195`); a bbox written the RFC 7946 way, west > east (`177.8 .. -70.0`),
//   is unwrapped the same. the centre is then normalised back to -180..180, so `167.6 .. 195` is -178.7, not 181.3.
// - 4 decimals (about 11 m): finer than an order by position can use, and a smaller coverage table.

export interface Bbox {
  xmin: number
  ymin: number
  xmax: number
  ymax: number
}

export interface Centre {
  lat: number
  lon: number
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4

/** longitude brought into -180..180 */
export function normaliseLon(lon: number): number {
  let v = lon
  while (v > 180) v -= 360
  while (v < -180) v += 360
  return v
}

/** the centre of a bbox, or null when it is missing or not finite */
export function bboxCentre(b: Partial<Bbox> | null | undefined): Centre | null {
  if (!b) return null
  const { xmin, ymin, xmax, ymax } = b
  if (![xmin, ymin, xmax, ymax].every(v => typeof v === 'number' && Number.isFinite(v))) return null
  const east = (xmin as number) > (xmax as number) ? (xmax as number) + 360 : (xmax as number)
  return { lat: round4(((ymin as number) + (ymax as number)) / 2), lon: round4(normaliseLon(((xmin as number) + east) / 2)) }
}
