<script lang="ts">
  // the key to the glyphs: statuses and trends in words, the empty-cell states, and the statistical (not better or
  // worse) reading. with the EOV vocabulary it also shows the GOOS badge and its credit.
  import { Icon } from '../../../src/icons/index.ts'
  import { GOOS_CREDIT } from './credits.ts'
  import { STATUS_WORDS } from './matrix.ts'
  import type { VocabId } from './data.ts'
  import { badgeUrl } from './delivery.ts'

  let { vocab }: { vocab: VocabId } = $props()
  const base = import.meta.env.BASE_URL
</script>

<section class="legend" id="legend" aria-labelledby="legend-h">
  <h2 id="legend-h" class="mbon-label">How to read a cell</h2>
  <p class="rule">
    A status says where the recent years sit <strong>relative to the place's own record</strong>. It does not say better or worse.
  </p>
  <div class="cols">
    <div>
      <h3 class="mbon-label k">Status</h3>
      <ul>
        <li><Icon name="st-above" size={20} /><span>{STATUS_WORDS.above}</span></li>
        <li><Icon name="st-within" size={20} /><span>{STATUS_WORDS.within}</span></li>
        <li><Icon name="st-below" size={20} /><span>{STATUS_WORDS.below}</span></li>
        <li><Icon name="st-none" size={20} /><span>{STATUS_WORDS.none}: the record is too short, or the indicator has no status</span></li>
      </ul>
    </div>
    <div>
      <h3 class="mbon-label k">Trend over the recent years</h3>
      <ul>
        <li><Icon name="tr-up" size={20} /><span>up</span></li>
        <li><Icon name="tr-flat" size={20} /><span>flat (changed by less than the record's usual spread)</span></li>
        <li><Icon name="tr-down" size={20} /><span>down</span></li>
      </ul>
    </div>
    <div>
      <h3 class="mbon-label k">Empty cells</h3>
      <ul>
        <li><Icon name="cell-live" size={20} /><span>on the fly: not computed yet, but computable in the browser</span></li>
        <li><Icon name="cell-na" size={20} /><span>no data for this place, or not applicable to this kind of place</span></li>
      </ul>
    </div>
    {#if vocab === 'eov'}
      <div>
        <h3 class="mbon-label k">GOOS EOV badges</h3>
        <p class="goos">
          <img src={badgeUrl(base, 'physics')} alt="Physics EOVs (GOOS EOV badge)" width="32" height="32" />
          <span>{GOOS_CREDIT}</span>
        </p>
      </div>
    {/if}
  </div>
</section>

<style>
  .legend { display: grid; gap: var(--space-3); padding: var(--space-4); background: var(--bg-tint); border-radius: var(--radius-md); }
  h2, h3 { margin: 0; }
  .rule { margin: 0; color: var(--text-body); font: var(--type-small); }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: var(--space-4); }
  .k { display: block; margin-bottom: var(--space-2); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
  li { display: flex; align-items: flex-start; gap: var(--space-2); font: var(--type-small); color: var(--text-body); }
  li :global(svg) { color: var(--text-strong); margin-top: 1px; }
  .goos { display: flex; align-items: center; gap: var(--space-2); margin: 0; font: var(--type-small); color: var(--text-body); }
  .goos img { border-radius: 50%; flex: none; }
</style>
