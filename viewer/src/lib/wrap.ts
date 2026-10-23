// where a long identifier or url may break: after a run of the separators : / _ . and nowhere else, so a card's
// citation wraps at "precipitation:" / "index." and never inside a word. the component puts a <wbr> after each part;
// the text itself (what Copy citation copies) is never changed.
const SEP = /[^:/_.]*[:/_.]+|[^:/_.]+$/g

/** the text cut after each run of separators; joined again it is the text */
export function breakParts(text: string): string[] {
  return text.match(SEP) ?? []
}
