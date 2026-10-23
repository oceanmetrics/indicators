<script lang="ts">
  // the cell drawer: the coverage sentence, then the cell as the paper's four elements in pipeline order (dataset,
  // place, method, delivery, in the pipeline colours), the hashed configuration, the citation and the GOOS badge.
  // a dialog: Esc closes, Tab stays inside, focus goes to Close on open and the caller returns it to the cell.
  import { onMount } from 'svelte'
  import { configHash, configLines } from '@oceanmetrics/catalog/cards'
  import { Icon } from '../../../src/icons/index.ts'
  import type { IconName } from '../../../src/icons/index.ts'
  import { spanLabel, STATUS_NOTE, STATUS_WORDS, TREND_WORDS } from '@oceanmetrics/status'
  import type { Catalog, Indicator, VocabId } from './data.ts'
  import { badgeUrl } from './delivery.ts'
  import { EOV_GLYPH_CREDIT, GOOS_CREDIT } from './credits.ts'
  import { mapHref, placeHref } from './hash.ts'
  import type { Carry, Depth } from './hash.ts'
  import { classText, periodText, valueText, valuesCollOf } from './matrix.ts'
  import type { CellModel, Place } from './matrix.ts'
  import type { GroupCount } from './nextSteps.ts'
  import NextSteps from './NextSteps.svelte'
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
    /** the state the drawer is opened from: its selection and shared keys go into the links to the Place and Map views */
    carry: Carry
    /** the title of the place's group */
    collTitle: string
    /** the groups the indicator is computed for (for a cell it is not offered for), their titles and Matrix hrefs */
    groups?: GroupCount[]
    titles?: (coll: string) => string
    groupHref?: (coll: string) => string
    onclose: () => void
  }
  let { catalog, ind, place, model, depth, vocab, carry, collTitle, groups = [], titles, groupHref, onclose }: Props = $props()

  const row = $derived(model.row)
  const m = $derived(catalog.manifest)
  const eovTerm = $derived(m.vocabularies.eov.terms.find(t => t.id === ind.category.eov))
  const base = import.meta.env.BASE_URL
  let badgeOk = $state(true)
  let root: HTMLElement | undefined = $state()
  let closeBtn: HTMLButtonElement | undefined = $state()

  const lines = $derived(configLines(ind, place.id, m.version))
  const hash = $derived(configHash(lines))
  // a cell with a value reads its sentence; any other cell reads its way forward (NextSteps)
  const headline = $derived(row?.sentence ?? '')
  const valuesColl = $derived(valuesCollOf(ind, place, row))
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

  {#if headline}<p class="headline">{headline}</p>{/if}
  {#if model.kind === 'live' || model.kind === 'nodata' || model.kind === 'na'}
    <NextSteps {ind} {place} kind={model.kind} reason={model.reason} groupTitle={collTitle} {groups} {titles} {groupHref} />
  {/if}
  <p class="toplace">
    <a class="plink" href={placeHref(carry, place.id, place.coll, ind.id)}>
      <Icon name="view-place" size={16} />Open in place view <span class="mbon-sr-only">: {place.name}, {ind.short}</span>
    </a>
    <a class="plink" href={mapHref(carry, ind.id, null, place.id)}>
      <Icon name="view-map" size={16} />Open in map view <span class="mbon-sr-only">: {ind.short}</span>
    </a>
  </p>

  {#if model.kind === 'value' && row}
    <div class="read om-read">
      <div class="big">
        <span class="num">{valueText(ind, row)}</span>
        <span class="per">in {periodText(row)}</span>
      </div>
      <ul class="marks om-marks">
        <li><Icon name={model.statusIcon ?? 'st-none'} size={22} /><span>{model.statusIcon ? STATUS_WORDS[model.statusIcon.slice(3) as keyof typeof STATUS_WORDS] : 'no status at this grain'}</span></li>
        {#if row.trend}<li><Icon name={model.trendIcon!} size={22} /><span>trend {TREND_WORDS[row.trend]}</span></li>{/if}
      </ul>
      <div class="chart"><Spark spark={row.spark} width={320} height={64} fluid /></div>
      <p class="cap om-note">{row.n_periods} {row.time_grain === 'year' ? 'years' : 'periods'} of record, {row.t0 ? spanLabel(row.t0, row.t1 ?? row.t0, row.time_grain) : ''}; the line shows the last 40 periods. {STATUS_NOTE}</p>
    </div>
  {:else if model.kind === 'class' && row}
    <div class="read om-read">
      <div class="big"><span class="num">{classText(ind, row)}</span><span class="per">of the area in {periodText(row)}</span></div>
      <p class="cap om-note">The largest class of {ind.short}. Categorical indicators show class shares and have no status.</p>
    </div>
  {/if}

  <Elements {catalog} {ind} {place} {collTitle} {valuesColl} {row} {depth} />

  <section class="config" aria-label="Configuration">
    <h3 class="k om-k"><Icon name="el-config" size={18} />Configuration <code>{hash}</code></h3>
    <p class="small om-small">The place, indicator, status method and manifest <code>{m.version}</code> that pin this number.</p>
    {#if depth === 'dive'}<pre class="code om-code">{lines.join('\n')}</pre>{/if}
  </section>

  <section class="cite" aria-label="Citation">
    <h3 class="k om-k"><Icon name="el-cite" size={18} />Cite</h3>
    <p class="citation">{citation}</p>
    <CopyButton text={citation} label="Copy citation" />
  </section>

  {#if eovTerm}
    <section class="goos" aria-label="GOOS Essential Ocean Variable">
      {#if badgeOk}
        <img src={badgeUrl(base, eovTerm.id)} alt="{eovTerm.label} (GOOS EOV badge)" width="64" height="64" onerror={() => (badgeOk = false)} />
      {/if}
      <div>
        <p class="main om-main">GOOS EOV: {eovTerm.label}</p>
        <p class="small om-small">Badge used unmodified. {GOOS_CREDIT}</p>
        <p class="small om-small"><Icon name={`eov-${eovTerm.id}` as IconName} size={16} /> The small glyph is {EOV_GLYPH_CREDIT.charAt(0).toLowerCase() + EOV_GLYPH_CREDIT.slice(1)}.</p>
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
    background: var(--overlay-bg);
    border-left: 1px solid var(--overlay-border);
    box-shadow: var(--overlay-shadow);
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
  .big { display: flex; align-items: baseline; gap: var(--space-2); flex-wrap: wrap; }
  .num { font: var(--fw-bold) var(--text-lg) / 1.1 var(--font-display); color: var(--text-strong); font-variant-numeric: tabular-nums; }
  .per { font: var(--type-small); color: var(--text-body); }
  .chart { max-width: 22rem; }

  .config, .cite, .goos { background: var(--bg-tint); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); min-width: 0; }
  .toplace { margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); }
  .plink { display: inline-flex; align-items: center; gap: var(--space-2); font: var(--fw-semibold) var(--text-sm) / 1.2 var(--font-sans); }
  .config .k, .cite .k { color: var(--text-body); }
  .small code, .k code { font-size: 0.75rem; }
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
