#!/usr/bin/env bash
# one stats unit (a place x an ERDDAP dataset x a variable) on the one engine: the steps of requests.yml's run job and of
# its daily job, so an issue, a dispatch and the schedule compute, gate and publish a unit the same way (ledger
# 2026-10-24, week 1: the compare gate).
#
#   stats_unit.sh compute OUT          om-extract run (the chunked engine and its stats item) into OUT/gazetteer/stats
#                                      and OUT/run, for REQ_PLACE, REQ_COLL, REQ_DATASET, REQ_VARIABLE (check-job's)
#   stats_unit.sh gate OUT             the published file of the same unit from the storage host (if any) against the
#                                      engine's: `om-extract compare --allow-newer` (the criterion of 2026-10-23 on the
#                                      published window, the engine's newer days allowed; no published file is the
#                                      first publish). prints one `<unit> verdict: ...` line, writes OUT/compare/
#                                      (compare.txt, compare.json, verdict.txt, reference.txt); exit 0 PASS, 1 FAIL
#   stats_unit.sh publish OUT          om-publish.sh the unit's three files (parquet, provenance, item) to both stores
#   stats_unit.sh daily UNITS.tsv ROOT every unit of the TSV (place, coll, dataset, variable, cadence) due today: checked,
#                                      computed (up to OM_TRIES tries, OM_RETRY_WAIT s apart: a PacIOOS outage), gated,
#                                      and published only on PASS when PUBLISH is true; ROOT/summary.md lists them.
#                                      cadence: daily (every day; also a line without the column), weekly (Mondays) or
#                                      monthly (the 1st), by the UTC date (ledger week 6: a monthly series runs monthly)
#
# environment: OM_CHUNKS (the chunk store, default ~/.cache/oceanmetrics/chunks), OM_STORAGE_HOST (default
# https://storage.oceanmetrics.io), OM_PUBLISH (om-publish.sh), REF_VERSION (gate: an S3 version id of the published file
# to compare against instead, a test of the gate: requests.yml never publishes with it), UNITS_FILTER (daily: an
# extended regex the TSV line must match), OM_TRIES (daily, default 4: a try and 3 retries), OM_RETRY_WAIT (default 600),
# OM_CADENCE (daily: `due`, the default, runs the units due on the day; `all` every unit), OM_TODAY (daily: the UTC date
# the cadence is read against, yyyy-mm-dd; default today).
#
# a unit is never published in part: OUT is emptied before each compute, a failed compute leaves nothing to publish, and
# publish refuses unless OUT holds exactly the unit's parquet, provenance and item and the gate wrote PASS for them.
set -euo pipefail

SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
HOST="${OM_STORAGE_HOST:-https://storage.oceanmetrics.io}"
BUCKET=oceanmetrics.io-public

need() { for v in "$@"; do [ -n "${!v:-}" ] || { echo "error: $v is not set" >&2; exit 2; }; done; }
key() { echo "gazetteer/stats/$REQ_DATASET/$REQ_VARIABLE/$REQ_PLACE.parquet"; }
tag() { echo "$REQ_DATASET/$REQ_VARIABLE/$REQ_PLACE"; }

compute() {
  local out=$1
  need REQ_PLACE REQ_COLL REQ_DATASET REQ_VARIABLE
  # the place from the gazetteer (a reference collection from the runner's private copy, PLACES_INTERNAL), the whole
  # record through the chunk store (kept between runs outside the checkout, so a run fetches only the chunks it lacks),
  # and erddap-places' stats/ layout with its STAC item under OUT/gazetteer/stats
  rm -rf "$out"
  mkdir -p "$out"
  uv run om-extract run \
    --collection "https://storage.oceanmetrics.io/gazetteer/erddap/$REQ_DATASET/collection.json" \
    --place "$REQ_PLACE" --coll "$REQ_COLL" --var "$REQ_VARIABLE" \
    --chunks "${OM_CHUNKS:-$HOME/.cache/oceanmetrics/chunks}" \
    --stats-dir "$out/gazetteer/stats" --out "$out/run"
}

gate() {
  local out=$1 eng ref url code rc src args line
  need REQ_PLACE REQ_DATASET REQ_VARIABLE
  eng="$out/gazetteer/stats/$REQ_DATASET/$REQ_VARIABLE/$REQ_PLACE.parquet"
  mkdir -p "$out/compare"
  rm -f "$out/compare/verdict.txt"
  ref="$out/compare/published.parquet"
  rm -f "$ref"
  fail() { line="$(tag) verdict: FAIL -> $1"; echo "$line" | tee "$out/compare/verdict.txt"; exit 1; }
  [ -s "$eng" ] || fail "the engine wrote no stats file ($eng): not published"
  if [ -n "${REF_VERSION:-}" ]; then
    # a test of the gate: an older version of the published file, never a reason to publish
    src="s3://$BUCKET/$(key) version $REF_VERSION (a test reference)"
    aws s3api get-object --bucket "$BUCKET" --key "$(key)" --version-id "$REF_VERSION" "$ref" > /dev/null \
      || fail "the test reference could not be read ($src)"
    args=("$ref")
  else
    # the storage host (R2 behind the om-gazetteer Worker, max-age 300): 200 is the published file, 404 the first
    # publish, anything else (an outage) refuses
    url="$HOST/$(key)"
    src="$url"
    code=$(curl -sS -L --retry 3 --retry-delay 20 -o "$ref" -w '%{http_code}' "$url") || code="${code:-000}"
    case "$code" in
      200) args=("$ref") ;;
      404) args=(--first-publish); rm -f "$ref"; src="$url (404: no published file)" ;;
      *) fail "the published file could not be read (HTTP $code, $url): not published" ;;
    esac
  fi
  echo "reference: $src" > "$out/compare/reference.txt"
  echo "$(tag): engine $eng ($(wc -c < "$eng" | tr -d ' ') B) against $src"
  rc=0
  uv run om-extract compare "$eng" "${args[@]}" --allow-newer --json "$out/compare/compare.json" \
    > "$out/compare/compare.txt" 2>&1 || rc=$?
  cat "$out/compare/compare.txt"
  # the verdict and its reasons as one line
  line="$(tag) $(sed -n '/^verdict:/,$p' "$out/compare/compare.txt" | sed 's/^ *//' |
    awk 'NR == 1 { printf "%s", $0; next } { printf "%s%s", (NR == 2 ? ": " : "; "), $0 } END { print "" }')"
  if [ "$rc" != 0 ] || ! grep -q '^verdict: PASS' "$out/compare/compare.txt"; then
    case "$line" in *"verdict: "*) ;; *) line="$(tag) verdict: FAIL -> om-extract compare exited $rc" ;; esac
    echo "$line" | tee "$out/compare/verdict.txt"
    return 1
  fi
  echo "$line" | tee "$out/compare/verdict.txt"
}

publish() {
  local out=$1 n_pq n_pv n_it
  need OM_PUBLISH REQ_PLACE REQ_DATASET REQ_VARIABLE
  grep -q ' verdict: PASS' "$out/compare/verdict.txt" 2>/dev/null \
    || { echo "error: no PASS from the gate in $out/compare/verdict.txt: not published" >&2; exit 1; }
  cd "$out/gazetteer"
  n_pq=$(find stats -name '*.parquet' | wc -l | tr -d ' ')
  n_pv=$(find stats -name '*.provenance.json' | wc -l | tr -d ' ')
  n_it=$( (find stats/items -name '*.json' 2> /dev/null || true) | wc -l | tr -d ' ')
  if [ "$n_pq" != 1 ] || [ "$n_pv" != 1 ] || [ "$n_it" != 1 ] || \
     [ ! -s "stats/$REQ_DATASET/$REQ_VARIABLE/$REQ_PLACE.parquet" ]; then
    echo "error: $out is not one whole unit ($n_pq parquet, $n_pv provenance, $n_it item): not published" >&2
    exit 1
  fi
  # om-publish.sh, both stores (content types by extension), the parquet, its provenance, then the item (it records the
  # others' size and checksum)
  "$OM_PUBLISH" --really --include '*.parquet' --include '*.provenance.json' --include 'items/*.json' \
    --last '*.provenance.json' --last 'items/*' stats gazetteer/stats
}

# whether a unit of `cadence` is due on the UTC date `today` (yyyy-mm-dd): daily always, weekly on a Monday, monthly
# on the 1st; exit 2 for an unknown cadence
due() {
  local cadence=$1 today=$2 y m dd w
  y=$((10#${today:0:4})); m=$((10#${today:5:2})); dd=$((10#${today:8:2}))
  case "$cadence" in
    daily) return 0 ;;
    monthly) [ "$dd" = 1 ] ;;
    weekly)
      # the day of the week (Sakamoto), 0 = Sunday, 1 = Monday
      local -a t=(0 3 2 5 0 3 5 1 4 6 2 4)
      [ "$m" -lt 3 ] && y=$((y - 1))
      w=$(( (y + y / 4 - y / 100 + y / 400 + ${t[$((m - 1))]} + dd) % 7 ))
      [ "$w" = 1 ] ;;
    *) return 2 ;;
  esac
}

daily() {
  local units=$1 root=$2 tries outage=0 i ok place coll dataset variable cadence rest d t k v rc notdue=0
  local -a published=() passed=() refused=() skipped=() failed=()
  local wait="${OM_RETRY_WAIT:-600}" max="${OM_TRIES:-4}" mode="${OM_CADENCE:-due}" today="${OM_TODAY:-$(date -u +%F)}"
  case "$mode" in due|all) ;; *) echo "error: OM_CADENCE is due or all, not '$mode'" >&2; exit 2 ;; esac
  [[ "$today" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "error: OM_TODAY is yyyy-mm-dd, not '$today'" >&2; exit 2; }
  mkdir -p "$root"
  while IFS=$'\t' read -r place coll dataset variable cadence rest || [ -n "$place" ]; do
    case "$place" in ''|'#'*|place) continue ;; esac
    if [ -n "${UNITS_FILTER:-}" ] && ! printf '%s\t%s\t%s\t%s\n' "$place" "$coll" "$dataset" "$variable" | grep -Eq "$UNITS_FILTER"; then
      continue
    fi
    # the unit's cadence (none is daily): a unit not due today is passed over, and counted
    cadence="${cadence:-daily}"
    rc=0; due "$cadence" "$today" || rc=$?
    if [ "$rc" = 2 ]; then failed+=("$dataset/$variable/$place (an unknown cadence: $cadence)"); continue; fi
    if [ "$rc" != 0 ] && [ "$mode" = due ]; then notdue=$((notdue + 1)); continue; fi
    # the unit checked like any job (check-job), then passed on as REQ_*
    d="$root/$(printf '%s_%s_%s' "$dataset" "$variable" "$place" | tr ':/' '--')"
    mkdir -p "$d"
    jq -n --arg place "$place" --arg coll "$coll" --arg dataset "$dataset" --arg variable "$variable" \
      '{place: $place, coll: $coll, dataset: $dataset, variable: $variable, indicator: ("erddap:" + $dataset + ":" + $variable + ":mean")}' \
      > "$d/job.json"
    if ! uv run python -m om_indicators.requests check-job "$d/job.json" > "$d/job.env"; then
      failed+=("$dataset/$variable/$place (a malformed unit)"); continue
    fi
    while IFS='=' read -r k v; do export "$k=$v"; done < "$d/job.env"
    t="$(tag)"
    echo "== $(date -u +%FT%TZ) $t"
    # a PacIOOS outage: a unit gets a try and OM_TRIES-1 retries; once a unit is skipped the next ones get one try
    # each until one computes again, so an outage costs one unit's retries, not every unit's
    if [ "$outage" = 1 ]; then tries=1; else tries=$max; fi
    ok=0
    for ((i = 1; i <= tries; i++)); do
      if bash "$SELF" compute "$d/unit" > "$d/compute.log" 2>&1; then ok=1; break; fi
      tail -n 3 "$d/compute.log" | sed 's/^/  /'
      if [ "$i" -lt "$tries" ]; then echo "  $t: compute failed, retry $i of $((tries - 1)) in ${wait}s"; sleep "$wait"; fi
    done
    if [ "$ok" != 1 ]; then
      rm -rf "$d/unit"                 # never a partial: nothing of a failed compute is kept to publish
      echo "  $t: SKIPPED after $tries tr$( [ "$tries" = 1 ] && echo y || echo ies) (see compute.log)"
      skipped+=("$t"); outage=1; continue
    fi
    outage=0
    if bash "$SELF" gate "$d/unit"; then
      if [ "${PUBLISH:-false}" = true ]; then
        if bash "$SELF" publish "$d/unit"; then published+=("$t"); else failed+=("$t (the publish failed)"); fi
      else
        passed+=("$t")
      fi
    else
      refused+=("$t")
    fi
    mkdir -p "$d/compare" && cp "$d/unit/compare/"* "$d/compare/" 2> /dev/null || true
    cp "$d/unit/compare/verdict.txt" "$d/verdict.txt" 2> /dev/null || true
  done < "$units"
  {
    echo "### daily stats: $(( ${#published[@]} + ${#passed[@]} + ${#refused[@]} + ${#skipped[@]} + ${#failed[@]} )) unit(s), publish ${PUBLISH:-false}"
    echo
    echo "- not due on $today: $notdue (cadence $mode)"
    echo "- published (PASS): ${#published[@]}"
    echo "- PASS, not published (a dry run): ${#passed[@]}"
    echo "- refused (FAIL, not published): ${#refused[@]}"
    for x in "${refused[@]+"${refused[@]}"}"; do echo "  - \`$x\`"; done
    echo "- skipped (compute failed, a PacIOOS outage?; not published): ${#skipped[@]}"
    for x in "${skipped[@]+"${skipped[@]}"}"; do echo "  - \`$x\`"; done
    echo "- failed: ${#failed[@]}"
    for x in "${failed[@]+"${failed[@]}"}"; do echo "  - \`$x\`"; done
    echo
    echo '```'
    cat "$root"/*/verdict.txt 2> /dev/null || true
    echo '```'
  } > "$root/summary.md"
  # one line per published unit, and an empty file when none was (printf of no argument would still write a newline)
  : > "$root/published.txt"
  for x in "${published[@]+"${published[@]}"}"; do echo "$x" >> "$root/published.txt"; done
  cat "$root/summary.md"
  for x in "${skipped[@]+"${skipped[@]}"}"; do echo "::warning::skipped (not published): $x"; done
  # a refused or failed unit is a red run; a skipped one (an outage) is a warning
  [ ${#refused[@]} = 0 ] && [ ${#failed[@]} = 0 ]
}

cmd=${1:-}
shift || true
case "$cmd" in
  compute|gate|publish) [ $# = 1 ] || { echo "usage: $0 $cmd OUT" >&2; exit 2; }; "$cmd" "$1" ;;
  daily) [ $# = 2 ] || { echo "usage: $0 daily UNITS.tsv ROOT" >&2; exit 2; }; daily "$1" "$2" ;;
  *) echo "usage: $0 compute|gate|publish OUT | daily UNITS.tsv ROOT" >&2; exit 2 ;;
esac
