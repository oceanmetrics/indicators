<script lang="ts">
  // the key to the colours: one row per class with its swatch, its words and (status, trend) its glyph, the places in
  // it, and the outline that means "no value". it reads without colour: the words and glyphs say everything the
  // swatch says.
  import { Icon } from '../../../../src/icons/index.ts'
  import { MODE_LABELS } from './classes.ts'
  import type { MapModel } from './classes.ts'

  interface Props {
    model: MapModel
    /** the unit, for value legends that name it in their title */
    unit?: string
    /** the line of the layer under the map (its title, period and source), or nothing */
    layer?: string
    /** the layer's colour ramp, low to high (its numbers are in the layer line too) */
    ramp?: { min: number; max: number; colors: string[] } | null
    rampUnit?: string | null
  }
  let { model, unit = '', layer = '', ramp = null, rampUnit = '' }: Props = $props()
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2))
  const none = $derived(model.items.filter(i => i.k == null).length)
</script>

<section class="legend" aria-labelledby="map-legend-h">
  <h2 id="map-legend-h" class="mbon-label">Legend · {MODE_LABELS[model.color]}{model.color === 'value' && unit ? ` (${unit})` : ''}</h2>
  <ul>
    {#each model.legend as l (l.k)}
      <li class:empty={l.count === 0}>
        <span class="sw" style:background="var({l.token})" aria-hidden="true"></span>
        {#if l.glyph}<Icon name={l.glyph} size={18} />{/if}
        <span class="w">{l.label}</span>
        <span class="n">{l.count}</span>
      </li>
    {/each}
    <li class:empty={none === 0}>
      <span class="sw none" style:border-color="var({model.none})" aria-hidden="true"></span>
      <span class="w">{model.noneLabel}</span>
      <span class="n">{none}</span>
    </li>
  </ul>
  {#if model.color === 'status' || model.color === 'trend'}
    <p class="note">Relative to each place’s own record, not better or worse.</p>
  {/if}
  {#if ramp}
    <div class="ramp" role="img" aria-label="layer colours from {fmt(ramp.min)} to {fmt(ramp.max)}{rampUnit ? ` ${rampUnit}` : ''}">
      <span class="bar" style:background="linear-gradient(to right, {ramp.colors.join(', ')})"></span>
      <span class="ends"><span>{fmt(ramp.min)}</span><span>{fmt(ramp.max)}{rampUnit ? ` ${rampUnit}` : ''}</span></span>
    </div>
  {/if}
  {#if layer}<p class="note">{layer}</p>{/if}
</section>

<style>
  .legend { display: grid; gap: var(--space-2); }
  h2 { margin: 0; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
  li { display: flex; align-items: center; gap: var(--space-2); font: var(--type-small); color: var(--text-body); min-width: 0; }
  li :global(svg) { color: var(--text-strong); flex: none; }
  .sw { flex: none; width: 1.25rem; height: 1rem; border-radius: 2px; border: 1px solid var(--border-strong); }
  .sw.none { background: transparent; border-width: 2px; }
  .w { flex: 1; min-width: 0; overflow-wrap: anywhere; color: var(--text-strong); }
  .n { flex: none; font-variant-numeric: tabular-nums; color: var(--text-body); }
  .empty .w, .empty .n { color: var(--text-body); }
  .ramp { display: grid; gap: 2px; }
  .bar { display: block; height: 0.7rem; border-radius: 2px; border: 1px solid var(--border-strong); }
  .ends { display: flex; justify-content: space-between; font: var(--text-xs) / 1.2 var(--font-mono); color: var(--text-body); }
  .note { margin: 0; font: var(--type-small); color: var(--text-body); }
</style>
