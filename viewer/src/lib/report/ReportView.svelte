<script lang="ts">
  // the Report view (placeholder until the builder and layouts land): a spec, its builder and its layout.
  import type { Catalog } from '../data.ts'
  import type { ViewState } from '../hash.ts'
  interface Props {
    catalog: Catalog
    view: ViewState
    titles: (coll: string) => string
    onpatch: (p: Partial<ViewState>) => void
  }
  let { view }: Props = $props()
</script>

<p class="status" role="status">The {view.spec.layout} report is on its way.</p>
