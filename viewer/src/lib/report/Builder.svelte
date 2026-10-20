<script lang="ts">
  // the report builder: a starting point (a preset sets the shared selection, the layout and the title), the layout with its panel
  // budget, the style (status method, recent window, baseline), the years and a title. the places and indicators are chosen in
  // the Select section above the tabs, the same selection as the Matrix and the Map. it holds no state of its own: every change
  // goes out through `onspec` as a new spec, so the report is always a permalink.
  import { Button, Select, Toggle } from '@marinebon/ui'
  import { Icon } from '../../../../src/icons/index.ts'
  import type { IconName } from '../../../../src/icons/index.ts'
  import { DEFAULT_SPEC, LAYOUT_IDS, LAYOUTS } from '../../../../src/report/spec.ts'
  import type { Fix, Layout, ReportSpec } from '../../../../src/report/spec.ts'
  import type { Catalog } from '../data.ts'
  import type { CoverageIndex } from '../matrix.ts'
  import { METHOD_IDS, DEPTHS } from '../hash.ts'
  import type { Depth } from '../hash.ts'
  import { METHOD_NOTES } from '../place.ts'
  import { availablePresets, PRESETS, presetOf } from './presets.ts'
  import type { ReportModel } from './report.ts'
  import Fixes from './Fixes.svelte'

  interface Props {
    catalog: Catalog
    idx: CoverageIndex
    spec: ReportSpec
    model: ReportModel
    depth: Depth
    split: 'place' | 'category' | null
    onspec: (spec: ReportSpec) => void
    onview: (p: { depth?: Depth }) => void
    onfix: (fix: Fix) => void
    onunsplit: () => void
    ondone: () => void
  }
  let { catalog, idx, spec, model, depth, split, onspec, onview, onfix, onunsplit, ondone }: Props = $props()

  const LAYOUT_ICON: Record<Layout, IconName> = {
    cards: 'view-cards', scorecard: 'view-scorecard', 'small-multiples': 'view-small-multiples', quad: 'view-quad', 'map-sheet': 'view-map-sheet', dossier: 'view-dossier',
  }
  const DEPTH_LABEL: Record<Depth, string> = { skim: 'Skimmer', swim: 'Swimmer', dive: 'Diver' }
  const all = $derived(catalog.manifest.indicators)
  const set = (p: Partial<ReportSpec>) => onspec({ ...spec, ...p })

  // ---- presets ----
  const presets = $derived(availablePresets(PRESETS, all, idx.places))
  const current = $derived(presetOf(spec, presets))
  const presetOptions = $derived([{ value: '', label: 'Custom' }, ...presets.map(p => ({ value: p.id, label: p.label }))])
  function pick(v: string) {
    const p = presets.find(x => x.id === v)
    if (p) onspec({ ...p.spec, depth: spec.depth })   // the preset's places and indicators are the shared selection too
  }

  // ---- numbers: empty = null; a baseline needs both ends ----
  const num = (v: string): number | null => (/^-?\d+$/.test(v.trim()) ? Number(v) : null)
  const base = $derived(spec.style.baseline)
  function setBaseline(which: 0 | 1, v: string) {
    const cur: [number | null, number | null] = [base?.[0] ?? null, base?.[1] ?? null]
    cur[which] = num(v)
    const ok = cur[0] != null && cur[1] != null && cur[0] <= cur[1]
    set({ style: { ...spec.style, baseline: ok ? [cur[0]!, cur[1]!] : null } })
  }
  let baseDraft = $state<[string, string]>(['', ''])
  $effect(() => { baseDraft = [String(base?.[0] ?? ''), String(base?.[1] ?? '')] })
</script>

<section class="builder" aria-label="Report builder">
  <div class="top">
    <div class="field">
      <Select label="Start from" options={presetOptions} value={current?.id ?? ''} onchange={(v: string) => pick(v)} />
    </div>
    <label class="field text">
      <span class="mbon-label">Title</span>
      <input type="text" value={spec.title ?? ''} placeholder="Untitled report" maxlength="120" onchange={e => set({ title: e.currentTarget.value.trim() || null })} />
    </label>
    <Button variant="primary" size="sm" onclick={ondone}>Done</Button>
  </div>

  <p class="om-note">The places and indicators are the selection above the tabs: the Matrix, the Map and this report share it. {model.places.length} {model.places.length === 1 ? 'place' : 'places'} and {model.indicators.length} {model.indicators.length === 1 ? 'indicator' : 'indicators'} of it have values.</p>

  <div class="opts om-controls">
    <div class="field" role="group" aria-label="Layout">
      <span class="mbon-label">Layout</span>
      <span class="row om-row">
        {#each LAYOUT_IDS as l (l)}
          <Button variant="quiet" size="sm" pressed={spec.layout === l} onclick={() => set({ layout: l })}><Icon name={LAYOUT_ICON[l]} size={16} />{LAYOUTS[l].title}</Button>
        {/each}
      </span>
    </div>
    <div class="fixes"><Fixes layout={spec.layout} budget={model.budget} {split} {onfix} {onunsplit} /></div>
    <div class="field">
      <Toggle checked={spec.places.context} label="Context extents" hint="needs the gazetteer's context links (not published yet)" disabled />
    </div>

    <div class="field" role="group" aria-label="Status method">
      <span class="mbon-label">Status method</span>
      <span class="row om-row">
        {#each METHOD_IDS as m (m)}
          <Button variant="quiet" size="sm" pressed={spec.style.status === m} onclick={() => set({ style: { ...spec.style, status: m } })}>{m}</Button>
        {/each}
      </span>
      <span class="note">{METHOD_NOTES[spec.style.status]}{spec.style.status === DEFAULT_SPEC.style.status ? ' Each indicator keeps its own method.' : ''}</span>
    </div>
    <label class="field num">
      <span class="mbon-label">Recent window (periods)</span>
      <input type="number" min="2" max="50" step="1" value={spec.style.recent} onchange={e => { const v = num(e.currentTarget.value); set({ style: { ...spec.style, recent: v != null && v >= 2 && v <= 50 ? v : DEFAULT_SPEC.style.recent } }) }} />
    </label>
    <div class="field" role="group" aria-label="Baseline years">
      <span class="mbon-label">Baseline years</span>
      <span class="row om-row">
        <input class="yr" type="number" step="1" aria-label="Baseline from" placeholder="from" value={baseDraft[0]} onchange={e => setBaseline(0, e.currentTarget.value)} />
        <span aria-hidden="true">to</span>
        <input class="yr" type="number" step="1" aria-label="Baseline to" placeholder="to" value={baseDraft[1]} onchange={e => setBaseline(1, e.currentTarget.value)} />
      </span>
      <span class="note">Empty: the whole record.</span>
    </div>
    <div class="field" role="group" aria-label="Years shown">
      <span class="mbon-label">Years kept</span>
      <span class="row om-row">
        <input class="yr" type="number" step="1" aria-label="Years from" placeholder="from" value={spec.time.from ?? ''} onchange={e => set({ time: { ...spec.time, from: num(e.currentTarget.value) } })} />
        <span aria-hidden="true">to</span>
        <input class="yr" type="number" step="1" aria-label="Years to" placeholder="to" value={spec.time.to ?? ''} onchange={e => set({ time: { ...spec.time, to: num(e.currentTarget.value) } })} />
      </span>
    </div>
    <div class="field" role="group" aria-label="Detail level">
      <span class="mbon-label">Detail</span>
      <span class="row om-row">
        {#each DEPTHS as d (d)}
          <Button variant="quiet" size="sm" pressed={depth === d} onclick={() => onview({ depth: d })}>{DEPTH_LABEL[d]}</Button>
        {/each}
      </span>
    </div>
  </div>
</section>

<style>
  .builder { display: grid; gap: var(--space-4); padding: var(--space-4); background: var(--bg-tint); border-radius: var(--radius-md); min-width: 0; }
  .top { display: flex; flex-wrap: wrap; gap: var(--space-3) var(--space-5); align-items: flex-end; }
  .field { display: grid; gap: var(--space-1); min-width: 0; }
  .note { font: var(--type-small); color: var(--text-body); max-width: 34rem; }
  input[type='text'], input[type='number'] {
    height: 2rem; padding: 0 var(--space-3); border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--control-bg); color: var(--text-strong); font: var(--type-small); min-width: 0;
  }
  input:focus-visible { border-color: var(--accent); }
  .text input { width: min(20rem, 100%); }
  .num input { width: 6rem; }
  .yr { width: 5.5rem; }
  .fixes { flex-basis: 100%; }
</style>
