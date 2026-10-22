// the layer slot: one raster or grid layer drawn under the places of the Map, at the period `t` the hash shares with every
// view. a slot is a small object (mount, update, unmount, legend) made by the factory of its kind; the renderer of build
// week 2 (2026-11-06 to 11-12, the `@oceanmetrics/map` package: grid slices, COGs, H3) registers its kinds here, and Day 6
// has one kind, `erddap` (the dataset's own ERDDAP WMS, erddapSlot.ts). the hash key is `layer=<kind>:<id>[:<variable>]`
// (`layer=erddap:dhw_5km:CRW_SST`). plain rules, no MapLibre at run time: hash.ts (the entry) reads the key codec from here,
// so the kinds' code stays in the map chunk.
import type { Map as MlMap } from 'maplibre-gl'

export type SlotKind = 'erddap' | 'cog' | 'h3'
export const SLOT_KINDS: SlotKind[] = ['erddap', 'cog', 'h3']

/** what the hash's `layer` names: a kind, the dataset (or asset) id, and the variable when the dataset has several */
export interface LayerSpec {
  kind: SlotKind
  id: string
  variable: string | null
}

/** what the legend says of the layer: its title, the time it asked for (an ISO instant; null = the latest), how it is drawn, and why nothing shows */
export interface LegendSpec {
  title: string
  /** the period start the layer draws ("2024-07-01"); null = the dataset's latest */
  t: string | null
  /** how it is drawn and for how long ("ERDDAP WMS, provisional until ...") */
  via: string
  /** set when no tile came back ("no tiles from pae-paha.pacioos.hawaii.edu") */
  problem: string | null
}

export interface LayerSlot {
  id: string
  kind: SlotKind
  title: string
  credit?: string
  /** add the slot's sources and layers (every id prefixed `slot:`) under `beforeId`, at `t` (a period start; null = the latest) */
  mount(map: MlMap, beforeId: string | null, t: string | null): void
  /** draw another period */
  update(t: string | null): void
  /** remove what mount added */
  unmount(map: MlMap): void
  legend(): LegendSpec | null
}

export interface SlotOptions {
  fetch?: typeof fetch
  /** called when the legend changes (a tile error, a new period) */
  onchange?: () => void
}

export type SlotFactory = (spec: LayerSpec, opts: SlotOptions) => Promise<LayerSlot>

// ---- the key codec ----

const PART = /^[A-Za-z0-9_.-]+$/

/** `erddap:dhw_5km:CRW_SST` -> { kind, id, variable }; null for anything else (an unknown kind, an empty or odd part) */
export function parseLayerKey(s: string | null | undefined): LayerSpec | null {
  if (!s) return null
  const bits = s.split(':')
  if (bits.length < 2 || bits.length > 3) return null
  const [kind, id, variable] = bits
  if (!SLOT_KINDS.includes(kind as SlotKind) || !PART.test(id) || (variable != null && !PART.test(variable))) return null
  return { kind: kind as SlotKind, id, variable: variable ?? null }
}

export function formatLayerKey(spec: LayerSpec): string {
  return `${spec.kind}:${spec.id}${spec.variable ? `:${spec.variable}` : ''}`
}

// ---- the registry ----

const factories = new Map<SlotKind, SlotFactory>()

export function registerSlotKind(kind: SlotKind, factory: SlotFactory): void {
  factories.set(kind, factory)
}

/** the slot of a spec, made by its kind's factory; throws (at once, not in the promise) on a kind nothing has registered */
export function slotFor(spec: LayerSpec, opts: SlotOptions = {}): Promise<LayerSlot> {
  const make = factories.get(spec.kind)
  if (!make) throw new Error(`no layer slot kind "${spec.kind}" is registered`)
  return make(spec, opts)
}

// ---- where the slot sits among the map's layers ----

/** every layer and source a slot adds starts with this, so clear() removes it and a click never hits it */
export const SLOT_PREFIX = 'slot:'
export const isSlotLayer = (id: string) => id.startsWith(SLOT_PREFIX)
/** what clear() removes: everything but the basemap (`base-*`), the slot's layers among it */
export const clearsLayer = (id: string) => !id.startsWith('base-')
/** the layers a click or the pointer tests: a part's, never the slot's */
export const hitsLayer = (id: string) => !isSlotLayer(id) && clearsLayer(id)

/**
 * the layer the slot goes under: the first vector part's fill (`p<i>:fill`), else the first WMS part (`w<i>`), else none (on
 * top of the basemap). `parts` is the map's parts in drawing order; a vector part counts only when it has tiles to draw.
 */
export function slotBeforeId(parts: readonly { kind: 'vector' | 'raster'; drawn: boolean }[]): string | null {
  const v = parts.findIndex(p => p.kind === 'vector' && p.drawn)
  if (v >= 0) return `p${v}:fill`
  const r = parts.findIndex(p => p.kind === 'raster' && p.drawn)
  return r >= 0 ? `w${r}` : null
}
