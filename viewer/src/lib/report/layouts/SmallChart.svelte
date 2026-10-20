<script lang="ts">
  // one small panel of Small multiples: the same chart geometry as the Place view's TimeChart (chart.ts: the line, the
  // long-term band, the shaded recent window), drawn small and optionally on a y range shared with its row. colours are
  // tokens. role="img" with the alt text from src/status as its name.
  import { lineChart, overlayOf } from '../../chart.ts'
  import type { CardModel } from '../../place.ts'

  interface Props {
    model: CardModel
    /** the y range of the row, when its panels share an axis */
    domain?: [number, number] | null
    height?: number
    /** y labels and year labels; the skimmer's panels are lines only */
    ticks?: boolean
  }
  let { model, domain = null, height = 92, ticks = true }: Props = $props()

  let w = $state(176)
  const overlay = $derived(overlayOf(model.result))
  const mode = $derived(model.method === 'values' && model.grain !== 'month' ? 'points' : 'line')
  const g = $derived(lineChart({ width: w, height, series: model.series, grain: model.grain ?? 'year', overlay, mode, yDomain: domain, compact: true, left: ticks ? undefined : 4 }))
  const last = $derived(g.points[g.points.length - 1])
</script>

<div class="wrap" bind:clientWidth={w}>
  <svg viewBox="0 0 {w} {height}" width={w} {height} role="img" aria-label={model.alt} focusable="false">
    {#if g.window}
      <rect class="win" x={g.window.x0} y={g.plot.y0} width={Math.max(0, g.window.x1 - g.window.x0)} height={g.plot.y1 - g.plot.y0} />
    {/if}
    {#if ticks}
      {#each g.yTicks as t (t.label)}
        <line class="grid" x1={g.plot.x0} x2={g.plot.x1} y1={t.y} y2={t.y} />
        <text class="tick" x={g.plot.x0 - 4} y={t.y + 3.5} text-anchor="end">{t.label}</text>
      {/each}
    {/if}
    {#if g.band}
      <rect class="band" x={g.plot.x0} y={g.band.y0} width={g.plot.x1 - g.plot.x0} height={Math.max(1, g.band.y1 - g.band.y0)} />
    {/if}
    {#if g.center != null}<line class="mean" x1={g.plot.x0} x2={g.plot.x1} y1={g.center} y2={g.center} />{/if}
    {#if ticks}
      {#each g.xTicks as t (t.label)}
        <text class="tick" x={t.x} y={g.plot.y1 + 13} text-anchor="middle">{t.label}</text>
      {/each}
    {/if}
    <line class="axis" x1={g.plot.x0} x2={g.plot.x1} y1={g.plot.y1} y2={g.plot.y1} />
    {#if g.d}<path class="line" d={g.d} />{/if}
    {#if mode === 'points'}
      {#each g.points as p (p.t)}<circle class="pt" cx={p.x} cy={p.y} r="2.4" />{/each}
    {/if}
    {#if last}<circle class="last" cx={last.x} cy={last.y} r="3" />{/if}
    {#if g.empty}<text class="tick" x={(g.plot.x0 + g.plot.x1) / 2} y={(g.plot.y0 + g.plot.y1) / 2} text-anchor="middle">No values</text>{/if}
  </svg>
</div>

<style>
  .wrap { min-width: 0; width: 100%; }
  svg { display: block; max-width: 100%; overflow: visible; }
  text { font-family: var(--font-mono); font-size: 10px; fill: var(--text-body); }
  .grid { stroke: var(--divider); stroke-width: 1; }
  .axis { stroke: var(--border-strong); stroke-width: 1; }
  .win { fill: var(--selected-bg); stroke: var(--border-strong); stroke-width: 1; stroke-dasharray: 3 3; }
  .band { fill: var(--bg-tint); }
  .mean { stroke: var(--text-body); stroke-width: 1.2; stroke-dasharray: 4 3; }
  .line { fill: none; stroke: var(--link); stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
  .pt { fill: var(--bg-surface); stroke: var(--link); stroke-width: 1.4; }
  .last { fill: var(--link); stroke: var(--bg-surface); stroke-width: 1.2; }
</style>
