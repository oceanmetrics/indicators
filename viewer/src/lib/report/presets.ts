// named report specs for the builder's "Start from" menu. they live here until instances land (instance.json holds
// them then, plan §6). a preset is the shared selection (places and indicators, as for every view) plus a layout and a title.
// it is offered only when it expands to at least one place and one indicator, so the OBIS one appears once OBIS indicators are published.
import { DEFAULT_SPEC, expandIndicators, expandPlaces } from '../../../../src/report/spec.ts'
import type { IndicatorLike, PlaceLike, PlaceSetLike, ReportSpec } from '../../../../src/report/spec.ts'

export interface Preset {
  id: string
  label: string
  spec: ReportSpec
}

const preset = (id: string, label: string, spec: Pick<ReportSpec, 'places' | 'indicators' | 'layout'>): Preset => ({
  id, label, spec: { ...DEFAULT_SPEC, ...spec, title: label },
})
const places = (...include: string[]): ReportSpec['places'] => ({ include, exclude: [], context: false })
const indicators = (...include: string[]): ReportSpec['indicators'] => ({ include, exclude: [] })

export const PRESETS: Preset[] = [
  preset('sanctuary-condition', 'Sanctuary condition', { places: places('coll:places'), indicators: indicators('*'), layout: 'scorecard' }),
  preset('cinms', 'One sanctuary: Channel Islands', { places: places('NMS:CINMS'), indicators: indicators('*'), layout: 'cards' }),
  preset('climate', 'Climate drivers and water quality', {
    places: places('coll:places'), indicators: indicators('cat:drivers-pressures', 'cat:water-quality'), layout: 'scorecard',
  }),
  preset('obis', 'Biodiversity (OBIS)', { places: places('coll:mr_eez'), indicators: indicators('series:obis-all:*'), layout: 'scorecard' }),
  preset('response', 'Response (SDG 14)', { places: places('coll:mr_eez'), indicators: indicators('cat:response'), layout: 'scorecard' }),
]

/** the presets that expand to something in this catalog */
export function availablePresets(all: Preset[], inds: IndicatorLike[], placesList: PlaceLike[], sets: readonly PlaceSetLike[] = []): Preset[] {
  return all.filter(p => expandPlaces(p.spec.places, placesList, sets).length > 0 && expandIndicators(p.spec.indicators, inds).length > 0)
}

/** the preset a spec is, if it is exactly one (the builder's select shows it) */
export function presetOf(spec: ReportSpec, all: Preset[] = PRESETS): Preset | null {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  return all.find(p => same(p.spec.places, spec.places) && same(p.spec.indicators, spec.indicators) && p.spec.layout === spec.layout) ?? null
}
