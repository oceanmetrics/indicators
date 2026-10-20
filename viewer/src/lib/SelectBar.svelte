<script lang="ts">
  // the Select section, above the Matrix, Map and Report tabs: the one selection they share. a place picker (place sets, groups
  // and places of the whole gazetteer, computed or not), an indicator picker (the vocabulary, the leads and show-empty switches
  // and the tree) and a line of what is chosen. every tick is a change of the report spec's rules (pi, px, ii, ix: selection.ts,
  // report/tree.ts), so a view switch carries the selection and a link is the selection. the Order control (sort keys, grouping, reset)
  // is part of it too: the order (ps pg po is ig io) is shared by the Matrix, Map and Report like the rules. the Place view carries it in its hash
  // and has no Select section of its own.
  import type { Catalog, Layers } from './data.ts'
  import type { ViewState } from './hash.ts'
  import type { CoverageIndex, Place } from './matrix.ts'
  import type { Indicator } from './data.ts'
  import type { TreeNode } from './report/tree.ts'
  import { leadsOnly, selectionOf, setLeadsOnly, withSelection } from './selection.ts'
  import type { Selection } from './selection.ts'
  import PlacePicker from './pick/PlacePicker.svelte'
  import IndicatorPicker from './pick/IndicatorPicker.svelte'
  import OrderPicker from './pick/OrderPicker.svelte'
  import { multiLabel, placeGroups, placeSetInfos, selectionLine } from './pick/places.ts'
  import { multiIndicatorLabel } from './pick/indicators.ts'

  interface Props {
    view: ViewState
    catalog: Catalog
    idx: CoverageIndex
    layers: Layers
    /** every place the selection can name now, and the places and indicators it holds */
    universe: Place[]
    places: Place[]
    indicators: Indicator[]
    /** the gazetteer's places are read / being read, and the way to ask for them */
    gazetteer: boolean
    loading: boolean
    ongazetteer: () => void
    onchange: (p: Partial<ViewState>) => void
  }
  let { view, catalog, idx, layers, universe, places, indicators, gazetteer, loading, ongazetteer, onchange }: Props = $props()

  const sets = $derived(catalog.manifest.place_sets ?? [])
  const m = $derived(catalog.manifest)

  // ---- places ----
  const chosenPlaces = $derived(new Set(places.map(p => p.id)))
  const groups = $derived(placeGroups(universe, idx, layers, { all: true, gazetteer }))
  const placeWords = $derived(multiLabel(groups, chosenPlaces, placeSetInfos(sets, groups)))
  const setSelection = (sel: Partial<Selection>) => onchange({ spec: withSelection(view, sel).spec })
  // the rules of a tick arrive with the panel (a tick only happens in an open panel)
  async function tickPlace(node: { kind: 'collection' | 'place'; key: string }, on: boolean) {
    const { toggleSelectedPlaces } = await import('./pick/placesTree.ts')
    setSelection({ places: toggleSelectedPlaces(selectionOf(view).places, universe, node, on, sets) })
  }

  // ---- indicators ----
  const chosenInds = $derived(new Set(indicators.map(i => i.id)))
  const computed = $derived(new Set(idx.places.map(p => p.id)))
  const computedChosen = $derived(places.filter(p => computed.has(p.id)))
  const known = $derived(m.vocabularies[view.vocab].terms.map(t => t.id))
  async function tickInd(n: TreeNode, on: boolean) {
    const { toggleSelectedIndicators } = await import('./pick/indicatorsTree.ts')
    setSelection({ indicators: toggleSelectedIndicators(selectionOf(view).indicators, m.indicators, view.vocab, known, n, on) })
  }

  let indPicker: { show: () => void } | undefined = $state()
  /** the Map's "another indicator" opens the indicator picker */
  export function showIndicators() { indPicker?.show() }
</script>

<section class="select" aria-label="Selection: places and indicators">
  <div class="pickers">
    <PlacePicker mode="multi" {idx} {universe} {layers} {sets} label={placeWords} chosen={chosenPlaces} ontoggle={tickPlace} {gazetteer} {loading} ongazetteer={ongazetteer} />
    <IndicatorPicker bind:this={indPicker} mode="multi" label={multiIndicatorLabel(indicators.length, view.vocab, leadsOnly(view.spec.indicators))} indicators={m.indicators} vocabs={m.vocabularies}
      vocab={view.vocab} onvocab={v => onchange({ vocab: v })} chosen={chosenInds} {idx} places={computedChosen} nPlaces={places.length} ontoggle={tickInd}
      leads={leadsOnly(view.spec.indicators)} onleads={v => setSelection({ indicators: setLeadsOnly(view.spec.indicators, v) })}
      showEmpty={view.showEmpty} onempty={v => onchange({ showEmpty: v })} />
    <OrderPicker order={view.spec.order} vocab={view.vocab} onchange={order => setSelection({ order })} />
  </div>
  <p class="line" role="status" aria-live="polite">{selectionLine(placeWords, indicators.length)}</p>
</section>

<style>
  .select { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-2) var(--space-5); min-width: 0; padding: var(--space-3) var(--space-4); background: var(--bg-tint); border-radius: var(--radius-md); }
  .pickers { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5); min-width: 0; align-items: flex-start; }
  .line { margin: 0; min-width: 0; flex: 1 1 16rem; align-self: center; font: var(--type-small); color: var(--text-strong); overflow-wrap: anywhere; }
  @media (max-width: 640px) { .select { padding: var(--space-3); } .pickers { flex: 1 1 100%; } }
</style>
