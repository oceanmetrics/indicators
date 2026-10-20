<script lang="ts">
  // the budget line of a layout and, over budget, the ways out (plan §6): switch the layout, split into sections, collapse
  // series to their leads. the same block sits in the builder and above an over-budget report.
  import { Button, Notice } from '@marinebon/ui'
  import { budgetLine, LAYOUTS } from '../../../../src/report/spec.ts'
  import type { Budget, Fix, Layout } from '../../../../src/report/spec.ts'

  interface Props {
    layout: Layout
    budget: Budget
    /** the sections the report is split into now, if any */
    split: 'place' | 'category' | null
    onfix: (fix: Fix) => void
    onunsplit: () => void
  }
  let { layout, budget, split, onfix, onunsplit }: Props = $props()

  const words = (f: Fix) =>
    f.kind === 'layout' ? `Switch to ${LAYOUTS[f.layout].title}`
      : f.kind === 'split' ? `Split into ${f.sections} sections, one per ${f.by}`
      : 'Collapse each series to its lead'
</script>

{#if split}
  <p class="line" role="status">Split into sections by {split}: each section fits {LAYOUTS[layout].title}. <Button variant="quiet" size="sm" onclick={onunsplit}>Show as one</Button></p>
{:else if budget.ok}
  <p class="line" role="status">{budgetLine(layout, budget)}</p>
{:else}
  <Notice kind="warn">
    <span class="msg">{budgetLine(layout, budget)}. Over: {budget.over.join(', ')}.</span>
    {#if budget.fixes.length}
      <span class="fixes" role="group" aria-label="Ways to fit the report">
        {#each budget.fixes as f (f.kind + (f.kind === 'layout' ? f.layout : f.kind === 'split' ? f.by : ''))}
          <Button variant="quiet" size="sm" onclick={() => onfix(f)}>{words(f)}</Button>
        {/each}
      </span>
    {:else}
      <span class="msg"> No layout fits as it is: choose fewer places or indicators.</span>
    {/if}
  </Notice>
{/if}

<style>
  .line { margin: 0; font: var(--type-small); color: var(--text-body); }
  .msg { display: block; }
  .fixes { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
</style>
