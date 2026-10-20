<!--
  OmHeader: the Ocean Metrics instance's header. It mirrors @marinebon/ui's Header layout and slots (app name,
  tagline, `lens`, `help`, `feedback`, `right`, the theme toggle) but shows the ensō mark and the wordmark where the
  kit's Header hard-codes the MBON logo. This becomes the kit Header's `logo` slot (proposed for @marinebon/ui
  v0.5.0); until then the viewer carries this copy, and the MBON instance uses the kit's Header as it is.

  The mark: the ring is currentColor (--link here), the waterline is --om-mark-spark (see brand.ts themedMark).
  The wordmark: "Ocean" in Fraunces (opsz 60, wght 600), "Metrics" in IBM Plex Mono, then the app name.
-->
<script lang="ts">
  import { Menu, ThemeToggle } from '@marinebon/ui'
  import type { Snippet } from 'svelte'
  import { MARK_SVG } from './brand.ts'

  interface Props {
    appName: string
    tagline?: string
    appHref?: string
    logoHref?: string
    themeToggle?: boolean
    helpLabel?: string
    lens?: Snippet
    help?: Snippet<[() => void]>
    feedback?: Snippet
    right?: Snippet
  }
  let { appName, tagline, appHref, logoHref = 'https://oceanmetrics.io', themeToggle = true, helpLabel = 'Help', lens, help, feedback, right }: Props = $props()
</script>

<header class="om-header">
  <a class="logo" href={logoHref} aria-label="Ocean Metrics (oceanmetrics.io)">
    <span class="mark" aria-hidden="true">{@html MARK_SVG}</span>
    <span class="word"><span class="ocean">Ocean</span><span class="metrics">Metrics</span></span>
  </a>
  <div class="app">
    <div class="name-row">
      <span class="dot" aria-hidden="true">·</span>
      {#if appHref}<a class="name" href={appHref}>{appName}</a>{:else}<span class="name">{appName}</span>{/if}
      {#if lens}<span class="lens">{@render lens()}</span>{/if}
    </div>
    {#if tagline}<p class="tagline">{tagline}</p>{/if}
  </div>
  <div class="right">
    {#if right}{@render right()}{/if}
    {#if help}
      <Menu label={helpLabel} align="end" variant="plain">
        {#snippet children(close)}{@render help(close)}{/snippet}
      </Menu>
    {/if}
    {#if feedback}{@render feedback()}{/if}
    {#if themeToggle}<ThemeToggle />{/if}
  </div>
</header>

<style>
  .om-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
    color: var(--text-body);
    min-height: 56px;
  }
  .logo { flex: none; display: inline-flex; align-items: center; gap: var(--space-2); color: var(--link); text-decoration: none; }
  .logo:hover { text-decoration: none; }
  .mark { display: inline-flex; color: var(--link); }
  .mark :global(svg) { width: 1.9rem; height: 1.9rem; display: block; }
  .word { display: inline-flex; align-items: baseline; gap: 0.1em; font-size: 1.25rem; line-height: 1; }
  .ocean { font-family: 'Fraunces', Georgia, 'Times New Roman', serif; font-weight: 600; font-variation-settings: 'opsz' 60; color: var(--text-strong); letter-spacing: -0.01em; }
  .metrics { font-family: var(--font-mono); font-weight: var(--fw-medium); font-size: 1.05rem; color: var(--link); }
  .app { min-width: 0; display: flex; flex-direction: column; }
  .name-row { display: flex; align-items: baseline; gap: var(--space-2); min-width: 0; }
  .dot { color: var(--text-body); font-size: var(--text-md); }
  .name { font: var(--fw-bold) var(--text-md) / 1.2 var(--font-display); letter-spacing: var(--ls-tight); color: var(--text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  a.name:hover { color: var(--brand-hover); text-decoration: none; }
  .lens { font: var(--type-label); text-transform: uppercase; letter-spacing: var(--ls-label); color: var(--label-color); }
  .tagline { margin: 0; font: var(--type-small); line-height: 1.3; color: var(--text-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .right { margin-left: auto; display: flex; align-items: center; gap: var(--space-2); flex: none; }
  @media (max-width: 640px) {
    .om-header { gap: var(--space-2); padding: var(--space-2) var(--space-3); }
    .mark :global(svg) { width: 1.5rem; height: 1.5rem; }
    .word { font-size: 1rem; }
    .metrics { font-size: 0.85rem; }
    .app { flex: 1; }
    .right { gap: var(--space-1); }
    .lens, .tagline { display: none; }
  }
</style>
