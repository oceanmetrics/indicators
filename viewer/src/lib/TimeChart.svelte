<script lang="ts">
  // the time series of a card as plain SVG: points and line, and for iea-sd the long-term mean line with the ±1 SD
  // band, for names-pct the median with the 10th to 90th percentile band, the recent window shaded behind it. all
  // geometry is chart.ts; colours are tokens. role="img" with the alt text from src/status as its name.
  import { lineChart, overlayOf } from './chart.ts'
  import type { CardModel } from './place.ts'

  interface Props {
    model: CardModel
    unit?: string
    /** the recent window's length, for its label */
    recent: number
  }
  let { model, unit = '', recent }: Props = $props()

  let w = $state(640)
  const h = $derived(w < 480 ? 210 : 240)
  const overlay = $derived(overlayOf(model.result))
  const mode = $derived(model.method === 'values' && model.grain !== 'month' ? 'points' : 'line')
  const g = $derived(lineChart({ width: w, height: h, series: model.series, grain: model.grain ?? 'year', overlay, mode }))
  const last = $derived(g.points[g.points.length - 1])
  const winLabel = $derived(`last ${recent} ${model.grain === 'year' ? 'years' : 'periods'}`)
  const bandLabel = $derived(overlay?.kind === 'pct' ? 'median, 10th to 90th percentile' : 'long-term mean ± 1 SD')
</script>

<div class="wrap" bind:clientWidth={w}>
  <svg viewBox="0 0 {w} {h}" width={w} height={h} role="img" aria-label={model.alt} focusable="false">
    {#if g.window}
      <rect class="win" x={g.window.x0} y={g.plot.y0} width={Math.max(0, g.window.x1 - g.window.x0)} height={g.plot.y1 - g.plot.y0} />
      <text class="lab" x={g.window.x1} y="11" text-anchor="end">{winLabel}</text>
    {/if}
    {#each g.yTicks as t (t.label)}
      <line class="grid" x1={g.plot.x0} x2={g.plot.x1} y1={t.y} y2={t.y} />
      <text class="tick" x={g.plot.x0 - 6} y={t.y + 3.5} text-anchor="end">{t.label}</text>
    {/each}
    {#if g.band}
      <rect class="band" x={g.plot.x0} y={g.band.y0} width={g.plot.x1 - g.plot.x0} height={Math.max(1, g.band.y1 - g.band.y0)} />
      <line class="edge" x1={g.plot.x0} x2={g.plot.x1} y1={g.band.y0} y2={g.band.y0} />
      <line class="edge" x1={g.plot.x0} x2={g.plot.x1} y1={g.band.y1} y2={g.band.y1} />
    {/if}
    {#if g.center != null}<line class="mean" x1={g.plot.x0} x2={g.plot.x1} y1={g.center} y2={g.center} />{/if}
    {#each g.xTicks as t (t.label)}
      <line class="xtick" x1={t.x} x2={t.x} y1={g.plot.y1} y2={g.plot.y1 + 4} />
      <text class="tick" x={t.x} y={g.plot.y1 + 16} text-anchor="middle">{t.label}</text>
    {/each}
    <line class="axis" x1={g.plot.x0} x2={g.plot.x1} y1={g.plot.y1} y2={g.plot.y1} />
    {#if unit}<text class="unit" x="4" y="11">{unit}</text>{/if}
    {#if g.d}<path class="line" d={g.d} />{/if}
    {#if g.markers}
      {#each g.points as p (p.t)}
        <circle class="pt" cx={p.x} cy={p.y} r={mode === 'points' ? 3.4 : 2.6}><title>{p.t.slice(0, model.grain === 'month' ? 7 : 4)}: {p.v}</title></circle>
      {/each}
    {/if}
    {#if last}<circle class="last" cx={last.x} cy={last.y} r="4.2" />{/if}
    {#if g.empty}<text class="tick" x={(g.plot.x0 + g.plot.x1) / 2} y={(g.plot.y0 + g.plot.y1) / 2} text-anchor="middle">No values to draw</text>{/if}
  </svg>
  {#if overlay}
    <ul class="key" aria-hidden="true">
      <li><span class="sw line"></span>value</li>
      <li><span class="sw mean"></span>{overlay.kind === 'pct' ? 'median' : 'mean'}</li>
      <li><span class="sw band"></span>{bandLabel}</li>
      {#if g.window}<li><span class="sw win"></span>recent window</li>{/if}
    </ul>
  {/if}
</div>

<style>
  .wrap { min-width: 0; width: 100%; }
  svg { display: block; max-width: 100%; overflow: visible; }
  text { font-family: var(--font-mono); font-size: 11px; fill: var(--text-body); }
  .unit { fill: var(--text-strong); font-weight: 600; }
  .lab { fill: var(--text-body); }
  .grid { stroke: var(--divider); stroke-width: 1; }
  .axis { stroke: var(--border-strong); stroke-width: 1; }
  .xtick { stroke: var(--border-strong); stroke-width: 1; }
  .win { fill: var(--selected-bg); stroke: var(--border-strong); stroke-width: 1; stroke-dasharray: 3 3; }
  .band { fill: var(--bg-tint); }
  .edge { stroke: var(--border-strong); stroke-width: 1; }
  .mean { stroke: var(--text-body); stroke-width: 1.5; stroke-dasharray: 5 3; }
  .line { fill: none; stroke: var(--link); stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }
  .pt { fill: var(--bg-surface); stroke: var(--link); stroke-width: 1.6; }
  .last { fill: var(--link); stroke: var(--bg-surface); stroke-width: 1.5; }
  .key { list-style: none; margin: var(--space-1) 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); font: var(--type-small); font-size: 0.75rem; color: var(--text-body); }
  .key li { display: inline-flex; align-items: center; gap: var(--space-2); }
  .sw { display: inline-block; width: 1.25rem; height: 0.75rem; box-sizing: border-box; }
  .sw.line { height: 0; border-top: 2px solid var(--link); }
  .sw.mean { height: 0; border-top: 2px dashed var(--text-body); }
  .sw.band { background: var(--bg-tint); border: 1px solid var(--border-strong); }
  .sw.win { background: var(--selected-bg); border: 1px dashed var(--border-strong); }
</style>
