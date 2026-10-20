<script lang="ts">
  // the Matrix: places grouped by their gazetteer collection against indicators grouped by the chosen vocabulary. `axes`
  // says which runs down the rows: indicators (the default, places across) or places. it scrolls inside its own box,
  // with the first column and the header rows sticky in both orientations. every place and indicator header has a
  // remove button (`onhide`); every place group says how many of its places are computed, links to the gazetteer (a group nothing
  // is computed for also links to a request) and, past 300 places, says it lists the first of them. a place no one has computed
  // is a row (or column) of "not computed yet" cells with the ways forward.
  import { tick } from 'svelte'
  import { Icon } from '../../../src/icons/index.ts'
  import { gazetteerHref } from './data.ts'
  import type { Catalog, Indicator, VocabId } from './data.ts'
  import { cellModel, computedOf, pickRow, shortPlaceName } from './matrix.ts'
  import { requestHref } from './nextSteps.ts'
  import type { ColumnGroup, CoverageIndex, Place, RowGroup } from './matrix.ts'
  import type { Axes, Depth } from './hash.ts'
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
    axes?: Axes
    titles: (coll: string) => string
    /** a group's number of places in the gazetteer (null until layers.json has loaded) */
    totals?: (coll: string) => number | null
    open: { place: string; indicator: string } | null
    onopen: (placeId: string, indicator: string) => void
    /** remove a place or an indicator from the display */
    onhide: (kind: 'place' | 'indicator', id: string) => void | Promise<void>
    /** the href of a place's view */
    placeHref: (placeId: string, coll: string) => string
  }
  let { catalog, idx, cols, rows, vocab, depth, axes = 'indicators', titles, totals = () => null, open, onopen, onhide, placeHref }: Props = $props()

  const flat = $derived(cols.flatMap(g => g.indicators))
  const flatPlaces = $derived(rows.flatMap(g => g.places))
  const indRows = $derived(axes === 'indicators')
  // the cells are the same in both orientations; only the loop order differs
  const width = $derived((indRows ? flatPlaces.length : flat.length) + 1)
  // a group's places that have coverage (not only those on display) of the gazetteer's places in it
  const computed = $derived(new Map(idx.colls.map(c => [c, idx.places.filter(p => p.coll === c).length])))
  const base = import.meta.env.BASE_URL
  let missingBadge = $state<Record<string, boolean>>({})
  let box = $state<HTMLDivElement>()

  const model = (ind: Indicator, p: Place) => cellModel(ind, p, pickRow(idx, p.id, ind))
  const isOpen = (ind: Indicator, p: Place) => open?.place === p.id && open?.indicator === ind.id
  const emptyWhy = $derived(flatPlaces.length === 0 ? 'No place is chosen, or none matches the search. Choose places in the Select section above, or clear the search.' : 'No indicator is chosen. Choose indicators in the Select section above.')

  // removing a header drops the button the keyboard is on: put focus on the next remove button of the same kind
  async function hide(kind: 'place' | 'indicator', id: string) {
    const all = () => [...(box?.querySelectorAll<HTMLButtonElement>(`button.x[data-kind="${kind}"]`) ?? [])]
    const at = all().findIndex(b => b.dataset.id === id)
    await onhide(kind, id)
    await tick()
    const left = all()
    ;(left[Math.min(at, left.length - 1)] ?? box)?.focus({ preventScroll: true })
  }
</script>

{#snippet remove(kind: 'place' | 'indicator', id: string, name: string)}
  <button type="button" class="x" data-kind={kind} data-id={id} aria-label="Remove {name} from the matrix" onclick={() => hide(kind, id)}>
    <Icon name="ui-close" size={14} />
  </button>
{/snippet}

{#snippet placeHead(p: Place)}
  <a class="pn" href={placeHref(p.id, p.coll)} data-place={p.id} title="{p.name} ({p.id}): open the place view" aria-label="{p.name}, {p.id}: open the place view">{shortPlaceName(p.name)}</a>
  <span class="pid">{p.id}</span>
  {@render remove('place', p.id, p.name)}
{/snippet}

{#snippet groupHead(g: RowGroup)}
  {@const coll = g.coll}
  <span class="gh gp">
    <span class="gt">{titles(coll)}</span>
    <span class="gn">{computedOf(computed.get(coll) ?? 0, totals(coll))} computed ·
      <a class="gz" href={gazetteerHref(coll)} target="_blank" rel="noopener">in the gazetteer<Icon name="ui-external" size={12} /><span class="mbon-sr-only"> (opens in a new tab)</span></a>
      {#if !computed.get(coll)}· <a class="gz" href={requestHref({ collection: coll, collectionTitle: titles(coll) })} target="_blank" rel="noopener">ask for it<Icon name="ui-external" size={12} /><span class="mbon-sr-only"> (a pre-filled GitHub issue; opens in a new tab)</span></a>{/if}</span>
    {#if g.total}<span class="gn">The first {g.places.length} of {g.total.toLocaleString('en-US')} places: search, or pick places in the Select section, to narrow it.</span>{/if}
  </span>
{/snippet}

{#snippet indHead(ind: Indicator, glyph: ReturnType<typeof asIcon>)}
  <span class="t">{#if glyph}<Icon name={glyph} size={16} />{/if}<span>{ind.short}</span></span>
  <span class="u">{ind.unit_label || 'unitless'} · by {ind.status_grain}</span>
  {@render remove('indicator', ind.id, ind.short)}
{/snippet}

{#snippet termHead(g: ColumnGroup)}
  {@const gi = asIcon(g.term.glyph)}
  <span class="gh">
    {#if vocab === 'eov' && !missingBadge[g.term.id]}
      <img class="badge" src={badgeUrl(base, g.term.id)} alt="{g.term.label} (GOOS EOV badge)" width="28" height="28"
        onerror={() => (missingBadge[g.term.id] = true)} />
    {/if}
    {#if gi}<Icon name={gi} size={18} />{/if}
    <span class="mbon-label">{g.term.label}</span>
  </span>
{/snippet}

<!-- the headers hold a link and a remove button per place or indicator, so the cells sit far down the Tab order: a skip
     button, shown on focus, goes straight to the first cell -->
<button type="button" class="skip" onclick={() => box?.querySelector<HTMLButtonElement>('button.cell')?.focus()}>Skip to the first cell</button>
<div class="box" role="region" aria-label={indRows ? 'Indicators by places' : 'Places by indicators'} tabindex="-1" bind:this={box}>
  <table class="matrix om-t" class:indrows={indRows}>
    <thead>
      <tr class="groups">
        <th class="rowh corner" scope="col" rowspan="2"><span class="mbon-label">{indRows ? 'Indicator' : 'Place'}</span></th>
        {#if indRows}
          {#each rows as g (g.coll)}
            <th scope="colgroup" colspan={g.places.length} class="group">{@render groupHead(g)}</th>
          {/each}
        {:else}
          {#each cols as g (g.term.id)}
            <th scope="colgroup" colspan={g.indicators.length} class="group">{@render termHead(g)}</th>
          {/each}
        {/if}
      </tr>
      <tr class="heads">
        {#if indRows}
          {#each flatPlaces as p (p.id)}
            <th scope="col" class="colh">{@render placeHead(p)}</th>
          {/each}
        {:else}
          {#each cols as g (g.term.id)}
            {#each g.indicators as ind (ind.id)}
              <th scope="col" class="colh ind" title={ind.title}>{@render indHead(ind, asIcon(g.term.glyph))}</th>
            {/each}
          {/each}
        {/if}
      </tr>
    </thead>
    <tbody>
      {#if indRows}
        {#each cols as g (g.term.id)}
          <tr class="band"><th colspan={width} scope="colgroup">{@render termHead(g)}</th></tr>
          {#each g.indicators as ind (ind.id)}
            <tr>
              <th class="rowh ind" scope="row" title={ind.title}>{@render indHead(ind, asIcon(g.term.glyph))}</th>
              {#each flatPlaces as p (p.id)}
                <td><Cell {ind} place={p} model={model(ind, p)} {depth} groupTitle={titles(p.coll)} open={isOpen(ind, p)} {onopen} /></td>
              {/each}
            </tr>
          {/each}
        {/each}
      {:else}
        {#each rows as g (g.coll)}
          <tr class="band">
            <th colspan={width} scope="colgroup">{@render groupHead(g)}</th>
          </tr>
          {#each g.places as p (p.id)}
            <tr>
              <th class="rowh" scope="row">{@render placeHead(p)}</th>
              {#each flat as ind (ind.id)}
                <td><Cell {ind} place={p} model={model(ind, p)} {depth} groupTitle={titles(p.coll)} open={isOpen(ind, p)} {onopen} /></td>
              {/each}
            </tr>
          {/each}
        {/each}
      {/if}
      {#if flat.length === 0 || flatPlaces.length === 0}
        <tr><td class="empty" colspan={width}>{emptyWhy}</td></tr>
      {/if}
    </tbody>
  </table>
</div>

<style>
  .box {
    --place-w: 13.5rem;
    --grp-h: 4.5rem;
    overflow: auto;
    max-height: min(72dvh, 52rem);
    min-height: 12rem;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overscroll-behavior: contain;
  }
  .box:focus-visible { outline-offset: 2px; }
  .skip { position: absolute; left: -9999px; }
  .skip:focus-visible {
    position: static; justify-self: start; padding: var(--space-1) var(--space-3);
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--control-bg);
    font: var(--type-small); color: var(--text-strong);
  }
  td { min-width: 9.5rem; width: 9.5rem; vertical-align: top; }
  td.empty { padding: var(--space-5); color: var(--text-body); }

  /* header rows: the group row, then the heads row below it */
  thead tr.groups th { top: 0; height: var(--grp-h); border-bottom: 1px solid var(--border); vertical-align: middle; }
  thead tr.heads th { top: var(--grp-h); vertical-align: bottom; border-bottom: 1px solid var(--border-strong); }
  th.group { padding: 0 var(--space-3); }
  .gh { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--label-color); position: sticky; left: calc(var(--place-w) + var(--space-3)); }
  .badge { width: 28px; height: 28px; border-radius: 50%; flex: none; }

  /* a column head or a row head holds a place or an indicator; the right padding keeps room for its remove button */
  th.colh, th.rowh { position: sticky; padding: var(--space-2) 2rem var(--space-2) var(--space-3); }
  th.rowh { left: 0; z-index: 2; background: var(--bg-surface); min-width: var(--place-w); max-width: var(--place-w); width: var(--place-w); border-right: 1px solid var(--border); }
  thead th.rowh { z-index: 4; top: 0; vertical-align: bottom; }
  .ind .t { display: flex; align-items: flex-start; gap: var(--space-1); font: var(--fw-semibold) var(--text-sm) / 1.2 var(--font-sans); color: var(--text-strong); }
  .ind .t :global(svg) { margin-top: 1px; color: var(--label-color); flex: none; }
  .ind .u { display: block; margin-top: 2px; font: var(--fw-regular) 0.6875rem / 1.3 var(--font-mono); color: var(--text-body); }
  .pn { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; line-clamp: 4; overflow: hidden; font: var(--fw-medium) var(--text-sm) / 1.25 var(--font-sans); color: var(--text-strong); text-decoration: underline; text-decoration-color: var(--border-strong); text-underline-offset: 3px; }
  .pn:hover { color: var(--link); text-decoration-color: currentColor; }
  .pid { display: block; margin-top: 2px; font: var(--fw-regular) 0.6875rem / 1.3 var(--font-mono); color: var(--text-body); overflow-wrap: anywhere; }
  tr.band .gh { position: sticky; left: var(--space-3); }
  /* a place group's head: its title, then "n of N computed" and the gazetteer link; wraps in a one-column group */
  .gp { display: block; width: max-content; max-width: min(100%, 24rem); white-space: normal; }
  .gt { display: block; font: var(--fw-semibold) var(--text-sm) / 1.2 var(--font-sans); }
  .gn { display: block; margin-top: 2px; font: var(--type-small); font-size: 0.75rem; line-height: 1.3; color: var(--text-body); }
  .gz { white-space: nowrap; }
  .gz :global(svg) { vertical-align: -1px; margin-left: 2px; }

  /* the remove button sits in the top right corner of its header, out of the flow so it never shifts the layout; shown
     on hover or focus, always on touch screens */
  .x {
    position: absolute;
    top: var(--space-1);
    right: var(--space-1);
    display: inline-grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-body);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.12s;
  }
  th:hover > .x, th:focus-within > .x, .x:focus-visible { opacity: 1; }
  .x:hover { background: var(--bg-tint); color: var(--text-strong); }
  @media (hover: none) {
    .x { opacity: 1; width: 2rem; height: 2rem; top: 0; right: 0; }
    th.colh, th.rowh { padding-right: 2.25rem; }
  }
  @media (prefers-reduced-motion: reduce) { .x { transition: none; } }

  @media (max-width: 640px) {
    .box { --place-w: 8.75rem; max-height: 68dvh; }
    td { min-width: 8.75rem; width: 8.75rem; }
    .pid { display: none; }
    table.indrows .pid { display: block; }
    .gh { left: calc(var(--place-w) + var(--space-2)); }
    th.colh, th.rowh { padding-left: var(--space-2); }
    tr.band .gh { left: var(--space-2); }
  }
</style>
