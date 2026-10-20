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
| [noaa-onms/eco-indicators](https://github.com/noaa-onms/eco-indicators) | Copernicus Marine long records (1993- physics, 1997- ocean colour and plankton types) | NOAA sanctuaries (`places`) | `om_indicators/adapters/eco_indicators.py`: monthly means → month and year rows |
| [obisindicators](https://github.com/marinebon/obisindicators) `obis-h3` release | OBIS records, richness, Shannon, Simpson, ES(50), Hill, Berger-Parker, density, by year, decade and EOV | Marine Regions EEZs and the high seas (`mr_eez`, `mr_high_seas`) | `om_indicators/adapters/obis.py`: exact point-in-polygon indicators |

The values are derived tables (no geometry). Code is MIT; values are CC BY 4.0 with the upstream credit carried in
the manifest.

## The contract

One row per (place, indicator, period), in `values/indicator=<id>/coll=<slug>/data.parquet`:

| column | type | |
|---|---|---|
| `place_id` | string | gazetteer id, `<authority>:<source_id>` (`NMS:CINMS`, `MRGID:8371`) |
| `coll` | string | gazetteer collection of the place (`places`, `mr_eez`) |
| `indicator` | string | `erddap:<dataset>:<variable>:<stat>`, `cmems:<dataset>:<variable>:mean`, `sdg:<series>`, `obis:<metric>[:<eov>]` |
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
-- every SST value for every sanctuary, straight from the bucket (published daily)
SELECT place_id, time, value FROM read_parquet(
  'https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/indicators/values/indicator=erddap:dhw_5km:CRW_SST:mean/coll=places/data.parquet')
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
| `viewer/` | Svelte 5 + Vite | the Matrix view on `indicators.json` + `coverage.parquet`, with `@marinebon/ui`; flip it with `#axes=t`, remove places or indicators with the x on a header (`xp=`, `xi=`), add more indicators from the Add or restore menu (`ai=`) |
| `catalog/` | (git-ignored) | build output, published to `s3://oceanmetrics.io-public/indicators/` |

## Commands

```sh
uv sync --group dev --group brand && npm ci
uv run --group dev pytest -q                 # contract, adapters, manifest, GOOS badges and traced glyphs
npm test                                     # status (incl. the ecoidx cross-check), coverage, icons, favicons, viewer
npm run check                                # svelte-check + tsc

# build the catalog from what the producers have published
uv run om-ind erddap-places --out catalog    # gazetteer/stats -> complete month and year rows
uv run om-ind sdg --values ../places/proto/eez_indicators/data/values.json --out catalog
uv run om-ind eco-indicators --out catalog   # noaa-onms/eco-indicators at the latest commit of data/copernicus.csv (--ref <sha> pins one)
uv run om-ind obis --out catalog             # the latest obis-h3 release's place_exact layer (--release v20261012 pins one)
uv run om-ind manifest --out catalog         # catalog/indicators.json
npm run coverage:build -- catalog            # catalog/coverage.parquet (statuses from src/status)
uv run om-ind validate catalog               # every values file and coverage.parquet against the schemas

npm run dev                                  # the viewer on http://localhost:5181/, reading catalog/
node viewer/scripts/shoot.mjs                # screenshots -> docs/shots/ (both themes, both brands, 390 px)

# brand: icons and favicons (no path or colour typed by hand)
uv run --group brand brand/eov_trace.py --task all   # GOOS badges -> WebP, traced eov- glyphs, review sheet
python3 brand/glyphs.py                      # bespoke glyphs from primitives -> brand/glyphs/bespoke.json
npm run icons:paths && npm run icons:build   # src/icons/icon-paths.ts; brand/v1/icons/{om-icons.svg, icons.css, index.html}
npm run icons:sheet                          # contact sheet screenshots -> docs/shots/icons_*.png
node brand/build-favicons.mjs                # brand/favicons/{oceanmetrics,mbon}/ incl. head.html to paste verbatim
Rscript fixtures/ecoidx/build_iea_sd_fixtures.R ~/Github/noaa-iea/ecoidx   # the iea-sd cross-check
```

## Publishing

- **Catalog:** `.github/workflows/catalog.yml` runs daily (08:07 UTC) on the self-hosted `macmini` runner:
  `scripts/build_catalog.sh` (erddap-places, eco-indicators and obis rebuilt from what they publish, the SDG series pulled
  from the published catalog), then `scripts/publish_catalog.sh` syncs to `s3://oceanmetrics.io-public/indicators/` (values first, the
  manifest last; `--delete` only under `indicators/values/`). Read it at
  https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/indicators/ (`storage.oceanmetrics.io/indicators/` once
  that host's Caddy allow-list includes the prefix). To refresh the SDG series from the places prototype:
  `SDG_VALUES=../places/proto/eez_indicators/data/values.json scripts/build_catalog.sh && scripts/publish_catalog.sh`.
- **Viewer:** `.github/workflows/pages.yml` tests, builds (`VITE_BASE=/indicators/`) and checks the size budget on
  every push touching the viewer, then deploys to https://oceanmetrics.io/indicators/.

## Size budget

`node scripts/size-budget.mjs` after `npm run build`, in gzip: entry JS ≤ 110 kB, all JS ≤ 200 kB, CSS ≤ 15 kB.
At the first deploy (2026-10-20) the entry was 86.5 kB and the CSS 6.7 kB. Raise a budget only with the reason here.

## Brand and icons

- **Themes** (`brand/themes/`): `oceanmetrics` maps the [Ocean Metrics brand v1](https://oceanmetrics.io/brand/v1/)
  onto the semantic tokens of [`@marinebon/ui`](https://marinebon.org/ui/) (teal brand, one sun action with dark ink);
  `mbon` is the kit's own tokens. The viewer switches with `?brand=oceanmetrics|mbon` and `?theme=light|dark`.
- **Icons** (108 glyphs in the families `ui- view- el- depth- onms- eov- place- st- tr- cell-`): published at
  [oceanmetrics.io/brand/v1/icons/](https://oceanmetrics.io/brand/v1/icons/) as a `<symbol>` sprite
  (`om-icons.svg`), CSS masks usable from any page (`icons.css`: `<i class="om-i om-i-st-above"></i>`) and the
  contact sheet. Glyphs from `brand/v1/` stay byte-identical (`brand/icons.lock.json`); new ones are additive.
- **Statuses** are statistical, relative to the place's own record: `st-above`, `st-within`, `st-below`, `st-none`
  and `tr-up`, `tr-flat`, `tr-down` differ in shape and read without colour. They are not ONMS condition ratings.
- **Favicons** (`brand/favicons/<theme>/`): an SVG mark, ICO, 16/32 px PNG, apple-touch, maskable icons, an og:image
  and a `head.html` to paste verbatim. MBON publishes only a 48 px favicon, so its larger icons are upscales.

## Credits

- Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Pictogrammers, Apache-2.0), plus glyphs
  generated in `brand/`.
- GOOS EOV badges: Credit: Global Ocean Observing System (GOOS). Used unmodified; see
  [`assets/goos-eov/SOURCE.md`](assets/goos-eov/SOURCE.md). The monochrome `eov-` glyphs are adapted from the GOOS EOV
  icons (Martín Míguez et al. 2026, *Front. Mar. Sci.* 13:1737002, CC BY): traced, monochrome, rescaled.
- `iea-sd` follows the CCIEA convention of `PlotTimeSeries()` in [ecoidx](https://github.com/marinebon/ecoidx).
