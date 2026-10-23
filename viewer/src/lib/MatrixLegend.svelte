<script lang="ts">
  // the key to a cell, always shown above the grid: what each empty state means in one line, then the statistical
  // (not better or worse) status and trend glyphs. with the EOV vocabulary it also shows the GOOS badge and its credit.
  import { Icon } from '../../../src/icons/index.ts'
  import { STATUS_WORDS } from '@oceanmetrics/status'
  import { GOOS_CREDIT } from './credits.ts'
  import { STATE_WORDS } from './matrix.ts'
  import type { VocabId } from './data.ts'
  import { badgeUrl } from './delivery.ts'

  let { vocab }: { vocab: VocabId } = $props()
  const base = import.meta.env.BASE_URL
</script>

<section class="legend" id="legend" aria-label="How to read a cell">
  <ul>
    <li><Icon name="cell-live" size={18} /><span><b>{STATE_WORDS.live}</b>: open it to compute or request it</span></li>
    <li><Icon name="cell-na" size={18} /><span><b>{STATE_WORDS.nodata}</b>: no values for this place</span></li>
    <li><span class="dash" aria-hidden="true">{STATE_WORDS.na}</span><span><b>not offered</b> for this kind of place</span></li>
    <li>
      <Icon name="st-above" size={18} /><Icon name="st-within" size={18} /><Icon name="st-below" size={18} />
      <span><b>status</b> relative to its own record: above, within, below (not better or worse)</span>
    </li>
    <li>
      <Icon name="tr-up" size={18} /><Icon name="tr-flat" size={18} /><Icon name="tr-down" size={18} />
      <span><b>trend</b>: up, flat, down</span>
    </li>
    <li><Icon name="st-none" size={18} /><span><b>{STATUS_WORDS.none}</b>: short record</span></li>
    {#if vocab === 'eov'}
      <li class="goos">
        <img src={badgeUrl(base, 'physics')} alt="Physics EOVs (GOOS EOV badge)" width="24" height="24" />
        <span>{GOOS_CREDIT}</span>
      </li>
    {/if}
  </ul>
</section>

<style>
  .legend { padding: var(--space-2) var(--space-3); background: var(--bg-tint); border-radius: var(--radius-md); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); }
  li { display: inline-flex; align-items: center; gap: var(--space-1); font: var(--type-small); font-size: 0.8125rem; color: var(--text-body); }
  li :global(svg) { color: var(--text-strong); flex: none; }
  b { color: var(--text-strong); font-weight: var(--fw-semibold); }
  .dash { display: inline-grid; place-items: center; width: 18px; color: var(--text-body); }
  .goos img { border-radius: 50%; flex: none; }
</style>
