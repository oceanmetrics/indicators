<script lang="ts">
  // the indicator picker's panel: a search, the vocabulary switch, the leads and show-empty switches, and the tree category ->
  // series -> indicator with, for each, how many of the places on display have a value. built by indicators.ts; this only
  // wires it. loaded on the first open.
  import { onMount } from 'svelte'
  import { Button, Toggle } from '@marinebon/ui'
  import Tree from '../report/Tree.svelte'
  import PickSearch from './PickSearch.svelte'
  import type { TreeNode } from '../report/tree.ts'
  import type { Indicator, Vocab, VocabId } from '../data.ts'
  import { arrowNav } from './nav.ts'
  import type { CoverageIndex, Place } from '../matrix.ts'
  import { buildIndicatorPickTree, placesWithValue } from './indicatorsTree.ts'
  import { VOCAB_LABELS } from './indicators.ts'

  interface Props {
    mode: 'multi' | 'single'
    indicators: Indicator[]
    vocabs: Record<VocabId, Vocab>
    vocab: VocabId
    onvocab: (v: VocabId) => void
    chosen: ReadonlySet<string>
    idx?: CoverageIndex
    places?: Place[]
    withValues?: Map<string, Set<string>>
    nPlaces?: number
    ontoggle?: (node: TreeNode, on: boolean) => void
    onchoose?: (id: string) => void
    leads?: boolean
    onleads?: (v: boolean) => void
    showEmpty?: boolean
    onempty?: (v: boolean) => void
    canShowEmpty?: boolean
    hintOf?: (ind: Indicator) => string
    onother?: () => void
    close: () => void
  }
  let { mode, indicators, vocabs, vocab, onvocab, chosen, idx, places, withValues: counted, nPlaces: counts, ontoggle, onchoose, leads = false, onleads, showEmpty = false, onempty, canShowEmpty = false, hintOf, onother, close }: Props = $props()

  let query = $state('')
  let root = $state<HTMLDivElement>()
  // the panel arrives after the button was pressed (it is loaded on the first open): the search box takes the focus now
  onMount(() => root?.querySelector<HTMLElement>('[data-autofocus]')?.focus())
  let localEmpty = $state(false)
  const empties = $derived(mode === 'multi' ? showEmpty : localEmpty)
  const withValues = $derived(counted ?? placesWithValue(idx!, places ?? [], indicators))
  const nPlaces = $derived(counts ?? places?.length ?? 0)
  const tree = $derived(buildIndicatorPickTree({
    indicators, vocab, terms: vocabs[vocab].terms, chosen, withValues, nPlaces, showEmpty: empties, query, hintOf,
  }))
  const pick = (n: TreeNode, on: boolean) => {
    if (mode === 'multi') ontoggle?.(n, on)
    else {
      onchoose?.(n.key)
      close()
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pc" bind:this={root} onkeydown={e => arrowNav(e, root, 'input[type=search], .pc button.cb')}>
  <PickSearch bind:value={query} label="Search indicators" />
  <div class="om-stack-s">
    <div class="om-row" role="group" aria-label="Group indicators by">
      {#each Object.keys(VOCAB_LABELS) as v (v)}
        <Button variant="quiet" size="sm" pressed={vocab === v} onclick={() => onvocab(v as VocabId)}>{VOCAB_LABELS[v as VocabId]}</Button>
      {/each}
    </div>
    <div class="om-row">
      {#if mode === 'multi' && onleads}<Toggle checked={leads} label="Leads only" onchange={(v: boolean) => onleads?.(v)} />{/if}
      {#if mode === 'multi' || canShowEmpty}
        <Toggle checked={empties} label="Show indicators without values here" onchange={(v: boolean) => (mode === 'multi' ? onempty?.(v) : (localEmpty = v))} />
      {/if}
    </div>
  </div>
  <p class="om-note">{mode === 'multi' ? 'Counts are places with a value, of the places chosen. A series ticks its lead; open it for the others.' : 'Choose an indicator of the selection.'}</p>
  <Tree nodes={tree} label="Indicators" ontoggle={pick} pick={mode === 'single'} expandAll={query.trim() !== ''} empty="No indicator matches." />
  {#if mode === 'single' && onother}
    <Button variant="quiet" size="sm" onclick={() => { close(); onother?.() }}>Another indicator: choose from all of them…</Button>
  {/if}
</div>
