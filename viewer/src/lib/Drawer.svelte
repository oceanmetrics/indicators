<script lang="ts">
  // the cell drawer: the coverage sentence, then the cell as the paper's four elements in pipeline order (dataset,
  // place, method, delivery, in the pipeline colours), the hashed configuration, the citation and the GOOS badge.
  // a dialog: Esc closes, Tab stays inside, focus goes to Close on open and the caller returns it to the cell.
  import { onMount } from 'svelte'
  import { Icon } from '../../../src/icons/index.ts'
  import type { IconName } from '../../../src/icons/index.ts'
  import { spanLabel } from '../../../src/status/index.ts'
  import type { Catalog, Indicator, VocabId } from './data.ts'
  import { configHash, configLines, badgeUrl } from './delivery.ts'
  import { EOV_GLYPH_CREDIT, GOOS_CREDIT, STATUS_NOTE } from './credits.ts'
  import { mapHref, placeHref } from './hash.ts'
  import type { Depth } from './hash.ts'
  import { classText, STATUS_WORDS, TREND_WORDS, periodText, valueText } from './matrix.ts'
  import type { CellModel, Place } from './matrix.ts'
  import CopyButton from './CopyButton.svelte'
  import Spark from './Spark.svelte'
  import Elements from './Elements.svelte'

  interface Props {
    catalog: Catalog
    ind: Indicator
    place: Place
    model: CellModel
    depth: Depth
    vocab: VocabId
    collTitle: string
    onclose: () => void
  }
  let { catalog, ind, place, model, depth, vocab, collTitle, onclose }: Props = $props()

  const row = $derived(model.row)
  const m = $derived(catalog.manifest)
  const eovTerm = $derived(m.vocabularies.eov.terms.find(t => t.id === ind.category.eov))
  const base = import.meta.env.BASE_URL
  let badgeOk = $state(true)
  let root: HTMLElement | undefined = $state()
  let closeBtn: HTMLButtonElement | undefined = $state()

  const lines = $derived(configLines(ind, place, m.version))
  const hash = $derived(configHash(lines))
  const headline = $derived.by(() => {
    if (row?.sentence) return row.sentence
    if (model.kind === 'live') return `${ind.short} for ${place.name} has not been computed. erddap-places can compute it in the browser from ${ind.dataset.title}; this read-only viewer does not do that yet.`
    if (model.kind === 'nodata') return `No ${ind.short} data for ${place.name} yet${model.reason ? `: ${model.reason}` : ''}.`
    return `${ind.short} is not defined for ${place.name}: the indicator has no values for ${collTitle} and its producer (${ind.producer.name}) does not compute it on the fly.`
  })
  const citation = $derived(ind.citation ?? '')

  onMount(() => { closeBtn?.focus() })

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onclose()
      return
    }
    if (e.key !== 'Tab' || !root) return
    const f = [...root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null)
    if (!f.length) return
    const first = f[0], last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
</script>

<svelte:window onkeydown={onkeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={onclose}></div>
<div class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" bind:this={root}>
  <header class="head">
    <div class="titles">
      <span class="mbon-label">{ind.short} · {collTitle}</span>
      <h2 id="drawer-title">{ind.title} in {place.name}</h2>
    </div>
    <button type="button" class="close" bind:this={closeBtn} onclick={onclose} aria-label="Close details">
      <Icon name="ui-close" size={20} />
    </button>
  </header>

  <p class="headline">{headline}</p>
  <p class="toplace">
    <a class="plink" href={placeHref({ vocab, depth, method: null }, place.id, place.coll, ind.id)}>
      <Icon name="view-place" size={16} />Open in place view <span class="mbon-sr-only">: {place.name}, {ind.short}</span>
    </a>
    <a class="plink" href={mapHref({ vocab, depth, method: null }, ind.id, place.coll)}>
      <Icon name="view-map" size={16} />Open in map view <span class="mbon-sr-only">: {ind.short}</span>
    </a>
  </p>

  {#if model.kind === 'value' && row}
    <div class="read">
      <div class="big">
        <span class="num">{valueText(ind, row)}</span>
        <span class="per">in {periodText(row)}</span>
      </div>
      <ul class="marks">
        <li><Icon name={model.statusIcon ?? 'st-none'} size={22} /><span>{model.statusIcon ? STATUS_WORDS[model.statusIcon.slice(3) as keyof typeof STATUS_WORDS] : 'no status at this grain'}</span></li>
        {#if row.trend}<li><Icon name={model.trendIcon!} size={22} /><span>trend {TREND_WORDS[row.trend]}</span></li>{/if}
      </ul>
      <div class="chart"><Spark spark={row.spark} width={320} height={64} fluid /></div>
      <p class="cap">{row.n_periods} {row.time_grain === 'year' ? 'years' : 'periods'} of record, {row.t0 ? spanLabel(row.t0, row.t1 ?? row.t0, row.time_grain) : ''}; the line shows the last 40 periods. {STATUS_NOTE}</p>
    </div>
  {:else if model.kind === 'class' && row}
    <div class="read">
      <div class="big"><span class="num">{classText(ind, row)}</span><span class="per">of the area in {periodText(row)}</span></div>
      <p class="cap">The largest class of {ind.short}. Categorical indicators show class shares and have no status.</p>
    </div>
  {/if}

  <Elements {catalog} {ind} {place} {collTitle} {row} {depth} />

  <section class="config" aria-label="Configuration">
    <h3 class="k"><Icon name="el-config" size={18} />Configuration <code>{hash}</code></h3>
    <p class="small">The place, indicator, status method and manifest <code>{m.version}</code> that pin this number.</p>
    {#if depth === 'dive'}<pre class="code">{lines.join('\n')}</pre>{/if}
  </section>

  <section class="cite" aria-label="Citation">
    <h3 class="k"><Icon name="el-cite" size={18} />Cite</h3>
    <p class="citation">{citation}</p>
    <CopyButton text={citation} label="Copy citation" />
  </section>

  {#if eovTerm}
    <section class="goos" aria-label="GOOS Essential Ocean Variable">
      {#if badgeOk}
        <img src={badgeUrl(base, eovTerm.id)} alt="{eovTerm.label} (GOOS EOV badge)" width="64" height="64" onerror={() => (badgeOk = false)} />
      {/if}
      <div>
        <p class="main">GOOS EOV: {eovTerm.label}</p>
        <p class="small">Badge used unmodified. {GOOS_CREDIT}</p>
        <p class="small"><Icon name={`eov-${eovTerm.id}` as IconName} size={16} /> The small glyph is {EOV_GLYPH_CREDIT.charAt(0).toLowerCase() + EOV_GLYPH_CREDIT.slice(1)}.</p>
      </div>
    </section>
  {/if}
</div>

<style>
  .scrim { position: fixed; inset: 0; background: color-mix(in srgb, var(--bg-abyss) 55%, transparent); z-index: var(--z-overlay); }
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(36rem, 100%);
    z-index: calc(var(--z-overlay) + 1);
    background: var(--pane-bg);
    border-left: 1px solid var(--pane-border);
    box-shadow: var(--shadow-lg);
    overflow-y: auto;
    padding: var(--space-4) var(--space-5) var(--space-6);
    display: grid;
    gap: var(--space-4);
    align-content: start;
    color: var(--text-body);
  }
  .head { display: flex; gap: var(--space-3); align-items: flex-start; }
  .titles { min-width: 0; flex: 1; }
  .titles h2 { font: var(--fw-bold) var(--text-md) / 1.2 var(--font-display); margin: var(--space-1) 0 0; color: var(--text-strong); }
  .close {
    flex: none; display: inline-flex; align-items: center; justify-content: center; width: 2.25rem; height: 2.25rem;
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--control-bg); color: var(--text-strong); cursor: pointer;
  }
  .close:hover { background: var(--control-hover); }
  .headline { margin: 0; font: var(--fw-medium) var(--text-md) / 1.4 var(--font-display); color: var(--text-strong); text-wrap: pretty; }
  .read { display: grid; gap: var(--space-2); background: var(--bg-tint); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); }
  .big { display: flex; align-items: baseline; gap: var(--space-2); flex-wrap: wrap; }
  .num { font: var(--fw-bold) var(--text-lg) / 1.1 var(--font-display); color: var(--text-strong); font-variant-numeric: tabular-nums; }
  .per { font: var(--type-small); color: var(--text-body); }
  .marks { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); }
  .marks li { display: flex; align-items: center; gap: var(--space-2); color: var(--text-strong); font: var(--type-small); }
  .chart { max-width: 22rem; }
  .cap { margin: 0; font: var(--type-small); color: var(--text-body); }

  .config, .cite, .goos { background: var(--bg-tint); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); min-width: 0; }
  .toplace { margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); }
  .plink { display: inline-flex; align-items: center; gap: var(--space-2); font: var(--fw-semibold) var(--text-sm) / 1.2 var(--font-sans); }
  .k { display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-2); font: var(--type-label); text-transform: uppercase; letter-spacing: var(--ls-label); }
  .config .k, .cite .k { color: var(--text-body); }
  .main { margin: 0 0 var(--space-1); font: var(--fw-semibold) var(--text-sm) / 1.35 var(--font-sans); color: var(--text-strong); overflow-wrap: anywhere; }
  .small { margin: 0 0 var(--space-1); font: var(--type-small); font-size: 0.8125rem; line-height: 1.45; color: var(--text-body); overflow-wrap: anywhere; }
  .small code, .k code { font-size: 0.75rem; }
  .code { margin: var(--space-2) 0; padding: var(--space-2) var(--space-3); background: var(--bg-page); border: 1px solid var(--border); border-radius: var(--radius-sm); overflow-x: auto; font: var(--fw-regular) 0.75rem / 1.5 var(--font-mono); color: var(--text-strong); white-space: pre-wrap; overflow-wrap: anywhere; }
  .citation { margin: 0 0 var(--space-2); font: var(--type-small); font-size: 0.8125rem; line-height: 1.5; color: var(--text-body); overflow-wrap: anywhere; }
  .goos { display: flex; gap: var(--space-4); align-items: center; }
  .goos img { flex: none; border-radius: 50%; }

  @media (max-width: 640px) {
    .scrim { background: color-mix(in srgb, var(--bg-abyss) 55%, transparent); }
    .drawer {
      top: auto; left: 0; right: 0; bottom: 0; width: 100%; max-height: 90dvh;
      border-left: 0; border-top: 1px solid var(--pane-border);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      padding: var(--space-4) var(--space-4) calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
    }
  }
</style>
