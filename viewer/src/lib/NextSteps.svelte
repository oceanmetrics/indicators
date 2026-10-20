<script lang="ts">
  // the way forward from a cell with no value, in the drawer and in the Place view. not computed yet: compute it now in
  // erddap-places, or ask for it in the catalog (a pre-filled issue). not offered: the groups it IS computed for (each a
  // link that opens the Matrix on that group) and the request link. no data: the reason and what the dataset covers.
  // the links are built by nextSteps.ts.
  import { Button } from '@marinebon/ui'
  import { Icon } from '../../../src/icons/index.ts'
  import type { Indicator } from './data.ts'
  import type { CellKind, Place } from './matrix.ts'
  import { COMPUTE_NOTE, computeHref, datasetCoverage, MAINTAINER_NOTE, REQUEST_NOTE, requestHref } from './nextSteps.ts'
  import type { GroupCount } from './nextSteps.ts'

  interface Props {
    ind: Indicator
    place: Place
    kind: Exclude<CellKind, 'value' | 'class'>
    /** why a cell has no data, when the coverage row says */
    reason?: string | null
    /** the title of the place's group */
    groupTitle: string
    /** the groups the indicator is computed for, and the Matrix href of each (not offered) */
    groups?: GroupCount[]
    titles?: (coll: string) => string
    groupHref?: (coll: string) => string
  }
  let { ind, place, kind, reason = null, groupTitle, groups = [], titles = c => c, groupHref = () => '#' }: Props = $props()

  const compute = $derived(computeHref(ind, place))
  const request = $derived(requestHref({ placeId: place.id, placeName: place.name, collection: place.coll, indicatorId: ind.id, short: ind.short }))
  const covers = $derived(datasetCoverage(ind))
</script>

<section class="next om-read" aria-label="Ways forward">
  {#if kind === 'live'}
    <p class="lead"><b>{ind.short}</b> is not computed yet for {place.name}.</p>
    <div class="acts">
      {#if compute}
        <Button variant="action" href={compute} target="_blank">Compute it now in erddap-places<Icon name="ui-external" size={16} /><span class="mbon-sr-only"> (opens in a new tab)</span></Button>
      {/if}
      <Button variant="quiet" href={request} target="_blank"><Icon name="cell-request" size={16} />Ask to add it to the catalog<span class="mbon-sr-only"> (opens in a new tab)</span></Button>
    </div>
    {#if compute}<p class="note om-note-s">{COMPUTE_NOTE}</p>{/if}
    <p class="note om-note-s">{REQUEST_NOTE}</p>
  {:else if kind === 'na'}
    <p class="lead"><b>{ind.short}</b> is not offered for {groupTitle}.</p>
    {#if groups.length}
      <p class="note om-note-s">It is computed for these place groups:</p>
      <div class="acts" role="group" aria-label="Place groups {ind.short} is computed for">
        {#each groups as g (g.coll)}
          <Button variant="quiet" size="sm" href={groupHref(g.coll)}>{titles(g.coll)} <span class="n om-count">{g.places}</span></Button>
        {/each}
      </div>
    {/if}
    <div class="acts">
      <Button variant="quiet" href={request} target="_blank"><Icon name="cell-request" size={16} />Ask for it here<span class="mbon-sr-only"> (opens in a new tab)</span></Button>
    </div>
    <p class="note om-note-s">{MAINTAINER_NOTE}</p>
  {:else}
    <p class="lead">No data for {place.name} yet{reason ? `: ${reason}` : ''}.</p>
    {#if covers}<p class="note om-note-s">{covers}</p>{/if}
    <div class="acts">
      <Button variant="quiet" href={request} target="_blank"><Icon name="cell-request" size={16} />Ask about it<span class="mbon-sr-only"> (opens in a new tab)</span></Button>
    </div>
    <p class="note om-note-s">{MAINTAINER_NOTE}</p>
  {/if}
</section>

<style>
  .lead { margin: 0; font: var(--type-small); color: var(--text-strong); }
  .acts { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .acts :global(.mbon-btn) { white-space: normal; text-align: left; }
</style>
