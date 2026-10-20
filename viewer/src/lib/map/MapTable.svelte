<script lang="ts">
  // the map as a table: every place with its value, period and class, sorted by class then value. this is the
  // accessible version of the map, and the way to read the places the map draws too small to see.
  import { Icon } from '../../../../src/icons/index.ts'
  import { tableOrder } from './classes.ts'
  import type { MapModel } from './classes.ts'

  interface Props {
    model: MapModel
    /** the href of a place's view */
    placeHref: (placeId: string) => string
    selected: string | null
    caption: string
  }
  let { model, placeHref, selected, caption }: Props = $props()
  const rows = $derived(tableOrder(model.items))
</script>

<details class="table" open>
  <summary>The map as a table <span class="n">{rows.length} {rows.length === 1 ? 'place' : 'places'}</span></summary>
  <div class="scroll" class:tall={rows.length > 40}>
    <table>
      <caption class="mbon-sr-only">{caption}</caption>
      <thead>
        <tr><th scope="col">Place</th><th scope="col" class="num">Value</th><th scope="col">Period</th><th scope="col">Class</th></tr>
      </thead>
      <tbody>
        {#each rows as it (it.placeId)}
          {@const leg = it.k != null ? model.legend[it.k] : null}
          <tr class:sel={it.placeId === selected}>
            <th scope="row"><a href={placeHref(it.placeId)}>{it.name}</a></th>
            <td class="num">{it.valueText ?? '–'}</td>
            <td>{it.periodText ?? '–'}</td>
            <td class="cls">
              {#if leg}
                <span class="sw" style:background="var({leg.token})" aria-hidden="true"></span>
                {#if leg.glyph}<Icon name={leg.glyph} size={16} />{/if}
              {:else}
                <span class="sw none" style:border-color="var({model.none})" aria-hidden="true"></span>
              {/if}
              <span>{it.label}</span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</details>

<style>
  .table { background: var(--bg-tint); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); min-width: 0; }
  summary { cursor: pointer; font: var(--type-label); text-transform: uppercase; letter-spacing: var(--ls-label); color: var(--text-strong); }
  .n { font: var(--type-small); text-transform: none; letter-spacing: 0; color: var(--text-body); margin-left: var(--space-2); }
  .scroll { overflow-x: auto; margin-top: var(--space-3); }
  .scroll.tall { max-height: 32rem; overflow-y: auto; }
  table { border-collapse: collapse; width: 100%; font: var(--type-small); color: var(--text-body); }
  th, td { text-align: left; padding: var(--space-1) var(--space-3) var(--space-1) 0; vertical-align: middle; white-space: nowrap; }
  thead th { position: sticky; top: 0; background: var(--bg-tint); font: var(--type-label); text-transform: uppercase; letter-spacing: var(--ls-label); color: var(--text-body); }
  tbody th { font-weight: var(--fw-medium); white-space: normal; min-width: 10rem; }
  tbody tr + tr > * { border-top: 1px solid var(--border); }
  .num { text-align: right; font-variant-numeric: tabular-nums; padding-right: var(--space-4); }
  .cls { display: flex; align-items: center; gap: var(--space-2); white-space: normal; min-width: 12rem; }
  .cls :global(svg) { color: var(--text-strong); flex: none; }
  .sw { flex: none; width: 1rem; height: 0.875rem; border-radius: 2px; border: 1px solid var(--border-strong); }
  .sw.none { background: transparent; border-width: 2px; }
  @media (max-width: 640px) {
    thead th:nth-child(3), tbody td:nth-child(3) { display: none; }
    .cls { min-width: 0; }
    tbody th { min-width: 0; }
  }
  tr.sel > * { background: var(--bg-surface); }
</style>
