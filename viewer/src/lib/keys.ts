// the viewer's keyboard shortcuts, as plain rules: the list Help ▾ → Keyboard shows, and the one page-wide key, `l`, which
// switches the Map's compare mode on or off (erddap-places' `l` switched its lens, Window statistics ↔ Then vs Now: here
// Then vs Now is the Map's compare mode, so the same key turns it on and off, the place kept). with no layer under the map
// there is nothing to compare, and `l` goes to the "Layer under the map" select instead. no shortcut fires while the reader
// types (input, textarea, select, contenteditable) or holds Ctrl, Alt or Meta; the other keys belong to the control that
// has focus (the Period scrubber, the compare handle, a Matrix header) and are listed so they can be found.

export const SHORTCUTS: { keys: string[]; what: string }[] = [
  { keys: ['l'], what: 'Map: compare two periods of the layer under the map, on or off (with no layer: go to the layer select)' },
  { keys: ['←', '→'], what: 'Period scrubber: the period before or after (Shift resizes the window; Home, End, PageUp, PageDown jump)' },
  { keys: ['←', '→'], what: 'compare handle: move it 5 % (Shift 1 %; Home and End to the edges)' },
  { keys: ['Alt', '↑ ↓ ← →'], what: 'Matrix header: move it' },
  { keys: ['Esc'], what: 'close the drawer or a picker; leave the expanded full screen' },
]

export interface KeyLike {
  key: string
  ctrlKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  repeat?: boolean
  /** the event target's tag name and whether it is editable */
  targetTag?: string
  targetEditable?: boolean
}

export type Shortcut = { kind: 'compare' }

export function shortcutFor(e: KeyLike): Shortcut | null {
  if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return null
  const tag = (e.targetTag ?? '').toUpperCase()
  if (e.targetEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return null
  if (e.key === 'l' || e.key === 'L') return { kind: 'compare' }
  return null
}

/** what `l` does to the hash: compare on at `t2` (the default second period), or off; nothing to do without a layer */
export function compareToggle(o: { on: boolean; layer: string | null; t2Default: string | null }): { t2: string | null; anom?: false; swipe?: null } | 'no-layer' | null {
  if (!o.layer) return 'no-layer'
  if (o.on) return { t2: null, anom: false, swipe: null }
  return o.t2Default ? { t2: o.t2Default } : null
}
