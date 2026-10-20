<script lang="ts">
  // the kit's Footer ("built by Ocean Metrics" is built in) with the credits this viewer must carry: data credits per
  // producer from the manifest providers, the icon credits, the GOOS badge credit and, for the MBON instance, the sponsor.
  import { Footer } from '@marinebon/ui'
  import type { Brand } from './brand/brand.ts'
  import type { Credit } from './delivery.ts'
  import { EOV_GLYPH_CREDIT, GOOS_CREDIT, MDI_CREDIT, SOURCE_HREF } from './credits.ts'

  interface Props {
    brand: Brand
    credits: Credit[]
    version: string
    loadMs: number | null
  }
  let { brand, credits, version, loadMs }: Props = $props()
</script>

<Footer sourceHref={SOURCE_HREF} sourceLabel="source on GitHub">
  {#snippet release()}manifest {version}{/snippet}
  {#snippet timing()}{loadMs == null ? '' : `loaded in ${loadMs} ms`}{/snippet}
  {#snippet children()}
    <span class="credits">
      {#if brand === 'mbon'}<span class="c"><strong>Sponsored by <a href="https://marinebon.org">MBON</a></strong></span>{/if}
      {#each credits as c (c.producer)}
        <span class="c">Data via {#if c.url}<a href={c.url}>{c.producer}</a>{:else}{c.producer}{/if}{c.providers.length ? `: ${c.providers.join('; ')}` : ''}</span>
      {/each}
      <span class="c">{MDI_CREDIT}</span>
      <span class="c">{EOV_GLYPH_CREDIT}</span>
      <span class="c">{GOOS_CREDIT}</span>
    </span>
  {/snippet}
</Footer>

<style>
  .credits { display: inline; color: var(--text-body); }
  .credits :global(a) { color: var(--text-body); text-decoration: underline; text-underline-offset: 2px; }
  .c { display: inline; }
  .c + .c::before { content: ' · '; }
  strong { font-weight: var(--fw-semibold); color: var(--text-strong); }
</style>
