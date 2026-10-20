<script lang="ts">
  // the two buttons on the map frame: Flat / Globe (the hash's `proj`) and Full screen. full screen goes to `target`, the
  // wrapper that holds the map AND its legend (not MapLibre's FullscreenControl, which takes the canvas alone); where the
  // element API is missing (iPhone Safari) the wrapper is expanded to a fixed, full-viewport box instead. Esc and the
  // button leave; the map follows its box (MapCanvas observes it), and focus stays on the button.
  import { onDestroy } from 'svelte'
  import { Icon } from '../../../../src/icons/index.ts'
  import { afterChange, enterFull, escLeaves, exitFull, fullLabel, PROJ_CHOICES } from './frame.ts'
  import type { FullMode, Proj } from './frame.ts'

  interface Props {
    /** the element that goes full screen */
    target: HTMLElement | undefined
    proj: Proj
    onproj: (p: Proj) => void
    mode: FullMode
  }
  let { target, proj, onproj, mode = $bindable('off') }: Props = $props()

  let button = $state<HTMLButtonElement>()

  async function toggle() {
    if (!target) return
    if (mode === 'off') mode = await enterFull(target, document)
    else {
      await exitFull(document, mode)
      mode = 'off'
    }
    button?.focus()
  }
  function onchange() {
    const next = target ? afterChange(mode, target, document) : mode
    if (next !== mode) { mode = next; button?.focus() }
  }
  function onkey(e: KeyboardEvent) {
    if (escLeaves(mode, e.key)) { e.stopPropagation(); mode = 'off'; button?.focus() }
  }
  // the expanded box covers the page: keep the page behind it from scrolling
  $effect(() => {
    const root = document.documentElement
    if (mode !== 'expanded') return
    const was = root.style.overflow
    root.style.overflow = 'hidden'
    return () => { root.style.overflow = was }
  })
  onDestroy(() => { if (mode === 'native') void exitFull(document, mode) })
</script>

<svelte:document onfullscreenchange={onchange} onkeydown={onkey} />

<div class="fc">
  <div class="seg" role="group" aria-label="Map projection">
    {#each PROJ_CHOICES as c (c.label)}
      <button type="button" aria-pressed={proj === c.proj} onclick={() => onproj(c.proj)}>
        {#if c.proj === 'globe'}<Icon name="ui-globe" size={16} />{/if}{c.label}
      </button>
    {/each}
  </div>
  <button type="button" class="full" bind:this={button} onclick={toggle}>
    <Icon name={mode === 'off' ? 'ui-fullscreen' : 'ui-fullscreen-exit'} size={16} />{fullLabel(mode)}
  </button>
</div>

<style>
  .fc { position: absolute; z-index: 3; top: var(--space-2); left: var(--space-2); display: flex; flex-wrap: wrap; gap: var(--space-2); max-width: calc(100% - 3.5rem); pointer-events: none; }
  .fc > * { pointer-events: auto; }
  .seg { display: inline-flex; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); overflow: hidden; box-shadow: var(--shadow-sm); }
  button {
    display: inline-flex; align-items: center; gap: var(--space-1); height: 2rem; padding: 0 var(--space-3); border: 0; cursor: pointer;
    background: var(--pane-bg); color: var(--text-strong); font: var(--fw-semibold) var(--text-sm) / 1 var(--font-sans); white-space: nowrap;
  }
  .full { border: 1px solid var(--border-strong); border-radius: var(--radius-sm); box-shadow: var(--shadow-sm); }
  button:hover { background: var(--control-hover); }
  .seg button + button { border-left: 1px solid var(--border-strong); }
  .seg button[aria-pressed='true'] { background: var(--selected-bg); box-shadow: inset 0 -2px 0 var(--accent); }
  button:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
  button :global(svg) { flex: none; }
</style>
