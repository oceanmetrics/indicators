#!/usr/bin/env bash
# publish the change files and the Atom feeds of a build (src/coverage/changes.ts) or of the backfill
# (scripts/backfill_changes.mjs) to indicators/{changes,feeds}/ of the public bucket through oceanmetrics/platform
# scripts/om-publish.sh (both stores, R2 then S3; the host's AWS profile and R2 rclone wrapper).
#   scripts/publish_changes.sh [out] [--dry-run]
# called by publish_catalog.sh after coverage.parquet and before indicators.json. order: the change files, then the
# feeds and their index, then changes/latest.json last, so a reader never follows the pointer to a file not there yet.
# nothing is deleted: a change file, once published, stays.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-catalog}"
REALLY="--really"; [ "${2:-}" = "--dry-run" ] && REALLY="--dry-run"
PREFIX="${INDICATORS_PREFIX:-indicators}"
. scripts/om_publish_path.sh
[ -f "$OUT/changes/latest.json" ] && [ -f "$OUT/feeds/index.json" ] || { echo "no change files in $OUT (changes/latest.json, feeds/index.json)" >&2; exit 1; }
npx --no-install om-catalog validate changes-latest "$OUT/changes/latest.json" >/dev/null
npx --no-install om-catalog validate feeds-index "$OUT/feeds/index.json" >/dev/null
CC="public, max-age=300"
JSON='json=application/json; charset=utf-8'
# om-publish stops on an empty selection, so a day without a change file (only latest.json) skips the first two
has() { find "$OUT/changes" -maxdepth 1 -name "$1" ! -name latest.json | grep -q .; }
if has '*.parquet'; then "$P" $REALLY --cache-control "$CC" --include '*.parquet' "$OUT/changes" "$PREFIX/changes"; fi
if has '*.json'; then "$P" $REALLY --cache-control "$CC" --type "$JSON" --include '*.json' --exclude latest.json "$OUT/changes" "$PREFIX/changes"; fi
"$P" $REALLY --cache-control "$CC" --type 'xml=application/atom+xml; charset=utf-8' --include '*.xml' "$OUT/feeds" "$PREFIX/feeds"
"$P" $REALLY --cache-control "$CC" --type "$JSON" "$OUT/feeds/index.json" "$PREFIX/feeds"
"$P" $REALLY --cache-control "$CC" --type "$JSON" "$OUT/changes/latest.json" "$PREFIX/changes"
echo "published $OUT/changes, $OUT/feeds -> $PREFIX/ ($(find "$OUT/changes" -name '????-??-??.json' | wc -l | tr -d ' ') change files, $(find "$OUT/feeds" -name '*.xml' | wc -l | tr -d ' ') feeds)$([ "$REALLY" = --really ] || echo ' (dry run)')"
