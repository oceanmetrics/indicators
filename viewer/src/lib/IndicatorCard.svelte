<script lang="ts">
  // one indicator for the place. the words are the places page's card (@oceanmetrics/catalog `cardsFor`, via placeCard):
  // title, status word, sentence, method, the citation with the place clause and the Reproduce block. what only the viewer
  // has is added around them: the category glyph (and the GOOS badge for the EOV grouping), the status recomputed in the
  // browser with @oceanmetrics/status (the same as coverage's for the manifest's method; another method on request), the
  // chart, a grain toggle and a method switch, a table, downloads of this place's rows and the four elements. loads only
  // its own values file; its loading and its errors are its own.
  import { Button } from '@marinebon/ui'
  import { placeCitation, valuesUrl } from '@oceanmetrics/catalog/cards'
  import { Icon } from '../../../src/icons/index.ts'
  import type { IconName } from '../../../src/icons/index.ts'
  import { fmt, METHOD_NOTES, periodLabel, STATUS_NOTE, STATUS_WORDS, TREND_WORDS } from '@oceanmetrics/status'
  import type { MethodId, Grain } from '@oceanmetrics/status'
  import type { CoverageRow } from '../../../src/coverage/build.ts'
  import type { Catalog, Indicator, Term, VocabId } from './data.ts'
  import { badgeUrl } from './delivery.ts'
  import { GOOS_CREDIT } from './credits.ts'
  import { downloadBlob } from './download.ts'
  import type { Depth } from './hash.ts'
  import { valuesCollOf } from './matrix.ts'
  import { breakParts } from './wrap.ts'
  import type { Place } from './matrix.ts'
  import { cardModel, defaultMethod, fileName, METHOD_IDS, placeCard, placeCsv } from './place.ts'
  import type { CardOptions } from './place.ts'
  import { loadPlaceRows } from './valuesData.ts'
  import type { PlaceRow } from './valuesData.ts'
  import { asIcon } from './icons.ts'
  import CopyButton from './CopyButton.svelte'
  import Elements from './Elements.svelte'
  import StackChart from './StackChart.svelte'
  import TimeChart from './TimeChart.svelte'

  interface Props {
    catalog: Catalog
    ind: Indicator
    place: Place
    collTitle: string
    /** the group's term: its glyph marks the card */
    term: Term
    vocab: VocabId
    depth: Depth
    /** the page-wide method override (#method=), null for each indicator's own */
    method: MethodId | null
    /** the coverage row at the status grain, for the sentence shown while the values load */
    cov: CoverageRow | null
    /** the card the URL points at */
    focused?: boolean
    /** called once when the values have loaded or failed */
    onsettled?: () => void
    /** a report's style: the recent window, a baseline and the years kept (the Place view passes none) */
    opts?: Pick<CardOptions, 'recent' | 'baseline' | 'from' | 'to'>
    /** a prefix for the card's element ids, when the same indicator is drawn for several places on one page */
    uid?: string
    /** a still figure (the embed route's fig=1): title, sentence, glyphs, chart and citation, no controls */
    still?: boolean
  }
  let { catalog, ind, place, collTitle, term, vocab, depth, method, cov, focused = false, onsettled, opts = {}, uid = "", still = false }: Props = $props()

  type Load = { s: 'loading' } | { s: 'ok'; rows: PlaceRow[] } | { s: 'error'; msg: string }
  let load = $state.raw<Load>({ s: 'loading' })
  let localMethod = $state<MethodId | null>(null)
  let grain = $state<Grain | null>(null)
  let table = $state(false)
  let tries = $state(0)
  let badgeOk = $state(true)

  // the places page's card of this place and indicator, from its coverage row (null without one)
  const card = $derived(placeCard(catalog.manifest, ind, place.id, cov, catalog.base))
  const url = $derived(card ? card.reproduce.valuesUrl : valuesUrl(catalog.base, ind, valuesCollOf(ind, place, cov)))
  $effect(() => {
    void tries
    const u = url
    let live = true
    load = { s: 'loading' }
    if (!u) { load = { s: 'error', msg: 'The manifest lists no values file for this place’s collection.' }; onsettled?.(); return }
    loadPlaceRows(u, place.id).then(
      rows => { if (live) { load = { s: 'ok', rows }; onsettled?.() } },
      e => { if (live) { load = { s: 'error', msg: e instanceof Error ? e.message : String(e) }; onsettled?.() } },
    )
    return () => { live = false }
  })

  const wanted = $derived(localMethod ?? method ?? defaultMethod(ind))
  const model = $derived(load.s === 'ok' ? cardModel(ind, place.name, load.rows, { method: wanted, grain, ...opts }) : null)
  const rows = $derived(load.s === 'ok' ? load.rows : [])
  const eov = $derived(catalog.manifest.vocabularies.eov.terms.find(t => t.id === ind.category.eov))
  const glyph = $derived(asIcon(term.glyph))
  const citation = $derived(card?.citation ?? placeCitation(ind, place.id))
  const isDefault = $derived(wanted === defaultMethod(ind))
  // the card's sentence (coverage's) until the browser has computed its own, and only when it is the same method
  const sentence = $derived(model ? model.sentence : isDefault && card?.sentence ? card.sentence : '')
  // the status glyph and word: the browser's once the values are in, the card's (coverage's) before, for the manifest's method
  const marks = $derived.by<{ glyph: IconName; word: string; trend: string | null } | null>(() => {
    if (model) {
      if (model.kind !== 'continuous' || model.method === 'values') return null
      return { glyph: (model.status ? `st-${model.status}` : 'st-none') as IconName, word: STATUS_WORDS[model.status ?? 'none'], trend: model.trend }
    }
    return card?.hasRule && isDefault ? { glyph: card.glyph as IconName, word: card.statusWord, trend: card.trend } : null
  })
  // the method line: the card's label and note for the manifest's method, the note of another one asked for
  const methodLine = $derived(model && model.method !== defaultMethod(ind) ? METHOD_NOTES[model.method] : card ? `Method: ${card.methodLabel}. ${card.methodNote}` : METHOD_NOTES[model?.method ?? defaultMethod(ind)])
  const unit = $derived(ind.unit_label ?? '')
  const GRAIN_NAME: Record<string, string> = { year: 'Year', month: 'Month', decade: 'Decade', day: 'Day', all: 'All time' }
  const dec = $derived(ind.decimals ?? 2)

  function csv() {
    downloadBlob(new Blob([placeCsv(rows)], { type: 'text/csv;charset=utf-8' }), fileName(place.id, ind.id, 'csv'))
  }
  async function parquet() {
    const { placeParquet } = await import('./parquetOut.ts')
    const buf = placeParquet(rows, { 'om:place_id': place.id, 'om:indicator': ind.id, 'om:citation': citation, 'om:source': url ?? '' })
    downloadBlob(new Blob([buf], { type: 'application/vnd.apache.parquet' }), fileName(place.id, ind.id, 'parquet'))
  }
  const cell = (v: number | null) => fmt(v, dec)
</script>

<article class="card" class:focused data-ind={ind.id} aria-labelledby="t-{uid}{ind.id}" aria-busy={load.s === 'loading'}>
  <header class="head">
    {#if vocab === 'eov' && eov && badgeOk}
      <img class="badge" src={badgeUrl(import.meta.env.BASE_URL, eov.id)} alt="{eov.label} (GOOS EOV badge)" width="40" height="40" onerror={() => (badgeOk = false)} />
    {:else if glyph}
      <span class="glyph"><Icon name={glyph} size={22} /></span>
    {/if}
    <div class="titles">
      <h4 id="t-{uid}{ind.id}" tabindex="-1">{card?.title ?? ind.title}</h4>
      <p class="sub">{unit || 'unitless'} · status by {ind.status_grain}{model?.grain && model.grain !== ind.status_grain ? ` · shown by ${model.grain}` : ''}</p>
    </div>
  </header>

  {#if load.s === 'error'}
    <div class="err" role="alert">
      <p>Could not load the values for this card: {load.msg}</p>
      <Button variant="quiet" size="sm" onclick={() => tries++}>Try again</Button>
    </div>
  {:else}
    <p class="sentence" class:pending={!model}>{sentence || 'Loading the values…'}</p>
    {#if marks}
      <ul class="marks om-marks">
        <li><Icon name={marks.glyph} size={22} /><span>{marks.word}</span></li>
        {#if marks.trend}<li><Icon name={`tr-${marks.trend}` as IconName} size={22} /><span>trend {TREND_WORDS[marks.trend as keyof typeof TREND_WORDS]}</span></li>{/if}
      </ul>
    {/if}
    {#if model}
      {#if model.kind === 'empty'}
        <p class="note om-note-s">This place has no values for this indicator.</p>
      {:else if model.kind === 'categorical'}
        <StackChart {model} />
      {:else}
        <TimeChart {model} {unit} recent={opts.recent ?? ind.recent} />
      {/if}

      {#if model.kind !== 'empty' && !still}
        <div class="controls">
          {#if model.grains.length > 1}
            <div class="ctl" role="group" aria-label="Time grain">
              <span class="mbon-label">Grain</span>
              {#each model.grains as g (g)}
                <Button variant="quiet" size="sm" pressed={model.grain === g} onclick={() => (grain = g)}>{GRAIN_NAME[g]}</Button>
              {/each}
            </div>
          {/if}
          {#if model.kind === 'continuous' && model.grain === ind.status_grain}
            <div class="ctl" role="group" aria-label="Status method">
              <span class="mbon-label">Status method</span>
              {#each METHOD_IDS as m (m)}
                <Button variant="quiet" size="sm" pressed={model.method === m} onclick={() => (localMethod = m)}>{m}</Button>
              {/each}
            </div>
          {/if}
          <Button variant="quiet" size="sm" pressed={table} onclick={() => (table = !table)}><Icon name="ui-table" size={16} />{table ? 'Hide table' : 'Show table'}</Button>
        </div>
        {#if model.kind === 'continuous'}
          <p class="note om-note-s">
            {#if model.grain !== ind.status_grain}Values only: a status is given at the {ind.status_grain} grain.
            {:else}{methodLine}{#if model.method !== 'values'}{' '}{STATUS_NOTE}{/if}{/if}
          </p>
        {:else if card}
          <p class="note om-note-s">{card.caption}. {methodLine}</p>
        {/if}
      {/if}

      {#if table && model.kind !== 'empty'}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div class="tbl" tabindex="0" role="region" aria-label="Values of {ind.short} in {place.name}">
          <table>
            {#if model.kind === 'categorical' && model.stack}
              <thead><tr><th scope="col">Period</th>{#each model.stack.classes as c (c.key)}<th scope="col">{c.label}</th>{/each}</tr></thead>
              <tbody>{#each [...model.stack.periods].reverse() as p (p.t)}<tr><th scope="row">{periodLabel(p.t, model.grain!)}</th>{#each p.parts as v, i (i)}<td>{fmt(v * 100, 1)}%</td>{/each}</tr>{/each}</tbody>
            {:else}
              <thead><tr><th scope="col">Period</th><th scope="col">Value{unit ? ` (${unit})` : ''}</th></tr></thead>
              <tbody>{#each model.series.filter(p => p.v != null).reverse() as p (p.t)}<tr><th scope="row">{periodLabel(p.t, model.grain!)}</th><td>{cell(p.v)}</td></tr>{/each}</tbody>
            {/if}
          </table>
        </div>
      {/if}

      {#if !still}
      <div class="actions" role="group" aria-label="Downloads for this place and indicator">
        <Button variant="quiet" size="sm" onclick={csv}><Icon name="ui-download" size={16} />CSV</Button>
        <Button variant="quiet" size="sm" onclick={parquet}><Icon name="ui-download" size={16} />Parquet</Button>
        <span class="n om-role">{rows.length} {rows.length === 1 ? "row" : "rows"}, all grains</span>
      </div>

      <details class="four">
        <summary><span class="mbon-label four-label"><span>Dataset</span><i aria-hidden="true">{' · '}</i><span>place</span><i aria-hidden="true">{' · '}</i><span>method</span><i aria-hidden="true">{' · '}</i><span>delivery</span></span></summary>
        <Elements {catalog} {ind} {place} {collTitle} valuesColl={cov?.coll ?? null} row={model.stat} {depth} method={model.method} grain={model.grain ?? ind.status_grain} />
      </details>
      {/if}

      <div class="cite">
        <p class="citation"><span class="mbon-label">Cite</span> {#each breakParts(citation) as part, i (i)}{part}<wbr />{/each}</p>
        {#if !still}<CopyButton text={citation} label="Copy citation" />{/if}
      </div>
      {#if card && !still}
        <details class="four repro">
          <summary><span class="mbon-label">Reproduce</span></summary>
          {#if card.reproduce.valuesUrl}
            <p class="small"><span class="mbon-label">Values</span> <a href={card.reproduce.valuesUrl} target="_blank" rel="noopener">{card.reproduce.valuesUrl}</a></p>
            <pre class="code om-code">{card.reproduce.snippet}</pre>
            <CopyButton text={card.reproduce.snippet ?? ''} label="Copy DuckDB SQL" />
          {:else}
            <p class="small">The manifest lists no values file for this place’s collection.</p>
          {/if}
          <p class="small"><span class="mbon-label">Config hash</span> <code>{card.reproduce.hash}</code></p>
          <pre class="code om-code">{card.reproduce.config.join('\n')}</pre>
        </details>
      {/if}
      {#if vocab === 'eov' && eov}
        <p class="credit">GOOS EOV: {eov.label}. Badge used unmodified. {GOOS_CREDIT}</p>
      {/if}
    {/if}
  {/if}
</article>

<style>
  .card {
    display: grid; gap: var(--space-3); align-content: start; min-width: 0;
    background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-md);
    padding: var(--space-4); scroll-margin-top: var(--space-4);
  }
  .card.focused { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
  .head { display: flex; gap: var(--space-3); align-items: flex-start; }
  .badge { flex: none; width: 40px; height: 40px; border-radius: 50%; }
  .glyph { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; color: var(--label-color); }
  .titles { min-width: 0; }
  h4:focus, h4:focus-visible { outline: none; }
  h4 { margin: 0; font: var(--fw-semibold) var(--text-md) / 1.25 var(--font-display); color: var(--text-strong); text-wrap: balance; }
  .sub { margin: 2px 0 0; font: var(--fw-regular) 0.75rem / 1.3 var(--font-mono); color: var(--text-body); }
  .sentence { margin: 0; font: var(--fw-medium) var(--text-sm) / 1.45 var(--font-sans); color: var(--text-strong); text-wrap: pretty; }
  .sentence.pending { color: var(--text-body); min-height: 2.9em; }
  .controls { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); align-items: center; }
  .ctl { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); }
  .ctl .mbon-label { margin-right: var(--space-1); }
  .err { background: var(--notice-err-bg); border-radius: var(--radius-sm); padding: var(--space-3); color: var(--text-strong); }
  .err p { margin: 0 0 var(--space-2); overflow-wrap: anywhere; }
  .tbl { max-height: 14rem; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius-sm); }
  table { border-collapse: collapse; width: 100%; font: var(--type-small); font-size: 0.8125rem; font-variant-numeric: tabular-nums; }
  th, td { padding: var(--space-1) var(--space-3); text-align: right; border-bottom: 1px solid var(--divider); }
  th[scope='row'], thead th:first-child { text-align: left; font-weight: var(--fw-medium); color: var(--text-strong); }
  thead th { position: sticky; top: 0; background: var(--bg-tint); color: var(--text-strong); font-weight: var(--fw-semibold); }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  .four > summary { cursor: pointer; padding: var(--space-1) 0; list-style: none; display: flex; align-items: center; gap: var(--space-2); }
  .four > summary::-webkit-details-marker { display: none; }
  .four > summary::before { content: '+'; font: var(--fw-bold) 1rem / 1 var(--font-mono); color: var(--label-color); width: 1rem; }
  .four[open] > summary::before { content: '–'; }
  .four > :global(.els) { margin-top: var(--space-2); }
  .cite { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  .citation { margin: 0; flex: 1 1 18rem; font: var(--type-small); font-size: 0.8125rem; line-height: 1.5; color: var(--text-body); overflow-wrap: anywhere; }
  /* the heading's words are the break points, and its letter-spacing is tightened on a phone so it stays on one line */
  .four-label span { white-space: nowrap; }
  .four-label i { font-style: normal; white-space: pre-wrap; }
  @media (max-width: 400px) { .four-label { letter-spacing: 0.06em; } .four > summary { gap: var(--space-1); } }
  .repro > :not(summary) { margin-top: var(--space-2); }
  .repro .small { margin-bottom: 0; font: var(--type-small); font-size: 0.8125rem; color: var(--text-body); overflow-wrap: anywhere; }
  .repro pre { margin-bottom: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .credit { margin: 0; font: var(--type-small); font-size: 0.75rem; color: var(--text-body); }
</style>
