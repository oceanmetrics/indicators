<script lang="ts">
  // the Matrix: places grouped by their gazetteer collection against indicators grouped by the chosen vocabulary. `axes`
  // says which runs down the rows: indicators (the default, places across) or places. it scrolls inside its own box,
  // with the first column and the header rows sticky in both orientations. every place and indicator header has a
  // remove button (`onhide`); every place group says how many of its places are computed, links to the gazetteer (a group nothing
  // is computed for also links to a request) and, past 300 places, says it lists the first of them. a place no one has computed
  // is a row (or column) of "not computed yet" cells with the ways forward. the order is the selection's (src/report/order.ts): with
  // grouping off on an axis the group headers (and the bands) of that axis are not drawn. every header can be moved: dragged onto
  // another header of its group (a whole group onto another group), or with Alt and the arrow keys, or with the small move buttons
  // that appear on hover and focus (always on a touch screen); reorder.ts has the rules, `onmove` reports the new arrangement.
  // a place's name links to its record page on the places site (the front door of a place); every cell opens the drawer, whose
  // links lead to the Place view. each header says its counts (above, within, below, without a status, the latest period) on
  // hover and focus, always on a touch screen. an OBIS series without a status rule is one row (or column), its lead, with a
  // disclosure that shows the rest (matrix.ts `foldColumns`, `ontogglefold`). the rows given are one page of the places.
  import { tick } from 'svelte'
  import { Icon } from '../../../src/icons/index.ts'
  import { gazetteerHref, placesPageHref } from './data.ts'
  import type { Catalog, Indicator, VocabId } from './data.ts'
  import { cellModel, computedOf, COUNT_PARTS, foldWords, headerCounts, pickRow, shortPlaceName } from './matrix.ts'
  import { requestHref } from './nextSteps.ts'
  import type { ColumnGroup, CoverageIndex, Place, Rollup, RowGroup, SeriesFold } from './matrix.ts'
  import type { Axes, Depth } from './hash.ts'
  import type { OrderSpec, Shown } from '../../../src/report/order.ts'
  import { createReorder } from './reorder.ts'
  import type { OrderAxis, OrderDir, OrderKind } from './reorder.ts'
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
    /** the order the rows and columns are in: whether each axis keeps its groups */
    order: OrderSpec
    titles: (coll: string) => string
    /** a group's number of places in the gazetteer (null until layers.json has loaded) */
    totals?: (coll: string) => number | null
    open: { place: string; indicator: string } | null
    onopen: (placeId: string, indicator: string) => void
    /** remove a place or an indicator from the display */
    onhide: (kind: 'place' | 'indicator', id: string) => void | Promise<void>
    /** a header was moved (dragged, or by the keys): the arrangement of an axis now on display */
    onmove: (axis: OrderAxis, shown: Shown[]) => void
    /** the folded series, by the id of the indicator that carries the disclosure, and the toggle */
    folds?: Map<string, SeriesFold>
    ontogglefold?: (series: string) => void
    /** the rollups of each place and indicator on display, for the counts of its header */
    counts?: { places: Map<string, Rollup>; indicators: Map<string, Rollup> }
  }
  let { catalog, idx, cols, rows, vocab, depth, axes = 'indicators', order, titles, totals = () => null, open, onopen, onhide, onmove, folds = new Map(), ontogglefold, counts }: Props = $props()
  // the indicators shown because their series is unfolded: their headers are marked as part of it
  const unfolded = $derived(new Set([...folds.values()].filter(f => f.open).flatMap(f => f.rest.map(i => i.id))))

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

  // ---- order: drag and drop, the keys, the words ----
  const gp = $derived(order.places.group)
  const gi = $derived(order.indicators.group)
  let said = $state('')
  const nameOf = $derived({
    placeItem: new Map(flatPlaces.map(p => [p.id, p.name])),
    indItem: new Map(flat.map(i => [i.id, i.short])),
    indGroup: new Map(cols.map(g => [g.term.id, g.term.label])),
  })
  const reorder = createReorder({
    shown: axis => axis === 'places'
      ? { shown: rows.map(g => ({ id: g.coll, items: g.places.map(p => p.id) })), grouped: gp }
      : { shown: cols.map(g => ({ id: g.term.id, items: g.indicators.map(i => i.id) })), grouped: gi },
    name: (axis, kind, id) => kind === 'group' ? (axis === 'places' ? titles(id) : nameOf.indGroup.get(id) ?? id) : (axis === 'places' ? nameOf.placeItem : nameOf.indItem).get(id) ?? id,
    commit: (axis, shown) => onmove(axis, shown),
    say: text => { said = text },
  })
  const hd = reorder.header
  const MOVE_HELP = 'Use the arrow keys to move it. Alt and an arrow key work from anywhere in the header.'
  const away = (dir: OrderDir, delta: -1 | 1) => (dir === 'row' ? (delta < 0 ? 'up' : 'down') : delta < 0 ? 'left' : 'right')

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
  <button type="button" class="x" data-f="x" data-kind={kind} data-id={id} aria-label="Remove {name} from the matrix" onclick={() => hide(kind, id)}>
    <Icon name="ui-close" size={14} />
  </button>
{/snippet}

<!-- the move buttons of a header: the middle one is the keyboard's (arrow keys), the other two are for a pointer or a touch (not in the Tab order) -->
{#snippet mover(axis: OrderAxis, kind: OrderKind, id: string, name: string, dir: OrderDir)}
  {@const p = { axis, kind, id, dir }}
  <span class="mv" class:inl={kind === 'group'}>
    <button type="button" class="ea" data-f="ea" tabindex="-1" aria-label="Move {name} {away(dir, -1)}" title="Move {away(dir, -1)}" onclick={() => reorder.nudge(p, -1)}>
      <Icon name={dir === 'row' ? 'ui-collapse' : 'ui-prev'} size={14} />
    </button>
    <button type="button" class="mvb" data-f="mv" aria-label="Move {name}" title="Move: drag the header, or use the arrow keys" onclick={() => (said = `${name}. ${MOVE_HELP}`)}>
      <Icon name="ui-sort" size={14} />
    </button>
    <button type="button" class="la" data-f="la" tabindex="-1" aria-label="Move {name} {away(dir, 1)}" title="Move {away(dir, 1)}" onclick={() => reorder.nudge(p, 1)}>
      <Icon name={dir === 'row' ? 'ui-expand' : 'ui-next'} size={14} />
    </button>
  </span>
{/snippet}

<!-- a header's counts: glyphs and numbers for the eye, the sentence for a screen reader -->
{#snippet tally(r: Rollup | undefined)}
  <span class="cnt" title={headerCounts(r)}>
    <span class="mbon-sr-only">{headerCounts(r)}</span>
    {#if r}<span class="cg" aria-hidden="true">{#each COUNT_PARTS as c (c.k)}<span><Icon name={c.glyph} size={12} />{r[c.k]}</span>{/each}{#if r.latest}<span class="lt">{r.latest.label}</span>{/if}</span>{/if}
  </span>
{/snippet}

{#snippet placeHead(p: Place, dir: OrderDir)}
  <a class="pn" href={placesPageHref(p.id)} target="_blank" rel="noopener" data-f="link" draggable="false" data-place={p.id} title="{p.name} ({p.id}): its page on the places site"
    aria-label="{p.name}, {p.id}: its page on the places site (opens in a new tab)">{shortPlaceName(p.name)}</a>
  <span class="pid">{p.id}</span>
  {@render tally(counts?.places.get(p.id))}
  {@render mover('places', 'item', p.id, p.name, dir)}
  {@render remove('place', p.id, p.name)}
{/snippet}

{#snippet groupHead(g: RowGroup, dir: OrderDir)}
  {@const coll = g.coll}
  <span class="gh gp">
    <span class="gt">{titles(coll)}{@render mover('places', 'group', coll, titles(coll), dir)}</span>
    <span class="gn">{computedOf(computed.get(coll) ?? 0, totals(coll))} computed ·
      <a class="gz" href={gazetteerHref(coll)} draggable="false" target="_blank" rel="noopener">in the gazetteer<Icon name="ui-external" size={12} /><span class="mbon-sr-only"> (opens in a new tab)</span></a>
      {#if !computed.get(coll)}· <a class="gz" draggable="false" href={requestHref({ collection: coll, collectionTitle: titles(coll) })} target="_blank" rel="noopener">ask for it<Icon name="ui-external" size={12} /><span class="mbon-sr-only"> (a pre-filled GitHub issue; opens in a new tab)</span></a>{/if}</span>
    {#if g.total}<span class="gn">The first {g.places.length} of {g.total.toLocaleString('en-US')} places: search, or pick places in the Select section, to narrow it.</span>{/if}
  </span>
{/snippet}

{#snippet indHead(ind: Indicator, glyph: ReturnType<typeof asIcon>, dir: OrderDir)}
  <span class="t">{#if glyph}<Icon name={glyph} size={16} />{/if}<span>{ind.short}</span></span>
  <span class="u">{ind.unit_label || 'unitless'} · by {ind.status_grain}</span>
  {@render tally(counts?.indicators.get(ind.id))}
  {#if folds.get(ind.id)}
    {@const f = folds.get(ind.id)!}
    <button type="button" class="fold" data-f="fold" aria-expanded={f.open} onclick={() => ontogglefold?.(f.series)}><Icon name={f.open ? 'ui-collapse' : 'ui-expand'} size={14} />{foldWords(f)}</button>
  {/if}
  {@render mover('indicators', 'item', ind.id, ind.short, dir)}
  {@render remove('indicator', ind.id, ind.short)}
{/snippet}

{#snippet termHead(g: ColumnGroup, dir: OrderDir)}
  {@const glyph = asIcon(g.term.glyph)}
  <span class="gh">
    {#if vocab === 'eov' && !missingBadge[g.term.id]}
      <img class="badge" src={badgeUrl(base, g.term.id)} alt="{g.term.label} (GOOS EOV badge)" width="28" height="28" draggable="false"
        onerror={() => (missingBadge[g.term.id] = true)} />
    {/if}
    {#if glyph}<Icon name={glyph} size={18} />{/if}
    <span class="mbon-label">{g.term.label}</span>
    {@render mover('indicators', 'group', g.term.id, g.term.label, dir)}
  </span>
{/snippet}

<!-- the headers hold a link, a move button and a remove button per place or indicator, so the cells sit far down the Tab order: a skip
     button, shown on focus, goes straight to the first cell -->
<button type="button" class="skip" onclick={() => box?.querySelector<HTMLButtonElement>('button.cell')?.focus()}>Skip to the first cell</button>
<p class="mbon-sr-only" role="status" aria-live="polite">{said}</p>
{#if !gp}
  {#each rows as g (g.coll)}{#if g.total}<p class="om-note">The first {g.places.length} of {g.total.toLocaleString('en-US')} places: search, or pick places in the Select section, to narrow it.</p>{/if}{/each}
{/if}
<div class="box" role="region" aria-label={indRows ? 'Indicators by places' : 'Places by indicators'} tabindex="-1" bind:this={box}>
  <table class="matrix om-t" class:indrows={indRows} class:nogroups={indRows ? !gp : !gi}>
    <thead>
      {#if indRows ? gp : gi}
        <tr class="groups">
          <th class="rowh corner" scope="col" rowspan="2"><span class="mbon-label">{indRows ? 'Indicator' : 'Place'}</span></th>
          {#if indRows}
            {#each rows as g (g.coll)}
              <th scope="colgroup" colspan={g.places.length} class="group" use:hd={{ axis: 'places', kind: 'group', id: g.coll, dir: 'col' }}>{@render groupHead(g, 'col')}</th>
            {/each}
          {:else}
            {#each cols as g (g.term.id)}
              <th scope="colgroup" colspan={g.indicators.length} class="group" use:hd={{ axis: 'indicators', kind: 'group', id: g.term.id, dir: 'col' }}>{@render termHead(g, 'col')}</th>
            {/each}
          {/if}
        </tr>
      {/if}
      <tr class="heads">
        {#if !(indRows ? gp : gi)}
          <th class="rowh corner" scope="col"><span class="mbon-label">{indRows ? 'Indicator' : 'Place'}</span></th>
        {/if}
        {#if indRows}
          {#each flatPlaces as p (p.id)}
            <th scope="col" class="colh" use:hd={{ axis: 'places', kind: 'item', id: p.id, dir: 'col' }}>{@render placeHead(p, 'col')}</th>
          {/each}
        {:else}
          {#each cols as g (g.term.id)}
            {#each g.indicators as ind (ind.id)}
              <th scope="col" class="colh ind" class:inf={unfolded.has(ind.id)} title={ind.title} use:hd={{ axis: 'indicators', kind: 'item', id: ind.id, dir: 'col' }}>{@render indHead(ind, asIcon(g.term.glyph), 'col')}</th>
            {/each}
          {/each}
        {/if}
      </tr>
    </thead>
    <tbody>
      {#if indRows}
        {#each cols as g (g.term.id)}
          {#if gi}
            <tr class="band"><th colspan={width} scope="colgroup" use:hd={{ axis: 'indicators', kind: 'group', id: g.term.id, dir: 'row' }}>{@render termHead(g, 'row')}</th></tr>
          {/if}
          {#each g.indicators as ind (ind.id)}
            <tr>
              <th class="rowh ind" scope="row" class:inf={unfolded.has(ind.id)} title={ind.title} use:hd={{ axis: 'indicators', kind: 'item', id: ind.id, dir: 'row' }}>{@render indHead(ind, asIcon(g.term.glyph), 'row')}</th>
              {#each flatPlaces as p (p.id)}
                <td><Cell {ind} place={p} model={model(ind, p)} {depth} groupTitle={titles(p.coll)} open={isOpen(ind, p)} {onopen} /></td>
              {/each}
            </tr>
          {/each}
        {/each}
      {:else}
        {#each rows as g (g.coll)}
          {#if gp}
            <tr class="band">
              <th colspan={width} scope="colgroup" use:hd={{ axis: 'places', kind: 'group', id: g.coll, dir: 'row' }}>{@render groupHead(g, 'row')}</th>
            </tr>
          {/if}
          {#each g.places as p (p.id)}
            <tr>
              <th class="rowh" scope="row" use:hd={{ axis: 'places', kind: 'item', id: p.id, dir: 'row' }}>{@render placeHead(p, 'row')}</th>
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
  /* grouping off on the axis that runs across: no group row, so the heads row is the top one */
  table.nogroups thead tr.heads th { top: 0; }
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
  /* a header's counts: shown on hover and focus (the space kept, so nothing moves), always on a touch screen */
  .cnt { display: block; margin-top: 2px; opacity: 0; transition: opacity 0.12s; }
  th:hover .cnt, th:focus-within .cnt { opacity: 1; }
  .cg { display: inline-flex; flex-wrap: wrap; gap: 0 var(--space-2); font: var(--fw-regular) 0.6875rem / 1.3 var(--font-mono); color: var(--text-body); }
  .cg > span { display: inline-flex; align-items: center; gap: 1px; }
  .cg :global(svg) { color: var(--label-color); }
  .fold { display: inline-flex; align-items: center; gap: 2px; margin-top: var(--space-1); padding: 1px var(--space-1); border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-tint); color: var(--text-strong); font: var(--type-small); font-size: 0.75rem; line-height: 1.3; text-align: left; cursor: pointer; }
  .fold:hover { border-color: var(--accent); }
  /* an indicator shown because its series is unfolded */
  th.inf { box-shadow: inset 3px 0 0 var(--border-strong); }
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
  @media (prefers-reduced-motion: reduce) { .x, .mv, .cnt { transition: none; } }
  @media (hover: none) { .cnt { opacity: 1; } }

  /* the move buttons: a small bar at the top right of a header (left of the remove button) shown on hover and focus; inside a group's
     title, inline; on a touch screen always shown, in the flow under the header's text */
  .mv {
    position: absolute; top: var(--space-1); right: calc(var(--space-1) + 1.5rem); z-index: 1; display: inline-flex; align-items: center; gap: 1px; padding: 1px;
    border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-surface);
    opacity: 0; pointer-events: none; transition: opacity 0.12s;
  }
  .mv.inl { position: static; margin-left: var(--space-2); vertical-align: middle; }
  th:hover .mv, th:focus-within .mv { opacity: 1; pointer-events: auto; }
  .mv button { display: inline-grid; place-items: center; width: 1.375rem; height: 1.375rem; padding: 0; border: 0; border-radius: var(--radius-sm); background: none; color: var(--text-body); cursor: pointer; }
  .mv button:hover { background: var(--bg-tint); color: var(--text-strong); }
  /* the drag: the header being dragged is dimmed; a header it can land on shows a bar on the side it would land; one it cannot is marked */
  .box :global(th[draggable='true']) { cursor: grab; }
  .box :global(th[data-dragging]) { opacity: 0.45; }
  .box :global(th[data-drop='before'][data-dir='col']) { box-shadow: inset 4px 0 0 var(--accent); }
  .box :global(th[data-drop='after'][data-dir='col']) { box-shadow: inset -4px 0 0 var(--accent); }
  .box :global(th[data-drop='before'][data-dir='row']) { box-shadow: inset 0 4px 0 var(--accent); }
  .box :global(th[data-drop='after'][data-dir='row']) { box-shadow: inset 0 -4px 0 var(--accent); }
  .box :global(th[data-drop='no']) { cursor: no-drop; outline: 2px dashed var(--border-strong); outline-offset: -3px; }
  @media (hover: none) {
    .mv, .mv.inl { position: static; opacity: 1; pointer-events: auto; display: flex; width: max-content; margin: var(--space-1) 0 0; }
    .mv.inl { display: inline-flex; margin: 0 0 0 var(--space-2); }
    .mv button { width: 2rem; height: 2rem; }
    .box :global(th[draggable='true']) { cursor: auto; }
  }

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
