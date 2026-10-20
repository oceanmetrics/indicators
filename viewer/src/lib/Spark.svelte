<script lang="ts">
  // a sparkline from a coverage row's `spark` JSON: axis-free, the last point marked. tokens only.
  import { parseSpark, sparkGeometry } from './spark.ts'

  interface Props {
    spark: string
    width?: number
    height?: number
    /** fill the width of the container (the drawer) instead of a fixed size */
    fluid?: boolean
  }
  let { spark, width = 96, height = 24, fluid = false }: Props = $props()
  const g = $derived(sparkGeometry(parseSpark(spark), width, height, 3))
</script>

{#if g.last}
  <svg class="spark" viewBox="0 0 {width} {height}" width={fluid ? '100%' : width} height={fluid ? undefined : height} aria-hidden="true" focusable="false">
    {#if g.d}<path d={g.d} fill="none" stroke="var(--link)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />{/if}
    <circle cx={g.last.x} cy={g.last.y} r="2.6" fill="var(--link)" />
  </svg>
{/if}

<style>
  .spark { display: block; overflow: visible; max-width: 100%; }
</style>
