<script lang="ts">
  // the class shares of a categorical indicator as stacked columns per period (a stacked area at month grain, where
  // the columns are one pixel wide), with a legend of the top classes and "other". tokens only for colour.
  import { stackChart, OTHER_KEY } from './chart.ts'
  import { fmt } from '../../../src/status/index.ts'
  import type { CardModel } from './place.ts'

  let { model }: { model: CardModel } = $props()
  let w = $state(640)
  const h = $derived(w < 480 ? 210 : 240)
  const stack = $derived(model.stack!)
  const g = $derived(stackChart(stack, w, h))
  const swatch = (i: number) => (stack.classes[i]?.key === OTHER_KEY ? 'c-other' : `c${i}`)
</script>

<div class="wrap" bind:clientWidth={w}>
  <svg viewBox="0 0 {w} {h}" width={w} height={h} role="img" aria-label={model.alt} focusable="false">
    {#each g.yTicks as t (t.label)}
      <line class="grid" x1={g.plot.x0} x2={g.plot.x1} y1={t.y} y2={t.y} />
      <text class="tick" x={g.plot.x0 - 6} y={t.y + 3.5} text-anchor="end">{t.label}</text>
    {/each}
    {#each g.bars as b (b.t)}
      {#each b.segs as s, i (i)}
        {#if s.h > 0}<rect class={swatch(i)} x={b.x} y={s.y} width={b.w} height={s.h} />{/if}
      {/each}
    {/each}
    {#each g.xTicks as t (t.label)}
      <line class="xtick" x1={t.x} x2={t.x} y1={g.plot.y1} y2={g.plot.y1 + 4} />
      <text class="tick" x={t.x} y={g.plot.y1 + 16} text-anchor="middle">{t.label}</text>
    {/each}
    <line class="axis" x1={g.plot.x0} x2={g.plot.x1} y1={g.plot.y1} y2={g.plot.y1} />
    <text class="unit" x="4" y="11">share of the area</text>
  </svg>
  <ul class="key" aria-label="Classes, largest mean share first">
    {#each stack.classes as c, i (c.key)}
      <li><span class="sw {swatch(i)}"></span>{c.label} <span class="pct">{fmt(c.mean * 100, 0)}%</span></li>
    {/each}
  </ul>
</div>

<style>
  .wrap { min-width: 0; width: 100%; --c0: var(--pipe-dataset-ink); --c1: var(--pipe-method-ink); --c2: var(--pipe-delivery-ink); --c3: var(--pipe-place-ink); --c4: var(--facet-org); --c5: var(--facet-content); --c-other: var(--text-muted); }
  svg { display: block; max-width: 100%; overflow: visible; }
  text { font-family: var(--font-mono); font-size: 11px; fill: var(--text-body); }
  .unit { fill: var(--text-strong); font-weight: 600; }
  .grid { stroke: var(--divider); stroke-width: 1; }
  .axis, .xtick { stroke: var(--border-strong); stroke-width: 1; }
  rect { stroke: var(--bg-surface); stroke-width: 0.5; }
  .c0 { fill: var(--c0); } .c1 { fill: var(--c1); } .c2 { fill: var(--c2); } .c3 { fill: var(--c3); } .c4 { fill: var(--c4); } .c5 { fill: var(--c5); } .c-other { fill: var(--c-other); }
  .key { list-style: none; margin: var(--space-1) 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); font: var(--type-small); font-size: 0.75rem; color: var(--text-body); }
  .key li { display: inline-flex; align-items: center; gap: var(--space-2); }
  .pct { font-family: var(--font-mono); color: var(--text-muted); }
  .sw { display: inline-block; width: 0.75rem; height: 0.75rem; border-radius: 2px; }
  .sw.c0 { background: var(--c0); } .sw.c1 { background: var(--c1); } .sw.c2 { background: var(--c2); } .sw.c3 { background: var(--c3); } .sw.c4 { background: var(--c4); } .sw.c5 { background: var(--c5); } .sw.c-other { background: var(--c-other); }
</style>
