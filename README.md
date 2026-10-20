# Ocean Metrics Indicators

Any place, any indicator, over time. A **value contract** shared by every producer of place-based ocean indicators,
a **manifest** of what exists, a **coverage** table of what has been computed where (with a default status and trend),
and a **viewer** that shows the matrix of places × indicators. Places come from the
[Ocean Metrics gazetteer](https://oceanmetrics.io/places/) (`place_id`); values come from the producers that already
compute them:

| producer | indicators | places | adapter |
|---|---|---|---|
| [erddap-places](https://github.com/oceanmetrics/erddap-places) precomputed stats | ERDDAP grids: SST, bleaching alerts, chlorophyll, pH, O₂, nutrients, NPP, precipitation, Seascapes ... | NOAA sanctuaries and a few others (gazetteer collection `places`) | `om_indicators/adapters/erddap_places.py`: daily → month and year rows |
| `oceanmetrics/places` `proto/eez_indicators` | UN SDG 14 series (14.5.1, 14.1.1, 14.6.1) | Marine Regions EEZs (`mr_eez`) | `om_indicators/adapters/sdg.py`: latest year |
| [obisindicators](https://github.com/marinebon/obisindicators) | OBIS records, richness, Shannon, Simpson, ES(50), Hill, by year and EOV | EEZs, offshore regions | Phase 5 |

The values are derived tables (no geometry). Code is MIT; values are CC BY 4.0 with the upstream credit carried in
the manifest.

## The contract

One row per (place, indicator, period), in `values/indicator=<id>/coll=<slug>/data.parquet`:

| column | type | |
|---|---|---|
| `place_id` | string | gazetteer id, `<authority>:<source_id>` (`NMS:CINMS`, `MRGID:8371`) |
| `coll` | string | gazetteer collection of the place (`places`, `mr_eez`) |
| `indicator` | string | `erddap:<dataset>:<variable>:<stat>`, `sdg:<series>`, `obis:<metric>[:<eov>]` |
| `time_grain` | string | `all`, `decade`, `year`, `month` or `day` |
| `time` | date | first day of the period; null for `all` |
| `class` | string | categorical indicators only: the class whose area share `value` is |
| `value` | double | finite or null |
| `n` | double | what the value summarises (time steps, records; see the manifest's `n_meaning`) |
| `unit` | string | |
| `x_*` | any | optional producer columns |

Each file carries its provenance (producer, the exact sources read, method, code version, created, licence) as JSON
in the Parquet key-value metadata under `om:provenance`. Schemas: [`schema/`](schema/). Validator and writer:
[`om_indicators/contract.py`](om_indicators/contract.py).

```sql
-- every SST value for every sanctuary, straight from the bucket
SELECT place_id, time, value FROM read_parquet(
  'https://storage.oceanmetrics.io/indicators/values/indicator=erddap:dhw_5km:CRW_SST:mean/coll=places/data.parquet')
WHERE time_grain = 'year' ORDER BY place_id, time;
```

## Layout

| path | language | what |
|---|---|---|
| `schema/` | JSON Schema | the contract (`values`, `provenance`), the manifest (`indicators`), `coverage` |
| `config/` | YAML | `indicators.yml` (categories, series, lead, preferred, kind, min_periods) and the vocabularies |
| `om_indicators/` | Python (uv) | contract validator and writer, producer adapters, manifest builder, CLI `om-ind` |
| `tests/` | pytest | one test per rule, exact-row fixtures |
| `src/status/` | TypeScript | the status methods (`iea-sd`, `names-pct`, `values`): the **only** implementation, used by the coverage builder and the viewer |
| `src/coverage/` | TypeScript (Node) | values → `coverage.parquet` |
| `fixtures/ecoidx/` | R | runs ecoidx `PlotTimeSeries()` on the CCIEA example data: the cross-check for `iea-sd` |
| `brand/` | Python, Node | icon pipeline (MDI by export name + generated glyphs + traced GOOS EOV glyphs), themes, favicons |
| `assets/goos-eov/` | PNG, WebP | the GOOS EOV badges, unmodified (see its `SOURCE.md`) |
| `viewer/` | Svelte 5 + Vite | the Matrix view on `indicators.json` + `coverage.parquet`, with `@marinebon/ui` |
| `catalog/` | (git-ignored) | build output, published to `s3://oceanmetrics.io-public/indicators/` |

## Commands

```sh
uv sync --group dev && npm ci
uv run --group dev pytest -q                 # contract, adapters, manifest
npm test                                     # status methods (ecoidx cross-check), coverage, icons, viewer
npm run check                                # svelte-check + tsc

# build the catalog from what the producers have published
uv run om-ind erddap-places --out catalog    # gazetteer/stats -> month and year rows
uv run om-ind sdg --values ../places/proto/eez_indicators/data/values.json --out catalog
uv run om-ind manifest --out catalog         # catalog/indicators.json
npm run coverage:build -- catalog            # catalog/coverage.parquet
uv run om-ind validate catalog               # every values file against the contract

npm run dev                                  # the viewer on http://localhost:5181/, reading catalog/
```

## Credits

- Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Pictogrammers, Apache-2.0), plus glyphs
  generated in `brand/`.
- GOOS EOV badges: Credit: Global Ocean Observing System (GOOS). Used unmodified; see
  [`assets/goos-eov/SOURCE.md`](assets/goos-eov/SOURCE.md). The monochrome `eov-` glyphs are adapted from the GOOS EOV
  icons (Martín Míguez et al. 2026, *Front. Mar. Sci.* 13:1737002, CC BY): traced, monochrome, rescaled.
- `iea-sd` follows the CCIEA convention of `PlotTimeSeries()` in [ecoidx](https://github.com/marinebon/ecoidx).
