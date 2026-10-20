// @vitest-environment jsdom
// the Matrix's header moves: which side of a header a pointer is on, which arrow moves which way, and the action itself (keys, drag and
// drop, a refused drop) against a small table in jsdom.
import { afterEach, describe, expect, it } from 'vitest'
import { arrowDelta, createReorder, dropSide } from './reorder.ts'
import type { HeaderParams, ReorderHost } from './reorder.ts'
import type { Shown } from '../../../src/report/order.ts'

describe('the side of a header a pointer is on', () => {
  const rect = { left: 100, top: 50, width: 80, height: 40 }
  it('a column header: the left half is before, the right half after', () => {
    expect(dropSide(rect, 120, 60, 'col')).toBe('before')
    expect(dropSide(rect, 150, 60, 'col')).toBe('after')
  })
  it('a row header: the upper half is before, the lower half after', () => {
    expect(dropSide(rect, 150, 60, 'row')).toBe('before')
    expect(dropSide(rect, 120, 80, 'row')).toBe('after')
  })
})

describe('the arrow that moves a header', () => {
  it('rows move with up and down, columns with left and right; any other key moves nothing', () => {
    expect([arrowDelta('ArrowUp', 'row'), arrowDelta('ArrowDown', 'row'), arrowDelta('ArrowLeft', 'row'), arrowDelta('ArrowRight', 'row')]).toEqual([-1, 1, null, null])
    expect([arrowDelta('ArrowLeft', 'col'), arrowDelta('ArrowRight', 'col'), arrowDelta('ArrowUp', 'col'), arrowDelta('Enter', 'col')]).toEqual([-1, 1, null, null])
  })
})

describe('the header action', () => {
  const state = (): Shown[] => [{ id: 'a', items: ['a1', 'a2', 'a3'] }, { id: 'b', items: ['b1', 'b2'] }]
  const make = (grouped = true) => {
    let shown = state()
    const log: { commits: Shown[][]; said: string[] } = { commits: [], said: [] }
    const host: ReorderHost = {
      shown: () => ({ shown, grouped }),
      name: (_axis, _kind, id) => id.toUpperCase(),
      commit: (_axis, next) => { shown = next; log.commits.push(next) },
      say: t => log.said.push(t),
    }
    const r = createReorder(host)
    const th = (p: HeaderParams, f = 'mv') => {
      const el = document.createElement('th')
      el.innerHTML = `<button data-f="${f}"></button><a data-f="link" href="#"></a>`
      document.body.appendChild(el)
      r.header(el, p)
      return el
    }
    return { r, th, log, now: () => shown }
  }
  const p = (id: string, kind: HeaderParams['kind'] = 'item', dir: HeaderParams['dir'] = 'col'): HeaderParams => ({ axis: 'places', kind, id, dir })
  const key = (el: Element, init: KeyboardEventInit) => el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
  const drag = (type: string, el: Element, init: { clientX?: number; clientY?: number } = {}) => {
    const e = new Event(type, { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown; clientX: number; clientY: number }
    e.dataTransfer = { setData() {}, effectAllowed: '', dropEffect: '' }
    e.clientX = init.clientX ?? 0
    e.clientY = init.clientY ?? 0
    el.dispatchEvent(e)
    return e
  }
  afterEach(() => { document.body.innerHTML = '' })

  it('a plain arrow on the Move button moves a header one place; the words say what went past what', async () => {
    const { th, log, now } = make()
    const el = th(p('a1'))
    key(el.querySelector('button')!, { key: 'ArrowRight' })
    await Promise.resolve()
    expect(now()[0].items).toEqual(['a2', 'a1', 'a3'])
    expect(log.said).toEqual(['Moved A1 after A2'])
  })
  it('Alt and an arrow work from any control of the header; a plain arrow elsewhere does nothing', () => {
    const { th, log, now } = make()
    const el = th(p('a2'))
    key(el.querySelector('a')!, { key: 'ArrowRight' })
    expect(log.commits).toHaveLength(0)
    key(el.querySelector('a')!, { key: 'ArrowLeft', altKey: true })
    expect(now()[0].items).toEqual(['a2', 'a1', 'a3'])
  })
  it('the arrow of the other direction does nothing (a column does not move with up and down)', () => {
    const { th, log } = make()
    key(th(p('a1')).querySelector('button')!, { key: 'ArrowDown' })
    expect(log.commits).toHaveLength(0)
  })
  it('at the edge of its group it stays and says so; it does not cross into the next group', () => {
    const { th, log } = make()
    key(th(p('a3')).querySelector('button')!, { key: 'ArrowRight' })
    key(th(p('a1')).querySelector('button')!, { key: 'ArrowLeft' })
    expect(log.commits).toHaveLength(0)
    expect(log.said).toEqual(['A3 is already last', 'A1 is already first'])
  })
  it('a group moves with the arrow on its Move button', () => {
    const { th, now } = make()
    key(th(p('a', 'group')).querySelector('button')!, { key: 'ArrowRight' })
    expect(now().map(g => g.id)).toEqual(['b', 'a'])
  })
  it('a drag onto another header of its group moves it, to the side of the pointer', () => {
    const { th, now, log } = make()
    const a1 = th(p('a1')), a3 = th(p('a3'))
    a3.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40, x: 0, y: 0, toJSON() {} }) as DOMRect
    drag('dragstart', a1)
    const over = drag('dragover', a3, { clientX: 80, clientY: 10 })
    expect(over.defaultPrevented).toBe(true)
    expect(a3.dataset.drop).toBe('after')
    drag('drop', a3, { clientX: 80, clientY: 10 })
    expect(now()[0].items).toEqual(['a2', 'a3', 'a1'])
    expect(log.said).toEqual(['Moved A1 after A3'])
    expect(a3.dataset.drop).toBeUndefined()
  })
  it('a drag onto a header of another group is refused: marked, not droppable, nothing moves', () => {
    const { th, log } = make()
    const a1 = th(p('a1')), b1 = th(p('b1'))
    drag('dragstart', a1)
    const over = drag('dragover', b1, { clientX: 10 })
    expect(over.defaultPrevented).toBe(false)
    expect(b1.dataset.drop).toBe('no')
    drag('drop', b1)
    expect(log.commits).toHaveLength(0)
  })
  it('with grouping off a drag goes to any header', () => {
    const { th, now } = make(false)
    const a1 = th(p('a1')), b1 = th(p('b1'))
    b1.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40, x: 0, y: 0, toJSON() {} }) as DOMRect
    drag('dragstart', a1)
    drag('dragover', b1, { clientX: 10 })
    drag('drop', b1, { clientX: 10 })
    expect(now().map(g => g.items)).toEqual([['a2', 'a3'], ['a1', 'b1', 'b2']])
  })
  it('a group is dropped on a group header, and an item is not dropped on a group', () => {
    const { th, now, log } = make()
    const a = th(p('a', 'group')), b = th(p('b', 'group')), a1 = th(p('a1'))
    b.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40, x: 0, y: 0, toJSON() {} }) as DOMRect
    drag('dragstart', a1)
    expect(drag('dragover', b, { clientX: 10 }).defaultPrevented).toBe(false)
    drag('dragend', a1)
    drag('dragstart', a)
    expect(drag('dragover', b, { clientX: 90 }).defaultPrevented).toBe(true)
    drag('drop', b, { clientX: 90 })
    expect(now().map(g => g.id)).toEqual(['b', 'a'])
    expect(log.commits).toHaveLength(1)
  })
})
