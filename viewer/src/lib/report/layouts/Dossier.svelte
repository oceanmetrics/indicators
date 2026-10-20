<script lang="ts">
  // the Dossier layout, laid out for paper: for each place a section (a new page in print), and in it each indicator's
  // figure, its caption (the status sentence), the method, the citation and how to reproduce it. it is never over budget:
  // the entries read their values as they near the screen, all at once when printing.
  import type { ReportSpec } from '../../../../../src/report/spec.ts'
  import type { Catalog } from '../../data.ts'
  import type { Depth } from '../../hash.ts'
  import { pickRow } from '../../matrix.ts'
  import type { ColumnGroup, CoverageIndex, Place } from '../../matrix.ts'
  import DossierEntry from './DossierEntry.svelte'
  import { dossierSections } from './dossier.ts'

  interface Props {
    catalog: Catalog
    idx: CoverageIndex
    spec: ReportSpec
    places: Place[]
    groups: ColumnGroup[]
    depth: Depth
    titles: (coll: string) => string
    /** the Place view's address for a place, an indicator being the optional third argument */
    placeHref: (placeId: string, coll: string, indId?: string) => string
    all?: boolean
  }
  let { catalog, idx, spec, places, groups, depth, titles, placeHref, all = false }: Props = $props()

  const inds = $derived(groups.flatMap(g => g.indicators))
  const sections = $derived(dossierSections(places, inds, (p, i) => pickRow(idx, p.id, i)?.last_value != null))
  const total = $derived(sections.reduce((n, s) => n + s.entries.length, 0))
</script>

<div class="dos">
  <p class="lead om-note">{total} {total === 1 ? 'figure' : 'figures'} in {sections.length} {sections.length === 1 ? 'section' : 'sections'}, one section per place. Statuses are relative to each place's own record, not better or worse.</p>
  {#each sections as s (s.place.id)}
    <section class="sec" aria-labelledby="dp-{s.place.id}">
      <header>
        <span class="mbon-label">{titles(s.place.coll)}</span>
        <h3 id="dp-{s.place.id}"><a href={placeHref(s.place.id, s.place.coll)}>{s.place.name}</a></h3>
      </header>
      {#each s.entries as e (e.ind.id)}
        <DossierEntry {catalog} {idx} {spec} place={e.place} ind={e.ind} figure={e.figure} {depth} placeLink={placeHref(e.place.id, e.place.coll, e.ind.id)} {all} />
      {/each}
    </section>
  {/each}
</div>

<style>
  .dos { display: grid; gap: var(--space-6); min-width: 0; }
  .lead { margin: 0; }
  .sec { display: grid; gap: var(--space-1); min-width: 0; }
  header { display: grid; gap: var(--space-1); padding-bottom: var(--space-2); }
  h3 { margin: 0; font: var(--fw-bold) var(--text-lg) / 1.2 var(--font-display); color: var(--text-strong); }
  h3 a { color: inherit; text-decoration: none; }
  h3 a:hover { color: var(--link); text-decoration: underline; }
  @media print {
    .sec { break-before: page; }
    .sec:first-of-type { break-before: auto; }
    header { break-after: avoid; }
  }
</style>
