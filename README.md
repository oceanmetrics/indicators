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
| `om_indicators/producers/cmems_place.py` (this repo; run by a maintainer on a request) | The same Copernicus Marine products, for one place at a time: surface-layer monthly means | Any gazetteer place whose polygon can be fetched (vector collections, the Marine Regions EEZs), e.g. the Albanian EEZ | `om_indicators/adapters/cmems_places.py`: the producer's published folder → month and year rows |
| [obisindicators](https://github.com/marinebon/obisindicators) `obis-h3` release | OBIS records, richness, Shannon, Simpson, ES(50), Hill, Berger-Parker, density, by year, decade and EOV | Marine Regions EEZs, the high seas and the high seas by FAO major fishing area (`mr_eez`, `mr_high_seas`, `fao_high_seas`) | `om_indicators/adapters/obis.py`: exact point-in-polygon indicators |

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
| `config/` | YAML | `indicators.yml` (categories, series, lead, preferred, kind, min_periods), the vocabularies, and `place_sets.yml` (named lists of place groups: the manifest's `place_sets`) |
| `om_indicators/` | Python (uv) | contract validator and writer, producer adapters, manifest builder, CLI `om-ind` |
| `tests/` | pytest | one test per rule, exact-row fixtures |
| `src/status/` | TypeScript | the status methods (`iea-sd`, `names-pct`, `values`): the **only** implementation, used by the coverage builder and the viewer |
| `src/coverage/` | TypeScript (Node) | values → `coverage.parquet` |
| `fixtures/ecoidx/` | R | runs ecoidx `PlotTimeSeries()` on the CCIEA example data: the cross-check for `iea-sd` |
| `brand/` | Python, Node | icon pipeline (MDI by export name + generated glyphs + traced GOOS EOV glyphs), themes, favicons |
| `assets/goos-eov/` | PNG, WebP | the GOOS EOV badges, unmodified (see its `SOURCE.md`) |
| `viewer/` | Svelte 5 + Vite | the Matrix view on `indicators.json` + `coverage.parquet`, with `@marinebon/ui`; one selection (the Select section: places, indicators) shared by the Matrix, Map and Report views; places as rows with `#axes=p`, remove places or indicators with the x on a header (`px=`, `ix=`) and tick them back in a picker |
| `catalog/` | (git-ignored) | build output, published to `s3://oceanmetrics.io-public/indicators/` |

## Commands

```sh
uv sync --group dev --group brand && npm ci
uv sync --group dev --group cmems            # the cmems group (Copernicus Marine Toolbox, xarray, shapely, NetCDF backends) is only for the place producer and its tests
uv run --group dev pytest -q                 # contract, adapters, manifest, GOOS badges and traced glyphs
npm test                                     # status (incl. the ecoidx cross-check), coverage, icons, favicons, viewer
npm run check                                # svelte-check + tsc

# compute one place of a Copernicus Marine indicator (a maintainer, on the Mac mini; see "Requests")
uv run --group cmems python -m om_indicators.producers.cmems_place --place MRGID:5670 --coll mr_eez --indicator cmems:cmems_mod_glo_bgc_my_0.25deg_P1M-m:no3:mean [--check] [--publish]

# build the catalog from what the producers have published
uv run om-ind erddap-places --out catalog    # gazetteer/stats -> complete month and year rows
uv run om-ind sdg --values ../places/proto/eez_indicators/data/values.json --out catalog
uv run om-ind eco-indicators --out catalog   # noaa-onms/eco-indicators at the latest commit of data/copernicus.csv (--ref <sha> pins one)
uv run om-ind cmems-places --out catalog     # places a maintainer accepted from a request (the Copernicus Marine place producer's published folder)
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
under `cache/gazetteer/`). A place in two values collections (e.g. a requested place also in a precomputed set) is one place; each
cell reads the values file of its own coverage row. Each group says how many of its places are computed of the
gazetteer's total and links to it (a group nothing is computed for also links to a request, and a group of more than 300 places lists the
first 300 and says how to narrow it). Opens on the National Marine Sanctuaries (the `places` collection: the `NMS:*` ids; `noaa_sanctuaries` holds the ONMS section ids, another id space). An indicator with no value for
any place on display is hidden, unless none has a value (places no one has computed yet: all stay, so each empty cell can be asked for).
A place of a **derived** gazetteer layer (the high seas by FAO area, `fao_high_seas`, which has no geometry of its own) also carries `display_id` in `coverage.parquet`: its index `source_id` (`FAO:21`), the id of the feature of the layer that draws it (`fao_major_areas`); null for any other place.
Every row also carries `lat` and `lon`, the centre of the place's bbox in the gazetteer index (`src/coverage/centre.ts`: the index writes the bbox of a place that crosses the antimeridian with its east beyond 180, so the longitude is unwrapped before the middle is taken, then put back in -180..180; 4 decimals; null when the index has no bbox). They order places north to south and west to east ("Order" below); the places picked from the whole gazetteer get the same centre from the same function.

**The selection** is one object, shared by the Matrix, Map, Report and Place views, chosen in the **Select section** above the view tabs (every view
but the Place view's body; the Place view carries it in its hash and its links). It is the report spec's own `places` and `indicators` rules
(`src/report/spec.ts`; `viewer/src/lib/selection.ts`), written as hash keys:
- `pi` / `px`: the places included and excluded: `coll:<slug>` (a gazetteer collection), `set:<id>` (a place set: its groups), a place id, or `*`
  (every computed place). Default `coll:places` (the sanctuaries), written as nothing.
- `ii` / `ix`: the indicators included and excluded: `*` (each series' lead; the default, written as nothing), `all` (every indicator),
  `cat:<term>`, `series:<id>` (its lead), `series:<id>:*`, or an id.
- shared by every view: `vocab`, `depth`, `axes=p` (places as rows; the old `axes=t` reads as the default), `empty=1` (show the indicators without values).
- Matrix only: `q` (a place search that narrows the selection; the toolbar shows it as a chip) and `cell` (an open drawer: `place|indicator`).
- **Old links still open on the same places and indicators** (read when the hash is parsed, dropped on the next write): `colls=a,b` is `pi=coll:a,coll:b`
  (`set:` stays), `xp` is `px`, `xi` is `ix`, `ai` joins `ii` beside `*`, `leads=0` is `ii=all`, and a Map link's `coll=<slug>` is `pi=coll:<slug>`
  with its `ind` joined to `ii`. A Report link's `pi=*` keeps meaning every place.

**The Select section** (`SelectBar.svelte`) holds the two pickers and a line of what is chosen ("National Marine Sanctuaries · 18 places × 24 indicators").
The pickers (`viewer/src/lib/pick/`, one component each for every view; their rules are in `places.ts` / `placesTree.ts` and
`indicators.ts` / `indicatorsTree.ts`, tested; the panels load on the first open). Each is a button that says what is selected
and opens a popover (a full-width sheet at 600 px and below; Esc closes it and focus returns to the button, Tab stays inside, arrow keys move through the list). A tick is a change of the rules (`report/tree.ts`).
- **Places** (`multi` in the Select section, `place` in the Place view): a search, the place sets, and **every polygon collection of the gazetteer**
  (`layers.json`; lines and points are not offered), computed or not, as a tick tree (set or group, then places) with "n of N computed" and the
  "in the gazetteer" link. A place set shows a line of what it combines. The places of a collection nothing is computed for come from the
  gazetteer's index (`index/places_index.parquet`, 5 MB: only `place_id`, `name` and `collection` are read, by range requests, in
  `gazetteerPlaces.ts`), the first time such a group is opened, chosen or searched; the default selection never reads it. A place with no value is a
  row (or column) of "not computed yet" cells with the ways forward below. A group longer than 300 places lists the first 300.
- **Indicators** (`multi` in the Select section, `single` in the Map and the Place view): a search, the vocabulary switch (ONMS, NaMES, GOOS EOVs),
  the "Leads only" switch (`all` against `*`) and "show indicators without values here" switch, and the tree category -> series -> indicator,
  tri-state at each level, with how many of the places chosen have a value. A series ticks its lead; open it for the others.

**Context carried between views:** every link to another view carries the selection and the shared keys (`hash.ts`: `carryOver`); each view keeps its
own keys as it was left. Matrix -> Map opens the indicator and place of the last opened cell; Map -> Matrix opens the drawer on the cell of the
selected place; Place -> Map opens the opened indicator with the place selected, both added to the selection when it lacks them
(`matrixToMapHref`, `mapToMatrixHref`, `placeToMapHref`).
A cell is a value with its status and trend glyphs, **not computed yet** (open it: compute it now in erddap-places, or
ask for it by a prefilled issue), **no data here** (the indicator has a values file for this place's collection, with
nothing for the place), or a dash (**not offered** for this kind of place).

**From an empty cell** the drawer (and the Place view) offers the way forward, built by `viewer/src/lib/nextSteps.ts`: for an
erddap-places indicator **Compute it now in erddap-places** (`<base>erddap-places/#place=…&dataset=…&variable=…`) and **Ask to add
it to the catalog** (the repo's `indicator-request.yml` issue form, pre-filled: `place`, `collection`, `indicator`); for a cell
the indicator is not offered for, the place groups it is computed for and the request link; for no data, the reason and the
dataset's time range. **Place view** (`#view=place&place=<id>&ind=<indicator>`): the place picker (`place` mode) switches place, keeping the indicator when the new place has it, and the indicator picker (`single`) jumps to a card; the indicator opened comes first under "You
opened" (its card, or a "not computed yet" card with the same ways forward), the others follow, and a breadcrumb
`Matrix › <place> › <indicator>` leads back to the Matrix with the drawer open on that cell (`cell=<place>|<indicator>`).

## Report view

`#view=report` lays out the selection (the places and indicators of the Select section: the same rows as the Matrix, in its
orientation); the spec (`src/report/spec.ts`) is in the URL hash, so every report is a permalink, and `report.json` (Export menu)
is the same spec. **Edit** opens the builder: a preset ("Start from" sets the shared selection, the layout and the title), the layout with its panel budget and, over budget, the fixes (switch layout,
split into sections, collapse series to leads), the status method, recent window, baseline and years. The **Context
region** switch is disabled and says what it waits on (the gazetteer recording which places lie inside which); `ctx=1` in
a link is still read. Every layout is drawn (`viewer/src/lib/report/`, the layouts in `layouts/`), at the skimmer,
swimmer and diver levels, with `split` sections, in print, in both themes and at 390 px (wide layouts wrap or page by
section, never scroll sideways):

| layout | what it shows | caps |
|---|---|---|
| **Cards** | the Place view's cards, a tab per category | 3 places, 40 panels |
| **Scorecard** | glyphs and the last value; indicators in rows and places in columns by default (`axes`), one card per row at 390 px | 60 places, 20 indicators |
| **Small multiples** | per indicator a row of small charts, one per place (the Place view's chart geometry), each with the place, the status and trend glyphs and the last value; the row shares one y axis (the `Shared y axis` / `Free y axis` toggle, spec key `ys=free`) | 3 indicators x 30 places |
| **Quad plot** | the IEA quad plot: each point is an indicator (a plot per place) or a place (a plot per indicator; one place or one indicator gives one plot) at its recent trend (x) and the departure of its recent mean from its long-term mean (y), in SD units of its own record (`quadPoint()` in `src/status/quad.ts`); dashed guides at ±1 SD, corner captions worded statistically, a status glyph per point, points without coordinates listed with why, hover tooltip, and the plot as a table | 30 panels |
| **Map sheet** | one indicator as a choropleth over the chosen places with a period slider, a colour-by choice, the legend and the table (the Map view's model and canvas; Marine Regions places are drawn by their own WMS) | 1 indicator |
| **Dossier** | for each place (a page in print) and indicator: the chart, the status sentence as the figure's caption, the method, the citation, and Reproduce (configuration hash, the Place view, the values file, at the diver level the DuckDB query) | paged, none |

Every layout but the Map sheet has a collapsible **locator map** on top: the chosen places outlined and, when the
gazetteer's tiles hold their geometry, the map framed to them (a Marine Regions EEZ is drawn by the publisher's WMS and has
no geometry of ours to frame, so the map keeps its group's extent); the place names show on hover and are listed under it.
The report's maps (and the Map view) frame places the short way round the globe (`unionBoxes()` in `viewer/src/lib/map/bounds.ts`: the Pacific sanctuaries are one box of about 134 degrees centred on the Pacific, not the world), never draw the world twice side by side (MapLibre's world copies are off while the world is narrower than the frame, and a view over the antimeridian keeps them but may not zoom out past one world across the frame), and on the globe a world-scale frame opens on the whole sphere (`globeZoom()` in `viewer/src/lib/map/frame.ts`, from MapLibre's camera model). In the Quad plot, labels are placed by `placeLabels()` so that none overlaps a point's glyph or another label: the nearest free spot among 16 directions at growing distances, a leader line from the point when the label stands off, and a note under the plot when there is no room (the table carries every label). Maps are printed as a picture of themselves, drawn in the light theme when the job starts from Export, Print (Ctrl-P without
it prints the last picture, in the theme on screen). The MapLibre chunk loads when a map is first shown. The Report shows the places and indicators of the selection
that have a value; cells with no value are listed under the report with a prefilled
GitHub issue. Print (Export, Print) hides the app chrome, prints the title, permalink and report id, and uses the light theme.

**Export, SanctuaryWatch bundle** builds `sanctuarywatch_<place or report id>.zip` in the browser (a store-only ZIP writer,
`src/report/zip.ts`, loaded with the export): for every place x indicator whose status is iea-sd or names-pct at the year
grain, a folder `<place>__<indicator>/` with `data.json`, `settings.json`, `settings.md`, `captions.md`, `alt.txt`,
`figure.svg` (the report's chart with its colours resolved from the light theme's tokens) and `figure.png` (that SVG at
2x), plus one `figures.csv`. The text files are built by `src/report/swBundle.ts`, the same functions
`scripts/sanctuarywatch_bundle.ts` (the daily job) writes with; the pairs left out are listed with why under the report.
**Embed:** `<base>embed/#card=<place_id>|<indicator>[&method=][&depth=][&vocab=]` renders one card with no chrome and a link
back to the Place view; `?theme=` and `?brand=` work as in the app, and `main.embed[data-state=done]` marks it drawn.

## Publishing

- **Catalog:** `.github/workflows/catalog.yml` runs daily (08:07 UTC) on the self-hosted `macmini` runner:
  `scripts/build_catalog.sh` (erddap-places, eco-indicators, the Copernicus Marine place producer's folder and obis rebuilt from what they publish, the SDG series pulled
  from the published catalog), then `scripts/publish_catalog.sh` syncs to `s3://oceanmetrics.io-public/indicators/` (values first, the
  manifest last; `--delete` only under `indicators/values/`). Read it at https://storage.oceanmetrics.io/indicators/
  (a 302 to the bucket, with CORS; since 2026-10-20) or straight from the bucket host
  https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/indicators/, which the viewer uses (one round trip fewer).
  To refresh the SDG series from the places prototype:
  `SDG_VALUES=../places/proto/eez_indicators/data/values.json scripts/build_catalog.sh && scripts/publish_catalog.sh`.
- **Viewer:** `.github/workflows/pages.yml` tests, builds (`VITE_BASE=/indicators/`) and checks the size budget on
  every push touching the viewer, then deploys to https://oceanmetrics.io/indicators/.

## Map view

`#view=map` colours one indicator over **the places of the selection** (the Select section above the tabs): by its
value (five quantile classes), its departure from the place's own mean (in SD), its status or trend (iea-sd or names-pct, computed by
`src/status` as of the period shown), the length of its record, or, for a categorical indicator, its largest class or the share of
one class. A slider walks the periods. Hash keys: `ind` (the indicator: the hash's when it is in the selection, else the first selected one with
values in the selected places), the selection (`pi`, `px`, `ii`, `ix`), `place` (the place selected), `color` (`value|departure|status|trend|record|class|share`), `t`
(`2024` or `2024-07`; none = each place's latest), `cls` (the class `share` maps), `grain`, `proj` (`globe`; absent = the flat map) and `method`.
- **Every group of the selection is a layered part** of the map, as a place set is (see below): `viewer/src/lib/map/selection.ts` turns the rules into groups; a group chosen in part
  (places picked by id, or some taken away) is drawn restricted to its chosen places (a vector filter; for a Marine Regions group an SLD filter on the
  MRGIDs, up to 120 of them: past that the whole group is drawn). Excluded places are not drawn and not in the legend or the table.
- **The indicator chooser** lists the indicators of the selection that have values here, with how many of the places; "Another indicator" opens the
  indicator picker of the Select section.
- **Globe and full screen** (the buttons on the map frame, `MapFrameControls.svelte`; rules in `frame.ts`): Flat / Globe sets MapLibre's `globe` projection (`proj=globe` in the hash, honoured by the embed too); every layer kind draws on it: the gazetteer PMTiles, the derived FAO layer, the Marine Regions WMS tiles and the hollow circles. A `--map-sea` colour (the themes) fills what the basemap tiles do not cover (the Arctic cap). **Full screen** uses the Fullscreen API on the wrapper that holds the map, its credit line and the side column (legend, selected place), not MapLibre's control, which takes the canvas alone: the side column floats over the map on the raised `--overlay-*` surface (under the map on a phone). Where the element API is missing (iPhone Safari), the wrapper is expanded to a fixed full-viewport box instead. The button says what it does (Full screen / Exit full screen); Esc and the button leave, and focus stays on the button.
- **Place sets** (`config/place_sets.yml`, the manifest's `place_sets`; `viewer/src/lib/sets.ts`): a named list of place groups offered as one choice above the groups, with a line of what it combines, in the place picker (a tick: the rule `set:<id>`) and in a link as `pi=set:political` (the old `coll=set:political` on the Map and `colls=set:political` in the Matrix read as the same). `political` is **Ocean by jurisdiction**: the EEZs (`mr_eez`) and the high seas by FAO major fishing area (`fao_high_seas`), which together cover the ocean. A record on a shared boundary counts in each place, so place totals are never summed. An `ecological` set (MEOW and PPOW) waits on UNEP-WCMC's permission and has no data here. The Map draws a set by layering its groups, the vector and derived groups first and the reference (WMS) groups on top (`viewer/src/lib/map/parts.ts`), with one legend, one table and one colour scale across all their places; a click answers from the top group down, so an EEZ over a high-seas piece is the EEZ, and open sea is the piece.
- **Derived groups:** a gazetteer layer with `kind: "derived"` (layers.json `display: {via, id_from}`) is drawn as the features of its `via` layer (`fao_major_areas`, PMTiles) whose `place_id` is a place's `display_id`; only those features are drawn, each coloured by the value of its place, and a click selects the place, not the FAO area. An FAO polygon covers its EEZs too: it is drawn under the EEZ WMS, and under a set the WMS fills every EEZ opaque (the places with no class in the no-data tint), so only each area's high-seas part shows. We host no geometry of the Marine Regions layers; the FAO major areas are the gazetteer's own PMTiles.
- **Geometry** is the group's gazetteer collection: vector collections (`places`, `noaa_nerrs`) from the gazetteer's PMTiles, reference
  collections (`mr_eez`) by Marine Regions' own WMS (one request per tile, an SLD plus `ENV`; no Marine Regions geometry is hosted by
  us). Values are read from every values file of the indicator that holds places of the group.
- **Members that are not computed** are drawn as faint outlines (`--map-member`) in a vector group (the other 29 reserves beside Wells),
  and below zoom 7, where an outline is too small to see, also as a small hollow circle at the member's label point in the same faint colour;
  clicking one, or opening a link to it, frames it and offers the same ways forward as an empty Matrix cell. A reference group draws
  them in the "no data" class. The legend and "The map as a table" carry every class in words and glyphs, so nothing depends on colour.

## Embeds

`<base>embed/` draws one view without the app's chrome, for iframes on other sites:

- one card: `embed/#card=<place_id>|<indicator>[&method=][&depth=][&fig=1]` (`fig=1`: a still figure, which the daily job
  saves as `indicators/sanctuarywatch/<place>/<figure>/figure.png`);
- one map: `embed/#view=map&…` with the Map view's keys, for example the live CoastWatch OBIS for the MBON tools page:

```html
<iframe src="https://oceanmetrics.io/indicators/embed/?brand=mbon#view=map&ind=obis:species&pi=set:political&grain=decade"
  title="OBIS species richness by EEZ and high-seas area (Ocean Metrics Indicators)" width="100%" height="900" style="border:0"></iframe>
```

## Requests

Anyone with a GitHub account can ask for an indicator the catalog does not hold yet for a place:

1. **In the viewer:** a place picker row under "Not computed yet" asks for a whole collection (the form with the collection only). A cell that reads "not computed yet" is a dataset erddap-places can compute for that place.
   Opening it offers "Compute it now in erddap-places" (the values in your browser only: nothing is saved and the cell
   stays empty) and "Ask to add it to the catalog" (the values join the catalog and the cell fills for everyone), which
   opens the issue form `.github/ISSUE_TEMPLATE/indicator-request.yml` filled in with the place, its collection and the
   indicator. The requester adds a purpose and submits.
2. **Triage, within a minute** (`requests.yml`, `om_indicators/requests.py`): a bot labels the issue and comments why.
   - `auto`: the indicator is in the manifest, comes from erddap-places, the place's polygon is published by the
     gazetteer or served one place at a time by its publisher (the Marine Regions EEZs, `raster.feature_url`), and the
     job is under 50 million grid values;
   - `already`: the values exist;
   - `needs-review`: anything else, for a maintainer. Some of these a maintainer can accept with one label, see
     "Accepting a request that needs review" below.
3. **The run, on the Mac mini:** an `auto` request runs by itself while the repository variable `REQUESTS_AUTORUN` is
   `on`, at most `REQUESTS_PER_DAY` (default 10) a day. Otherwise, or past the cap, a maintainer starts it by adding the
   `run` label (only people with triage access can add labels). erddap-places computes the place and publishes it, the
   catalog is rebuilt and published, and the bot comments the Place view link and closes the issue. Issue #1 (Wells
   NERR, precipitation) is the worked example.

Requesters are answered on the issue only; no email is sent.

### Accepting a request that needs review

A request for a **Copernicus Marine** indicator (`cmems:…`, for example nitrate) at a place outside the sanctuaries is
never run by itself, because the run uses a maintainer's personal Copernicus Marine login. When the place's polygon can be
fetched (a collection published as vector data, or a Marine Regions one such as the EEZs, served one place at a time) and
the job is under 10 million grid values (a 40° × 40° box of the ¼° products), the bot labels it `needs-review` and its
comment says "A maintainer can accept it by adding the `run` label; it runs on Copernicus Marine with the maintainer's
account". Adding the `run` label (people with triage access only) starts the run job on the Mac mini:

1. the check job runs again and the producer is chosen from the checked indicator id, never from the issue text;
2. the **Copernicus Marine place producer** (`om_indicators/producers/cmems_place.py`) fetches the polygon, asks the
   Copernicus Marine Toolbox for the surface layer over the polygon's box (one grid cell of margin; a place across ±180°
   in two windows), averages the cells whose centres fall inside the polygon at every month (the method of
   noaa-onms/eco-indicators, so sanctuary and EEZ values share one method), and writes month and year rows through the
   contract. It publishes the place's Parquet, its `provenance.json` and the merged `index.json` under
   `s3://oceanmetrics.io-public/indicators/producers/cmems/`;
3. the catalog is rebuilt (the `cmems-places` adapter reads that folder into `values/indicator=<id>/coll=<place's
   collection>/`) and published, and the bot comments the Place view link and closes the issue.

A request nobody can run this way (a derived collection such as the FAO high seas, a collection with tiles only, a job
over the limit, a sanctuary, whose Copernicus Marine values come from eco-indicators) stays with a maintainer, and a
`run` label on it gets a comment saying so. `REQUESTS_AUTORUN` never starts a Copernicus Marine request. To run one
by hand, on the Mac mini (`uv sync --group cmems` once; the Toolbox login is in `~/.copernicusmarine/`):

```sh
uv run --group cmems python -m om_indicators.producers.cmems_place --place MRGID:5670 --coll mr_eez \
  --indicator cmems:cmems_mod_glo_bgc_my_0.25deg_P1M-m:no3:mean --check      # polygon, windows and job size; no Copernicus call
uv run --group cmems python -m om_indicators.producers.cmems_place --place MRGID:5670 --coll mr_eez \
  --indicator cmems:cmems_mod_glo_bgc_my_0.25deg_P1M-m:no3:mean --publish    # compute and upload
scripts/build_catalog.sh && scripts/publish_catalog.sh                        # then rebuild and publish the catalog
```

## The paper

`node scripts/paper_matrix.mjs` turns the manifest and coverage into the figure and table of what is computed where
(`docs/paper/computed_where.{svg,png,csv}`): one row per indicator series, one column per place collection, the places
with values, the years and whether a status is given. It was first made for "Coding Ocean Indicators: Patterns and
People" (PPG-26-197).

## Size budget

`node scripts/size-budget.mjs` after `npm run build`, in gzip: entry JS ≤ 110 kB, all JS except the map chunk ≤ 200 kB,
the map chunk (MapLibre, pmtiles and the map components) ≤ 330 kB, CSS except the map's ≤ 15 kB, the map's CSS ≤ 15 kB.
At the first deploy (2026-10-20) the entry was 86.5 kB and the CSS 6.7 kB. The map chunk has its own budget because
MapLibre is about 230 kB gzip and is loaded only when the Map view is opened. With the two pickers (2026-10-20) the entry is 107.0 kB and the CSS 14.98 kB (107.6 and 15.0 with the place sets: their code is the Map's or lives in the lazy panels, and their rules reuse `om-*` classes): the picker panels and their rules load on the first open, and rules that several components repeated live once in `viewer/src/app.css` as `om-*` classes (gzip is per file, so each copy cost bytes). Nothing was raised for the pickers. With the globe and full screen (2026-10-20) the entry is 108.1 kB (the hash key, three icons and the overlay tokens, which live in the inlined theme files) and the CSS 14.99 kB: the `--map-sea` and `--overlay-*` tokens and the Menu rule are in `brand/themes/*.css` (inlined in the JS), not in the entry CSS. Nothing was raised. With the shared selection and the Select section (2026-10-20) the entry was 109.7 kB and the CSS 14.9 kB before the merge with the globe and the report layouts (the toggling rules of `report/tree.ts` load with the first tick or removal, the gazetteer's index loader and the picker panels on first use; the Tree's look-alike CSS moved rather than grew).  After the three merges of 2026-10-20 (globe, report layouts, shared selection) the entry was 111.3 kB, over budget; the
icon map was 31.5 kB of it, 19.4 kB of that the traced eov- paths, which most views never draw. The generator now writes them
to `src/icons/icon-paths-eov.ts`, loaded the first time an eov- glyph draws, and the entry is 92.6 kB. Raise a budget only with the reason here.

With the report layouts and maps (2026-10-20) the entry is 107.9 kB (the spec's `ys` key) and nothing in the entry's CSS changed. The
budget script now counts three things differently, and one budget is new: (1) `MapCanvas-*` (MapLibre, pmtiles) and `MapTable-*` count
as the map chunk, because the Map view and the report's two maps share them (MapLibre was inside `MapView-*` before; the map JS is 293.7 kB
of 330 and its CSS 12.2 kB of 15); (2) the Report view's own lazy styles (`ReportView-*`, `LocatorMap-*`, `MapSheet-*`, `PrintableMap-*`)
have a **report CSS** budget of 8 kB, now 4.7 kB (they were 2.1 kB inside the 15 kB "CSS but map", which is now 12.9 kB); the six layouts and
the two maps are new code, loaded only with the report. The other JS (all but the map) is 181.7 kB of 200, the swExport chunk (SVG, PNG, ZIP) 5.7 kB
loaded on Export.

## Brand and icons

- **Themes** (`brand/themes/`): `oceanmetrics` maps the [Ocean Metrics brand v1](https://oceanmetrics.io/brand/v1/)
  onto the semantic tokens of [`@marinebon/ui`](https://marinebon.org/ui/) (teal brand, one sun action with dark ink);
  `mbon` is the kit's own tokens. The viewer switches with `?brand=oceanmetrics|mbon` and `?theme=light|dark`.
  Floating panels (the pickers, the drawer, the kit Menu, the full-screen side column) wear `--overlay-bg`, `--overlay-border` and `--overlay-shadow` (defined in both theme files): in dark mode a lighter surface, a visible rim and a deep shadow, so they stand off the page; in light mode the kit's own border and shadow. Text on them stays AA (body 6.3:1 in the Ocean Metrics dark, 8.6:1 in MBON dark).
- **Icons** (111 glyphs in the families `ui- view- el- depth- onms- eov- place- st- tr- cell-`): published at
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
