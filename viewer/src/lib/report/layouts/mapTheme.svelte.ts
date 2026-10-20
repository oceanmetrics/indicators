// the theme in force and the tokens resolved against it, for the report's maps (MapCanvas takes resolved colours, not token
// names). call `watchTheme()` while a component initialises: it follows `data-theme` on <html>, so the colours (read through
// `css(name)` inside a $derived) follow the theme, and the print job's switch to the light theme.
import { onMount } from 'svelte'

export function watchTheme() {
  let theme = $state(typeof document === 'undefined' ? 'light' : document.documentElement.dataset.theme ?? 'light')
  onMount(() => {
    const mo = new MutationObserver(() => { theme = document.documentElement.dataset.theme ?? 'light' })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  })
  return {
    get theme() { return theme },
    get dark() { return theme === 'dark' },
    /** a token resolved against the theme in force (a `$derived` that reads `theme` first re-resolves on a switch) */
    css(name: string): string { void theme; return getComputedStyle(document.documentElement).getPropertyValue(name).trim() },
  }
}
