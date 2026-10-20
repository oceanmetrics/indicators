// work a layout must finish before the browser prints: a live map cannot be printed (WebGL keeps no buffer), so each map
// registers a hook that waits until it is drawn in the print theme and takes a picture of itself. the Report view runs the
// hooks between switching to the light theme and window.print(), and gives up on a slow one after `timeoutMs`.
type Hook = () => Promise<void>

const hooks = new Set<Hook>()

/** register a hook; returns the function that removes it (call it when the component goes away) */
export function onPrintPrep(fn: Hook): () => void {
  hooks.add(fn)
  return () => { hooks.delete(fn) }
}

/** run every hook at once and wait for all, a failing hook being skipped, for at most `timeoutMs` */
export async function runPrintPrep(timeoutMs = 12_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const all = Promise.all([...hooks].map(h => h().catch(() => undefined)))
  const limit = new Promise<void>(res => { timer = setTimeout(res, timeoutMs) })
  await Promise.race([all, limit])
  clearTimeout(timer)
}
