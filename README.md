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
| `viewer/` | Svelte 5 + Vite | the Matrix view on `indicators.json` + `coverage.parquet`, with `@marinebon/ui`; places as rows with `#axes=p`, remove places or indicators with the x on a header (`xp=`, `xi=`), add more indicators from the Add or restore menu (`ai=`) |
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
npm run coverage:build -- catalog            # catalog/coverage.parquet (statuses from src/status; place_coll from the gazetteer index, see `--gazetteer-index`, `--layers`)
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

## Matrix view

Indicators are the rows and places the columns. Places are grouped by their **home gazetteer collection** (`place_coll` in
`coverage.parquet`: the first of the place's collections in the gazetteer's `layers.json` order, else the values `coll`;
build flags `--gazetteer-index <file|URL|none>` and `--layers <file|URL|none>`, `OM_OFFLINE=1` uses the cached copies
under `cache/gazetteer/`). A place in two values collections (Pitcairn's EEZ: `places` and `mr_eez`) is one place; each
cell reads the values file of its own coverage row. Each group says how many of its places are computed of the
gazetteer's total and links to it. Opens on the sanctuaries; the other groups are chips. An indicator with no value for
any place on display is hidden.
Hash keys: `colls` (comma list of groups; none = the sanctuaries, every group while searching), `q`, `vocab`, `leads`,
`depth`, `cell` (an open drawer: `place|indicator`), `axes=p` (places as rows; the old `axes=t` reads as the default),
`empty=1` (show the indicators without values), `xp` and `xi` (removed places and indicators), `ai` (added indicators).
A cell is a value with its status and trend glyphs, **not computed yet** (open it: compute it now in erddap-places, or
ask for it by a prefilled issue), **no data here** (the indicator has a values file for this place's collection, with
nothing for the place), or a dash (**not offered** for this kind of place).

## Report view

`#view=report` lays out chosen places x chosen indicators; the spec (`src/report/spec.ts`: rules such as `coll:places`,
`cat:water-quality`, `series:sst:*`, with each untick in an exclude list) is in the URL hash, so every report is a
permalink, and `report.json` (Export menu) is the same spec. **Edit** opens the builder: a preset, two trees of tri-state
checkboxes (places by collection, indicators by category then series; Tab to a box, Space toggles it, the counts are
places with a value of the places chosen), the layout with its panel budget and, over budget, the fixes (switch layout,
split into sections, collapse series to leads), the status method, recent window, baseline and years. Layouts drawn today:
**Cards** (1 to 3 places, a tab per category, the Place view's cards) and **Scorecard** (places x indicators, glyphs and the
last value; one card per place at 390 px); the others show a notice with their budget. The Matrix toolbar's **Report**
button opens the builder with what the Matrix shows. Cells with no value are listed under the report with a prefilled
GitHub issue. Print (Export, Print) hides the app chrome, prints the title, permalink and report id, and uses the light theme.
**Embed:** `<base>embed/#card=<place_id>|<indicator>[&method=][&depth=][&vocab=]` renders one card with no chrome and a link
back to the Place view; `?theme=` and `?brand=` work as in the app, and `main.embed[data-state=done]` marks it drawn.

## Publishing

- **Catalog:** `.github/workflows/catalog.yml` runs daily (08:07 UTC) on the self-hosted `macmini` runner:
  `scripts/build_catalog.sh` (erddap-places, eco-indicators and obis rebuilt from what they publish, the SDG series pulled
  from the published catalog), then `scripts/publish_catalog.sh` syncs to `s3://oceanmetrics.io-public/indicators/` (values first, the
  manifest last; `--delete` only under `indicators/values/`). Read it at https://storage.oceanmetrics.io/indicators/
  (a 302 to the bucket, with CORS; since 2026-10-20) or straight from the bucket host
  https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/indicators/, which the viewer uses (one round trip fewer).
  To refresh the SDG series from the places prototype:
  `SDG_VALUES=../places/proto/eez_indicators/data/values.json scripts/build_catalog.sh && scripts/publish_catalog.sh`.
- **Viewer:** `.github/workflows/pages.yml` tests, builds (`VITE_BASE=/indicators/`) and checks the size budget on
  every push touching the viewer, then deploys to https://oceanmetrics.io/indicators/.

## Map view

`#view=map` colours one indicator over one collection of places: by its value (five quantile classes), its departure
from the place's own mean (in SD), its status or trend (iea-sd or names-pct, computed by `src/status` as of the period
shown), the length of its record, or, for a categorical indicator, its largest class or the share of one class. A slider
walks the periods. Hash keys: `ind`, `coll`, `color` (`value|departure|status|trend|record|class|share`), `t` (`2024` or
`2024-07`; none = each place's latest), `cls` (the class `share` maps) and `method`. Vector collections (`places`) are
drawn from the gazetteer's PMTiles; reference collections (`mr_eez`) are drawn by Marine Regions' own WMS, one request per
tile, coloured by an SLD and the request's `ENV`, so no Marine Regions geometry is hosted by us. The legend and "The map
as a table" carry every class in words and glyphs, so nothing depends on colour.

## Embeds

`<base>embed/` draws one view without the app's chrome, for iframes on other sites:

- one card: `embed/#card=<place_id>|<indicator>[&method=][&depth=][&fig=1]` (`fig=1`: a still figure, which the daily job
  saves as `indicators/sanctuarywatch/<place>/<figure>/figure.png`);
- one map: `embed/#view=map&…` with the Map view's keys, for example the live CoastWatch OBIS for the MBON tools page:

```html
<iframe src="https://oceanmetrics.io/indicators/embed/?brand=mbon#view=map&ind=obis:species&coll=mr_eez&grain=decade"
  title="OBIS species richness by EEZ (Ocean Metrics Indicators)" width="100%" height="900" style="border:0"></iframe>
```

## Requests

Anyone with a GitHub account can ask for an indicator the catalog does not hold yet for a place:

1. **In the viewer:** a cell that reads "not computed yet" is a dataset erddap-places can compute for that place.
   Opening it offers "Compute it now in erddap-places" (in the browser, nothing saved) and "Ask to add it to the
   catalog", which opens the issue form `.github/ISSUE_TEMPLATE/indicator-request.yml` filled in with the place, its
   collection and the indicator. The requester adds a purpose and submits.
2. **Triage, within a minute** (`requests.yml`, `om_indicators/requests.py`): a bot labels the issue and comments why.
   - `auto`: the indicator is in the manifest, comes from erddap-places, the place is in a public gazetteer collection
     and the job is under 50 million grid values;
   - `already`: the values exist;
   - `needs-review`: anything else, for a maintainer.
3. **The run, on the Mac mini:** an `auto` request runs by itself while the repository variable `REQUESTS_AUTORUN` is
   `on`, at most `REQUESTS_PER_DAY` (default 10) a day. Otherwise, or past the cap, a maintainer starts it by adding the
   `run` label (only people with triage access can add labels). erddap-places computes the place and publishes it, the
   catalog is rebuilt and published, and the bot comments the Place view link and closes the issue. Issue #1 (Wells
   NERR, precipitation) is the worked example.

Requesters are answered on the issue only; no email is sent.

## The paper

`node scripts/paper_matrix.mjs` turns the manifest and coverage into the figure and table of what is computed where
(`docs/paper/computed_where.{svg,png,csv}`): one row per indicator series, one column per place collection, the places
with values, the years and whether a status is given. It was first made for "Coding Ocean Indicators: Patterns and
People" (PPG-26-197).

## Size budget

`node scripts/size-budget.mjs` after `npm run build`, in gzip: entry JS ≤ 110 kB, all JS except the map chunk ≤ 200 kB,
the map chunk (MapLibre, pmtiles and the map components) ≤ 330 kB, CSS except the map's ≤ 15 kB, the map's CSS ≤ 15 kB.
At the first deploy (2026-10-20) the entry was 86.5 kB and the CSS 6.7 kB. The map chunk has its own budget because
MapLibre is about 230 kB gzip and is loaded only when the Map view is opened. Raise a budget only with the reason here.

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
