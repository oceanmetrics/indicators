<script lang="ts">
  // the Matrix's own controls, under the Select section and the view tabs: the swap of rows and columns, the depth switch and the
  // place search chip. what is chosen (places, indicators, the vocabulary, leads and show-empty) is the shared selection, in the
  // Select section. all state lives in `view` (the URL hash).
  import { Button } from '@marinebon/ui'
  import { Icon } from '../../../src/icons/index.ts'
  import { DEPTHS } from './hash.ts'
  import type { Depth, ViewState } from './hash.ts'

  interface Props {
    view: ViewState
    onchange: (patch: Partial<ViewState>) => void
  }
  let { view, onchange }: Props = $props()

  const DEPTH_UI: Record<Depth, { label: string; icon: 'depth-skim' | 'depth-swim' | 'depth-dive'; note: string }> = {
    skim: { label: 'Skimmer', icon: 'depth-skim', note: 'Glyphs and the last value for each place.' },
    swim: { label: 'Swimmer', icon: 'depth-swim', note: 'Adds a sparkline of the recent record. Open a cell for the sentence, sources and method.' },
    dive: { label: 'Diver', icon: 'depth-dive', note: 'Adds the values file and the status method. Open a cell for the configuration and a query.' },
  }
</script>

<section class="controls" aria-label="Matrix controls">
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
