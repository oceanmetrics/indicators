<script lang="ts">
  // the Matrix's controls: collections and a search over place names, the vocabulary the columns group by, the
  // leads-only toggle, and the depth switch. all state lives in `view` (the URL hash).
  import { Button, Toggle } from '@marinebon/ui'
  import { Icon } from '../../../src/icons/index.ts'
  import type { VocabId } from './data.ts'
  import { DEPTHS } from './hash.ts'
  import type { Depth, ViewState } from './hash.ts'

  interface Props {
    view: ViewState
    colls: { id: string; title: string; places: number }[]
    onchange: (patch: Partial<ViewState>) => void
  }
  let { view, colls, onchange }: Props = $props()

  const VOCABS: { id: VocabId; label: string }[] = [
    { id: 'onms', label: 'ONMS sections' },
    { id: 'names', label: 'NaMES themes' },
    { id: 'eov', label: 'GOOS EOVs' },
  ]
  const DEPTH_UI: Record<Depth, { label: string; icon: 'depth-skim' | 'depth-swim' | 'depth-dive'; note: string }> = {
    skim: { label: 'Skimmer', icon: 'depth-skim', note: 'Glyphs and the last value for each place.' },
    swim: { label: 'Swimmer', icon: 'depth-swim', note: 'Adds a sparkline of the recent record. Open a cell for the sentence, sources and method.' },
    dive: { label: 'Diver', icon: 'depth-dive', note: 'Adds the values file and the status method. Open a cell for the configuration and a query.' },
  }

  const toggleColl = (id: string) =>
    onchange({ colls: view.colls.includes(id) ? view.colls.filter(c => c !== id) : [...view.colls, id] })
</script>

<section class="controls" aria-label="Matrix controls">
  <div class="group" role="group" aria-label="Places">
    <span class="mbon-label">Places</span>
    <div class="row">
      {#each colls as c (c.id)}
        <Button variant="quiet" size="sm" pressed={view.colls.includes(c.id)} onclick={() => toggleColl(c.id)}>
          {c.title} <span class="n">{c.places}</span>
        </Button>
      {/each}
      <label class="search">
        <Icon name="ui-search" size={16} />
        <span class="mbon-sr-only">Search place names</span>
        <input type="search" placeholder="Search places" value={view.q} oninput={e => onchange({ q: e.currentTarget.value })} autocomplete="off" />
      </label>
    </div>
  </div>

  <div class="group" role="group" aria-label="Indicators">
    <span class="mbon-label">Group indicators by</span>
    <div class="row">
      {#each VOCABS as v (v.id)}
        <Button variant="quiet" size="sm" pressed={view.vocab === v.id} onclick={() => onchange({ vocab: v.id })}>{v.label}</Button>
      {/each}
      <Toggle checked={view.leads} label="Leads only" onchange={(v: boolean) => onchange({ leads: v })} />
    </div>
  </div>

  <div class="group" role="group" aria-label="Detail level">
    <span class="mbon-label">Detail</span>
    <div class="row">
      {#each DEPTHS as d (d)}
        <Button variant="quiet" size="sm" pressed={view.depth === d} onclick={() => onchange({ depth: d })}>
          <Icon name={DEPTH_UI[d].icon} size={16} />{DEPTH_UI[d].label}
        </Button>
      {/each}
    </div>
  </div>
  <p class="note">{DEPTH_UI[view.depth].note}</p>
</section>

<style>
  .controls { display: flex; flex-wrap: wrap; gap: var(--space-3) var(--space-5); align-items: flex-start; }
  .group { display: grid; gap: var(--space-2); min-width: 0; }
  .row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .n { font: var(--type-label); letter-spacing: 0; color: var(--text-body); }
  .search {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-3);
    min-width: 0;
    height: 2rem;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--control-bg);
    color: var(--text-body);
  }
  .search:focus-within { border-color: var(--accent); }
  .search input { border: 0; background: none; outline: none; width: 11rem; min-width: 0; font: var(--type-small); color: var(--text-strong); }
  .search input:focus-visible { outline: none; }
  .search input::placeholder { color: var(--text-body); opacity: 1; }
  .note { flex-basis: 100%; margin: 0; font: var(--type-small); color: var(--text-body); }
  @media (max-width: 640px) {
    .search input { width: 8rem; }
  }
</style>
