// drag and drop and the keys for ordering the Matrix's headers: a place or an indicator within its group (or anywhere when the axis is
// not grouped), a whole group, on either axis and in either orientation. the rules are src/report/order.ts (canMoveItem, moveItem,
// moveGroup, nudgeItem, nudgeGroup); this wires them to the DOM as one Svelte action for a header cell.
// - HTML5 drag and drop: the header is the drag source and the drop target; a drop target shows a bar on the side the item would land
//   (data-drop="before|after"), or "no" when the move is refused (an item into another group while grouped). the header's rect
//   decides the side (the left half of a column header is "before", the upper half of a row header).
// - keys: Alt+Up/Down (rows) or Alt+Left/Right (columns) on any control of a header, or plain arrows on its move button, move it one
//   place; on a group header, the whole group. every move is announced (polite live region) and the focus stays on the control.
// - a move reports the new arrangement through the host, which turns it into the axis's custom order.
import { tick } from 'svelte'
import { canMoveItem, moveGroup, moveItem, movedWords, nudgeGroup, nudgeItem, stuckWords } from '../../../src/report/order.ts'
import type { Shown, Side } from '../../../src/report/order.ts'

export type OrderAxis = 'places' | 'indicators'
export type OrderKind = 'item' | 'group'
export type OrderDir = 'row' | 'col'

export interface ReorderHost {
  /** what is on display on an axis, in order, and whether the axis keeps its groups */
  shown: (axis: OrderAxis) => { shown: Shown[]; grouped: boolean }
  /** the name of an item or a group, for the words */
  name: (axis: OrderAxis, kind: OrderKind, id: string) => string
  /** a move happened: the arrangement now on display */
  commit: (axis: OrderAxis, shown: Shown[]) => void
  /** a sentence for the live region */
  say: (text: string) => void
}

export interface HeaderParams {
  axis: OrderAxis
  kind: OrderKind
  id: string
  /** is the header a row's (items run down) or a column's (they run across)? */
  dir: OrderDir
}

/** which side of a header a pointer is on: the first half is before (left of a column, above a row) */
export function dropSide(rect: { left: number; top: number; width: number; height: number }, x: number, y: number, dir: OrderDir): Side {
  return dir === 'col' ? (x < rect.left + rect.width / 2 ? 'before' : 'after') : (y < rect.top + rect.height / 2 ? 'before' : 'after')
}

/** the arrow key that moves a header earlier (-1) or later (1), by the direction the items run; null for any other key */
export function arrowDelta(key: string, dir: OrderDir): -1 | 1 | null {
  if (dir === 'row') return key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : null
  return key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : null
}

const MIME = 'application/x-om-order'

export function createReorder(host: ReorderHost) {
  let drag: HeaderParams | null = null

  const cell = (p: HeaderParams) =>
    [...document.querySelectorAll<HTMLElement>('[data-ax][data-kind][data-id]')].find(e => e.dataset.ax === p.axis && e.dataset.kind === p.kind && e.dataset.id === p.id) ?? null

  /** move one place earlier or later (the keys, the chevrons); the focus stays on the control that had it */
  async function nudge(p: HeaderParams, delta: -1 | 1): Promise<boolean> {
    const { shown, grouped } = host.shown(p.axis)
    const name = host.name(p.axis, p.kind, p.id)
    const n = p.kind === 'group' ? nudgeGroup(shown, grouped, p.id, delta) : nudgeItem(shown, grouped, p.id, delta)
    if (!n) {
      host.say(stuckWords(name, delta < 0 ? 'first' : 'last'))
      return false
    }
    const was = (document.activeElement as HTMLElement | null)?.dataset?.f
    host.commit(p.axis, n.shown)
    host.say(movedWords(name, host.name(p.axis, p.kind, n.past), n.side))
    await tick()
    const el = cell(p)
    ;(el?.querySelector<HTMLElement>(`[data-f="${was}"]`) ?? el?.querySelector<HTMLElement>('[data-f]'))?.focus()
    return true
  }

  function clear() {
    for (const e of document.querySelectorAll<HTMLElement>('[data-drop]')) delete e.dataset.drop
    for (const e of document.querySelectorAll<HTMLElement>('[data-dragging]')) delete e.dataset.dragging
  }

  /** the action for a header cell (a `th`): the drag source, the drop target and the keys */
  function header(node: HTMLElement, initial: HeaderParams) {
    let p = initial
    const mark = (p0: HeaderParams) => {
      node.dataset.ax = p0.axis
      node.dataset.kind = p0.kind
      node.dataset.id = p0.id
      node.dataset.dir = p0.dir
    }
    mark(p)
    node.draggable = true

    // can the item being dragged land on this header?
    const allowed = () => {
      if (!drag || drag.axis !== p.axis || drag.kind !== p.kind) return null
      const { shown, grouped } = host.shown(p.axis)
      return p.kind === 'group' ? grouped && drag.id !== p.id : canMoveItem(shown, grouped, drag.id, p.id)
    }
    const onstart = (e: DragEvent) => {
      drag = p
      node.dataset.dragging = '1'
      e.dataTransfer?.setData(MIME, p.id)
      e.dataTransfer?.setData('text/plain', host.name(p.axis, p.kind, p.id))
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    }
    const onover = (e: DragEvent) => {
      const ok = allowed()
      if (ok === null) return
      if (!ok) {
        node.dataset.drop = 'no'
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
        return
      }
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      node.dataset.drop = dropSide(node.getBoundingClientRect(), e.clientX, e.clientY, p.dir)
    }
    const onleave = (e: DragEvent) => {
      if (!node.contains(e.relatedTarget as Node | null)) delete node.dataset.drop
    }
    const ondrop = (e: DragEvent) => {
      const d = drag
      const ok = allowed()
      const side: Side = node.dataset.drop === 'after' ? 'after' : 'before'
      clear()
      drag = null
      if (!d || !ok) return
      e.preventDefault()
      const { shown, grouped } = host.shown(p.axis)
      const next = p.kind === 'group' ? moveGroup(shown, grouped, d.id, p.id, side) : moveItem(shown, grouped, d.id, p.id, side)
      if (!next) return
      host.commit(p.axis, next)
      host.say(movedWords(host.name(p.axis, p.kind, d.id), host.name(p.axis, p.kind, p.id), side))
    }
    const onend = () => { clear(); drag = null }
    const onkey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select')) return
      // Alt+arrow from anywhere in the header; a plain arrow on its move button
      const onMove = t.dataset.f === 'mv'
      if (!(e.altKey || onMove) || e.ctrlKey || e.metaKey) return
      const delta = arrowDelta(e.key, p.dir)
      if (delta == null) return
      e.preventDefault()
      e.stopPropagation()
      void nudge(p, delta)
    }
    node.addEventListener('dragstart', onstart)
    node.addEventListener('dragover', onover)
    node.addEventListener('dragleave', onleave)
    node.addEventListener('drop', ondrop)
    node.addEventListener('dragend', onend)
    node.addEventListener('keydown', onkey)
    return {
      update(next: HeaderParams) { p = next; mark(p) },
      destroy() {
        node.removeEventListener('dragstart', onstart)
        node.removeEventListener('dragover', onover)
        node.removeEventListener('dragleave', onleave)
        node.removeEventListener('drop', ondrop)
        node.removeEventListener('dragend', onend)
        node.removeEventListener('keydown', onkey)
      },
    }
  }

  return { header, nudge }
}
