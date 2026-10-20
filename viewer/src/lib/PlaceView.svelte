<script lang="ts">
  // the Place view: every indicator that has coverage for one place, one card each, grouped by the chosen vocabulary
  // (leads first, "more in this series" collapsed). each card reads only its own values file and computes its status
  // in the browser with src/status. the view is a permalink: #view=place&place=<id>[&coll=][&vocab=][&method=][&ind=].
  // with `ind=` the indicator the reader opened comes first ("You opened"): its card, or, when the place has no values
  // for it, a "not computed yet" card with the ways forward. a breadcrumb leads back to the Matrix cell it came from.
  import { onMount, tick, untrack } from 'svelte'
  import { Button, Notice } from '@marinebon/ui'
  import { Icon } from '../../../src/icons/index.ts'
  import { gazetteerPlaceHref } from './data.ts'
  import type { Catalog, Layers } from './data.ts'
  import { badgeUrl } from './delivery.ts'
  import { groupHref, METHOD_IDS, placeHref } from './hash.ts'
  import type { ViewState } from './hash.ts'
  import { cellModel, indexCoverage, pickRow, shortPlaceName, STATE_WORDS } from './matrix.ts'
  import { computedGroups } from './nextSteps.ts'
  import NextSteps from './NextSteps.svelte'
  import { coveredIndicators, groupCards, METHOD_NOTES, placeCoverage } from './place.ts'
  import { asIcon } from './icons.ts'
  import IndicatorCard from './IndicatorCard.svelte'
  import PlacePicker from './pick/PlacePicker.svelte'
  import IndicatorPicker from './pick/IndicatorPicker.svelte'
  import { placesWithValue } from './pick/indicatorsTree.ts'
  import { placeLabel } from './pick/places.ts'
  import type { CoverageIndex } from './matrix.ts'

  interface Props {
    catalog: Catalog
    view: ViewState
    titles: (coll: string) => string
    /** every place's coverage (the place picker's list) and the gazetteer's layers */
    idxAll: CoverageIndex
    layers?: Layers
    /** href of "Back to the matrix" (the Matrix state the reader came from, with the cell it opened this place from) */
    backHref: string
    onpatch: (p: Partial<ViewState>) => void
    /** ms from the start of the view until the lead cards have loaded (or failed) */
    onready?: (ms: number) => void
    /** performance.now() when the view was entered; 0 for a cold page */
    t0?: number
  }
  let { catalog, view, titles, idxAll, layers = {}, backHref, onpatch, onready, t0 = 0 }: Props = $props()

  const base = import.meta.env.BASE_URL

  const found = $derived(placeCoverage(catalog.coverage, view.place ?? ''))
  const place = $derived(found.place)
  const idx = $derived(indexCoverage(found.rows))
  const covered = $derived(place ? coveredIndicators(idx, place.id, catalog.manifest.indicators) : [])
  // the indicator the reader opened, when the place has values for it (its card first) or not (a card with the ways forward)
  const opened = $derived(view.ind ? catalog.manifest.indicators.find(i => i.id === view.ind) ?? null : null)
  const openedHere = $derived(opened != null && covered.some(i => i.id === opened.id))
  const openedModel = $derived(opened && place && !openedHere ? cellModel(opened, place, null) : null)
  // the cards below hold the others: the opened one is above, not twice
  const rest = $derived(openedHere ? covered.filter(i => i.id !== opened?.id) : covered)
  const groups = $derived(groupCards(rest, catalog.manifest.vocabularies, view.vocab))
  // every place's rows, only when a not-offered indicator asks which groups it is computed for
  const allIdx = $derived(openedModel?.kind === 'na' ? indexCoverage(catalog.coverage) : null)
  const openedGroup = $derived(openedModel?.kind === 'na' && opened && allIdx ? computedGroups(allIdx, opened) : [])
  const leadCount = $derived(groups.reduce((n, g) => n + g.series.length, 0) + (openedHere ? 1 : 0))
  const withStatus = $derived(place ? covered.filter(i => pickRow(idx, place.id, i)?.status).length : 0)
  const covRow = (indId: string) => {
    const ind = covered.find(i => i.id === indId)
    return place && ind ? pickRow(idx, place.id, ind) : null
  }

  // ---- the pickers: another place (keeping the indicator when it has it), another indicator (its card comes first) ----
  const chosenInd = $derived(new Set(view.ind ? [view.ind] : []))
  const hasHere = $derived(placesWithValue(idx, place ? [place] : [], catalog.manifest.indicators))
  function choosePlace(c: { coll: string; placeId: string | null }) {
    if (!c.placeId) return
    const keep = view.ind && catalog.manifest.indicators.some(i => i.id === view.ind && pickRow(idxAll, c.placeId!, i)?.last_value != null)
    onpatch({ place: c.placeId, coll: c.coll, ind: keep ? view.ind : null, cell: null })
  }
  let lastInd = untrack(() => view.ind)
  $effect(() => { if (view.ind !== lastInd) { lastInd = view.ind; if (view.ind) focusCard() } })

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
    if (!el) { title?.focus({ preventScroll: true }); return }
    // the opened indicator is the first card: show the page from its top (breadcrumb, place) rather than the card alone
    if (el.closest('.you')) window.scrollTo(0, 0)
    else el.scrollIntoView({ block: 'start' })
    el.querySelector<HTMLElement>('h4')?.focus?.({ preventScroll: true })
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
  {#if !place}
    <p class="crumb"><a class="back" href={backHref}><Icon name="ui-prev" size={16} />Back to the matrix</a></p>
    <Notice kind="warn">No indicator has data for <code>{view.place}</code> in this catalog. <a href={backHref}>Back to the matrix</a> to pick a place.</Notice>
  {:else}
    <nav class="crumb" aria-label="Breadcrumb">
      <ol>
        <li><a class="back" href={backHref}><Icon name="ui-prev" size={16} />Matrix</a></li>
        {#if opened}
          <li><a href={placeHref(view, place.id, place.coll)}>{shortPlaceName(place.name)}</a></li>
          <li aria-current="page">{opened.short}</li>
        {:else}
          <li aria-current="page">{shortPlaceName(place.name)}</li>
        {/if}
      </ol>
    </nav>
    <header class="top">
      <span class="mbon-label">Place · {titles(place.coll)}</span>
      <h2 class="om-h2" id="pv-title" tabindex="-1" bind:this={title}>{place.name}</h2>
      <p class="meta om-meta"><code>{place.id}</code> <span aria-hidden="true">·</span> <a href={gazetteerPlaceHref(place.coll, place.id)} target="_blank" rel="noopener">in the gazetteer<Icon name="ui-external" size={14} /><span class="mbon-sr-only"> (opens in a new tab)</span></a> <span aria-hidden="true">·</span> {covered.length} indicators, {withStatus} with a status relative to their own record</p>
    </header>

    <section class="controls om-controls" aria-label="Place view controls">
      <PlacePicker mode="place" idx={idxAll} universe={idxAll.places} {layers} label={placeLabel(place)} current={place.id} onchoose={choosePlace} />
      <IndicatorPicker mode="single" label={opened ? opened.short : 'Jump to an indicator'} indicators={catalog.manifest.indicators} vocabs={catalog.manifest.vocabularies}
        vocab={view.vocab} onvocab={v => onpatch({ vocab: v })} chosen={chosenInd} withValues={hasHere} nPlaces={1} canShowEmpty
        hintOf={i => (hasHere.get(i.id)?.size ? '' : 'not computed yet')} onchoose={id => onpatch({ ind: id })} />
      <div class="group om-stack-s" role="group" aria-label="Status method">
        <span class="mbon-label">Status method</span>
        <div class="row om-row">
          <Button variant="quiet" size="sm" pressed={view.method == null} onclick={() => onpatch({ method: null })}>Each indicator’s own</Button>
          {#each METHOD_IDS as m (m)}
            <Button variant="quiet" size="sm" pressed={view.method === m} onclick={() => onpatch({ method: m })}>{m}</Button>
          {/each}
        </div>
      </div>
      <p class="note om-note-w">{view.method ? `${METHOD_NOTES[view.method]} Applies to every continuous indicator at its status grain.` : 'Each card uses the status method the manifest names for its indicator; change one card or all of them.'}</p>
    </section>

    {#if opened}
      {@const term = catalog.manifest.vocabularies[view.vocab].terms.find(t => t.id === opened.category[view.vocab]) ?? { id: 'other', label: 'Other' }}
      <section class="you om-stack-s" aria-labelledby="you-h">
        <h3 id="you-h" class="mbon-label">You opened</h3>
        {#if openedHere}
          {#key opened.id}<IndicatorCard catalog={catalog} ind={opened} {place} collTitle={titles(place.coll)} {term} vocab={view.vocab} depth={view.depth}
            method={view.method} cov={covRow(opened.id)} focused {onsettled} />{/key}
        {:else if openedModel}
          <article class="card pending" data-ind={opened.id} data-kind={openedModel.kind} aria-labelledby="t-pending">
            <h4 id="t-pending" tabindex="-1">{opened.title}</h4>
            <p class="state"><Icon name={openedModel.stateIcon ?? 'cell-na'} size={18} />{openedModel.kind === 'na' ? `Not offered for ${titles(place.coll)}` : STATE_WORDS[openedModel.kind === 'live' ? 'live' : 'nodata']}</p>
            <NextSteps ind={opened} {place} kind={openedModel.kind as 'live' | 'nodata' | 'na'} reason={openedModel.reason} groupTitle={titles(place.coll)}
              groups={openedGroup} titles={titles} groupHref={c => groupHref(view, c)} />
          </article>
        {/if}
      </section>
      {#if groups.length}<h3 class="mbon-label all">Other indicators for this place</h3>{/if}
    {/if}

    {#each groups as g (g.term.id)}
      {@const gi = asIcon(g.term.glyph)}
      <section class="grp om-stack" aria-labelledby="g-{g.term.id}">
        <h3 id="g-{g.term.id}" class="gh">
          {#if view.vocab === 'eov' && !badgeMissing[g.term.id]}
            <img class="badge" src={badgeUrl(base, g.term.id)} alt="{g.term.label} (GOOS EOV badge)" width="32" height="32" onerror={() => (badgeMissing[g.term.id] = true)} />
          {/if}
          {#if gi}<Icon name={gi} size={20} />{/if}
          <span class="mbon-label">{g.term.label}</span>
          <span class="count om-count">{nCards(g)}</span>
        </h3>
        <div class="cards om-cards">
          {#each g.series as s (s.series)}
            <IndicatorCard catalog={catalog} ind={s.lead} {place} collTitle={titles(place.coll)} term={g.term} vocab={view.vocab} depth={view.depth}
              method={view.method} cov={covRow(s.lead.id)} focused={view.ind === s.lead.id} {onsettled} />
            {#if s.more.length}
              <details class="more" bind:open={openSeries[`${g.term.id}|${s.series}`]}>
                <summary><span class="mbon-label">More in this series: {s.title}</span> <span class="count om-count">{s.more.length}</span></summary>
                {#if openSeries[`${g.term.id}|${s.series}`]}
                  <div class="cards inner om-cards">
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
    {#if groups.length === 0}<p class="note om-note-w">No indicator has coverage for this place.</p>{/if}
  {/if}
</div>

<style>
  .pv { display: grid; gap: var(--space-4); min-width: 0; }
  .crumb ol { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); font: var(--type-small); color: var(--text-body); }
  .crumb li + li::before { content: '\203A'; margin-right: var(--space-1); color: var(--text-body); }
  .crumb [aria-current] { color: var(--text-strong); font-weight: var(--fw-semibold); }
  .you > h3, .all { margin: var(--space-2) 0 0; color: var(--label-color); }
  .pending { display: grid; gap: var(--space-2); padding: var(--space-4); background: var(--bg-surface); border: 1px solid var(--accent); box-shadow: 0 0 0 2px var(--accent); border-radius: var(--radius-md); max-width: 34rem; min-width: 0; }
  .pending h4 { margin: 0; font: var(--fw-semibold) var(--text-md) / 1.25 var(--font-display); color: var(--text-strong); }
  .pending h4:focus { outline: none; }
  .state { margin: 0; display: flex; align-items: center; gap: var(--space-2); font: var(--type-small); color: var(--text-body); }
  .back { display: inline-flex; align-items: center; gap: var(--space-1); font: var(--fw-semibold) var(--text-sm) / 1.2 var(--font-sans); }
  .top { display: grid; gap: var(--space-1); min-width: 0; }
  .gh { display: flex; align-items: center; gap: var(--space-2); margin: var(--space-3) 0 0; color: var(--label-color); font-size: inherit; }
  .gh :global(svg) { color: var(--label-color); }
  .badge { width: 32px; height: 32px; border-radius: 50%; flex: none; }
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
