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
    /** choose one leaf instead of ticking boxes: a leaf is a button (`ontoggle(leaf, true)`), the groups above it only open and close */
    pick?: boolean
    /** a node whose children are not all read yet (`lazy`) was opened: the caller reads them */
    onopen?: (node: TreeNode) => void
  }
  let { nodes, label, ontoggle, expandAll = false, empty = 'Nothing to list.', pick = false, onopen }: Props = $props()

  // category and small collection nodes start open; the rest closed (when picking, the groups holding the current leaf are open)
  let open = $state<Record<string, boolean>>({})
  const id = (n: TreeNode) => `${n.kind}:${n.key}`
  const isLeaf = (n: TreeNode) => n.kind === 'indicator' || n.kind === 'place'
  const kids = (n: TreeNode) => (n.kind === 'series' ? (pick ? [...n.children, ...n.more] : n.more) : n.children)
  const expandable = (n: TreeNode) => (pick ? !isLeaf(n) && (kids(n).length > 0 || !!n.lazy) : n.children.length > 0 && n.kind !== 'series' || n.more.length > 0 || !!n.lazy)
  const dflt = (n: TreeNode) => (pick ? n.kind === 'category' || n.state !== 'unchecked' : n.kind === 'category' || (n.kind === 'collection' && n.state !== 'unchecked' && !n.lazy && n.children.length <= 30))
  const isOpen = (n: TreeNode) => expandAll || (open[id(n)] ?? dflt(n))
  const flip = (n: TreeNode) => {
    open[id(n)] = !isOpen(n)
    if (open[id(n)] && n.lazy) onopen?.(n)
  }
  const aria = (n: TreeNode) => (n.state === 'mixed' ? 'mixed' : n.state === 'checked')
</script>

{#snippet item(n: TreeNode)}
  <li class="node" data-kind={n.kind}>
    <div class="row om-top">
      {#if expandable(n)}
        <button type="button" class="disc" aria-expanded={isOpen(n)} aria-label="{isOpen(n) ? 'Collapse' : 'Expand'} {n.kind === 'series' ? `more in ${n.label}` : n.label}" onclick={() => flip(n)}>
          <Icon name={isOpen(n) ? 'ui-collapse' : 'ui-expand'} size={16} />
        </button>
      {:else}
        <span class="disc" aria-hidden="true"></span>
      {/if}
      {#if pick && isLeaf(n)}
        <button type="button" class="cb" title={n.title} data-state={n.state} data-key={n.key} aria-current={n.state === 'checked' ? 'true' : undefined} onclick={() => ontoggle(n, true)}>
          <span class="lab">{n.label}</span>
          <span class="hint">{n.hint}</span>
        </button>
      {:else if pick}
        <button type="button" class="cb" data-state={n.state} data-key={n.key} aria-expanded={isOpen(n)} onclick={() => flip(n)}>
          <span class="lab">{n.label}</span>
          <span class="hint">{n.hint}</span>
        </button>
      {:else}
        <button type="button" class="cb" role="checkbox" aria-checked={aria(n)} title={n.title} data-state={n.state} data-key={n.key} onclick={() => ontoggle(n, n.state !== 'checked')}>
          <span class="box" aria-hidden="true">
            {#if n.state === 'checked'}<Icon name="ui-check" size={14} />{:else if n.state === 'mixed'}<span class="dash"></span>{/if}
          </span>
          <span class="lab">{n.label}{#if n.desc}<small class="desc">{n.desc}</small>{/if}</span>
          <span class="hint">{n.hint}</span>
        </button>
      {/if}
      {#if n.link}
        <a class="lk" href={n.link.href} target="_blank" rel="noopener" aria-label="{n.label}: {n.link.label} (opens in a new tab)">{n.link.label}<Icon name="ui-external" size={12} /></a>
      {/if}
    </div>
    {#if expandable(n) && isOpen(n)}
      <ul class="kids" role="group" aria-label={n.kind === 'series' ? `More in ${n.label}` : n.label}>
        {#each kids(n) as k (k.kind + k.key)}{@render item(k)}{/each}
        {#if n.note}<li class="note om-note">{n.note}</li>{/if}
      </ul>
    {/if}
  </li>
{/snippet}

{#if nodes.length}
  <ul class="tree" class:picking={pick} role="group" aria-label={label}>
    {#each nodes as n (n.kind + n.key)}{@render item(n)}{/each}
  </ul>
{:else}
  <p class="empty">{empty}</p>
{/if}

<style>
  ul { list-style: none; margin: 0; padding: 0; }
  .kids { margin-left: 1.25rem; }
  .disc { flex: none; display: inline-grid; place-items: center; width: 1.5rem; height: 1.75rem; padding: 0; border: 0; background: none; color: var(--text-body); border-radius: var(--radius-sm); cursor: pointer; }
  button.disc:hover { background: var(--control-hover); color: var(--text-strong); }
  .cb {
    flex: 1 1 12rem; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-2); padding: var(--space-1) var(--space-2);
    border: 0; border-radius: var(--radius-sm); background: none; text-align: left; cursor: pointer; color: var(--text-strong); font: var(--type-small);
  }
  .cb:hover { background: var(--control-hover); }
  .box {
    flex: none; display: inline-grid; place-items: center; width: 1.125rem; height: 1.125rem; border: 1.5px solid var(--border-strong);
    border-radius: 3px; background: var(--control-bg); color: var(--on-brand);
  }
  .cb[data-state='checked'] .box, .cb[data-state='mixed'] .box { background: var(--brand); border-color: var(--brand); }
  .dash { width: 0.5rem; height: 2px; background: var(--on-brand); border-radius: 1px; }
  .row { flex-wrap: wrap; }
  .lab { flex: 1 1 8rem; min-width: 0; overflow-wrap: anywhere; }
  .desc { display: block; font: var(--type-small); font-size: 0.75rem; color: var(--text-body); }
  .note { padding: var(--space-1) var(--space-2); }
  .node[data-kind='category'] > .row .lab { font-weight: var(--fw-semibold); }
  .hint { margin-left: auto; padding-left: var(--space-2); flex: 0 1 auto; max-width: 55%; text-align: right; white-space: nowrap; font: var(--fw-regular) 0.6875rem / 1.2 var(--font-mono); color: var(--text-body); }
  .cb[aria-current='true'] { background: var(--control-hover); }
  .picking .hint { white-space: normal; }
  .lk { flex: none; display: inline-flex; align-items: center; gap: 2px; padding: 0 var(--space-1); font: var(--type-small); white-space: nowrap; }
  @media (max-width: 600px) { .hint { white-space: normal; max-width: 100%; margin-left: 0; text-align: left; padding-left: 0; } }
  .empty { margin: 0; padding: var(--space-3); font: var(--type-small); color: var(--text-body); }
</style>
