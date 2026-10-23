<script lang="ts">
  // the view switch: Matrix, Map and Report as links (each keeps the last state it was left in, so switching back restores
  // it), plus the place being read when the Place view is open. links, not buttons: every view is a permalink. the Map's
  // small subtitle says what is there besides the places (Ben 2026-10-23); it is left out on a phone.
  import { Icon } from '../../../src/icons/index.ts'
  import type { ViewKind } from './hash.ts'

  interface Props {
    current: ViewKind
    matrixHref: string
    mapHref: string
    reportHref: string
    placeName?: string | null
  }
  let { current, matrixHref, mapHref, reportHref, placeName = null }: Props = $props()
</script>

<nav class="views" aria-label="Views">
  <a href={matrixHref} aria-current={current === 'matrix' ? 'page' : undefined}><Icon name="view-matrix" size={18} />Matrix</a>
  <a href={mapHref} aria-current={current === 'map' ? 'page' : undefined}><Icon name="view-map" size={18} />Map<span class="sub">layers · then vs now</span></a>
  <a href={reportHref} aria-current={current === 'report' ? 'page' : undefined}><Icon name="view-report" size={18} />Report</a>
  {#if current === 'place' && placeName}
    <span class="here" aria-current="page"><Icon name="view-place" size={18} /><span class="pn">{placeName}</span></span>
  {/if}
</nav>

<style>
  .views { min-width: 0; display: flex; flex-wrap: wrap; gap: var(--space-1); border-bottom: 1px solid var(--border); }
  .views a, .here {
    display: inline-flex; align-items: center; gap: var(--space-2);
    padding: var(--space-2) var(--space-3); margin-bottom: -1px;
    font: var(--fw-semibold) var(--text-sm) / 1.2 var(--font-sans); color: var(--text-body);
    text-decoration: none; border-bottom: 2px solid transparent;
  }
  .views a:hover { color: var(--text-strong); border-bottom-color: var(--border-strong); }
  .views [aria-current='page'] { color: var(--text-strong); border-bottom-color: var(--brand); }
  .views :global(svg) { color: var(--label-color); flex: none; }
  .sub { font: var(--fw-regular) var(--text-xs) / 1.2 var(--font-sans); color: var(--text-body); }
  @media (max-width: 600px) { .sub { display: none; } }
  .here { min-width: 0; max-width: 100%; }
  .pn { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 22rem; min-width: 0; }
</style>
