<script lang="ts">
  // the Matrix's controls: the two pickers (places: groups and places; indicators: the vocabulary, the leads and show-empty
  // switches and the tree), the swap of rows and columns, the depth switch and the Report button. what was removed from the
  // display (the x on a header) is brought back by ticking it in a picker. all state lives in `view` (the URL hash).
  import { Button } from '@marinebon/ui'
  import { Icon } from '../../../src/icons/index.ts'
  import type { Indicator, Layers, PlaceSet, Vocab, VocabId } from './data.ts'
  import { DEPTHS } from './hash.ts'
  import type { Depth, ViewState } from './hash.ts'
  import type { CoverageIndex, Place } from './matrix.ts'
  import type { TreeNode } from './report/tree.ts'
  import PlacePicker from './pick/PlacePicker.svelte'
  import IndicatorPicker from './pick/IndicatorPicker.svelte'
  import { matrixChosen, multiLabel, placeGroups, placeSetInfos } from './pick/places.ts'
  import { multiIndicatorLabel } from './pick/indicators.ts'

  interface Props {
    view: ViewState
    idx: CoverageIndex
    layers: Layers
    /** the groups on display (view.colls, or the default when none is asked for) */
    groups: string[]
    onchange: (patch: Partial<ViewState>) => void
    /** the manifest's indicators and vocabularies, and the ids on display now */
    indicators: Indicator[]
    vocabs: Record<VocabId, Vocab>
    shown: Set<string>
    /** the places on display (the rows of the groups on display, after the search) */
    displayed: Place[]
    /** the Report view opened with what the Matrix shows now (matrixToSpec) */
    reportHref?: string
    /** the manifest's place sets */
    sets?: PlaceSet[]
  }
  let { view, idx, layers, groups, onchange, indicators, vocabs, shown, displayed, reportHref = '', sets = [] }: Props = $props()

  const DEPTH_UI: Record<Depth, { label: string; icon: 'depth-skim' | 'depth-swim' | 'depth-dive'; note: string }> = {
    skim: { label: 'Skimmer', icon: 'depth-skim', note: 'Glyphs and the last value for each place.' },
    swim: { label: 'Swimmer', icon: 'depth-swim', note: 'Adds a sparkline of the recent record. Open a cell for the sentence, sources and method.' },
    dive: { label: 'Diver', icon: 'depth-dive', note: 'Adds the values file and the status method. Open a cell for the configuration and a query.' },
  }

  // ---- places ----
  const chosenPlaces = $derived(matrixChosen(idx, groups, view.hidePlaces))
  const placeLabel = $derived(multiLabel(placeGroups(idx, layers), chosenPlaces, placeSetInfos(sets, placeGroups(idx, layers), layers)))
  // the rules of a tick arrive with the panel (a tick only happens in an open panel)
  async function tickPlace(node: { kind: 'collection' | 'place'; key: string }, on: boolean) {
    const { toggleMatrixPlaces } = await import('./pick/placesTree.ts')
    onchange(toggleMatrixPlaces(idx, { colls: groups, hidePlaces: view.hidePlaces }, node, on, sets))
  }

  // ---- indicators ----
  const pool = $derived(new Set(indicators.filter(i => !view.leads || i.lead).map(i => i.id)))
  async function tickInd(n: TreeNode, on: boolean) {
    const { nodeIndicatorIds, toggleMatrixIndicators } = await import('./pick/indicatorsTree.ts')
    onchange(toggleMatrixIndicators({ hideInds: view.hideInds, addInds: view.addInds }, nodeIndicatorIds(n, on), on, pool))
  }
</script>

<section class="controls" aria-label="Matrix controls">
  <PlacePicker mode="multi" {idx} {layers} {sets} label={placeLabel} chosen={chosenPlaces} ontoggle={tickPlace}
    removed={view.hidePlaces.length} onrestore={() => onchange({ hidePlaces: [] })} />
  <IndicatorPicker mode="multi" label={multiIndicatorLabel(shown.size, view.vocab, view.leads)} {indicators} {vocabs} vocab={view.vocab}
    onvocab={v => onchange({ vocab: v })} chosen={shown} {idx} places={displayed} ontoggle={tickInd}
    leads={view.leads} onleads={v => onchange({ leads: v })} showEmpty={view.showEmpty} onempty={v => onchange({ showEmpty: v })}
    removed={view.hideInds.length} onrestore={() => onchange({ hideInds: [] })} />

  <div class="group om-stack-s" role="group" aria-label="Layout">
    <span class="mbon-label">Layout</span>
    <div class="row om-row">
      <Button variant="quiet" size="sm" pressed={view.axes === 'places'} onclick={() => onchange({ axes: view.axes === 'places' ? 'indicators' : 'places' })}>
        Places as rows
      </Button>
    </div>
  </div>
  <div class="group om-stack-s" role="group" aria-label="Detail level">
    <span class="mbon-label">Detail</span>
    <div class="row om-row">
      {#each DEPTHS as d (d)}
        <Button variant="quiet" size="sm" pressed={view.depth === d} onclick={() => onchange({ depth: d })}>
          <Icon name={DEPTH_UI[d].icon} size={16} />{DEPTH_UI[d].label}
        </Button>
      {/each}
    </div>
  </div>
  {#if reportHref}
    <div class="group om-stack-s" role="group" aria-label="Report">
      <span class="mbon-label">Report</span>
      <div class="row om-row">
        <Button variant="quiet" size="sm" href={reportHref}><Icon name="view-report" size={16} />Report</Button>
      </div>
    </div>
  {/if}
  {#if view.q}
    <div class="group om-stack-s" role="group" aria-label="Place search">
      <span class="mbon-label">Place search</span>
      <div class="row om-row">
        <Button variant="quiet" size="sm" aria-label="Clear the place search “{view.q}”" onclick={() => onchange({ q: '' })}>“{view.q}” <Icon name="ui-close" size={14} /></Button>
      </div>
    </div>
  {/if}
  <p class="note om-note-w">{DEPTH_UI[view.depth].note}</p>
</section>

<style>
  .controls { display: flex; flex-wrap: wrap; gap: var(--space-3) var(--space-5); align-items: flex-start; min-width: 0; }
</style>
