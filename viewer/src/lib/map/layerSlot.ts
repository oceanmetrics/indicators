// the layer slot: one raster, grid or hexagon layer drawn under the places of the Map, at the period `t` the hash shares
// with every view. the contract lives in `@oceanmetrics/map` (`slot.ts`, moved there from this file for build week 2):
// a slot is a small object (mount, update, unmount, legend) made by the factory its kind registers. this file only
// re-exports it, so the app imports one path and hash.ts (the entry) takes the key codec without the providers (the
// package has no side effects, so only what is named here is bundled). the hash key is `layer=<kind>:<id>[:<variable>]`
// (`layer=grid:dhw_5km:CRW_SST`); Day 6's `erddap:` links parse as `grid:` and are written back as `grid:`.
export {
  carryLayers, formatLayerKey, isPartFill, isSlotLayer, parseLayerKey, registerSlotKind, SLOT_KIND_ALIASES, SLOT_KINDS, SLOT_PREFIX,
  slotBeforeId, slotFor,
} from '@oceanmetrics/map'
export type { LayerSlot, LayerSpec, LegendSpec, SlotFactory, SlotKind, SlotOptions } from '@oceanmetrics/map'
