<script lang="ts">
  // the report builder: a preset, the two selection trees (places, indicators), the layout with its panel budget, the
  // style (status method, recent window, baseline), the years and a title. it holds no state of its own: every change goes out through `onspec` as a new spec, so the report is always a permalink.
  import { Button, Select, Toggle } from '@marinebon/ui'
  import PlacePicker from '../pick/PlacePicker.svelte'
  import { multiLabel, placeGroups } from '../pick/places.ts'
  import { Icon } from '../../../../src/icons/index.ts'
  import type { IconName } from '../../../../src/icons/index.ts'
  import { DEFAULT_SPEC, LAYOUT_IDS, LAYOUTS, expandPlaces } from '../../../../src/report/spec.ts'
  import type { Fix, Layout, ReportSpec } from '../../../../src/report/spec.ts'
  import type { Catalog, Layers, VocabId } from '../data.ts'
  import type { CoverageIndex } from '../matrix.ts'
  import { METHOD_IDS, DEPTHS } from '../hash.ts'
  import type { Depth } from '../hash.ts'
  import { METHOD_NOTES } from '../place.ts'
  import { availablePresets, PRESETS, presetOf } from './presets.ts'
  import type { ReportModel } from './report.ts'
  import {
    buildIndicatorTree, toggleCategory, toggleCollection, toggleIndicator, togglePlace, toggleSeries,
  } from './tree.ts'
  import type { TreeNode } from './tree.ts'
  import Fixes from './Fixes.svelte'
  import Tree from './Tree.svelte'

  interface Props {
    catalog: Catalog
    idx: CoverageIndex
    spec: ReportSpec
    model: ReportModel
    vocab: VocabId
    depth: Depth
    titles: (coll: string) => string
    layers: Layers
    split: 'place' | 'category' | null
    onspec: (spec: ReportSpec) => void
    onview: (p: { vocab?: VocabId; depth?: Depth }) => void
    onfix: (fix: Fix) => void
    onunsplit: () => void
    ondone: () => void
  }
  let { catalog, idx, spec, model, vocab, depth, titles, layers, split, onspec, onview, onfix, onunsplit, ondone }: Props = $props()

  const LAYOUT_ICON: Record<Layout, IconName> = {
    cards: 'view-cards', scorecard: 'view-scorecard', 'small-multiples': 'view-small-multiples', quad: 'view-quad', 'map-sheet': 'view-map-sheet', dossier: 'view-dossier',
  }
  const VOCABS: { id: VocabId; label: string }[] = [
    { id: 'onms', label: 'ONMS sections' }, { id: 'names', label: 'NaMES themes' }, { id: 'eov', label: 'GOOS EOVs' },
  ]
  const DEPTH_LABEL: Record<Depth, string> = { skim: 'Skimmer', swim: 'Swimmer', dive: 'Diver' }
  const all = $derived(catalog.manifest.indicators)
  const terms = $derived(catalog.manifest.vocabularies[vocab].terms)
  const known = $derived(terms.map(t => t.id))
  const set = (p: Partial<ReportSpec>) => onspec({ ...spec, ...p })

  // ---- presets ----
  const presets = $derived(availablePresets(PRESETS, all, idx.places))
  const current = $derived(presetOf(spec, presets))
  const presetOptions = $derived([{ value: '', label: 'Custom' }, ...presets.map(p => ({ value: p.id, label: p.label }))])
  function pick(v: string) {
    const p = presets.find(x => x.id === v)
    if (p) onspec({ ...p.spec, depth: spec.depth })
  }

  // ---- the trees ----
  const chosenPlaces = $derived(expandPlaces(spec.places, idx.places))
  const chosenIds = $derived(new Set(chosenPlaces.map(p => p.id)))
  const indNodes = $derived(buildIndicatorTree({ indicators: all, vocab, terms, sel: spec.indicators, rows: catalog.coverage, places: chosenPlaces }))
  function toggleP(n: { kind: 'collection' | 'place'; key: string }, on: boolean) {
    const places = n.kind === 'collection' ? toggleCollection(spec.places, idx.places, n.key, on) : togglePlace(spec.places, idx.places, n.key, on)
    set({ places })
  }
  function toggleI(n: TreeNode, on: boolean) {
    const indicators = n.kind === 'category' ? toggleCategory(spec.indicators, all, vocab, known, n.key, on)
      : n.kind === 'series' ? toggleSeries(spec.indicators, all, n.key, on)
      : toggleIndicator(spec.indicators, all, n.key, on)
    set({ indicators })
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
    <div class="field" role="group" aria-label="Group indicators by">
      <span class="mbon-label">Group indicators by</span>
      <span class="row om-row">
        {#each VOCABS as v (v.id)}
          <Button variant="quiet" size="sm" pressed={vocab === v.id} onclick={() => onview({ vocab: v.id })}>{v.label}</Button>
        {/each}
      </span>
    </div>
    <Button variant="primary" size="sm" onclick={ondone}>Done</Button>
  </div>

  <div class="trees">
    <section class="pane" aria-labelledby="bp">
      <h3 id="bp" class="mbon-label">Places <span class="n">{chosenPlaces.length} chosen</span></h3>
      <PlacePicker mode="multi" kicker="Groups and places" {idx} {layers} label={multiLabel(placeGroups(idx, layers), chosenIds)} chosen={chosenIds} ontoggle={toggleP} />
      <Toggle checked={spec.places.context} label="Context region" hint="Also show each place's surrounding region (e.g. Channel Islands within the Santa Barbara Bight). Not scheduled yet: it waits on the gazetteer recording which places lie inside which." disabled />
    </section>
    <section class="pane" aria-labelledby="bi">
      <h3 id="bi" class="mbon-label">Indicators <span class="n">{model.indicators.length} chosen</span></h3>
      <p class="hint om-note">Counts are places with a value, of the places chosen. A series ticks its lead; open it for the others.</p>
      <div class="scroll"><Tree nodes={indNodes} label="Indicators" ontoggle={toggleI} empty="No indicator has a value for the chosen places." /></div>
    </section>
  </div>

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
  .n { margin-left: var(--space-2); font: var(--type-label); letter-spacing: 0; color: var(--text-body); text-transform: none; }
  input[type='text'], input[type='number'] {
    height: 2rem; padding: 0 var(--space-3); border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--control-bg); color: var(--text-strong); font: var(--type-small); min-width: 0;
  }
  input:focus-visible { border-color: var(--accent); }
  .text input { width: min(20rem, 100%); }
  .num input { width: 6rem; }
  .yr { width: 5.5rem; }
  .trees { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); align-items: start; }
  .pane { display: grid; gap: var(--space-2); min-width: 0; padding: var(--space-3); background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-md); }
  h3 { margin: 0; }
  .scroll { max-height: 22rem; overflow: auto; overscroll-behavior: contain; }
  .fixes { flex-basis: 100%; }
  @media (max-width: 760px) { .trees { grid-template-columns: minmax(0, 1fr); } .scroll { max-height: 16rem; } }
</style>
