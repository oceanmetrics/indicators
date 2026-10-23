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
| `om_indicators/producers/cmems_place.py` (this repo; run by a maintainer on a request; the computation is om-extract's Copernicus Marine reader, `om_extract/readers/copernicus.py`) | The same Copernicus Marine products, for one place at a time: surface-layer monthly means | Any gazetteer place whose polygon can be fetched (vector collections, the Marine Regions EEZs), e.g. the Albanian EEZ | `om_indicators/adapters/cmems_places.py`: the producer's published folder → month and year rows |
| [obisindicators](https://github.com/marinebon/obisindicators) `obis-h3` release | OBIS records, richness, Shannon, Simpson, ES(50), Hill, Berger-Parker, density, by year, decade and EOV | Marine Regions EEZs, the high seas and the high seas by FAO major fishing area (`mr_eez`, `mr_high_seas`, `fao_high_seas`) | `om_indicators/adapters/obis.py`: exact point-in-polygon indicators |

The values are derived tables (no geometry). Code is MIT; values are CC BY 4.0 with the upstream credit carried in
the manifest.

## The contract

One row per (place, indicator, period), in `values/indicator=<id>/coll=<slug>/data.parquet`, with the file's
provenance as JSON in its Parquet key-value metadata under `om:provenance`. The contract (1.2.0: the columns, the
provenance fields, what changed from 1.1 and why 1.1 files stay valid) is documented in
[oceanmetrics/extract](https://github.com/oceanmetrics/extract) README "Contract". The validator, writer and reader are
`om_extract.contract` (every adapter calls `contract.write_values()`; `om_indicators/contract.py` re-exports it); the
schemas are `values-row` and `values-provenance` in [oceanmetrics/platform](https://github.com/oceanmetrics/platform)
`packages/catalog/schemas/`. Until extract's next release the dependency is a git source
(`[tool.uv.sources]` in `pyproject.toml`), and the schemas resolve from `node_modules/@oceanmetrics/catalog/schemas`
(the npm package `@oceanmetrics/catalog`, installed by `npm install`; no environment variable is needed).

```sql
-- every SST value for every sanctuary, straight from the bucket (published daily)
SELECT place_id, time, value FROM read_parquet(
  'https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/indicators/values/indicator=erddap:dhw_5km:CRW_SST:mean/coll=places/data.parquet')
WHERE time_grain = 'year' ORDER BY place_id, time;
```

## Layout

| path | language | what |
|---|---|---|
| `schema/` | JSON Schema | the manifest (`indicators`) and `coverage` (`om_indicators/schema.py`); the values contract's schemas are in `platform` |
| `config/` | YAML | `indicators.yml` (categories, series, lead, preferred, kind, min_periods), the vocabularies, and `place_sets.yml` (named lists of place groups: the manifest's `place_sets`) |
| `om_indicators/` | Python (uv) | producer adapters (writing through `om_extract.contract`), manifest builder, coverage check, CLI `om-ind` |
| `tests/` | pytest | one test per rule, exact-row fixtures |
| `src/coverage/` | TypeScript (Node) | values → `coverage.parquet` |
| `@oceanmetrics/status` | TypeScript (package) | the status methods (`iea-sd`, `names-pct`, `values`): the **only** implementation, used by the coverage builder and the viewer. It lives in https://github.com/oceanmetrics/platform (`packages/status`, with its tests and the R cross-check against ecoidx) and comes from npm: `npm install` here picks it up, and a change to a status method is made in `oceanmetrics/platform` and released there, then taken here by bumping the version range |
| `brand/` | Python, Node | icon pipeline (MDI by export name + generated glyphs + traced GOOS EOV glyphs), themes, favicons |
| `assets/goos-eov/` | PNG, WebP | the GOOS EOV badges, unmodified (see its `SOURCE.md`) |
| `viewer/` | Svelte 5 + Vite | the Matrix view on `indicators.json` + `coverage.parquet`, with `@marinebon/ui`; one selection (the Select section: places, indicators) shared by the Matrix, Map and Report views; places as rows with `#axes=p`, remove places or indicators with the x on a header (`px=`, `ix=`) and tick them back in a picker |
| `catalog/` | (git-ignored) | build output, published to `s3://oceanmetrics.io-public/indicators/` |

## Commands

```sh
uv sync --group dev --group brand && npm ci   # npm ci also installs @oceanmetrics/status and @oceanmetrics/catalog (the schemas python reads) from npm
uv sync --group dev --group cmems            # the cmems group (Copernicus Marine Toolbox, xarray, shapely, NetCDF backends) is only for the place producer and its tests
uv run --group dev pytest -q                 # adapters, manifest, coverage, GOOS badges and traced glyphs
npm test                                     # coverage, icons, favicons, viewer (the status tests are in oceanmetrics/platform)
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
npm run coverage:build -- catalog            # catalog/coverage.parquet (statuses from `@oceanmetrics/status`; place_coll from the gazetteer index, see `--gazetteer-index`, `--layers`)
uv run om-ind validate catalog               # every values file and coverage.parquet against the schemas

npm run dev                                  # the viewer on http://localhost:5181/, reading catalog/
node viewer/scripts/shoot.mjs                # screenshots -> docs/shots/ (both themes, both brands, 390 px)

# brand: icons and favicons (no path or colour typed by hand)
uv run --group brand brand/eov_trace.py --task all   # GOOS badges -> WebP, traced eov- glyphs, review sheet
python3 brand/glyphs.py                      # bespoke glyphs from primitives -> brand/glyphs/bespoke.json
npm run icons:paths && npm run icons:build   # src/icons/icon-paths.ts; brand/v1/icons/{om-icons.svg, icons.css, index.html}
npm run icons:sheet                          # contact sheet screenshots -> docs/shots/icons_*.png
node brand/build-favicons.mjs                # brand/favicons/{oceanmetrics,mbon}/ incl. head.html to paste verbatim
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
- the order: `ps pg po is ig io` (see "The order" below).
- shared by every view: `vocab`, `depth`, `axes=p` (places as rows; the old `axes=t` reads as the default), `empty=1` (show the indicators without values),
  `t` (the period, `2024` or `2024-07`; none = the latest). One `t` drives the Map, the layer under it and, with the period scrubber of build week 3
  (2026-11-13 to 11-19), the Matrix; until then the Matrix, the Report and the Place view carry it untouched, so it survives a switch of views.
- Matrix only: `q` (a place search that narrows the selection; the toolbar shows it as a chip), `cell` (an open drawer: `place|indicator`), `page` (the page of
  the grid, 60 places a page; 1 is left out) and `unfold` (the OBIS series shown open: series ids, `unfold=obis-fish`).
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

**The order** of the rows and columns is part of the shared selection (`src/report/order.ts`, one tested implementation for the Matrix, the Report's
layouts, the Map's table and the pickers; `ReportSpec.order`), chosen with the **Order** control of the Select section (a button that says
what differs from "A to Z"; its panel loads on the first open) or by moving a header. Hash keys, shared by every view and carried by the tab links;
the defaults write nothing:
- `ps`: the place sort, `az` (default: the groups A-Z by title, the places A-Z by name), `ns` (north to south), `sn`, `we` (west to east), `above`, `below` (the count of the
  place's cells above or below their own record, most first), `recent` (the most recent period with a value first), `custom`. North, south, west and east
  are by the centre of the place's bbox (`lat` and `lon`: coverage rows, and for a place picked from the whole gazetteer the same
  `src/coverage/centre.ts` on the index's bbox; the antimeridian is unwrapped first, so a place across it is centred on the right side); a place with no
  position goes last. `pg=0`: places not grouped, one flat list in which any place can go anywhere (every place north to south across the sanctuaries and the EEZs).
- `is`: the indicator sort, `az` (default: grouped by the vocabulary's categories, the groups A-Z by label with "Other" last, the indicators A-Z by short title),
  `vocab` (the vocabulary's own term order, a series together with its lead first, then the manifest order), `series` (the groups A-Z, a series together with its
  lead first), `above`, `below` (the count of places above or below, most first), `custom`. `ig=0`: indicators not grouped.
- The **status sorts** (`above`, `below`, `recent`) read a `StatusRank`: the counts of the chosen places by the chosen indicators, from `@oceanmetrics/catalog`
  `rollups` (`selectionRollups`, `statusRank` in `matrix.ts`); a tie is A-Z. The Matrix and the Report pass it (`usesRank`); the Map's table and the pickers have no
  counts and read a status sort as A-Z. The Matrix's two sort selects (below) write `ps` and `is`, so a status sort is shared with the other views like any order.
- `po`, `io`: the custom order, read only with `ps=custom` / `is=custom`: a comma list of ids. A grouped axis may begin with **group entries**, `g:<group id>`
  (`g:places`, `g:mr_eez` for places; `g:<term id>` for indicators, e.g. `g:drivers`), which order the groups; the id entries order the items of each group by their place in
  the list (an item moves only within its group while the axis is grouped). An id the selection does not hold is ignored; an item or group that is not listed follows the listed ones,
  in A-Z, so a new indicator or place appears without breaking a custom order. A move writes the shortest list that gives the order (entries that change nothing are dropped:
  moving one place writes one or two ids, `ps=custom&po=NMS:CINMS`). Choosing another sort key keeps the list in the session, but the URL carries it only for `custom`.
  The default order leaves `order` out of `report.json`, so the ids of reports made before it hold.

To move a header: **drag** a place, indicator or group header (row or column, whichever orientation) onto another header of its group (a bar shows the side it would land on;
a header in another group is marked as not droppable); a **group** is dragged by its title onto another group; with grouping off an item goes anywhere. With the keyboard, **Alt+Up/Down**
(rows) or **Alt+Left/Right** (columns) on any control of a header moves it one place, and a plain arrow does on its Move button (the small button that appears on hover and focus; its
neighbours move it by a click or a tap, and are always shown on a touch screen, so a phone can reorder too). On a group header the whole group moves. Each move is announced in a polite live region
("Moved Channel Islands after Chumash Heritage"; "Wells is already first") and focus stays on the control that had it. A move switches that axis to Custom; "Reset the places' order" or
"Reset both" in the Order panel goes back. The place picker lists a group's places in the order too, and the indicator picker its categories and series. In the Report the places,
the groups and every layout that lists them follow it; the Scorecard and the Cards keep their exceptions-first order only while the axis has the default order, so an order the reader chose is
what they see (`style=values` is the way to a plain A-Z Scorecard). The Map's table is by class, then value, until an order is chosen for the places; then it follows it.

**The summary, the sorts, the fold and the pages** (build week 3; `MatrixBar.svelte` wires the rules of `matrix.ts`). Above the grid one line says the
selection on display, from `@oceanmetrics/catalog` `rollups` over the places (every page) by the indicators shown: "18 places × 19 indicators: 11 above, 94
within, 12 below, 118 without a status · latest 2025", with the status glyphs (one cell per place × indicator; "without a status" is a value with no status: no
rule, a categorical indicator, or too short a record). Every place and indicator header says the same counts of its own cells (an indicator's over every page) and its latest period (a sentence
for a screen reader, glyphs and numbers for the eye), on hover and focus, always on a touch screen. Two native selects, **Sort places** (Name A to Z, Most above,
Most below, Most recent period) and **Sort indicators** (A to Z, Series order leads first, Most above, Most below), write `ps` / `is`; a sort chosen in the Order
control (north to south, custom) shows in them too. **The OBIS fold**: an OBIS series without a status rule (counts of records and species track sampling
effort) with two or more indicators on display is one row (or column), its lead, with a disclosure "Show 8 more of OBIS (fish)" (`foldColumns`, the matrix-wide
counterpart of the package's per-place `foldSeriesWithoutRule`; the rule `foldsInMatrix` uses the package's `STATUS_RULES`); open, the series follows its lead,
together, each member marked at its header's edge. The open series are in the hash, `unfold=obis-fish,obis-all`. **The pages**: the grid shows 60 places a page
(`pageRows`, `PAGE_SIZE`), across their groups (a group cut by a page keeps its head), with Previous and Next links ("places 61 to 120 of 303 · page 2 of 6",
`page=2` in the hash; a page out of range is the nearest). The pages are links, so each is a permalink with the selection and the sort; a new selection, order or
search starts on page 1, a removal or a move keeps the page. The columns (the indicators with a value) are the same on every page. **A place's name** links to
its record page on the places site, `https://oceanmetrics.io/places/p/<id>` (`placesPageHref`, a new tab), the front door of a place; every cell still opens the
drawer, whose "Open in place view" is the deep Place view.

**The cards** of the Place view (`IndicatorCard.svelte`) say what the places page's cards say, from the same rules (`@oceanmetrics/catalog` `cardsFor` through
`place.ts` `placeCard`): the title, the status glyph and word, the sentence (coverage's until the browser has computed its own), the method label and note, the
citation with the place clause and a **Reproduce** block (the values url, a DuckDB query for the place, the configuration lines and their hash). Around them the
viewer keeps what only it has: the chart, the grain and method switches, the table, the downloads and the four elements. The values url, the DuckDB one-liner,
the configuration lines and hash (`configHash`: the hash of a known place never changes, `delivery.test.ts` pins the package's two), the citation with the place
clause, the status, trend and method words and the status note are the packages' (`@oceanmetrics/catalog/cards`, `@oceanmetrics/status`), imported wherever the
viewer shows them (the drawer, the Report's dossier and SanctuaryWatch export, the Map).

**Context carried between views:** every link to another view carries the selection and the shared keys (`hash.ts`: `carryOver`); each view keeps its
own keys as it was left. Matrix -> Map opens the indicator and place of the last opened cell; Map -> Matrix opens the drawer on the cell of the
selected place; Place -> Map opens the opened indicator with the place selected, both added to the selection when it lacks them
(`matrixToMapHref`, `mapToMatrixHref`, `placeToMapHref`).
A cell is a value with its status and trend glyphs, **not computed yet** (open it: compute it now in erddap-places, or
ask for it by a prefilled issue), **no data here** (the indicator has a values file for this place's collection, with
nothing for the place), or a dash (**not offered** for this kind of place).

**From an empty cell** the drawer (and the Place view) offers the way forward, built by `viewer/src/lib/nextSteps.ts`: for an
erddap-places indicator **Compute it now in erddap-places** (`<base>erddap-places/#place=…&dataset=erddap/…&variable=…`: the dataset is named by its STAC collection id, the manifest's `dataset.collection`, as erddap-places names it; `nextSteps.catalog.test.ts` checks every such link against the published gazetteer) and **Ask to add
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
| **Quad plot** | the IEA quad plot: each point is an indicator (a plot per place) or a place (a plot per indicator; one place or one indicator gives one plot) at its recent trend (x) and the departure of its recent mean from its long-term mean (y), in SD units of its own record (`quadPoint()` in `@oceanmetrics/status`); dashed guides at ±1 SD, corner captions worded statistically, a status glyph per point, points without coordinates listed with why, hover tooltip, and the plot as a table | 30 panels |
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

- **Runners:** the Mac mini has two self-hosted runners of the `oceanmetrics` organisation, and a runner takes one job at a
  time. `macmini` (`~/actions-runner/erddap-places`) holds the long jobs: erddap-places' daily precompute (hours) and the
  monthly obis-h3 release. `macmini-quick` (`~/actions-runner/quick`, label `macmini-quick` only, so no long job lands on
  it) runs this repo's short jobs: the catalog and the request runs, which otherwise waited behind the precompute.
- **Catalog:** `.github/workflows/catalog.yml` runs daily (08:07 UTC) on the self-hosted `macmini-quick` runner:
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
`@oceanmetrics/status` as of the period shown), the length of its record, or, for a categorical indicator, its largest class or the share of
one class. The Period scrubber walks the periods. Hash keys: `ind` (the indicator: the hash's when it is in the selection, else the first selected one with
values in the selected places), the selection (`pi`, `px`, `ii`, `ix`), `place` (the place selected), `color` (`value|departure|status|trend|record|class|share`), `t`
(shared by every view: `2024` or `2024-07`; none = each place's latest), `t2` (the second period of the compare mode, shared like `t`, or a year range `2003-2012`; absent = off),
`anom` (`1`: the compare mode draws `t2 - t`), `swipe` (the compare handle, 0..1), `cls` (the class `share` maps), `grain`, `proj` (`globe`; absent = the flat map), `layer`
(the layer under the map, below), `pal` (its palette) and `method`. The grammar did not change with the packages below.
- **The map stack** is `@oceanmetrics/map` (the slot contract, `setupMapLibre`, the basemap, the ramps, the grid provider) and
  `@oceanmetrics/engine` (the mask, the lobes, the ERDDAP requests, DuckDB-WASM, the slice) on MapLibre 6 (named imports: it has no
  default export). `MapCanvas.svelte` calls `setupMapLibre` once a page with MapLibre's worker module (`maplibre-gl-worker.mjs?worker&url`;
  `vite.config.ts` names worker chunks `.mjs`, which MapLibre 6's `importScriptInWorkers` requires) and registers `pmtiles://` (`setup.ts`:
  one setup a page for every map, given the same three functions each time). Both packages come from npm (`@oceanmetrics/map` ^0.3.1 for the
  cell readout, the counts, the palette and the Retry; `@oceanmetrics/engine` ^0.1.1).
- **The basemap** is CARTO's positron (light) or dark-matter (dark) through `composeStyle(baseStyle(theme), { theme, dem: false })`:
  the GEBCO sea floor, isobaths, land mask and undersea names are built and in the bucket, but `storage.oceanmetrics.io/basemap/`
  (the package's `DEFAULT_TILES`) answers 404 until the storage host lets `basemap` through, and MapLibre schedules no frame while a source
  fails, so `dem: false` stays the default. `VITE_BASEMAP_DEM=1` at build or dev time turns them on, read from the bucket's path-style url
  (`basemapTiles.ts`, `tilesAt`). The credit line is the style's own attribution
  (`styleCredit`: "© OpenStreetMap contributors © CARTO"). What is the basemap's is the layer ids of the style set (`basemapLayerIds`):
  `clear()` removes every other layer and source, a click or the pointer tests the others that are not the slot's (`isSlotLayer`), and a
  theme flip is `setStyle(next, { diff: true, transformStyle: carryLayers(id => !basemap.has(id)) })`, which carries the parts and the slot
  into the other theme's style under the layers they sat under. If CARTO does not answer, the map draws on a plain `--map-sea` background.
- **The layer under the map** (`layer=<kind>:<id>[:<variable>]`, e.g. `layer=grid:dhw_5km:CRW_SST`; the "Layer under the map" select beside the
  Period scrubber; Day 6's `layer=erddap:...` links open the same layer and are written back as `grid:`): a **grid slice** of an ERDDAP dataset
  drawn under the places at the step of `t` (the period's first day, `2024-07` -> `2024-07-01`; the dataset's latest step when `t` is
  absent), computed in the browser. `viewer/src/lib/map/layerSlot.ts` re-exports the contract of `@oceanmetrics/map` (a `LayerSlot`: `mount`,
  `update(t)`, `unmount`, `legend`, made by the factory its kind registers); MapCanvas mounts it under the first vector part's fill (else
  the first layer of ours, else the basemap's sea surface) and its ids start `slot:`. The one kind is `grid` (`gridKind.ts`): `gridSlot`
  (one square per cell of the dataset's own lattice, a ramp from `defaultRampFor`, holes where the step has no data) over the engine's
  `sliceSource`. The dataset is the gazetteer's `erddap/<id>/collection.json` through `toDataset`; the places are the polygon places the map
  draws (`slicePlaces`: every computed place of a vector group, from that group's gazetteer collection; a reference group such as the
  EEZs, drawn by Marine Regions' WMS, and a derived group have no polygon here and are named in the legend). **One slice per place lobe**:
  each place's polygon is read from `<coll>/places.parquet` (`placeGeometry.ts`, range requests on the row groups that hold it), split at
  ±180 (`placeLobes`), and each lobe asks ERDDAP for its own box at the step and is masked by its own place (`lobeMasks`); never one box over
  the union of the places (the sanctuaries' union at 0.05° is about 4.5 million cells a step, their lobes together about 0.2 million).
  A place with a lobe over 250,000 cells a request, or one past 600,000 cells in all, is left out whole and named in the legend
  (Papahānaumokuākea at MUR's 0.01°). Over the slot the sliced places lose their fill (the slice is masked to them) and keep their class on
  the outline, in the legend and in the table. The legend shows the ramp and a line with the layer's title, its step, how it is drawn
  ("grid slice in the browser (DuckDB-WASM) from ERDDAP at <host>"), its range, and "loading the slice…" until it is in; the credit line
  names the layer, its producers and its server. The select lists the ERDDAP datasets of the manifest's indicators, one entry per variable,
  the shown indicator's dataset first.
- **The engine chunk.** `gridSource.ts` is loaded with `import()` the first time a grid slot asks for a slice: `@oceanmetrics/engine`,
  Apache Arrow, the mask (turf), hyparquet's codecs for the gazetteer's ZSTD GeoParquet, and DuckDB-WASM 1.32.0 (pinned exactly, as obis-hex
  and atlas: 1.33 dev builds broke OPFS), whose mvp and eh wasm and worker files are self-hosted through `?url` imports and booted once a page
  in its own Web Worker by `connectBrowser`. None of it is in the entry or the map chunk (README "Size budget"). A first slice of the
  sanctuaries took 6 to 15 s from mount on 2026-10-23 (MUR monthly at 0.01°, `grid:jplMURSST41mday:sst`, 101,626 cells in 14 lobes, from
  erddap.oceanmetrics.io; 13 to 45 s for MUR daily); a new `t` only refetches the slabs (`update(t)`, 17 to 21 s a step from MUR daily).
  The axes and polygons of a slot are asked once more after 1.5 s when the first try fails (`RETRY_MS`; the mirror
  answered 404 to a lobe's axis request on 2026-10-23, and later "Currently unknown datasetID" for a while). PacIOOS did not answer that night, so the layer shots use the mirror (`shoot.mjs --layer grid:jplMURSST41mday:sst`). Each slice logs its
  time to the console (`[om] grid slice ...`). Where two places' boxes overlap, the engine's `sliceSource` reads the lobes' slabs with
  `SELECT DISTINCT` (engine 0.1.1), so a cell of the overlap is drawn once; the squares of a 0.05° or finer grid have no outline (map 0.2.2).
- **The Period scrubber** (`TimeScrubber.svelte`, rules in `timeWindow.ts`): `t` is the handle and the right edge of a window
  `[t - w, t]` drawn as a band behind it, `w` defaulting by grain (12 months, 10 years, 3 decades, 30 days). Brush across the track to set
  the window (t is its later end), drag the band or the handle to pan it, the wheel over the track zooms it anchored at t, double-click
  resets it; click sets t; arrows move t, Shift+arrows resize the window, Home/End and PageUp/PageDown jump. A drag asks for the period once,
  on release. The slice always shows the step at t; the window is the view's own (not in the hash) and is what the live series reads once
  it is on the Map (build week 3, 2026-11-13 to 11-19).
- **Compare: Then vs Now as two slices of one layer** (`compare.ts`; `t2=<period>` in the hash, shared like `t`, absent = off; the
  "Compare" Toggle beside the Period scrubber, its "Compare with" period and the "Difference" Toggle). The layer is drawn at `t` (the
  scrubber's) and a second grid slot of the same layer at `t2` (`gridSlot`'s `instance`, ids `slot:grid@t2`, map 0.2.3) sits just above
  it: **one MapLibre map, two layer groups**, each slot's fill bracketed by two custom layers that set and clear the WebGL scissor
  box, the slot at `t2` left of the swipe handle and the slot at `t` right of it, so neither shows through the other at 0.9 opacity
  (`swipeLayers.ts` places the pairs; MapLibre 6 uses the scissor only for its debug drawing). That is erddap-places'
  `thenNow/swipe.ts` `clipFor` (a CSS clip of the right-hand map of two synced maps) inside one canvas: a straight screen line on the
  flat map and the globe, nothing re-laid-out while the handle or the camera moves. A `setFilter` on the cells' `lon` was the other
  one-map way and was not taken: it rebuilds every tile of a 100,000-square GeoJSON source each frame, and on the globe a meridian is
  not a screen line. Then (`t2`, usually the earlier) is on the left, Now (`t`) on the right, as in erddap-places; the handle moves by drag
  or by its keys (arrows 5 %, Shift 1 %, Home/End, PageUp/PageDown), and its position is `swipe=` in the hash (0..1, three decimals,
  the middle left out; written on release, not on every frame of a drag), as erddap-places had it. Both slots
  draw on **one colour scale**, the union of the two slices' ranges (a `domain` function and `repaint()`), and share one slice per period
  (`sliceCache.ts`: a period asked twice is fetched once; a request is aborted only when no slot waits for it). **`anom=1`** draws
  `t2 - t` per cell, computed in the engine's SQL from the two slices (`gridAnomaly.ts`: both into DuckDB-WASM, `anomalySql`, NULL where
  either period has no data), on the diverging `balance` ramp symmetric about 0; as in erddap-places the swipe is hidden and the
  difference covers the map (the slot at `t` is hidden under it). The legend names both periods ("left of the handle 2016-07 · right
  2024-07 · one colour scale over both periods", or "2016-07 minus 2024-07, per cell · blue lower in 2016-07, red higher"). erddap-places
  pairs a day of the year (`md`) across a climatology and a year; here `t` and `t2` are periods of the layer's grain (a month of MUR
  monthly, a year of a yearly grid), each one step of the dataset, so no day-of-year pairing is needed. Its exceedance pill and the
  anomaly series of the Time strip go with the live series (build week 3).
- **The climatology Then** (build week 2, erddap-places parity row 32): `t2` may be a year range, `t2=2003-2012`, the mean per cell of
  that range's periods at the month of `t` (July 2003 .. July 2012 for `t=2024-07`; the month of the dataset's latest step when `t` is
  absent). One slice per period through the shared slices (`sliceCache.ts`), at most three at once (`MEAN_CONCURRENCY`: the mirror
  drops requests under parallel load), averaged per cell in the engine's SQL (`gridAnomaly.ts` `meanRows`, `compare.ts` `meanSql`: NULL
  where no period has data). Years outside the dataset's record are left out, and at most 12 periods are averaged (`MAX_MEAN_PERIODS`,
  the first 12 inside the record); a period whose slice fails is left out of the mean and named. The legend says what the mean held:
  "Then: mean of 2003-07..2012-07 (10 periods)", "(12 periods: capped at 12 of 18)", "17 outside the record", "1 failed: 2007-07"; the
  swipe caption says "mean of 2003-07..2012-07". The "Compare with" select offers erddap-places' baselines (1985-2005, 2003-2012) that
  overlap the record and the ten years before `t`; a link may name any range. With `anom=1` the difference is that mean minus `t`.
  The shots `map_wk2_range_*` and `map_wk2_retry*` read IMERG's monthly precipitation in January (`shoot.mjs --only map_wk2_range
  --compare-layer grid:IMERG_monthly_global_precip:precipitation --t 2024-01`): the mirror dropped MUR monthly for most of 2026-10-23.
- **The cell readout** (rows 17, 37): hovering a cell (a tap on a phone) shows a small box beside the pointer and a "Cell:" line in the
  legend with the cell's value, unit and period, the centre and, for a boundary cell, the share inside the place; in the compare mode
  both periods and the difference `t2 - t` (the anomaly's sign). Each slot answers from its own last slice (`GridSlot.cellAt`,
  `@oceanmetrics/map` 0.3.1's `cellLocator` over the dataset's lattice), so both halves of the swipe and the hidden slot under the
  anomaly answer; the words are `gridLayer.ts` `cellReadout`.
- **The cells sliced** (row 19): the legend says "Cells: 101,923 sliced in 14 places (9,163 on a boundary) · with data: 100,982 at
  2024-07, 100,982 at 2016-07" (`cellCountLine`; the mask is counted lobe by lobe in `gridSource.ts`, the slices by `GridSlot.counts()`)
  and "Cells per place" opens a table of each place's cells and boundary cells (`cellRows`); the places left out are named as before.
- **Retry** (row 20): every ERDDAP request of the slice is patient (`gridLayer.ts` `patientFetch`, the places page's: a 404 or a 5xx is
  asked again, six tries, 0.3 s x the try between them), and a slice that still fails reads "no data: erddap.oceanmetrics.io answered
  HTTP 404 Not Found" (`problemText`: the host and the status, never the server's page) with a **Retry** button under the legend line
  that asks for that slice again (`GridSlot.retry()`; the failed slices are not kept, so only they are fetched). A slot whose collection
  did not load is made again.
- **The palette** (rows 30, 82): a "Palette" select beside the layer lists the default (the layer's `defaultRampFor`, thermal for SST)
  and every ramp of `@oceanmetrics/map` by kind, each also reversed (`rampChoices`); `pal=<ramp>[_r]` in the hash (`pal=spectral_r` is
  erddap-places' red = warm Spectral), read only with a layer, absent = the default. The slot and the compare slot repaint without a
  new slice (`GridSlot.setRamp`), the legend's ramp follows; the difference keeps its diverging `balance`.
- **The keyboard** (row 58): `l`, erddap-places' lens key, turns the compare mode on (at the default second period) and off, the place
  kept; with no layer under the map it goes to the "Layer under the map" select and says so (`viewer/src/lib/keys.ts`). Help ▾ →
  *Keyboard shortcuts* lists it with the keys of the Period scrubber, the compare handle, the Matrix headers and Esc.
- **The second pass of build week 2** (2026-10-23, erddap-places parity rows 18, 21, 24, 33, 72, 87 and four cosmetic findings; shots
  `map_wk2b_*`): a place selected from a link is **framed by the viewport** (`bounds.ts` `fitPadding`: a margin of 6 % of the frame's
  shorter side, 12 to 64 px, plus the Flat / Globe / Full screen row on top and the scale at the bottom; the fixed 80 px a side left a
  place a third of a 390 px frame) and **the short way round the globe** (`placeBox`: the longitudes of every vertex as points on a
  circle, the box the circle less the widest gap, so Papahanaumokuakea is one box over 180 whether the tiles give it as two features or,
  at zoom 1 on a phone, as one whose ring runs from 177 to -162). **A period outside the layer's record draws its last (or first) step**
  (`gridLayer.ts` `clampStep`, in the shared slices of `gridKind.ts`; `GridLayerSlot.stepOf`), and the legend says so: "2026-08 is
  past the record of this layer: its last step, 2025-09-01, is drawn" (`clampLine`; IMERG's final run ends months before the
  indicators). **Turning compare on or off is a history entry** (`hash.ts` `historyStep`; every other change rewrites the entry), so
  Back returns to the view before it and Forward again, the Map following in place (`keys.mjs`: "Back after compare off", "Forward").
  The cosmetic fixes: the "Compare with" select is 13 rem, so "mean of 2003–2012" reads whole; the difference legend names a year
  range's Then in full once and then "Then" (`compareLegendLine` `secondShort`); the Palette select is hidden under the difference
  (`paletteShown`), which keeps `balance`.
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
   `run` label (only people with triage access can add labels). The one engine computes the place:
   `om-extract run --chunks --stats-dir` (oceanmetrics/extract, since 2026-10-23 in place of erddap-places'
   `precompute.ts`) reads the place from the gazetteer, runs the chunked ERDDAP path over the whole record (the chunk
   store `OM_CHUNKS`, default `~/.cache/oceanmetrics/chunks` on the runner, so a re-run fetches only what it lacks) and
   writes erddap-places' `stats/` layout with its STAC item: `<dataset>/<variable>/<place>.parquet`, its
   `.provenance.json` and `items/<dataset>_<variable>_<place>.json`. What happens next depends on the repository
   variable `OM_STATS_PUBLISH`:
   - **unset (the default) or anything but `publish`: a dry run.** The files are listed in the log and attached to the
     run as the `stats` artifact (a tarball: an artifact cannot hold the `:` of a place id), nothing is uploaded, the
     catalog is not rebuilt, and the bot comments that the values are computed but not published; the issue stays open.
     The default waits on the parity criterion (ledger 2026-10-23): the engine's sums differ from erddap-places'
     published ones in the last bits, so it writes nothing under `gazetteer/stats/` until "bit for bit" is restated.
   - **`publish`:** the parquet, its provenance and then the item are uploaded to
     `s3://oceanmetrics.io-public/gazetteer/stats/`, the item goes on the requested-items list, the catalog is rebuilt
     and published, and the bot comments the Place view link and closes the issue.

   Issue #1 (Wells NERR, precipitation) is the worked example (run by erddap-places before the switch).

Requesters are answered on the issue only; no email is sent.

### Accepting a request that needs review

A request for a **Copernicus Marine** indicator (`cmems:…`, for example nitrate) at a place outside the sanctuaries is
never run by itself, because the run uses a maintainer's personal Copernicus Marine login. When the place's polygon can be
fetched (a collection published as vector data, or a Marine Regions one such as the EEZs, served one place at a time) and
the job is under 10 million grid values (a 40° × 40° box of the ¼° products), the bot labels it `needs-review` and its
comment says "A maintainer can accept it by adding the `run` label; it runs on Copernicus Marine with the maintainer's
account". Adding the `run` label (people with triage access only) starts the run job on the Mac mini:

1. the check job runs again and the producer is chosen from the checked indicator id, never from the issue text;
2. the **Copernicus Marine place producer** (`om_indicators/producers/cmems_place.py`, a thin call into om-extract's
   Copernicus Marine reader, the engine `om-extract run --reader copernicus` runs) fetches the polygon, asks the
   Copernicus Marine Toolbox for the surface layer over the polygon's box (one grid cell of margin; a place across ±180°
   in two windows), averages the cells whose centres fall inside the polygon at every month (the method of
   noaa-onms/eco-indicators, so sanctuary and EEZ values share one method), and writes month and year rows through the
   contract. It publishes the place's Parquet, its `provenance.json` and the merged `index.json` under
   `s3://oceanmetrics.io-public/indicators/producers/cmems/` (not behind `OM_STATS_PUBLISH`: this folder is the
   producer's own, not `gazetteer/stats/`). The windows, the subset, the mean, the rows and the provenance are the
   reader's (`extract_place()`, `build_provenance()`); the producer keeps the request around them (the indicator check,
   the polygon, the folder, the index, the upload), and `tests/test_cmems_place_golden.py` holds it to the files it wrote
   before the move, byte for byte (`tests/fixtures/cmems_place/`);
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

With the order (2026-10-20: the ordering rules, the Matrix's drag and drop and keys, the hash keys) the entry is 96.7 kB of 110 (+4.1), the CSS 14.5 kB of 15 (+1.5: the move buttons, the drop bars and the touch rules of the Matrix, the Order control reuses `om-*` classes), the other JS 195.9 kB of 200 (the Order panel, the picker orders and the table order; the map chunk 290.7 kB);
the Order panel (`OrderPanel.svelte`) is a lazy chunk. Nothing was raised.

With the report layouts and maps (2026-10-20) the entry is 107.9 kB (the spec's `ys` key) and nothing in the entry's CSS changed. The
budget script now counts three things differently, and one budget is new: (1) `MapCanvas-*` (MapLibre, pmtiles) and `MapTable-*` count
as the map chunk, because the Map view and the report's two maps share them (MapLibre was inside `MapView-*` before; the map JS is 293.7 kB
of 330 and its CSS 12.2 kB of 15); (2) the Report view's own lazy styles (`ReportView-*`, `LocatorMap-*`, `MapSheet-*`, `PrintableMap-*`)
have a **report CSS** budget of 8 kB, now 4.7 kB (they were 2.1 kB inside the 15 kB "CSS but map", which is now 12.9 kB); the six layouts and
the two maps are new code, loaded only with the report. The other JS (all but the map) is 181.7 kB of 200, the swExport chunk (SVG, PNG, ZIP) 5.7 kB
loaded on Export.

With the layer slot (2026-10-22: `layerSlot.ts`, the `erddap` kind and its protocol, the "Layer under the map" select) the entry is 97.2 kB (the
hash's `layer` codec), the other JS 196.5 kB and the map JS 293.4 kB of 330 (+2.7): the kind's code is in the map chunk, so nothing was lazy-loaded or raised.

With the map packages (2026-10-23: MapLibre 6, `@oceanmetrics/map` with the CARTO basemap and the grid slot, the Period scrubber) the
entry is 97.4 kB (the codec now comes from the package), the other JS 196.8 kB and the map JS 316.3 kB of 330 (+22.9: MapLibre 6 over 5.24,
the package's setup, basemap and grid provider, the grid kind, the scrubber); nothing in the map chunk was lazy-loaded or raised. The engine
is a new lazy chunk with its own line, **engine JS ≤ 160 kB**, now 139.2 kB (`gridSource.ts`: `@oceanmetrics/engine`, Apache Arrow, the mask,
hyparquet's codecs), loaded on the first slice. The budget script tells chunks apart by Vite's manifest (`build.manifest`): a chunk belongs to
a lazy root when only that root's static imports reach it. Outside every line, and printed: DuckDB-WASM's worker scripts (381.3 kB gzip) and
wasm (eh 7.6 MB, mvp 8.7 MB gzip, one of them fetched by the engine's worker), the worker modules (`.mjs`, 147.1 kB: MapLibre's), and the map
package's COG protocol chunks (219.6 kB, requested on the first `cog://`, which no kind registered here makes).

With the compare mode (2026-10-23: `t2`, `anom` and `swipe` in the hash, `compare.ts`, the swipe handle, the kit's Toggle, the slice cache, the
companion slot, the anomaly SQL) the entry is 97.6 kB (+0.2, the hash keys), the other JS 197.0 kB, the map JS 320.0 kB of 330 (+3.6) and the
engine JS 139.5 kB of 160 (+0.3, `gridAnomaly.ts`); nothing was raised.

With the shared cards and the Matrix of build week 3 (2026-10-23) the entry is 102.6 kB of 110 (+5.0) and **the budget of all JS but the map is raised
from 200 to 205 kB**, now 201.8 kB (+4.8 over 197.0). The reason: (1) the viewer's card words, citation with the place clause and Reproduce block now come
from `@oceanmetrics/catalog` 0.3.0 (`cardsFor`, `placeCitation`, `reproduceFor`, `configHash`, `rollups`), the one implementation the places page reads
too; a package module lands whole in one chunk, with every export some chunk uses, so the Drawer's `configHash` in the entry pulls `cardsFor` (the
Place view's) up front with it: +3.4 kB over the copies it replaced, measured with the packages installed and the code unchanged (97.6 -> 100.0 entry,
197.0 -> 200.4 all but the map); (2) the Matrix's summary line, the sort selects, the header counts, the OBIS fold and the pager are entry code (the
Matrix is the first screen): +1.4 kB. Nothing could move to a lazy chunk without moving the Matrix. The CSS is 14.6 kB of 15 (+0.5: the summary bar,
the header counts and the fold button); nothing in the map or the engine changed.

With build week 2's parity rows (2026-10-23: the cell readout, the counts, the Retry, the palette, the year-range Then, `l` and the
Keyboard list) the map JS is 323.9 kB of 330 (+3.9), the engine 139.8 of 160 (+0.3: the patient fetch, the mean), all JS but the map
203.2 of 205 (+1.2: the legend's rows and Retry, `keys.ts` and the Keyboard notice), the entry 103.4 of 110 (+0.7: the Keyboard list),
the CSS but the map 14.8 of 15 (+0.2, the legend's cell table) and the map's CSS 12.5 of 15. Nothing was raised.

The second pass of build week 2 (2026-10-23: the fit by viewport, `placeBox`, the step clamp, the history entry, the cosmetic fixes) adds
0.5 kB to the map JS (324.4 of 330), 0.1 to the entry (103.5 of 110) and to all JS but the map (203.3 of 205); the engine and the CSS are
unchanged. Nothing was raised.

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
