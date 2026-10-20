// the indicator picker's rules that the page needs before the panel opens: the vocabulary words and the words on the button.
// the panel's own rules (the tree, the counts, the ticks as the Matrix's keys, the Map's group hints) are in indicatorsTree.ts.
import type { VocabId } from '../data.ts'

export const VOCAB_LABELS: Record<VocabId, string> = { onms: 'ONMS sections', names: 'NaMES themes', eov: 'GOOS EOVs' }

// ---- the button's words ----

/** "11 indicators · ONMS sections · leads only" */
export function multiIndicatorLabel(n: number, vocab: VocabId, leads: boolean): string {
  return `${n} ${n === 1 ? 'indicator' : 'indicators'} · ${VOCAB_LABELS[vocab]}${leads ? ' · leads only' : ''}`
}

