<script lang="ts">
  // one quad plot (the IEA quad plot): each point is an indicator (or a place) at its recent trend (x) and the departure of
  // its recent mean from its long-term mean (y), both in SD units of its own record. dashed guides at ±1 SD, the corner
  // captions say where a point is in words (statistical, never better or worse), and each marker is the status glyph of the
  // point. the coordinates and words are src/status/quad.ts. points with no coordinates are listed under the chart with why,
  // and a table (details) carries every number for those who do not read the plot.
  import { ICON_PATHS, Icon } from '../../../../../src/icons/index.ts'
  import type { IconName } from '../../../../../src/icons/index.ts'
  import { QUADRANT_SHORT, QUADRANT_WORDS, fmt, quadAlt, quadPoint, quadWhy, quadWords, quadrantOf } from '../../../../../src/status/index.ts'
  import type { QuadPoint } from '../../../../../src/status/index.ts'
  import { scaleLinear } from '../../chart.ts'
  import { STATUS_WORDS, TREND_WORDS } from '../../matrix.ts'
  import type { CardModel } from '../../place.ts'
  import { placeLabels, quadExtent, quadTicks } from './quadPlot.ts'
  import type { QuadItem } from './quadPlot.ts'

  interface Props {
    title: string
    items: QuadItem[]
    /** the card model of each item once its values have loaded */
    modelOf: (it: QuadItem) => CardModel | null
    /** the table under the plot open (the diver) */
    open?: boolean
    href?: (it: QuadItem) => string
  }
  let { title, items, modelOf, open = false, href }: Props = $props()

  let w = $state(520)
  const narrow = $derived(w < 460)
  const h = $derived(Math.round(Math.min(480, Math.max(narrow ? 380 : 300, w * (narrow ? 1 : 0.82)))))
  const corner = $derived(narrow ? QUADRANT_SHORT : QUADRANT_WORDS)
  const M = { l: 46, t: 14, r: 14, b: 40 }

  const entries = $derived(items.map(it => {
    const m = modelOf(it)
    const r = m?.result ?? null
    const pt = r ? quadPoint(r) : null
    return { it, m, pt, why: !m ? 'values are loading' : !r ? 'this indicator has no status method' : quadWhy(r) }
  }))
  const drawn = $derived(entries.filter(e => e.pt) as (typeof entries[number] & { pt: QuadPoint })[])
  const left = $derived(entries.filter(e => !e.pt))
  const ext = $derived(quadExtent(drawn.map(e => e.pt)))
  const plot = $derived({ x0: M.l, y0: M.t, x1: w - M.r, y1: h - M.b })
  const sx = $derived(scaleLinear(-ext, ext, plot.x0, plot.x1))
  const sy = $derived(scaleLinear(-ext, ext, plot.y1, plot.y0))
  const ticks = $derived(quadTicks(ext))
  const labs = $derived(placeLabels(drawn.map(e => ({ id: e.it.key, x: sx(e.pt.x), y: sy(e.pt.y), text: e.it.label })), plot))
  const labOf = (key: string) => labs.find(l => l.id === key)
  const unlabelled = $derived(labs.filter(l => !l.placed).map(l => l.text))
  const alt = $derived(quadAlt(entries.map(e => ({ label: e.it.label, point: e.pt, why: e.why })), `Quad plot of ${title}`))

  let hover = $state<string | null>(null)
  const tip = $derived(drawn.find(e => e.it.key === hover) ?? null)
  const statusIcon = (s: string | null | undefined) => (`st-${s ?? 'none'}` as IconName)
  const glyph = (name: string) => (ICON_PATHS as Record<string, string>)[name] ?? ''
  const words = (e: { m: CardModel | null; pt: QuadPoint }) => quadWords(e.pt, e.m?.method)
</script>

<figure class="qc" bind:clientWidth={w}>
  <figcaption class="cap"><span class="mbon-label">Quad plot</span> <strong>{title}</strong></figcaption>
  <div class="stage">
    <svg viewBox="0 0 {w} {h}" width={w} height={h} role="img" aria-label={alt} focusable="false">
      {#each ticks as v (v)}
        <line class="grid" x1={sx(v)} x2={sx(v)} y1={plot.y0} y2={plot.y1} />
        <line class="grid" x1={plot.x0} x2={plot.x1} y1={sy(v)} y2={sy(v)} />
        <text class="tick" x={sx(v)} y={plot.y1 + 14} text-anchor="middle">{v === 0 ? '0' : fmt(v, 0)}</text>
        <text class="tick" x={plot.x0 - 6} y={sy(v) + 3.5} text-anchor="end">{v === 0 ? '0' : fmt(v, 0)}</text>
      {/each}
      <line class="axis" x1={sx(0)} x2={sx(0)} y1={plot.y0} y2={plot.y1} />
      <line class="axis" x1={plot.x0} x2={plot.x1} y1={sy(0)} y2={sy(0)} />
      {#each [-1, 1] as g (g)}
        <line class="guide" x1={sx(g)} x2={sx(g)} y1={plot.y0} y2={plot.y1} />
        <line class="guide" x1={plot.x0} x2={plot.x1} y1={sy(g)} y2={sy(g)} />
      {/each}
      <rect class="frame" x={plot.x0} y={plot.y0} width={plot.x1 - plot.x0} height={plot.y1 - plot.y0} />
      <text class="quad" x={plot.x1 - 5} y={plot.y0 + 12} text-anchor="end">{corner['above-rising']}</text>
      <text class="quad" x={plot.x0 + 5} y={plot.y0 + 12} text-anchor="start">{corner['above-falling']}</text>
      <text class="quad" x={plot.x1 - 5} y={plot.y1 - 6} text-anchor="end">{corner['below-rising']}</text>
      <text class="quad" x={plot.x0 + 5} y={plot.y1 - 6} text-anchor="start">{corner['below-falling']}</text>
      <text class="axtitle" x={(plot.x0 + plot.x1) / 2} y={h - 6} text-anchor="middle">Recent trend, in SD (change over the recent window)</text>
      <text class="axtitle" transform="translate(11 {(plot.y0 + plot.y1) / 2}) rotate(-90)" text-anchor="middle">Recent mean minus long-term mean, in SD</text>
      {#each labs.filter(l => l.leader) as l (l.id)}
        <line class="leader" x1={l.leader!.x1} y1={l.leader!.y1} x2={l.leader!.x2} y2={l.leader!.y2} />
      {/each}
      {#each drawn as e (e.it.key)}
        {@const l = labOf(e.it.key)}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <g class="pt" class:on={hover === e.it.key} tabindex="0" role="img" aria-label="{e.it.label}: {words(e)}"
          onpointerenter={() => (hover = e.it.key)} onpointerleave={() => (hover = null)} onfocus={() => (hover = e.it.key)} onblur={() => (hover = null)}>
          <circle class="halo" cx={sx(e.pt.x)} cy={sy(e.pt.y)} r="10" />
          <g transform="translate({sx(e.pt.x) - 8} {sy(e.pt.y) - 8}) scale({16 / 24})"><path d={glyph(statusIcon(e.m?.status))} fill="currentColor" /></g>
          {#if l?.placed}<text class="lab" x={l.x} y={l.y} text-anchor={l.anchor}>{l.text}</text>{/if}
        </g>
      {/each}
      {#if drawn.length === 0}<text class="tick" x={(plot.x0 + plot.x1) / 2} y={(plot.y0 + plot.y1) / 2} text-anchor="middle">No point to draw</text>{/if}
    </svg>
    {#if tip}
      <div class="tip" role="status" style:left="{Math.min(Math.max(sx(tip.pt.x), 90), w - 90)}px" style:top="{Math.max(sy(tip.pt.y) + 14, 0)}px">
        <strong>{tip.it.label}{tip.it.place && tip.it.label !== tip.it.place.name ? ` · ${tip.it.place.name}` : ''}</strong>
        <span>{words(tip)}</span>
      </div>
    {/if}
  </div>

  {#if unlabelled.length}
    <p class="left om-note">Not labelled on the plot, there is no room (see the table): {unlabelled.join(', ')}.</p>
  {/if}
  {#if left.length}
    <p class="left om-note">
      Not placed: {#each left as e, n (e.it.key)}<span>{n ? '; ' : ''}<strong>{e.it.label}</strong> ({e.why})</span>{/each}.
    </p>
  {/if}

  <details class="tbl" {open}>
    <summary><span class="mbon-label">The plot as a table</span> <span class="om-count">{drawn.length} {drawn.length === 1 ? 'point' : 'points'}</span></summary>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="scroll" role="region" aria-label="Quad plot values of {title}" tabindex="0">
      <table>
        <thead><tr><th scope="col">Point</th><th scope="col">Status</th><th scope="col">Trend</th><th scope="col" class="num">Trend, SD</th><th scope="col" class="num">Mean vs long-term, SD</th><th scope="col">Where</th></tr></thead>
        <tbody>
          {#each drawn as e (e.it.key)}
            <tr>
              <th scope="row">{#if href}<a href={href(e.it)}>{e.it.label}</a>{:else}{e.it.label}{/if}</th>
              <td><span class="g"><Icon name={statusIcon(e.m?.status)} size={16} />{e.m?.status ? STATUS_WORDS[e.m.status] : 'no status'}</span></td>
              <td>{#if e.m?.trend}<span class="g"><Icon name={`tr-${e.m.trend}` as IconName} size={16} />{TREND_WORDS[e.m.trend]}</span>{:else}–{/if}</td>
              <td class="num">{fmt(e.pt.x, 2)}</td>
              <td class="num">{fmt(e.pt.y, 2)}</td>
              <td>{QUADRANT_WORDS[quadrantOf(e.pt)]}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </details>
</figure>

<style>
  .qc { margin: 0; display: grid; gap: var(--space-2); min-width: 0; padding: var(--space-3) var(--space-4); background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-md); }
  .cap { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2); font: var(--type-small); color: var(--text-strong); }
  .stage { position: relative; min-width: 0; }
  svg { display: block; max-width: 100%; overflow: visible; }
  text { font-family: var(--font-mono); font-size: 10.5px; fill: var(--text-body); }
  .tick { font-size: 10px; }
  .axtitle { font-size: 10.5px; fill: var(--text-strong); }
  .quad { font-size: 9.5px; fill: var(--text-body); opacity: 0.85; }
  .grid { stroke: var(--divider); stroke-width: 1; }
  .axis { stroke: var(--border-strong); stroke-width: 1.2; }
  .guide { stroke: var(--text-body); stroke-width: 1; stroke-dasharray: 5 4; opacity: 0.7; }
  .frame { fill: none; stroke: var(--border-strong); stroke-width: 1; }
  .pt { color: var(--text-strong); cursor: default; outline: none; }
  .pt .halo { fill: var(--bg-surface); stroke: var(--border-strong); stroke-width: 1; }
  .pt.on .halo, .pt:focus-visible .halo { stroke: var(--link); stroke-width: 2; }
  .leader { stroke: var(--text-body); stroke-width: 1; opacity: 0.7; }
  .lab { font-size: 11px; fill: var(--text-strong); paint-order: stroke; stroke: var(--bg-surface); stroke-width: 3px; stroke-linejoin: round; }
  .tip { position: absolute; transform: translateX(-50%); display: grid; gap: 2px; width: max-content; max-width: min(18rem, 90%); padding: var(--space-2) var(--space-3); background: var(--bg-surface); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); font: var(--type-small); color: var(--text-body); pointer-events: none; z-index: 2; }
  .tip strong { color: var(--text-strong); }
  .left { margin: 0; }
  .tbl > summary { cursor: pointer; padding: var(--space-1) 0; }
  .scroll { max-height: 18rem; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius-sm); }
  table { border-collapse: collapse; width: 100%; font: var(--type-small); font-size: 0.8125rem; font-variant-numeric: tabular-nums; }
  th, td { padding: var(--space-1) var(--space-3); text-align: left; border-bottom: 1px solid var(--divider); }
  th.num, td.num { text-align: right; }
  thead th { position: sticky; top: 0; background: var(--bg-tint); color: var(--text-strong); font-weight: var(--fw-semibold); }
  th[scope='row'] { font-weight: var(--fw-medium); color: var(--text-strong); }
  .g { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--text-strong); }
  @media print { .tbl { display: none; } .tip { display: none; } .qc { break-inside: avoid; } }
</style>
