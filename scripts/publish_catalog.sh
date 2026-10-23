#!/usr/bin/env bash
# publish a built catalog to s3://oceanmetrics.io-public/indicators/ (read at https://storage.oceanmetrics.io/indicators/ or
# https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/indicators/),
# using the host's AWS profile (the repository holds no secrets).
#   scripts/publish_catalog.sh [out] [--dry-run]
# order matters for readers: the values first, then coverage.parquet, then the change files and feeds
# (scripts/publish_changes.sh), then indicators.json last, so a reader never follows a manifest to a file that is not
# there yet. --delete is scoped to indicators/values/ only.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-catalog}"
DRY=""; [ "${2:-}" = "--dry-run" ] && DRY="--dryrun"
DEST="${INDICATORS_BUCKET:-s3://oceanmetrics.io-public/indicators}"
[ -f "$OUT/indicators.json" ] && [ -f "$OUT/coverage.parquet" ] || { echo "no built catalog in $OUT" >&2; exit 1; }
uv run om-ind validate "$OUT" >/dev/null || { echo "catalog does not validate; not publishing" >&2; exit 1; }
CC="public, max-age=300"
aws s3 sync "$OUT/values/" "$DEST/values/" --delete $DRY --only-show-errors \
  --content-type application/vnd.apache.parquet --cache-control "$CC"
# the SanctuaryWatch figures (scripts/sanctuarywatch_bundle.ts), when built: stable URLs, rewritten each run
if [ -d "$OUT/sanctuarywatch" ]; then
  aws s3 sync "$OUT/sanctuarywatch/" "$DEST/sanctuarywatch/" $DRY --only-show-errors --cache-control "$CC"
fi
aws s3 cp scripts/bucket_README.md "$DEST/README.md" $DRY --only-show-errors \
  --content-type "text/markdown; charset=utf-8" --cache-control "$CC"
aws s3 cp "$OUT/coverage.parquet" "$DEST/coverage.parquet" $DRY --only-show-errors \
  --content-type application/vnd.apache.parquet --cache-control "$CC"
# the change files and feeds (src/coverage/changes.ts), when the changes step wrote them: after coverage.parquet, which
# they describe, and before indicators.json
if [ -f "$OUT/changes/latest.json" ]; then
  scripts/publish_changes.sh "$OUT" ${DRY:+--dry-run}
fi
aws s3 cp "$OUT/indicators.json" "$DEST/indicators.json" $DRY --only-show-errors \
  --content-type "application/json; charset=utf-8" --cache-control "$CC"
echo "published $OUT -> $DEST ($(find "$OUT/values" -name data.parquet | wc -l | tr -d ' ') values files)"
