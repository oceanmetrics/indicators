<script lang="ts">
  // the Quad plot layout: the plots a report has (quadGroups: one place's indicators, one indicator's places, or per the
  // axes), each a QuadChart on the card models read for the report's style. a plot is a lens on the same numbers as the
  // Scorecard: the glyph on each point is the cell's status.
  import type { ReportSpec } from '../../../../../src/report/spec.ts'
  import type { Catalog } from '../../data.ts'
  import type { Depth } from '../../hash.ts'
  import { pickRow } from '../../matrix.ts'
  import type { ColumnGroup, CoverageIndex, Place } from '../../matrix.ts'
  import { cellKey, loadCells } from '../cells.ts'
  import type { CellResult } from '../cells.ts'
  import QuadChart from './QuadChart.svelte'
  import { quadGroups } from './quadPlot.ts'
  import type { QuadItem } from './quadPlot.ts'
  import type { Axes } from './smallMultiples.ts'

  interface Props {
    catalog: Catalog
    idx: CoverageIndex
    spec: ReportSpec
    places: Place[]
    groups: ColumnGroup[]
    depth: Depth
    placeHref: (placeId: string, coll: string) => string
    axes?: Axes
    heading?: string | null
  }
  let { catalog, idx, spec, places, groups, depth, placeHref, axes = 'indicators', heading = null }: Props = $props()

  const inds = $derived(groups.flatMap(g => g.indicators))
  const plots = $derived(quadGroups(places, inds, axes, (p, i) => pickRow(idx, p.id, i)?.last_value != null))

  let results = $state.raw<Map<string, CellResult>>(new Map())
  $effect(() => {
    const pairs = plots.flatMap(g => g.items.map(i => ({ place: i.place, ind: i.ind })))
    results = new Map()
    return loadCells(catalog, idx, spec, pairs, r => (results = r))
  })
  const modelOf = (it: QuadItem) => {
    const r = results.get(cellKey(it.place, it.ind))
    return r?.s === 'ok' ? r.model : null
  }
  const pending = $derived(plots.flatMap(g => g.items).filter(i => !results.has(cellKey(i.place, i.ind))).length)
</script>

<section class="qp om-stack" aria-label={heading ?? 'Quad plot'}>
  {#if heading}<h3 class="sh om-st">{heading}</h3>{/if}
  {#if pending > 0}<p class="om-note" role="status">Reading {pending} {pending === 1 ? 'record' : 'records'}…</p>{/if}
  <div class="plots">
    {#each plots as g (g.key)}
      <QuadChart title={g.title} items={g.items} {modelOf} open={depth === 'dive'}
        href={g.by === 'indicator' ? (it => placeHref(it.place.id, it.place.coll)) : undefined} />
    {/each}
  </div>
  <p class="om-note">
    Each point is placed by its own record, in SD units: right is a recent rise over the recent window, up is a recent mean above its long-term mean.
    The dashed lines are 1 SD, the thresholds of the iea-sd status; the glyph on a point is its status. Nothing here says better or worse.
  </p>
</section>

<style>
  .plots { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 40rem)); min-width: 0; }
  @media print { .plots { grid-template-columns: minmax(0, 1fr); } }
</style>
