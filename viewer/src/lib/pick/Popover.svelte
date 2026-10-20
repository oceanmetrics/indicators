<script lang="ts">
  // the shell of the two pickers: a button that states the selection, and the panel it opens (a popover under the button on
  // a wide screen, a full-width sheet at 600 px and below). Esc closes it and focus returns to the button; Tab stays inside
  // while it is open; a click outside closes it. the panel's content is the caller's, and loaded only on the first open.
  import { tick } from 'svelte'
  import { Button } from '@marinebon/ui'
  import type { Snippet } from 'svelte'
  import { Icon } from '../../../../src/icons/index.ts'
  import type { IconName } from '../../../../src/icons/index.ts'

  interface Props {
    /** what the button says: the selection */
    label: string
    /** the small word above the button and the panel's name ("Places") */
    kicker: string
    icon: IconName
    /** called when the panel opens (the caller loads its content then) */
    onopen?: () => void
    children: Snippet<[() => void]>
  }
  let { label, kicker, icon, onopen, children }: Props = $props()

  let open = $state(false)
  let host = $state<HTMLDivElement>()
  const trigger = () => host?.querySelector<HTMLButtonElement>('button.trig')
  let panel = $state<HTMLDivElement>()

  const focusables = () =>
    [...(panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])') ?? [])].filter(x => x.offsetParent !== null || x === document.activeElement)

  async function toggle() {
    open = !open
    if (!open) return
    onopen?.()
    await tick()
    ;(panel?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0])?.focus()
  }
  function close() {
    open = false
    trigger()?.focus()
  }
  /** open the panel (the Map's "another indicator" opens the indicator picker of the Select section) */
  export function show() { setTimeout(() => { if (!open) void toggle() }, 0) }
  function onkey(e: KeyboardEvent) {
    if (!open) return
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      const f = focusables()
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && (document.activeElement === first || !panel?.contains(document.activeElement))) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (document.activeElement === last || !panel?.contains(document.activeElement))) { e.preventDefault(); first.focus() }
    }
  }
  function onclick(e: MouseEvent) {
    const t = e.target as Node
    if (open && panel && !panel.contains(t) && !trigger()?.contains(t)) open = false
  }
</script>

<svelte:window onkeydown={onkey} {onclick} />

<div class="pk" bind:this={host}>
  <span class="mbon-label">{kicker}</span>
  <Button variant="quiet" size="sm" class="trig" aria-haspopup="dialog" aria-expanded={open} pressed={open} onclick={toggle}>
    <Icon name={icon} size={16} /><span class="val">{label}</span><Icon name="ui-expand" size={14} />
  </Button>
  {#if open}
    <div bind:this={panel} class="pop" role="dialog" aria-label={kicker}>
      <div class="hd">
        <span class="mbon-label">{kicker}</span>
        <Button variant="quiet" size="sm" onclick={close}>Done</Button>
      </div>
      <div class="body">{@render children(close)}</div>
    </div>
  {/if}
</div>

<style>
  .pk { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); justify-items: start; gap: var(--space-2); min-width: 0; max-width: 100%; }
  .pk :global(.trig) { max-width: 100%; min-width: 0; justify-content: flex-start; text-align: left; }
  .pk :global(.trig svg) { flex: none; }
  .val { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pop {
    position: absolute; z-index: 40; top: calc(100% + var(--space-1)); left: 0; display: grid; grid-template-rows: auto minmax(0, 1fr);
    width: min(34rem, calc(100vw - 2 * var(--space-4))); max-height: min(34rem, 72dvh); background: var(--overlay-bg);
    border: 1px solid var(--overlay-border); border-radius: var(--radius-md); box-shadow: var(--overlay-shadow);
  }
  .hd { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-2) var(--space-3); }
  .body { display: grid; gap: var(--space-3); align-content: start; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: var(--space-3); }
  /* what the panels hold (PlacePanel, IndicatorPanel, PickSearch): the panel's body is their grid */
  .pop :global(.pc) { display: contents; }
  .pop :global(.search) { display: flex; align-items: center; gap: var(--space-2); height: 2rem; padding: 0 var(--space-3); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--control-bg); color: var(--text-body); }
  .pop :global(.search:focus-within) { border-color: var(--accent); }
  .pop :global(.search input) { flex: 1; min-width: 0; border: 0; background: none; outline: none; font: var(--type-small); color: var(--text-strong); }
  @media (max-width: 600px) {
    .pop { position: fixed; z-index: 40; inset: auto 0 0 0; width: auto; max-height: 85dvh; border-radius: var(--radius-md) var(--radius-md) 0 0; }
  }
</style>
