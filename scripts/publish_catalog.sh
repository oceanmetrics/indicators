#!/usr/bin/env bash
# publish a built catalog to indicators/ of the public bucket (read at https://storage.oceanmetrics.io/indicators/)
# through oceanmetrics/platform scripts/om-publish.sh, which writes both stores (R2 then S3) and never deletes; the AWS
# profile and the R2 rclone wrapper of the host (the repository holds no secrets).
#   scripts/publish_catalog.sh [out] [--dry-run]
# order matters for readers: the values first, then coverage.parquet, then the change files and feeds
# (scripts/publish_changes.sh), then indicators.json last, so a reader never follows a manifest to a file that is not
# there yet. nothing is deleted (until 2026-10-23 values/ was synced with --delete): a values file a build no longer
# writes stays on the stores but is not linked from indicators.json. coverage.parquet and indicators.json keep the R2
# copy they replace under indicators/_history/<date>/ (R2 has no object versions; the change backfill reads them).
# env: OM_PUBLISH (the script; default a platform checkout beside this repo), INDICATORS_PREFIX (default indicators),
# and om-publish's own (OM_STORE, OM_S3_BUCKET, OM_R2_BUCKET).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-catalog}"
REALLY="--really"; [ "${2:-}" = "--dry-run" ] && REALLY="--dry-run"
PREFIX="${INDICATORS_PREFIX:-indicators}"
. scripts/om_publish_path.sh
[ -f "$OUT/indicators.json" ] && [ -f "$OUT/coverage.parquet" ] || { echo "no built catalog in $OUT" >&2; exit 1; }
uv run om-ind validate "$OUT" >/dev/null || { echo "catalog does not validate; not publishing" >&2; exit 1; }
CC="public, max-age=300"
"$P" $REALLY --cache-control "$CC" --include '*.parquet' "$OUT/values" "$PREFIX/values"
# the SanctuaryWatch figures (scripts/sanctuarywatch_bundle.ts), when built: stable URLs, rewritten each run
if [ -d "$OUT/sanctuarywatch" ]; then
  "$P" $REALLY --cache-control "$CC" "$OUT/sanctuarywatch" "$PREFIX/sanctuarywatch"
fi
"$P" $REALLY --cache-control "$CC" scripts/bucket_README.md "$PREFIX" --as README.md
"$P" $REALLY --keep-history --cache-control "$CC" "$OUT/coverage.parquet" "$PREFIX"
# the change files and feeds (src/coverage/changes.ts), when the changes step wrote them: after coverage.parquet, which
# they describe, and before indicators.json
if [ -f "$OUT/changes/latest.json" ]; then
  if [ "$REALLY" = --really ]; then scripts/publish_changes.sh "$OUT"; else scripts/publish_changes.sh "$OUT" --dry-run; fi
fi
"$P" $REALLY --keep-history --cache-control "$CC" --type 'json=application/json; charset=utf-8' "$OUT/indicators.json" "$PREFIX"
echo "published $OUT -> $PREFIX/ ($(find "$OUT/values" -name data.parquet | wc -l | tr -d ' ') values files)$([ "$REALLY" = --really ] || echo ' (dry run)')"
