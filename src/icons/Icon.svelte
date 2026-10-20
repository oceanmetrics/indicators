<script lang="ts">
  // the one renderer of the Ocean Metrics icon set: a name from the generated map, never a raw path string
  // (a hand-typed "MDI" path is exactly the mistake the generator exists to prevent). aria-hidden unless the icon
  // carries its own accessible name (title); an unknown name renders nothing rather than throwing.
  import { ICON_PATHS, type IconName } from "./icon-paths";

  interface Props {
    name: IconName;
    /** CSS pixels; the glyph is always drawn on a 24x24 viewBox, so this only scales it */
    size?: number;
    /** when set, the icon is role="img" with this label; leave unset inside a control that already has a name */
    title?: string;
    class?: string;
  }

  let { name, size = 20, title, class: className = "" }: Props = $props();
  const d = $derived((ICON_PATHS as Record<string, string>)[name]);
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
{/if}

<style>
  .om-icon {
    display: inline-block;
    flex: none;
    color: inherit;
  }
</style>
