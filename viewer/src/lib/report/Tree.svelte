<script lang="ts">
  // a tree of tri-state checkboxes (tree.ts builds the nodes, the builder turns a click into new rules). every box is a
  // button with role="checkbox" and aria-checked true | false | mixed, so Tab reaches it and Space or Enter toggles it;
  // the arrow next to a node opens or closes its children. a series shows its other members under "more in this series".
  import { Icon } from '../../../../src/icons/index.ts'
  import type { TreeNode } from './tree.ts'

  interface Props {
    nodes: TreeNode[]
    label: string
    ontoggle: (node: TreeNode, on: boolean) => void
    /** open every node (a search is on) */
    expandAll?: boolean
    /** shown when there is nothing to list */
    empty?: string
  }
  let { nodes, label, ontoggle, expandAll = false, empty = 'Nothing to list.' }: Props = $props()

  // category and small collection nodes start open; the rest closed
  let open = $state<Record<string, boolean>>({})
  const id = (n: TreeNode) => `${n.kind}:${n.key}`
  const expandable = (n: TreeNode) => n.children.length > 0 && n.kind !== 'series' || n.more.length > 0
  const kids = (n: TreeNode) => (n.kind === 'series' ? n.more : n.children)
  const isOpen = (n: TreeNode) => expandAll || (open[id(n)] ?? (n.kind === 'category' || (n.kind === 'collection' && n.children.length <= 30)))
  const flip = (n: TreeNode) => (open[id(n)] = !isOpen(n))
  const aria = (n: TreeNode) => (n.state === 'mixed' ? 'mixed' : n.state === 'checked')
</script>

{#snippet item(n: TreeNode)}
  <li class="node" data-kind={n.kind}>
    <div class="row">
      {#if expandable(n)}
        <button type="button" class="disc" aria-expanded={isOpen(n)} aria-label="{isOpen(n) ? 'Collapse' : 'Expand'} {n.kind === 'series' ? `more in ${n.label}` : n.label}" onclick={() => flip(n)}>
          <Icon name={isOpen(n) ? 'ui-collapse' : 'ui-expand'} size={16} />
        </button>
      {:else}
        <span class="disc" aria-hidden="true"></span>
      {/if}
      <button type="button" class="cb" role="checkbox" aria-checked={aria(n)} title={n.title} data-state={n.state} data-key={n.key} onclick={() => ontoggle(n, n.state !== 'checked')}>
        <span class="box" aria-hidden="true">
          {#if n.state === 'checked'}<Icon name="ui-check" size={14} />{:else if n.state === 'mixed'}<span class="dash"></span>{/if}
        </span>
        <span class="lab">{n.label}</span>
        <span class="hint">{n.hint}</span>
      </button>
    </div>
    {#if expandable(n) && isOpen(n)}
      <ul class="kids" role="group" aria-label={n.kind === 'series' ? `More in ${n.label}` : n.label}>
        {#each kids(n) as k (k.kind + k.key)}{@render item(k)}{/each}
      </ul>
    {/if}
  </li>
{/snippet}

{#if nodes.length}
  <ul class="tree" role="group" aria-label={label}>
    {#each nodes as n (n.kind + n.key)}{@render item(n)}{/each}
  </ul>
{:else}
  <p class="empty">{empty}</p>
{/if}

<style>
  ul { list-style: none; margin: 0; padding: 0; }
  .kids { margin-left: 1.25rem; }
  .row { display: flex; align-items: center; gap: var(--space-1); min-width: 0; }
  .disc { flex: none; display: inline-grid; place-items: center; width: 1.5rem; height: 1.75rem; padding: 0; border: 0; background: none; color: var(--text-body); border-radius: var(--radius-sm); cursor: pointer; }
  button.disc:hover { background: var(--control-hover); color: var(--text-strong); }
  .cb {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-2);
    border: 0; border-radius: var(--radius-sm); background: none; text-align: left; cursor: pointer; color: var(--text-strong); font: var(--type-small);
  }
  .cb:hover { background: var(--control-hover); }
  .box {
    flex: none; display: inline-grid; place-items: center; width: 1.125rem; height: 1.125rem; border: 1.5px solid var(--border-strong);
    border-radius: 3px; background: var(--control-bg); color: var(--on-brand);
  }
  .cb[data-state='checked'] .box, .cb[data-state='mixed'] .box { background: var(--brand); border-color: var(--brand); }
  .dash { width: 0.5rem; height: 2px; background: var(--on-brand); border-radius: 1px; }
  .lab { min-width: 0; overflow-wrap: anywhere; }
  .node[data-kind='category'] > .row .lab { font-weight: var(--fw-semibold); }
  .hint { margin-left: auto; padding-left: var(--space-2); flex: none; font: var(--fw-regular) 0.6875rem / 1.2 var(--font-mono); color: var(--text-body); white-space: nowrap; }
  .empty { margin: 0; padding: var(--space-3); font: var(--type-small); color: var(--text-body); }
  @media (max-width: 640px) { .hint { white-space: normal; text-align: right; } }
</style>
