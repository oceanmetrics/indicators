<script lang="ts">
  // the swipe between the two periods of the compare mode: a line over the map at `value` (0..1 of its width) with a grip,
  // the period left of it (the slot at t2) and right of it (the slot at t) named at the top. drag the line or the grip, or
  // focus the grip and use the arrows (Shift for 1 %), Home/End, PageUp/PageDown. the map under it stays draggable: only the
  // line and the grip take the pointer. the clip itself is MapCanvas's scissor; this only moves the fraction (compare.ts).
  import { clampSwipe, keySwipe } from './compare.ts'

  interface Props {
    value: number
    left: string
    right: string
    /** the live position while dragging */
    onchange: (f: number) => void
    /** the position let go on (a release, a key): what the hash keeps */
    oncommit?: (f: number) => void
  }
  let { value, left, right, onchange, oncommit }: Props = $props()

  let box = $state<HTMLDivElement>()
  let dragging = false
  let moved = false
  const at = (e: PointerEvent) => {
    const r = box!.getBoundingClientRect()
    return clampSwipe(r.width ? (e.clientX - r.left) / r.width : 0.5)
  }
  function down(e: PointerEvent) {
    if (e.button !== 0 || !box) return
    dragging = true
    moved = false
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }
  function move(e: PointerEvent) { if (dragging) { moved = true; onchange(at(e)) } }
  function up(e: PointerEvent) {
    if (!dragging) return
    dragging = false
    if (moved) oncommit?.(at(e))
  }
  function key(e: KeyboardEvent) {
    const f = keySwipe(e.key, e.shiftKey, value)
    if (f == null) return
    e.preventDefault()
    onchange(f)
    oncommit?.(f)
  }
  const pct = $derived(`${clampSwipe(value) * 100}%`)
</script>

<div class="swipe" bind:this={box}>
  <span class="cap l" style:right="calc(100% - {pct} + 0.5rem)">{left}</span>
  <span class="cap r" style:left="calc({pct} + 0.5rem)">{right}</span>
  <div class="line" style:left={pct} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={() => (dragging = false)} aria-hidden="true"></div>
  <button type="button" class="grip" style:left={pct} role="slider" aria-label="swipe between {left} (left) and {right} (right)"
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clampSwipe(value) * 100)} aria-valuetext="{Math.round(clampSwipe(value) * 100)} % {left}"
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={() => (dragging = false)} onkeydown={key}>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6 3 12l6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
  </button>
</div>

<style>
  .swipe { position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: hidden; border-radius: var(--radius-md); }
  .line { position: absolute; top: 0; bottom: 0; width: 14px; margin-left: -7px; pointer-events: auto; cursor: ew-resize; touch-action: none; }
  .line::after { content: ''; position: absolute; top: 0; bottom: 0; left: 6px; width: 2px; background: var(--overlay-bg); box-shadow: 0 0 0 1px var(--overlay-border), var(--overlay-shadow); }
  .grip {
    position: absolute; top: 50%; width: 2.25rem; height: 2.25rem; margin: -1.125rem 0 0 -1.125rem; padding: 0; display: grid; place-items: center;
    border-radius: 50%; border: 1px solid var(--overlay-border); background: var(--overlay-bg); color: var(--text-strong); box-shadow: var(--overlay-shadow);
    pointer-events: auto; cursor: ew-resize; touch-action: none;
  }
  .grip:focus-visible { outline: 3px solid var(--focus-ring, var(--brand)); outline-offset: 2px; }
  .cap {
    position: absolute; bottom: 2.25rem; max-width: 40%; padding: 0.1rem 0.45rem; border-radius: var(--radius-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    background: var(--overlay-bg); border: 1px solid var(--overlay-border); color: var(--text-strong); font: var(--fw-semibold) var(--text-xs) / 1.4 var(--font-mono);
  }
</style>
