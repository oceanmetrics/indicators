<script lang="ts">
  // the Place view: every indicator that has coverage for one place, one card each, grouped by the chosen vocabulary
  // (leads first, "more in this series" collapsed). each card reads only its own values file and computes its status
  // in the browser with src/status. the view is a permalink: #view=place&place=<id>[&coll=][&vocab=][&method=][&ind=].
  import { onMount, tick } from 'svelte'
  import { Button, Notice } from '@marinebon/ui'
  import { Icon } from '../../../src/icons/index.ts'
  import type { Catalog, VocabId } from './data.ts'
  import { badgeUrl } from './delivery.ts'
  import { METHOD_IDS } from './hash.ts'
  import type { ViewState } from './hash.ts'
  import { indexCoverage, pickRow } from './matrix.ts'
  import { coveredIndicators, groupCards, METHOD_NOTES, placeCoverage } from './place.ts'
  import { asIcon } from './icons.ts'
  import IndicatorCard from './IndicatorCard.svelte'

  interface Props {
    catalog: Catalog
    view: ViewState
    titles: (coll: string) => string
    /** href of "Back to the matrix" */
    backHref: string
    onpatch: (p: Partial<ViewState>) => void
    /** ms from the start of the view until the lead cards have loaded (or failed) */
    onready?: (ms: number) => void
    /** performance.now() when the view was entered; 0 for a cold page */
    t0?: number
  }
  let { catalog, view, titles, backHref, onpatch, onready, t0 = 0 }: Props = $props()

  const VOCABS: { id: VocabId; label: string }[] = [
    { id: 'onms', label: 'ONMS sections' },
    { id: 'names', label: 'NaMES themes' },
    { id: 'eov', label: 'GOOS EOVs' },
  ]
  const base = import.meta.env.BASE_URL

  const found = $derived(placeCoverage(catalog.coverage, view.place ?? ''))
  const place = $derived(found.place)
  const idx = $derived(indexCoverage(found.rows))
  const covered = $derived(place ? coveredIndicators(idx, place.id, catalog.manifest.indicators) : [])
  const groups = $derived(groupCards(covered, catalog.manifest.vocabularies, view.vocab))
  const leadCount = $derived(groups.reduce((n, g) => n + g.series.length, 0))
  const withStatus = $derived(place ? covered.filter(i => pickRow(idx, place.id, i)?.status).length : 0)
  const covRow = (indId: string) => {
    const ind = covered.find(i => i.id === indId)
    return place && ind ? pickRow(idx, place.id, ind) : null
  }

  // ---- ready: every lead card has loaded or failed ----
  let settled = 0
  let reported = false
  function onsettled() {
    settled++
    if (!reported && settled >= leadCount && leadCount > 0) {
      reported = true
      onready?.(Math.round(performance.now() - t0))
      if (view.ind) focusCard()
    }
  }

  // ---- a card the URL points at: its series opens, the page scrolls to it ----
  const openSeries = $state<Record<string, boolean>>({})
  $effect(() => {
    if (!view.ind) return
    for (const g of groups) for (const s of g.series) if (s.more.some(i => i.id === view.ind)) openSeries[`${g.term.id}|${s.series}`] = true
  })
  async function focusCard() {
    await tick()
    const el = document.querySelector<HTMLElement>(`article.card[data-ind="${CSS.escape(view.ind ?? '')}"]`)
    el?.scrollIntoView({ block: 'start' })
    el?.querySelector<HTMLElement>('h4')?.focus?.()
  }

  let title: HTMLElement | undefined = $state()
  onMount(async () => {
    await tick()
    if (view.ind) focusCard()
    else {
      window.scrollTo(0, 0)
      title?.focus({ preventScroll: true })
    }
  })

  const nCards = (g: { series: { more: unknown[] }[] }) => g.series.reduce((n, s) => n + 1 + s.more.length, 0)
  let badgeMissing = $state<Record<string, boolean>>({})
</script>

<div class="pv">
  <p class="crumb"><a class="back" href={backHref}><Icon name="ui-prev" size={16} />Back to the matrix</a></p>

  {#if !place}
    <Notice kind="warn">No indicator has data for <code>{view.place}</code> in this catalog. <a href={backHref}>Back to the matrix</a> to pick a place.</Notice>
  {:else}
    <header class="top">
      <span class="mbon-label">Place · {titles(place.coll)}</span>
      <h2 id="pv-title" tabindex="-1" bind:this={title}>{place.name}</h2>
      <p class="meta"><code>{place.id}</code> <span aria-hidden="true">·</span> collection <code>{place.coll}</code> <span aria-hidden="true">·</span> {covered.length} indicators, {withStatus} with a status relative to their own record</p>
    </header>

    <section class="controls" aria-label="Place view controls">
      <div class="group" role="group" aria-label="Indicators">
        <span class="mbon-label">Group indicators by</span>
        <div class="row">
          {#each VOCABS as v (v.id)}
            <Button variant="quiet" size="sm" pressed={view.vocab === v.id} onclick={() => onpatch({ vocab: v.id })}>{v.label}</Button>
          {/each}
        </div>
      </div>
      <div class="group" role="group" aria-label="Status method">
        <span class="mbon-label">Status method</span>
        <div class="row">
          <Button variant="quiet" size="sm" pressed={view.method == null} onclick={() => onpatch({ method: null })}>Each indicator’s own</Button>
          {#each METHOD_IDS as m (m)}
            <Button variant="quiet" size="sm" pressed={view.method === m} onclick={() => onpatch({ method: m })}>{m}</Button>
          {/each}
        </div>
      </div>
      <p class="note">{view.method ? `${METHOD_NOTES[view.method]} Applies to every continuous indicator at its status grain.` : 'Each card uses the status method the manifest names for its indicator; change one card or all of them.'}</p>
    </section>

    {#each groups as g (g.term.id)}
      {@const gi = asIcon(g.term.glyph)}
      <section class="grp" aria-labelledby="g-{g.term.id}">
        <h3 id="g-{g.term.id}" class="gh">
          {#if view.vocab === 'eov' && !badgeMissing[g.term.id]}
            <img class="badge" src={badgeUrl(base, g.term.id)} alt="{g.term.label} (GOOS EOV badge)" width="32" height="32" onerror={() => (badgeMissing[g.term.id] = true)} />
          {/if}
          {#if gi}<Icon name={gi} size={20} />{/if}
          <span class="mbon-label">{g.term.label}</span>
          <span class="count">{nCards(g)}</span>
        </h3>
        <div class="cards">
          {#each g.series as s (s.series)}
            <IndicatorCard catalog={catalog} ind={s.lead} {place} collTitle={titles(place.coll)} term={g.term} vocab={view.vocab} depth={view.depth}
              method={view.method} cov={covRow(s.lead.id)} focused={view.ind === s.lead.id} {onsettled} />
            {#if s.more.length}
              <details class="more" bind:open={openSeries[`${g.term.id}|${s.series}`]}>
                <summary><span class="mbon-label">More in this series: {s.title}</span> <span class="count">{s.more.length}</span></summary>
                {#if openSeries[`${g.term.id}|${s.series}`]}
                  <div class="cards inner">
                    {#each s.more as ind (ind.id)}
                      <IndicatorCard catalog={catalog} {ind} {place} collTitle={titles(place.coll)} term={g.term} vocab={view.vocab} depth={view.depth}
                        method={view.method} cov={covRow(ind.id)} focused={view.ind === ind.id} />
                    {/each}
                  </div>
                {/if}
              </details>
            {/if}
          {/each}
        </div>
      </section>
    {/each}
    {#if groups.length === 0}<p class="note">No indicator has coverage for this place.</p>{/if}
  {/if}
</div>

<style>
  .pv { display: grid; gap: var(--space-4); min-width: 0; }
  .crumb { margin: 0; }
  .back { display: inline-flex; align-items: center; gap: var(--space-1); font: var(--fw-semibold) var(--text-sm) / 1.2 var(--font-sans); }
  .top { display: grid; gap: var(--space-1); }
  h2 { margin: 0; font: var(--fw-bold) var(--text-xl) / 1.15 var(--font-display); color: var(--text-strong); text-wrap: balance; }
  h2:focus, h2:focus-visible { outline: none; }
  .meta { margin: 0; font: var(--type-small); color: var(--text-body); }
  .controls { display: flex; flex-wrap: wrap; gap: var(--space-3) var(--space-5); align-items: flex-start; }
  .group { display: grid; gap: var(--space-2); min-width: 0; }
  .row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .note { flex-basis: 100%; margin: 0; font: var(--type-small); color: var(--text-body); }
  .grp { display: grid; gap: var(--space-3); min-width: 0; }
  .gh { display: flex; align-items: center; gap: var(--space-2); margin: var(--space-3) 0 0; color: var(--label-color); font-size: inherit; }
  .gh :global(svg) { color: var(--label-color); }
  .badge { width: 32px; height: 32px; border-radius: 50%; flex: none; }
  .count { font: var(--type-label); letter-spacing: 0; color: var(--text-body); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 34rem), 1fr)); gap: var(--space-4); align-items: start; min-width: 0; }
  .more { grid-column: 1 / -1; background: var(--bg-tint); border-radius: var(--radius-md); padding: var(--space-2) var(--space-4); }
  .more > summary { cursor: pointer; padding: var(--space-2) 0; list-style: none; display: flex; align-items: center; gap: var(--space-2); }
  .more > summary::-webkit-details-marker { display: none; }
  .more > summary::before { content: '+'; font: var(--fw-bold) 1rem / 1 var(--font-mono); color: var(--label-color); width: 1rem; }
  .more[open] > summary::before { content: '–'; }
  .inner { margin: var(--space-2) 0 var(--space-3); }
  @media (max-width: 640px) {
    .cards { grid-template-columns: minmax(0, 1fr); }
  }
</style>
