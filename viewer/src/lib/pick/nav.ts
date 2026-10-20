// arrow-key movement through a picker's controls (the search box, then every result or tree box in order): Down goes to the
// next, Up to the previous, Home and End to the ends; the ends do not wrap, so the keyboard cannot lose its place.
export function nextIndex(current: number, count: number, key: string): number | null {
  if (count <= 0) return null
  if (key === 'ArrowDown') return Math.min(current + 1, count - 1)
  if (key === 'ArrowUp') return Math.max(current - 1, 0)
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

const KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End'])

/** handle a keydown inside a picker panel: move focus along `selector`'s elements; Home and End only outside the search box */
export function arrowNav(e: KeyboardEvent, root: HTMLElement | undefined, selector: string): void {
  if (!root || !KEYS.has(e.key)) return
  const target = e.target as HTMLElement
  if ((e.key === 'Home' || e.key === 'End') && target.tagName === 'INPUT') return
  const items = [...root.querySelectorAll<HTMLElement>(selector)].filter(x => x.offsetParent !== null)
  const at = items.indexOf(target)
  if (at < 0) return
  const to = nextIndex(at, items.length, e.key)
  if (to == null) return
  e.preventDefault()
  items[to].focus()
}
