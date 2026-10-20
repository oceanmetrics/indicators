<script lang="ts">
  // the one renderer of the Ocean Metrics icon set: a name from the generated map, never a raw path string
  // (a hand-typed "MDI" path is exactly the mistake the generator exists to prevent). aria-hidden unless the icon
  // carries its own accessible name (title); an unknown name renders nothing rather than throwing. the eov- paths load
  // on first use (eov.svelte.ts): until they arrive an eov- icon keeps its box empty, so nothing shifts when it draws.
  import { CORE_PATHS } from "./icon-core.ts";
  import type { IconName } from "./icon-paths.ts";
  import { eov, isEovName, loadEov } from "./eov.svelte.ts";

  interface Props {
    name: IconName;
    /** CSS pixels; the glyph is always drawn on a 24x24 viewBox, so this only scales it */
    size?: number;
    /** when set, the icon is role="img" with this label; leave unset inside a control that already has a name */
    title?: string;
    class?: string;
  }

  let { name, size = 20, title, class: className = "" }: Props = $props();
  const lazy = $derived(isEovName(name));
  $effect(() => { if (lazy && !eov.paths) loadEov().catch(() => {}); });
  const d = $derived(lazy ? eov.paths?.[name] : (CORE_PATHS as Record<string, string>)[name]);
</script>

{#if d}
  <svg
    class="om-icon {className}"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    role={title ? "img" : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : "true"}
    focusable="false"
  >
    <path fill="currentColor" {d} />
  </svg>
{:else if lazy}
  <svg class="om-icon {className}" viewBox="0 0 24 24" width={size} height={size} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : "true"} focusable="false"></svg>
{/if}

<style>
  .om-icon {
    display: inline-block;
    flex: none;
    color: inherit;
  }
</style>
