<script lang="ts">
  // the Scorecard layout: places x indicators, each cell a status glyph and a trend glyph (the value too from the
  // swimmer level on). statuses are read from the coverage rows; when the spec's method, window, baseline or years differ
  // from an indicator's own, they are recomputed here from the place's values with src/status. with a status method on,
  // places and indicators are sorted exceptions first. on a phone the table becomes one card per place.
  import { onMount } from 'svelte'
  import { Icon } from '../../../../src/icons/index.ts'
  import type { StatusResult } from '../../../../src/status/index.ts'
  import type { ReportSpec } from '../../../../src/report/spec.ts'
  import type { Catalog, Indicator } from '../data.ts'
  import { valuesUrl } from '../delivery.ts'
  import type { Depth } from '../hash.ts'
  import { pickRow } from '../matrix.ts'
  import type { ColumnGroup, CoverageIndex, Place } from '../matrix.ts'
  import { asIcon } from '../icons.ts'
  import { loadPlaceRows } from '../valuesData.ts'
  import { byScore, exceptionWeight } from './report.ts'
  import { needsRecompute, recomputeStatus, scoreCell } from './scorecard.ts'
  import type { ScoreCell } from './scorecard.ts'
  import MatrixLegend from '../MatrixLegend.svelte'

  interface Props {
    catalog: Catalog
    idx: CoverageIndex
    spec: ReportSpec
    places: Place[]
    groups: ColumnGroup[]
    depth: Depth
    vocab: 'onms' | 'names' | 'eov'
    titles: (coll: string) => string
    placeHref: (placeId: string, coll: string) => string
    /** a heading above the table, when the report is split into sections */
    heading?: string | null
  }
  let { catalog, idx, spec, places, groups, depth, vocab, titles, placeHref, heading = null }: Props = $props()

  const key = (p: Place, i: Indicator) => `${p.id}\u0000${i.id}`
  const inds = $derived(groups.flatMap(g => g.indicators))
  const rowOf = (p: Place, i: Indicator) => pickRow(idx, p.id, i)

  // ---- statuses recomputed for a style the coverage rows do not hold ----
  let results = $state.raw<Map<string, StatusResult>>(new Map())
  let pending = $state(0)
  let failed = $state(0)
  $effect(() => {
    const s = spec
    const ps = places
    const is = inds
    let live = true
    results = new Map()
    failed = 0
    const todo = is.filter(i => ps.some(p => needsRecompute(i, rowOf(p, i), s)))
    pending = todo.length
    if (!todo.length) return
    ;(async () => {
      const acc = new Map<string, StatusResult>()
      let bad = 0
      for (const i of todo) {
        await Promise.all(ps.map(async p => {
          const row = rowOf(p, i)
          if (!needsRecompute(i, row, s)) return
          const url = valuesUrl(catalog.base, i, row!.coll)
          try {
            acc.set(key(p, i), recomputeStatus(i, p, url ? await loadPlaceRows(url, p.id) : [], s))
          } catch { bad++ }
        }))
        if (!live) return
        results = new Map(acc)
        failed = bad
        pending--
      }
    })()
    return () => { live = false }
  })

  const cells = $derived.by(() => {
    const m = new Map<string, ScoreCell>()
    for (const p of places) for (const i of inds) m.set(key(p, i), scoreCell(i, p, rowOf(p, i), results.get(key(p, i)) ?? null))
    return m
  })
  const cell = (p: Place, i: Indicator) => cells.get(key(p, i))!

  // ---- exceptions first, inside each collection and each category ----
  const sorting = $derived(spec.style.status !== 'values')
  const shownGroups = $derived(!sorting ? groups : groups.map(g => ({ ...g, indicators: byScore(g.indicators, i => places.reduce((n, p) => n + exceptionWeight(cell(p, i).rank), 0)) })))
  const flat = $derived(shownGroups.flatMap(g => g.indicators))
  const rows = $derived.by(() => {
    const colls = [...new Set(places.map(p => p.coll))]
    return colls.map(c => {
      const mine = places.filter(p => p.coll === c)
      return { coll: c, places: sorting ? byScore(mine, p => inds.reduce((n, i) => n + exceptionWeight(cell(p, i).rank), 0)) : mine }
    })
  })

  // ---- a phone gets one card per place ----
  let narrow = $state(false)
  onMount(() => {
    const mq = matchMedia('(max-width: 640px)')
    narrow = mq.matches
    const on = () => (narrow = mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  })
  const ex = $derived(sorting ? 'Places and indicators are sorted with out-of-range statuses and strong trends first.' : 'Values only: no status is drawn.')
</script>

{#snippet glyphs(c: ScoreCell)}
  {#if c.kind === 'value' || c.kind === 'class'}
    <span class="g" role="img" aria-label={c.aria} title={c.aria}>
      {#if c.statusIcon}<span class="st"><Icon name={c.statusIcon} size={18} /></span>{/if}
      {#if c.trendIcon}<span class="tr"><Icon name={c.trendIcon} size={18} /></span>{/if}
      {#if c.value && (depth !== 'skim' || c.kind === 'class' || !c.statusIcon)}<span class="v">{c.value}</span>{/if}
    </span>
  {:else if c.stateIcon}
    <span class="g state" role="img" aria-label={c.aria} title={c.aria}><Icon name={c.stateIcon} size={18} /></span>
  {/if}
{/snippet}

<section class="sc om-stack" aria-label={heading ?? 'Scorecard'}>
  {#if heading}<h3 class="sh om-st">{heading}</h3>{/if}
  {#if pending > 0}<p class="note om-note" role="status">Recomputing statuses for this style ({pending} of {inds.length} indicators to go)…</p>{/if}
  {#if failed > 0}<p class="note om-note" role="status">{failed} cells kept their default status: their values could not be read.</p>{/if}

  {#if narrow}
    <div class="cards">
      {#each rows as r (r.coll)}
        <h4 class="coll mbon-label">{titles(r.coll)} · {r.places.length}</h4>
        {#each r.places as p (p.id)}
          <article class="pc">
            <h5><a href={placeHref(p.id, p.coll)}>{p.name}</a></h5>
            <ul>
              {#each flat as i (i.id)}
                {@const c = cell(p, i)}
                {#if c.kind === 'value' || c.kind === 'class'}
                  <li>{@render glyphs(c)}<span class="it">{i.short}</span></li>
                {/if}
              {/each}
            </ul>
          </article>
        {/each}
      {/each}
    </div>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="box" role="region" aria-label="{heading ?? 'Scorecard'}: places by indicators" tabindex="0">
      <table class="om-t" class:wide={depth !== 'skim'}>
        <thead>
          <tr class="groups">
            <th class="corner" scope="col" rowspan="2"><span class="mbon-label">Place</span></th>
            {#each shownGroups as g (g.term.id)}
              {@const gi = asIcon(g.term.glyph)}
              <th scope="colgroup" colspan={g.indicators.length} class="group"><span class="gh">{#if gi}<Icon name={gi} size={16} />{/if}<span class="mbon-label">{g.term.label}</span></span></th>
            {/each}
          </tr>
          <tr class="heads">
            {#each flat as i (i.id)}
              <th scope="col" class="ih" title={i.title}><span class="t">{i.short}</span></th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.coll)}
            <tr class="band"><th scope="colgroup" colspan={flat.length + 1}><span class="mbon-label">{titles(r.coll)} · {r.places.length}</span></th></tr>
            {#each r.places as p (p.id)}
              <tr>
                <th scope="row" class="rh"><a href={placeHref(p.id, p.coll)} title="Open the place view of {p.name}">{p.name}</a></th>
                {#each flat as i (i.id)}
                  <td data-kind={cell(p, i).kind}>{@render glyphs(cell(p, i))}</td>
                {/each}
              </tr>
            {/each}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
  <p class="note om-note">{ex} Statuses are relative to each place's own record, not better or worse.</p>
  {#if !heading}<MatrixLegend {vocab} />{/if}
</section>

<style>
  .box { overflow: auto; max-height: min(78dvh, 60rem); background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-md); overscroll-behavior: contain; }
  .box:focus-visible { outline-offset: 2px; }
  td { min-width: 3.25rem; width: 3.25rem; height: 2.5rem; text-align: center; vertical-align: middle; border-right: 1px solid var(--divider); }
  table.wide td { min-width: 5.25rem; width: 5.25rem; height: 3rem; }
  thead tr.groups th { top: 0; height: 2.25rem; padding: 0 var(--space-2); border-bottom: 1px solid var(--border); border-right: 1px solid var(--divider); vertical-align: middle; }
  thead tr.heads th { top: 2.25rem; vertical-align: bottom; border-bottom: 1px solid var(--border-strong); border-right: 1px solid var(--divider); padding: var(--space-2) var(--space-1); height: 9.5rem; }
  .gh { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--label-color); position: sticky; left: 12rem; white-space: nowrap; }
  .gh :global(svg) { color: var(--label-color); }
  .ih .t { display: block; writing-mode: vertical-rl; transform: rotate(180deg); max-height: 8.5rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0 auto; font: var(--fw-semibold) var(--text-xs) / 1.2 var(--font-sans); color: var(--text-strong); }
  th.corner, th.rh { position: sticky; left: 0; min-width: 12rem; width: 12rem; max-width: 12rem; padding: var(--space-2) var(--space-3); background: var(--bg-surface); border-right: 1px solid var(--border); }
  thead th.corner { z-index: 4; top: 0; vertical-align: bottom; }
  th.rh { z-index: 2; font: var(--fw-medium) var(--text-sm) / 1.25 var(--font-sans); }
  th.rh a { color: var(--text-strong); text-decoration: underline; text-decoration-color: var(--border-strong); text-underline-offset: 3px; }
  th.rh a:hover { color: var(--link); text-decoration-color: currentColor; }
  .g { display: inline-flex; align-items: center; justify-content: center; gap: 2px; flex-wrap: wrap; max-width: 100%; }
  .st { color: var(--text-strong); display: inline-flex; }
  .tr { color: var(--text-body); display: inline-flex; }
  .state { color: var(--text-body); opacity: 0.7; }
  .v { flex-basis: 100%; font: var(--fw-regular) 0.6875rem / 1.2 var(--font-mono); color: var(--text-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  td[data-kind='class'] .v { white-space: normal; max-width: 6rem; }
  .cards { display: grid; gap: var(--space-3); }
  .coll { margin: var(--space-2) 0 0; }
  .pc { padding: var(--space-3); background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-md); break-inside: avoid; }
  .pc h5 { margin: 0 0 var(--space-2); font: var(--fw-semibold) var(--text-md) / 1.25 var(--font-display); }
  .pc h5 a { color: var(--text-strong); }
  .pc ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); }
  .pc li { display: flex; align-items: center; gap: var(--space-2); font: var(--type-small); color: var(--text-strong); }
  .pc li .g { flex: none; justify-content: flex-start; min-width: 4.5rem; flex-wrap: nowrap; }
  .pc li .v { flex-basis: auto; margin-left: var(--space-1); }
  .pc .it { min-width: 0; overflow-wrap: anywhere; }
</style>
