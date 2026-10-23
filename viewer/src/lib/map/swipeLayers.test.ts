import { describe, expect, it } from 'vitest'
import type { CustomLayerInterface } from 'maplibre-gl'
import { placeSwipePairs } from './swipeLayers.ts'

// MapLibre's rules as the placement sees them: addLayer(l, before) inserts just under `before` (on top without it), and
// getStyle() leaves custom layers out
function fakeMap(ids: string[]) {
  const order = ids.map(id => ({ id, type: 'fill' }))
  return {
    order: () => order.map(l => l.id),
    getStyle: () => ({ layers: order.filter(l => l.type !== 'custom') }),
    getLayer: (id: string) => order.find(l => l.id === id),
    addLayer(l: CustomLayerInterface, before?: string) {
      const at = before ? order.findIndex(x => x.id === before) : -1
      order.splice(at >= 0 ? at : order.length, 0, { id: l.id, type: 'custom' })
    },
    removeLayer(id: string) { order.splice(order.findIndex(l => l.id === id), 1) },
  }
}
const pair = ['t2:on', 't2:off', 't:on', 't:off'].map(id => ({ id, type: 'custom', render() {} }) as CustomLayerInterface) as unknown as Parameters<typeof placeSwipePairs>[3]

describe('the scissor pairs among the layers', () => {
  it('regression: each slot\'s fill sits inside its own pair (t on, t, t off, t2 on, t2, t2 off), under the places', () => {
    const m = fakeMap(['water', 'slot:grid:fill', 'slot:grid@t2:fill', 'p0:fill', 'labels'])
    expect(placeSwipePairs(m, 'slot:grid:fill', 'slot:grid@t2:fill', pair)).toBe(true)
    expect(m.order()).toEqual(['water', 't:on', 'slot:grid:fill', 't:off', 't2:on', 'slot:grid@t2:fill', 't2:off', 'p0:fill', 'labels'])
  })
  it('placed again (a theme flip, a new period) it moves, it is never doubled; on top when nothing is above', () => {
    const m = fakeMap(['water', 'slot:grid:fill', 'slot:grid@t2:fill'])
    placeSwipePairs(m, 'slot:grid:fill', 'slot:grid@t2:fill', pair)
    placeSwipePairs(m, 'slot:grid:fill', 'slot:grid@t2:fill', pair)
    expect(m.order()).toEqual(['water', 't:on', 'slot:grid:fill', 't:off', 't2:on', 'slot:grid@t2:fill', 't2:off'])
  })
  it('compare off: the pairs go and nothing else is touched', () => {
    const m = fakeMap(['water', 'slot:grid:fill', 'slot:grid@t2:fill'])
    placeSwipePairs(m, 'slot:grid:fill', 'slot:grid@t2:fill', pair)
    expect(placeSwipePairs(m, 'slot:grid:fill', null, pair)).toBe(false)
    expect(m.order()).toEqual(['water', 'slot:grid:fill', 'slot:grid@t2:fill'])
  })
})
