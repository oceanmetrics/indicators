<script lang="ts">
  // the Matrix's controls: collections and a search over place names, the vocabulary the columns group by, the
  // leads-only toggle, the flip of rows and columns, the depth switch, and the "Add or restore" menu for what was
  // removed from the display or lies beyond the leads. all state lives in `view` (the URL hash).
  import { Button, Toggle } from '@marinebon/ui'
  import { Icon } from '../../../src/icons/index.ts'
  import type { Indicator, VocabId } from './data.ts'
  import { DEPTHS } from './hash.ts'
  import type { Depth, ViewState } from './hash.ts'
  import { addableIndicators } from './matrix.ts'
  import type { Place } from './matrix.ts'

  interface Props {
    view: ViewState
    colls: { id: string; title: string; places: number }[]
    onchange: (patch: Partial<ViewState>) => void
    /** the manifest's indicators, and the ids on display now */
    indicators?: Indicator[]
    shown?: Set<string>
    /** the places removed from the display */
    removedPlaces?: Place[]
    /** the Report view opened with what the Matrix shows now (matrixToSpec) */
    reportHref?: string
  }
  let { view, colls, onchange, indicators = [], shown = new Set(), removedPlaces = [], reportHref = '' }: Props = $props()

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

  // ---- add or restore ----
  let menuOpen = $state(false)
  let menu = $state<HTMLDetailsElement>()
  const removedInds = $derived(view.hideInds.map(id => indicators.find(i => i.id === id)).filter((i): i is Indicator => !!i))
  // a removed indicator is restored from the list above, not offered again under "More indicators"
  const more = $derived(addableIndicators(indicators, new Set([...shown, ...view.hideInds])))
  const removedN = $derived(removedPlaces.length + removedInds.length)
  const restorePlace = (id: string) => onchange({ hidePlaces: view.hidePlaces.filter(x => x !== id) })
  const restoreInd = (id: string) => onchange({ hideInds: view.hideInds.filter(x => x !== id) })
  const addInd = (id: string) => onchange({ addInds: [...view.addInds.filter(x => x !== id), id] })
  const restoreAll = () => onchange({ hidePlaces: [], hideInds: [] })
  function onkey(e: KeyboardEvent) {
    if (e.key === 'Escape' && menuOpen) {
      menuOpen = false
      menu?.querySelector('summary')?.focus()
      e.stopPropagation()
    }
  }
</script>

<svelte:window onkeydown={onkey} onclick={e => { if (menuOpen && menu && !menu.contains(e.target as Node)) menuOpen = false }} />

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
      <Button variant="quiet" size="sm" pressed={view.axes === 'indicators'} onclick={() => onchange({ axes: view.axes === 'indicators' ? 'places' : 'indicators' })}>
        Indicators as rows
      </Button>
    </div>
  </div>

  <div class="group menu" role="group" aria-label="Add or restore">
    <span class="mbon-label">Show or hide</span>
    <div class="row">
      <details class="add" bind:open={menuOpen} bind:this={menu}>
        <summary>Add or restore{#if removedN} <span class="n">{removedN} removed</span>{/if}</summary>
        <div class="panel">
          {#if removedN}
            <div class="sect">
              <div class="sh"><span class="mbon-label">Removed</span><Button variant="quiet" size="sm" onclick={restoreAll}>Restore all</Button></div>
              {#if removedPlaces.length}
                <div class="chips" role="group" aria-label="Removed places">
                  {#each removedPlaces as p (p.id)}
                    <Button variant="quiet" size="sm" aria-label="Restore {p.name}" onclick={() => restorePlace(p.id)}>{p.name}</Button>
                  {/each}
                </div>
              {/if}
              {#if removedInds.length}
                <div class="chips" role="group" aria-label="Removed indicators">
                  {#each removedInds as i (i.id)}
                    <Button variant="quiet" size="sm" aria-label="Restore {i.short}" onclick={() => restoreInd(i.id)}>{i.short}</Button>
                  {/each}
                </div>
              {/if}
              <p class="hint">Select a name to put it back.</p>
            </div>
          {:else}
            <p class="hint">Nothing is removed. Use the <Icon name="ui-close" size={14} /> on a place or indicator header to take it off the display.</p>
          {/if}
          {#if more.length}
            <div class="sect">
              <span class="mbon-label">More indicators</span>
              {#each more as g (g.series)}
                <div class="series">
                  <span class="st">{g.title}</span>
                  <div class="chips" role="group" aria-label="Add from {g.title}">
                    {#each g.indicators as i (i.id)}
                      <Button variant="quiet" size="sm" aria-label="Add {i.short}" title={i.title} onclick={() => addInd(i.id)}>{i.short}</Button>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </details>
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
  {#if reportHref}
    <div class="group" role="group" aria-label="Report">
      <span class="mbon-label">Report</span>
      <div class="row">
        <Button variant="quiet" size="sm" href={reportHref}><Icon name="view-report" size={16} />Report</Button>
      </div>
    </div>
  {/if}
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
  .menu { position: relative; }
  .add { position: relative; }
  .add summary {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 2rem;
    padding: 0 var(--space-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--control-bg);
    color: var(--text-strong);
    font: var(--type-small);
    cursor: pointer;
    list-style: none;
  }
  .add summary::-webkit-details-marker { display: none; }
  .add[open] summary { border-color: var(--accent); }
  .panel {
    position: absolute;
    z-index: 30;
    top: calc(100% + var(--space-1));
    left: 0;
    display: grid;
    gap: var(--space-4);
    width: min(36rem, calc(100vw - 2 * var(--space-4)));
    max-height: min(26rem, 60dvh);
    overflow: auto;
    padding: var(--space-3) var(--space-4);
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
  }
  .sect { display: grid; gap: var(--space-2); }
  .sh { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .chips { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-2); }
  .series { display: grid; gap: var(--space-1); }
  .st { font: var(--type-small); color: var(--text-strong); }
  .hint { margin: 0; font: var(--type-small); color: var(--text-body); }
  .hint :global(svg) { vertical-align: -2px; }
  .note { flex-basis: 100%; margin: 0; font: var(--type-small); color: var(--text-body); }
  @media (max-width: 640px) {
    .search input { width: 8rem; }
    .menu { flex-basis: 100%; }
  }
</style>
