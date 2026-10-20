#!/usr/bin/env bash
# build the indicator catalog into <out> (default catalog/) from what the producers have published, then validate it.
#   scripts/build_catalog.sh [out]
# erddap-places is rebuilt from the published gazetteer/stats; the SDG series are pulled from the published catalog
# (they are rebuilt by hand from the places prototype: SDG_VALUES=<values.json> scripts/build_catalog.sh). no step
# writes outside <out>; nothing is uploaded (scripts/publish_catalog.sh does that).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-catalog}"
rm -rf "$OUT/values" "$OUT/indicators.json" "$OUT/coverage.parquet"
mkdir -p "$OUT"

uv run om-ind erddap-places --out "$OUT"
if [ -n "${SDG_VALUES:-}" ]; then
  uv run om-ind sdg --values "$SDG_VALUES" --out "$OUT"
else
  uv run om-ind pull --family sdg --out "$OUT"
fi
uv run om-ind manifest --out "$OUT" ${SDG_VALUES:+--sdg-values "$SDG_VALUES"}
npm run -s coverage:build -- "$OUT"
uv run om-ind validate "$OUT"
