#!/usr/bin/env bash
# publish the change files and the Atom feeds of a build (src/coverage/changes.ts) or of the backfill
# (scripts/backfill_changes.mjs) to s3://oceanmetrics.io-public/indicators/{changes,feeds}/, using the host's AWS profile.
#   scripts/publish_changes.sh [out] [--dry-run]
# called by publish_catalog.sh after coverage.parquet and before indicators.json. order: the change files, then the
# feeds and their index, then changes/latest.json last, so a reader never follows the pointer to a file not there yet.
# nothing is deleted: a change file, once published, stays.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-catalog}"
DRY=""; [ "${2:-}" = "--dry-run" ] && DRY="--dryrun"
DEST="${INDICATORS_BUCKET:-s3://oceanmetrics.io-public/indicators}"
[ -f "$OUT/changes/latest.json" ] && [ -f "$OUT/feeds/index.json" ] || { echo "no change files in $OUT (changes/latest.json, feeds/index.json)" >&2; exit 1; }
npx --no-install om-catalog validate changes-latest "$OUT/changes/latest.json" >/dev/null
npx --no-install om-catalog validate feeds-index "$OUT/feeds/index.json" >/dev/null
CC="public, max-age=300"
aws s3 sync "$OUT/changes/" "$DEST/changes/" $DRY --only-show-errors --exclude "*" --include "*.parquet" \
  --content-type application/vnd.apache.parquet --cache-control "$CC"
aws s3 sync "$OUT/changes/" "$DEST/changes/" $DRY --only-show-errors --exclude "*" --include "*.json" --exclude "latest.json" \
  --content-type "application/json; charset=utf-8" --cache-control "$CC"
aws s3 sync "$OUT/feeds/" "$DEST/feeds/" $DRY --only-show-errors --exclude "*" --include "*.xml" \
  --content-type "application/atom+xml; charset=utf-8" --cache-control "$CC"
aws s3 cp "$OUT/feeds/index.json" "$DEST/feeds/index.json" $DRY --only-show-errors \
  --content-type "application/json; charset=utf-8" --cache-control "$CC"
aws s3 cp "$OUT/changes/latest.json" "$DEST/changes/latest.json" $DRY --only-show-errors \
  --content-type "application/json; charset=utf-8" --cache-control "$CC"
echo "published $OUT/changes, $OUT/feeds -> $DEST ($(find "$OUT/changes" -name '????-??-??.json' | wc -l | tr -d ' ') change files, $(find "$OUT/feeds" -name '*.xml' | wc -l | tr -d ' ') feeds)"
