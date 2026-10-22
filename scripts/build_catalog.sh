#!/usr/bin/env bash
# build the indicator catalog into <out> (default catalog/) from what the producers have published, then validate it.
#   scripts/build_catalog.sh [out]
# erddap-places is rebuilt from the published gazetteer/stats; eco-indicators (Copernicus Marine long records over the
# sanctuaries, at the latest commit of data/copernicus.csv; ECO_REF=<sha> pins one; cmems-places adds the places a maintainer
# accepted from a request) and obis (the latest obis-h3
# release; OBIS_RELEASE=vYYYYMMDD pins one) are rebuilt from what they publish; the SDG series are pulled from the
# published catalog (they are rebuilt by hand from the places prototype: SDG_VALUES=<values.json>
# scripts/build_catalog.sh). no step writes outside <out>; nothing is uploaded (scripts/publish_catalog.sh does that).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-catalog}"
rm -rf "$OUT/values" "$OUT/indicators.json" "$OUT/coverage.parquet"
mkdir -p "$OUT"

# the places computed on request (any public gazetteer collection) are not linked by the stats collection: their items
# are listed by the requests workflow in the published indicators/requests/items.json (REQUESTED_ITEMS overrides)
uv run om-ind erddap-places --out "$OUT" --extra-items "${REQUESTED_ITEMS:-https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/indicators/requests/items.json}"
uv run om-ind eco-indicators --out "$OUT" ${ECO_REF:+--ref "$ECO_REF"}
# places a maintainer accepted from a request (Copernicus Marine means over any gazetteer place, om_indicators/producers/cmems_place.py):
# the producer's published folder is read (CMEMS_PLACES_BASE overrides); an empty or missing folder is an empty step
uv run om-ind cmems-places --out "$OUT" ${CMEMS_PLACES_BASE:+--base "$CMEMS_PLACES_BASE"}
uv run om-ind obis --out "$OUT" ${OBIS_RELEASE:+--release "$OBIS_RELEASE"}
if [ -n "${SDG_VALUES:-}" ]; then
  uv run om-ind sdg --values "$SDG_VALUES" --out "$OUT"
else
  uv run om-ind pull --family sdg --out "$OUT"
fi
uv run om-ind manifest --out "$OUT" ${SDG_VALUES:+--sdg-values "$SDG_VALUES"}
npm run -s coverage:build -- "$OUT"
uv run om-ind validate "$OUT"
