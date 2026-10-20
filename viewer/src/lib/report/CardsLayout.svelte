<script lang="ts">
  // the Cards layout (NaMES-like): one section per place, tabs by category of the current vocabulary, one card per
  // indicator. the cards are the Place view's IndicatorCard, so status, sentence and chart are the same. with a status
  // method on, a tab lists exceptions first. skimmer level shows the headline and glyphs only, no chart.
  import { tick } from 'svelte'
  import { Icon } from '../../../../src/icons/index.ts'
  import type { IconName } from '../../../../src/icons/index.ts'
  import { exceptionRank } from '../../../../src/report/spec.ts'
  import type { ReportSpec } from '../../../../src/report/spec.ts'
  import type { Catalog, Indicator, Term, VocabId } from '../data.ts'
  import type { Depth } from '../hash.ts'
  import { cellModel, pickRow, STATUS_WORDS, TREND_WORDS } from '../matrix.ts'
  import type { ColumnGroup, CoverageIndex, Place } from '../matrix.ts'
  import { asIcon } from '../icons.ts'
  import IndicatorCard from '../IndicatorCard.svelte'
  import { byScore } from './report.ts'
  import { methodFor, recentFor } from './scorecard.ts'

  interface Props {
    catalog: Catalog
    idx: CoverageIndex
    spec: ReportSpec
    places: Place[]
    groups: ColumnGroup[]
    depth: Depth
    vocab: VocabId
    titles: (coll: string) => string
    placeHref: (placeId: string, coll: string) => string
    /** every category one after another, no tabs (printing) */
    all?: boolean
  }
  let { catalog, idx, spec, places, groups, depth, vocab, titles, placeHref, all = false }: Props = $props()

  const sorting = $derived(spec.style.status !== 'values')
  // the tab chosen per place; the first category with an indicator here by default
  let chosen = $state<Record<string, string>>({})

  // a place's categories: the groups' indicators that have a value here, exceptions first when a method is on
  function tabsOf(p: Place) {
    return groups.map(g => {
      const mine = g.indicators.filter(i => pickRow(idx, p.id, i)?.last_value != null)
      const rank = (i: Indicator) => { const r = pickRow(idx, p.id, i); return exceptionRank(r?.status, r?.trend) }
      return { term: g.term, indicators: sorting ? byScore(mine, i => 3 - rank(i)) : mine }
    }).filter(t => t.indicators.length)
  }
  const activeOf = (p: Place, tabs: ReturnType<typeof tabsOf>) => tabs.find(t => t.term.id === chosen[p.id]) ?? tabs[0]

  async function onkey(e: KeyboardEvent, p: Place, tabs: ReturnType<typeof tabsOf>) {
    const at = tabs.findIndex(t => t.term.id === activeOf(p, tabs)?.term.id)
    const to = e.key === 'ArrowRight' ? (at + 1) % tabs.length : e.key === 'ArrowLeft' ? (at - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1
    if (to < 0) return
    e.preventDefault()
    chosen[p.id] = tabs[to].term.id
    await tick()
    document.getElementById(`tab-${p.id}-${tabs[to].term.id}`)?.focus()
  }
  const glyphOf = (g: string | undefined) => asIcon(g) as IconName | null
</script>

{#snippet panel(p: Place, t: { term: Term; indicators: Indicator[] })}
            {#if depth === 'skim'}
              <ul class="heads">
                {#each t.indicators as i (i.id)}
                  {@const m = cellModel(i, p, pickRow(idx, p.id, i))}
                  <li>
                    <span class="gl">
                      {#if m.statusIcon}<Icon name={m.statusIcon} size={20} />{/if}
                      {#if m.trendIcon}<Icon name={m.trendIcon} size={20} />{/if}
                    </span>
                    <span class="tx">
                      <strong>{i.short}</strong>
                      <span>{m.row?.sentence ?? ''}</span>
                      {#if m.row?.status}<span class="w">{STATUS_WORDS[m.row.status]}{m.row.trend ? `, trend ${TREND_WORDS[m.row.trend]}` : ''}</span>{/if}
                    </span>
                  </li>
                {/each}
              </ul>
            {:else}
              <div class="grid">
                {#each t.indicators as i (i.id)}
                  <IndicatorCard {catalog} uid="{p.id}-" ind={i} place={p} collTitle={titles(p.coll)} term={t.term} {vocab} {depth} method={methodFor(i, spec)} cov={pickRow(idx, p.id, i)}
                    opts={{ recent: recentFor(i, spec), baseline: spec.style.baseline, from: spec.time.from, to: spec.time.to }} />
                {/each}
              </div>
            {/if}
{/snippet}

<div class="cl">
  {#each places as p (p.id)}
    {@const tabs = tabsOf(p)}
    {@const active = activeOf(p, tabs)}
    <section class="place" aria-labelledby="pl-{p.id}">
      <header>
        <span class="mbon-label">{titles(p.coll)}</span>
        <h3 id="pl-{p.id}"><a href={placeHref(p.id, p.coll)}>{p.name}</a></h3>
      </header>
      {#if tabs.length === 0}
        <p class="empty">No chosen indicator has a value here.</p>
      {:else}
        {#if !all}
        <div class="tabs" role="tablist" aria-label="Categories for {p.name}">
          {#each tabs as t (t.term.id)}
            {@const gi = glyphOf(t.term.glyph)}
            <button type="button" role="tab" id="tab-{p.id}-{t.term.id}" aria-selected={active?.term.id === t.term.id} aria-controls="panel-{p.id}" tabindex={active?.term.id === t.term.id ? 0 : -1}
              onclick={() => (chosen[p.id] = t.term.id)} onkeydown={e => onkey(e, p, tabs)}>
              {#if gi}<Icon name={gi} size={16} />{/if}{t.term.label} <span class="n">{t.indicators.length}</span>
            </button>
          {/each}
        </div>
        {/if}
        {#if all}
          {#each tabs as t (t.term.id)}
            <h4 class="cat">{t.term.label}</h4>
            <div class="panel">{@render panel(p, t)}</div>
          {/each}
        {:else if active}
          <div class="panel" role="tabpanel" id="panel-{p.id}" aria-labelledby="tab-{p.id}-{active.term.id}">
            {@render panel(p, active)}
          </div>
        {/if}
      {/if}
    </section>
  {/each}
</div>

<style>
  .cl { display: grid; gap: var(--space-6); min-width: 0; }
  .place { display: grid; gap: var(--space-3); min-width: 0; }
  header { display: grid; gap: var(--space-1); }
  h3 { margin: 0; font: var(--fw-bold) var(--text-lg) / 1.2 var(--font-display); color: var(--text-strong); }
  h3 a { color: inherit; text-decoration: none; }
  h3 a:hover { color: var(--link); text-decoration: underline; }
  .cat { margin: var(--space-3) 0 0; font: var(--fw-semibold) var(--text-md) / 1.25 var(--font-display); color: var(--text-strong); }
  .empty { margin: 0; font: var(--type-small); color: var(--text-body); }
  .tabs { display: flex; flex-wrap: wrap; gap: var(--space-1); border-bottom: 1px solid var(--border); }
  .tabs button {
    display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); margin-bottom: -1px;
    border: 0; border-bottom: 2px solid transparent; background: none; cursor: pointer; color: var(--text-body); font: var(--fw-semibold) var(--text-sm) / 1.2 var(--font-sans);
  }
  .tabs button:hover { color: var(--text-strong); border-bottom-color: var(--border-strong); }
  .tabs button[aria-selected='true'] { color: var(--text-strong); border-bottom-color: var(--brand); }
  .tabs :global(svg) { color: var(--label-color); }
  .n { font: var(--type-label); letter-spacing: 0; color: var(--text-body); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 34rem), 1fr)); gap: var(--space-4); align-items: start; min-width: 0; }
  .heads { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
  .heads li { display: flex; gap: var(--space-3); padding: var(--space-2) var(--space-3); background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-md); break-inside: avoid; }
  .gl { flex: none; display: inline-flex; gap: var(--space-1); min-width: 3rem; color: var(--text-strong); }
  .tx { display: grid; gap: 2px; font: var(--type-small); color: var(--text-body); min-width: 0; }
  .tx strong { color: var(--text-strong); }
  .w { font: var(--fw-regular) 0.75rem / 1.3 var(--font-mono); }
  @media (max-width: 640px) { .grid { grid-template-columns: minmax(0, 1fr); } .tabs { overflow-x: auto; flex-wrap: nowrap; } .tabs button { flex: none; } }
</style>
