<script lang="ts">
  // a MapCanvas that can be printed: a live WebGL map prints blank, so each time the map has drawn (and again as the print job
  // starts, in the light theme, through the print hooks) a picture of it is kept, and on paper the picture takes the map's
  // place. on screen nothing changes. the canvas is the Map view's own; the size is the parent's (--map-h).
  import { onMount } from 'svelte'
  import MapCanvas from '../../map/MapCanvas.svelte'
  import { onPrintPrep } from '../printHooks.ts'

  type CanvasProps = Omit<Parameters<typeof MapCanvas>[1], 'onstate'>
  interface Props extends CanvasProps {
    onstate?: (s: 'loading' | 'done') => void
  }
  let { onstate, ...rest }: Props = $props()

  let canvas: ReturnType<typeof MapCanvas> | undefined = $state()
  let phase = $state<'loading' | 'done'>('loading')
  let shot = $state<string | null>(null)

  async function capture() {
    const u = await (canvas as unknown as { snap?: () => Promise<string | null> } | undefined)?.snap?.()
    if (u) shot = u
  }
  function onmapstate(s: 'loading' | 'done') {
    phase = s
    onstate?.(s)
    if (s === 'done') void capture()
  }

  // before printing: let the theme switch redraw the map, wait until it is drawn, then take the picture
  onMount(() => onPrintPrep(async () => {
    await new Promise(r => setTimeout(r, 300))
    for (let n = 0; n < 60 && phase !== 'done'; n++) await new Promise(r => setTimeout(r, 150))
    await capture()
  }))
</script>

<div class="pm" class:has={!!shot}>
  <div class="live"><MapCanvas bind:this={canvas} {...rest} onstate={onmapstate} /></div>
  {#if shot}<img class="shot" src={shot} alt={rest.label} />{/if}
</div>

<style>
  .pm { height: var(--map-h, 20rem); min-width: 0; position: relative; }
  .live { height: 100%; }
  .live :global(.map) { min-height: 0; }
  .shot { display: none; }
  @media print {
    .pm { break-inside: avoid; }
    .pm.has { height: auto; }
    .pm.has .live { display: none; }
    .pm.has .shot { display: block; width: 100%; height: auto; border-radius: var(--radius-md); }
  }
</style>
