<script lang="ts">
  // the Small multiples layout: one small chart per place and indicator, a row for each indicator (the places along it) or,
  // with places in rows, for each place. a row of one indicator shares one y axis by default (one range for every panel, so
  // the heights compare) or gives each panel its own (the `ys=free` key of the spec; a toggle here). each panel has the
  // place, the status and trend glyphs and the last value. the charts are the Place view's geometry (chart.ts) on the card
  // model (@oceanmetrics/status), so a panel and a card cannot disagree.
  import { Button } from '@marinebon/ui'
  import { Icon } from '../../../../../src/icons/index.ts'
  import type { IconName } from '../../../../../src/icons/index.ts'
  import type { ReportSpec } from '../../../../../src/report/spec.ts'
  import type { Catalog, Indicator } from '../../data.ts'
  import type { Depth } from '../../hash.ts'
  import { pickRow, STATUS_WORDS, TREND_WORDS } from '../../matrix.ts'
  import type { ColumnGroup, CoverageIndex, Place } from '../../matrix.ts'
  import { cellKey, loadCells } from '../cells.ts'
  import type { CellResult } from '../cells.ts'
  import SmallChart from './SmallChart.svelte'
  import { lastText, panelRows, sharedDomain } from './smallMultiples.ts'
  import type { Axes } from './smallMultiples.ts'

  interface Props {
    catalog: Catalog
    idx: CoverageIndex
    spec: ReportSpec
    places: Place[]
    groups: ColumnGroup[]
    depth: Depth
    placeHref: (placeId: string, coll: string) => string
    axes?: Axes
    /** a heading above the rows, when the report is split into sections */
    heading?: string | null
    onyaxis: (y: 'shared' | 'free') => void
  }
  let { catalog, idx, spec, places, groups, depth, placeHref, axes = 'indicators', heading = null, onyaxis }: Props = $props()

  const inds = $derived(groups.flatMap(g => g.indicators))
  const rows = $derived(panelRows(places, inds, axes, (p, i) => pickRow(idx, p.id, i)?.last_value != null))

  let results = $state.raw<Map<string, CellResult>>(new Map())
  $effect(() => {
    const pairs = rows.flatMap(r => r.panels)
    results = new Map()
    return loadCells(catalog, idx, spec, pairs, r => (results = r))
  })
  const pending = $derived(rows.flatMap(r => r.panels).filter(p => !results.has(cellKey(p.place, p.ind))).length)
  const modelOf = (p: { place: Place; ind: Indicator }) => {
    const r = results.get(cellKey(p.place, p.ind))
    return r?.s === 'ok' ? r.model : null
  }

  // the panels' height by depth: the skimmer gets lines only, the diver the sentence under each
  const height = $derived(depth === 'skim' ? 56 : depth === 'dive' ? 124 : 92)
  const shared = $derived(spec.yaxis === 'shared')
  const iconOf = (kind: 'st' | 'tr', v: string | null) => (v ? (`${kind}-${v}` as IconName) : null)
</script>

<section class="sm om-stack" aria-label={heading ?? 'Small multiples'}>
  {#if heading}<h3 class="sh om-st">{heading}</h3>{/if}
  <div class="tools">
    <div class="ctl" role="group" aria-label="Y axis">
      <span class="mbon-label">Y axis</span>
      <Button variant="quiet" size="sm" pressed={shared} onclick={() => onyaxis('shared')}>Shared y axis</Button>
      <Button variant="quiet" size="sm" pressed={!shared} onclick={() => onyaxis('free')}>Free y axis</Button>
    </div>
    {#if pending > 0}<span class="om-note" role="status">Reading {pending} {pending === 1 ? 'record' : 'records'}…</span>{/if}
  </div>

  {#each rows as r (r.key)}
    {@const models = r.panels.map(modelOf)}
    {@const domain = sharedDomain(r.by, spec.yaxis, models)}
    {@const unit = r.by === 'indicator' ? r.panels[0].ind.unit_label : ''}
    <section class="row" aria-labelledby="sm-{r.key}">
      <h4 id="sm-{r.key}">{r.title}{#if unit}<span class="unit"> ({unit})</span>{/if}</h4>
      {#if r.by === 'indicator'}
        <p class="axisnote om-note-s">{domain ? 'One y axis for every place in this row.' : shared ? '' : 'Each place has its own y axis.'}</p>
      {:else}
        <p class="axisnote om-note-s">Each indicator has its own y axis: they differ in unit.</p>
      {/if}
      <ul class="panels" class:skim={depth === 'skim'} class:dive={depth === 'dive'}>
        {#each r.panels as p, n (p.place.id + p.ind.id)}
          {@const m = models[n]}
          <li class="panel" aria-busy={m ? 'false' : 'true'}>
            <div class="top">
              {#if r.by === 'indicator'}
                <a class="name" href={placeHref(p.place.id, p.place.coll)} title="Open the place view of {p.place.name}">{p.place.name}</a>
              {:else}
                <span class="name">{p.ind.short}</span>
              {/if}
              {#if m && m.kind === 'continuous' && m.method !== 'values'}
                <span class="gl" role="img" aria-label="{m.status ? STATUS_WORDS[m.status] : 'no status'}{m.trend ? `, trend ${TREND_WORDS[m.trend]}` : ''}"
                  title="{m.status ? STATUS_WORDS[m.status] : 'no status'}{m.trend ? `, trend ${TREND_WORDS[m.trend]}` : ''}">
                  <Icon name={iconOf('st', m.status) ?? 'st-none'} size={16} />
                  {#if m.trend}<Icon name={iconOf('tr', m.trend)!} size={16} />{/if}
                </span>
              {/if}
            </div>
            {#if !m}
              <p class="wait om-note-s">{results.get(cellKey(p.place, p.ind))?.s === 'error' ? 'The values did not load.' : 'Loading…'}</p>
            {:else if m.kind === 'continuous'}
              <SmallChart model={m} {domain} {height} ticks={depth !== 'skim'} />
              <p class="last">{lastText(m, p.ind)}</p>
              {#if depth === 'dive'}<p class="sent">{m.sentence}</p>{/if}
            {:else}
              <p class="sent">{m.sentence}</p>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/each}
  <p class="note om-note">Statuses are relative to each place's own record, not better or worse. The shaded band is the recent window, the dashed line the long-term mean ± 1 SD of that place.</p>
</section>

<style>
  .tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); }
  .ctl { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); }
  .ctl .mbon-label { margin-right: var(--space-1); }
  .row { display: grid; gap: var(--space-2); min-width: 0; }
  h4 { margin: 0; font: var(--fw-semibold) var(--text-md) / 1.25 var(--font-display); color: var(--text-strong); }
  .unit { font: var(--fw-regular) var(--text-sm) / 1.2 var(--font-mono); color: var(--text-body); }
  .axisnote { margin: 0; }
  .axisnote:empty { display: none; }
  .panels { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3); grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); }
  .panels.skim { grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr)); }
  .panels.dive { grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); }
  .panel { display: grid; gap: var(--space-1); align-content: start; min-width: 0; padding: var(--space-2) var(--space-3); background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-md); break-inside: avoid; }
  .top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); min-width: 0; }
  .name { min-width: 0; overflow-wrap: anywhere; font: var(--fw-semibold) var(--text-sm) / 1.25 var(--font-sans); color: var(--text-strong); }
  a.name { text-decoration: underline; text-decoration-color: var(--border-strong); text-underline-offset: 3px; }
  a.name:hover { color: var(--link); text-decoration-color: currentColor; }
  .gl { flex: none; display: inline-flex; gap: 2px; color: var(--text-strong); }
  .last { margin: 0; font: var(--fw-regular) 0.75rem / 1.3 var(--font-mono); color: var(--text-body); }
  .sent { margin: 0; font: var(--type-small); color: var(--text-body); text-wrap: pretty; }
  .wait { margin: 0; min-height: 4rem; }
  .note { margin: 0; }
  @media print {
    .tools { display: none; }
    .panels { grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); }
  }
</style>
