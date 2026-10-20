<script lang="ts">
  // the Matrix: rows are places grouped by collection, columns are indicators grouped by the chosen vocabulary.
  // it scrolls inside its own box, with the place column and the headers sticky.
  import { Icon } from '../../../src/icons/index.ts'
  import type { Catalog, VocabId } from './data.ts'
  import { cellModel, pickRow } from './matrix.ts'
  import type { ColumnGroup, CoverageIndex, RowGroup } from './matrix.ts'
  import type { Depth } from './hash.ts'
  import { badgeUrl } from './delivery.ts'
  import { asIcon } from './icons.ts'
  import Cell from './Cell.svelte'

  interface Props {
    catalog: Catalog
    idx: CoverageIndex
    cols: ColumnGroup[]
    rows: RowGroup[]
    vocab: VocabId
    depth: Depth
    titles: (coll: string) => string
    open: { place: string; indicator: string } | null
    onopen: (placeId: string, indicator: string) => void
    /** the href of a place's view */
    placeHref: (placeId: string, coll: string) => string
  }
  let { catalog, idx, cols, rows, vocab, depth, titles, open, onopen, placeHref }: Props = $props()

  const flat = $derived(cols.flatMap(g => g.indicators))
  const base = import.meta.env.BASE_URL
  let missingBadge = $state<Record<string, boolean>>({})
</script>

<div class="box" role="region" aria-label="Places by indicators" tabindex="-1">
  <table class="matrix">
    <thead>
      <tr class="groups">
        <th class="place corner" scope="col" rowspan="2"><span class="mbon-label">Place</span></th>
        {#each cols as g (g.term.id)}
          {@const gi = asIcon(g.term.glyph)}
          <th scope="colgroup" colspan={g.indicators.length} class="group">
            <span class="gh">
              {#if vocab === 'eov' && !missingBadge[g.term.id]}
                <img class="badge" src={badgeUrl(base, g.term.id)} alt="{g.term.label} (GOOS EOV badge)" width="28" height="28"
                  onerror={() => (missingBadge[g.term.id] = true)} />
              {/if}
              {#if gi}<Icon name={gi} size={18} />{/if}
              <span class="mbon-label">{g.term.label}</span>
            </span>
          </th>
        {/each}
      </tr>
      <tr class="inds">
        {#each cols as g (g.term.id)}
          {#each g.indicators as ind (ind.id)}
            {@const ci = asIcon(g.term.glyph)}
            <th scope="col" class="ind" title={ind.title}>
              <span class="t">{#if ci}<Icon name={ci} size={16} />{/if}<span>{ind.short}</span></span>
              <span class="u">{ind.unit_label || 'unitless'} · by {ind.status_grain}</span>
            </th>
          {/each}
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as g (g.coll)}
        <tr class="coll">
          <th colspan={flat.length + 1} scope="colgroup"><span class="collname mbon-label">{titles(g.coll)} · {g.places.length}</span></th>
        </tr>
        {#each g.places as p (p.id)}
          <tr>
            <th class="place" scope="row">
              <a class="pn" href={placeHref(p.id, p.coll)} data-place={p.id} title="Open the place view of {p.name}">{p.name}</a>
              <span class="pid">{p.id}</span>
            </th>
            {#each flat as ind (ind.id)}
              <td>
                <Cell {ind} place={p} model={cellModel(ind, p, pickRow(idx, p.id, ind))} {depth}
                  open={open?.place === p.id && open?.indicator === ind.id} {onopen} />
              </td>
            {/each}
          </tr>
        {/each}
      {/each}
      {#if rows.length === 0}
        <tr><td class="empty" colspan={flat.length + 1}>No place matches. Clear the search or pick other collections.</td></tr>
      {/if}
    </tbody>
  </table>
</div>

<style>
  .box {
    --place-w: 13.5rem;
    --grp-h: 3.25rem;
    overflow: auto;
    max-height: min(72dvh, 52rem);
    min-height: 12rem;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overscroll-behavior: contain;
  }
  .box:focus-visible { outline-offset: 2px; }
  table.matrix {
    border-collapse: separate;
    border-spacing: 0;
    width: max-content;
    min-width: 100%;
    font-variant-numeric: tabular-nums;
  }
  th, td { padding: 0; border-bottom: 1px solid var(--divider); text-align: left; font-weight: inherit; }
  td { min-width: 9.5rem; width: 9.5rem; vertical-align: top; }
  td.empty { padding: var(--space-5); color: var(--text-body); }

  thead th { position: sticky; background: var(--bg-surface); z-index: 3; }
  thead tr.groups th { top: 0; height: var(--grp-h); border-bottom: 1px solid var(--border); vertical-align: middle; }
  thead tr.inds th { top: var(--grp-h); padding: var(--space-2) var(--space-3); vertical-align: bottom; border-bottom: 1px solid var(--border-strong); }
  th.group { padding: 0 var(--space-3); }
  .gh { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--label-color); position: sticky; left: calc(var(--place-w) + var(--space-3)); }
  .badge { width: 28px; height: 28px; border-radius: 50%; flex: none; }
  .ind .t { display: flex; align-items: flex-start; gap: var(--space-1); font: var(--fw-semibold) var(--text-sm) / 1.2 var(--font-sans); color: var(--text-strong); }
  .ind .t :global(svg) { margin-top: 1px; color: var(--label-color); }
  .ind .u { display: block; margin-top: 2px; font: var(--fw-regular) 0.6875rem / 1.3 var(--font-mono); color: var(--text-body); }

  th.place { position: sticky; left: 0; z-index: 2; background: var(--bg-surface); min-width: var(--place-w); max-width: var(--place-w); width: var(--place-w); padding: var(--space-2) var(--space-3); border-right: 1px solid var(--border); }
  thead th.place { z-index: 4; top: 0; vertical-align: bottom; }
  .pn { display: block; font: var(--fw-medium) var(--text-sm) / 1.25 var(--font-sans); color: var(--text-strong); text-decoration: underline; text-decoration-color: var(--border-strong); text-underline-offset: 3px; }
  .pn:hover { color: var(--link); text-decoration-color: currentColor; }
  .pid { display: block; margin-top: 2px; font: var(--fw-regular) 0.6875rem / 1.3 var(--font-mono); color: var(--text-body); }
  tr.coll th { position: sticky; left: 0; background: var(--bg-tint); padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); }
  .collname { position: sticky; left: var(--space-3); display: inline-block; }

  @media (max-width: 640px) {
    .box { --place-w: 8.75rem; max-height: 68dvh; }
    td { min-width: 8.75rem; width: 8.75rem; }
    .pid { display: none; }
    .gh { left: calc(var(--place-w) + var(--space-2)); }
  }
</style>
