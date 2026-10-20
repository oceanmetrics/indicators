<script lang="ts">
  // the Map view (placeholder until the map lands): one indicator over one collection.
  import type { Catalog } from '../data.ts'
  import type { ViewState } from '../hash.ts'
  interface Props {
    catalog: Catalog
    view: ViewState
    titles: (coll: string) => string
    onpatch: (p: Partial<ViewState>) => void
    onready?: (ms: number) => void
  }
  let { view }: Props = $props()
</script>

<p class="status" role="status">The map of {view.ind ?? 'an indicator'} is on its way.</p>
