<script lang="ts">
  // copies a text to the clipboard and says so (aria-live); falls back to a hidden textarea when the async API is absent
  import { Button } from '@marinebon/ui'
  import { Icon } from '../../../src/icons/index.ts'

  let { text, label = 'Copy' }: { text: string; label?: string } = $props()
  let done = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* nothing more to try */ }
      ta.remove()
    }
    done = true
    clearTimeout(timer)
    timer = setTimeout(() => (done = false), 2000)
  }
</script>

<Button variant="quiet" size="sm" onclick={copy}>
  <Icon name={done ? 'ui-check' : 'ui-copy'} size={16} />{done ? 'Copied' : label}
</Button>
<span class="mbon-sr-only" aria-live="polite">{done ? 'Copied to the clipboard' : ''}</span>
