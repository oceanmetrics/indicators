<script lang="ts">
  // the period scrubber: the indicator's periods on a track, `t` (the hash's, shared by every view) as the handle and the
  // window [t - w, t] as the band behind it. brush across the track to set the window (t is its later end), drag the band
  // or the handle to pan it, the wheel over the track to zoom it (anchored at t), double-click to reset it; the arrows move t,
  // Shift+arrows resize the window, Home/End and PageUp/PageDown jump. a drag shows where it is and asks for the period once,
  // on release, so the slice under the map is fetched for the step let go on, not for every step passed. the rules are
  // timeWindow.ts; the kit's Slider takes one value, not a range, so this is its look (tokens, the − / + buttons) over a band.
  import { brushWindow, clampWindow, fractionOf, indexAt, keyWindow, panWindow, windowStart, zoomWindow } from './timeWindow.ts'

  interface Props {
    label: string
    /** how many periods; the indices run 0..n-1, oldest first */
    n: number
    /** the index of t */
    value: number
    /** the window, in steps back from t */
    win: number
    /** the window double-click resets to */
    defaultWin: number
    format: (i: number) => string
    /** the window's two ends as words (default `format`): without a "(latest)" the line fits */
    formatEdge?: (i: number) => string
    disabled?: boolean
    /** t chosen (on release, a key, a button) */
    onchange: (i: number) => void
    onwindow: (w: number) => void
  }
  let { label, n, value, win, defaultWin, format, formatEdge, disabled = false, onchange, onwindow }: Props = $props()
  const edge = (i: number) => (formatEdge ?? format)(i)

  // while a drag runs, what it shows; null otherwise
  let live = $state<{ t: number; w: number } | null>(null)
  const t = $derived(live?.t ?? value)
  const w = $derived(clampWindow(live?.w ?? win, n))
  const pct = (i: number) => `${fractionOf(i, n) * 100}%`
  const id = `scrub-${Math.random().toString(36).slice(2, 8)}`

  let track = $state<HTMLDivElement>()
  const fracOf = (e: PointerEvent | WheelEvent) => {
    const r = track!.getBoundingClientRect()
    return r.width ? (e.clientX - r.left) / r.width : 0
  }

  // ---- pointer: a brush from empty track, a pan from the band or the handle ----
  let drag: { mode: 'brush' | 'pan'; i0: number; x0: number; t0: number; moved: boolean } | null = null
  function down(e: PointerEvent) {
    if (disabled || e.button !== 0 || !track) return
    const i = indexAt(fracOf(e), n)
    const onBand = (e.target as HTMLElement).closest('.band, .handle') != null
    drag = { mode: onBand ? 'pan' : 'brush', i0: i, x0: e.clientX, t0: value, moved: false }
    track.setPointerCapture?.(e.pointerId)
  }
  function move(e: PointerEvent) {
    if (!drag || !track) return
    if (!drag.moved && Math.abs(e.clientX - drag.x0) < 3) return
    drag.moved = true
    const i = indexAt(fracOf(e), n)
    live = drag.mode === 'pan' ? { t: panWindow(drag.t0, win, i - drag.i0, n), w: win } : brushWindow(drag.i0, i, n)
  }
  function up(e: PointerEvent) {
    if (!drag) return
    const d = drag
    drag = null
    const got = live
    live = null
    if (!d.moved) { const i = indexAt(fracOf(e), n); if (i !== value) onchange(i); return }
    if (!got) return
    if (got.w !== win) onwindow(got.w)
    if (got.t !== value) onchange(got.t)
  }
  function wheel(e: WheelEvent) {
    if (disabled) return
    e.preventDefault()
    const next = zoomWindow(win, e.deltaY, n)
    if (next !== win) onwindow(next)
  }
  function key(e: KeyboardEvent) {
    if (disabled) return
    const k = keyWindow(e.key, e.shiftKey, value, win, n)
    if (!k) return
    e.preventDefault()
    if (k.w !== win) onwindow(k.w)
    if (k.t !== value) onchange(k.t)
  }
  // the wheel is not passive, so it can zoom the window instead of scrolling the page
  $effect(() => {
    const el = track
    if (!el) return
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  })
</script>

<div class="scrub" class:disabled>
  <div class="head">
    <span class="mbon-label" id="{id}-l">{label}</span>
    <output class="val" for={id}>{format(t)}</output>
  </div>
  <div class="row">
    <button type="button" class="pm" aria-label="earlier {label}" disabled={disabled || value <= 0} onclick={() => onchange(value - 1)}>−</button>
    <div class="trackwrap">
      <div class="track" bind:this={track} id={id} role="slider" tabindex={disabled ? -1 : 0} aria-labelledby="{id}-l" aria-valuemin={0} aria-valuemax={n - 1}
        aria-valuenow={t} aria-valuetext="{format(t)}, window from {edge(windowStart(t, w))}" aria-disabled={disabled}
        title="drag across to set the window · drag the window to pan · wheel to zoom · double-click to reset"
        onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={() => { drag = null; live = null }}
        ondblclick={() => { if (!disabled && win !== defaultWin) onwindow(defaultWin) }} onkeydown={key}>
        <div class="rail"></div>
        <div class="band" style:left={pct(windowStart(t, w))} style:width="calc({pct(t)} - {pct(windowStart(t, w))})"></div>
        <div class="handle" style:left={pct(t)}></div>
      </div>
      <div class="ticks" aria-hidden="true">
        <span class="tl first">{format(0)}</span>
        <span class="tl win">window {edge(windowStart(t, w))} to {edge(t)}</span>
        <span class="tl last">{format(n - 1)}</span>
      </div>
    </div>
    <button type="button" class="pm" aria-label="later {label}" disabled={disabled || value >= n - 1} onclick={() => onchange(value + 1)}>+</button>
  </div>
</div>

<style>
  .scrub { display: flex; flex-direction: column; gap: var(--space-1); min-width: 12rem; }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-2); }
  .val { font: var(--fw-semibold) var(--text-sm) / 1 var(--font-mono); color: var(--text-strong); }
  .row { display: flex; align-items: flex-start; gap: var(--space-2); }
  .trackwrap { flex: 1; min-width: 0; }
  .track { position: relative; height: 1.6rem; margin: 0 8px; cursor: pointer; touch-action: none; outline: none; }
  .track:focus-visible .handle { box-shadow: 0 0 0 3px var(--focus-ring, var(--brand)); }
  .rail { position: absolute; left: 0; right: 0; top: calc(50% - 2px); height: 4px; border-radius: 2px; background: var(--border-strong); }
  .band { position: absolute; top: calc(50% - 5px); height: 10px; min-width: 2px; border-radius: 3px; background: color-mix(in srgb, var(--brand) 35%, transparent); border: 1px solid var(--brand); box-sizing: border-box; cursor: grab; }
  .handle { position: absolute; top: calc(50% - 8px); width: 16px; height: 16px; margin-left: -8px; border-radius: 50%; background: var(--bg-surface); border: 2px solid var(--brand); box-sizing: border-box; cursor: grab; }
  .ticks { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0 var(--space-2); margin: 0.1rem 0 0; font: var(--text-xs) / 1.2 var(--font-mono); color: var(--text-body); }
  .tl { white-space: nowrap; }
  .tl.win { order: 3; flex-basis: 100%; text-align: center; overflow: hidden; text-overflow: ellipsis; min-width: 0; color: var(--text-body); }
  .pm {
    flex: none; width: 1.6rem; height: 1.6rem; display: grid; place-items: center; padding: 0; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); background: var(--control-bg); color: var(--text-heading); font: var(--fw-semibold) var(--text-sm) / 1 var(--font-mono); cursor: pointer;
  }
  .pm:hover:not(:disabled) { background: var(--control-hover); }
  .pm:disabled { opacity: 0.4; cursor: not-allowed; }
  .disabled { opacity: 0.6; }
  .disabled .track { cursor: not-allowed; }
</style>
