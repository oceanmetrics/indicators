# CLAUDE.md

Guidance for Claude Code in `oceanmetrics/indicators`: **Ocean Metrics Indicators**, any place × any indicator × time.
The plan is `~/Github/bbest/notes/om/plans_todo/2026-10-19_indicator-matrix_plan.md` (§1 contract, §2 manifest,
§6 reports and status methods, §8 branding and icons; its "Decisions" sections are settled). The OBIS track is
`2026-10-19_eez-obis-exact_plan.md` (obisindicators, its own repo).

**This repo is public from its first commit.** Never commit secrets, private emails, or internal data: nothing from
`~/data/oceanmetrics/places-internal`, no Marine Regions copies, no PPOW geometry, in code or fixtures. Values tables
(no geometry) are fine; fixtures are synthetic or from public sources.

## Commands

```sh
uv sync --group dev --group brand && npm ci
uv run --group dev pytest -q                      # contract, adapters, manifest, GOOS (must be green to commit)
uv run --group dev pytest -q tests/test_contract.py -k round_trip
npm test                                          # vitest: status, coverage, icons, favicons, viewer (must be green)
npx vitest run src/status/ecoidx.test.ts          # one file
npm run check                                     # svelte-check + tsc
npm run dev                                       # viewer on http://localhost:5181/ (reads catalog/)
node viewer/scripts/shoot.mjs [--only <name>]     # screenshots -> docs/shots/; look at them
node viewer/scripts/shoot.mjs --url https://oceanmetrics.io/indicators/ --out docs/shots/live   # the deployed site
node viewer/scripts/keys.mjs [--url <site>]       # keyboard: cell -> drawer -> Esc -> focus back; place link -> Place view; default matrix (indicators in rows) cell round trip, places-as-rows (#axes=p), remove button -> xp=/xi=
npm run icons:paths && npm run icons:build && npm run icons:sheet   # after any change to brand/ sources
Rscript fixtures/ecoidx/build_iea_sd_fixtures.R ~/Github/noaa-iea/ecoidx   # regenerate the iea-sd cross-check
```

The catalog build (adapters → manifest → coverage → validate) is in README.md "Commands". The icon set is published by
copying `brand/v1/icons/{om-icons.svg,icons.css,index.html}` to `oceanmetrics.github.io/static/brand/v1/icons/`
(served at https://oceanmetrics.io/brand/v1/icons/) after `npm test` is green; never change a locked glyph.

In a sandbox set `TMPDIR` to a writable directory or vitest cannot start. `OM_OFFLINE=1` skips tests that read the
published gazetteer over HTTP.

## Architecture

```
producer outputs (published) ──► om_indicators/adapters/*.py ──► contract.write_values() ──► catalog/values/indicator=<id>/coll=<slug>/data.parquet
config/indicators.yml + vocab + producer STAC ──► om_indicators/manifest.py ──► catalog/indicators.json
values + indicators.json ──► src/coverage/build.ts (imports src/status/) ──► catalog/coverage.parquet
indicators.json + coverage.parquet ──► viewer/ (imports src/status/, src/icons/)
```

- **One implementation per status method.** `src/status/` (TypeScript, no DOM) is the only place a status, trend,
  sentence or alt text is computed. The coverage builder (Node) and the viewer import it, as the erddap-places
  precompute imports the app's modules. Python never computes a status. R appears only in `fixtures/ecoidx/`, to run
  the real ecoidx `PlotTimeSeries()` and record what it draws; vitest asserts `iea-sd` matches every series.
- **`src/report/` is the report spec** (rules, expansion, layout caps and the panel budget, report id), shared by the viewer's Report view and the Node figure job; the tri-state trees, presets and layouts are in `viewer/src/lib/report/`, and the embed route is `viewer/embed/` + `viewer/src/embed.ts`.
- **`iea-sd` is ported from ecoidx `PlotTimeSeries()`, not `plot_ts()`.** `plot_ts()` compares the recent mean
  itself with 1 SD rather than its departure from the long-term mean (`R/plot.R:167-168`), and its +/− captions are
  reversed. The recent window is the last `recent` rows of the series (NA rows count), the SD is the sample SD, a
  change of exactly 1 SD is not a change.
- **Places are grouped by `place_coll`** (the home gazetteer collection, written by the coverage builder from the
  gazetteer index and `layers.json`), never by the values `coll`. The values file of a cell always comes from its
  coverage row's `coll` (`valuesCollOf()`): Pitcairn's EEZ is one place with rows in `places` and `mr_eez`. In the
  gazetteer index the `NMS:*` sanctuaries and `PSGID:939` live only in the `places` collection (the `noaa_sanctuaries`
  collection holds `ONMS:*` ids), so the default group is `DEFAULT_GROUPS` in `viewer/src/lib/data.ts`. Matrix hash keys:
  `colls`, `q`, `vocab`, `leads`, `depth`, `cell`, `axes=p`, `empty=1`, `xp`, `xi`, `ai` (README "Matrix view").
- **The Map view** (`viewer/src/lib/map/`): classes, legends and the table come from `classes.ts` (status and trend
  only through `src/status`); reference collections (Marine Regions `mr_*`) are drawn by Marine Regions' own WMS
  (`wms.ts`: an SLD plus `ENV`, one request per tile) and never from geometry we host. The map's `coll` is a place group
  (`place_coll ?? coll`, `pick.ts`), read from every values file that holds its places; the group's members that are not
  computed are drawn faint in a vector group.
- **The pickers** (`viewer/src/lib/pick/`): one place picker and one indicator picker for every view, the rules in plain
  `.ts` (`places.ts`, `placesTree.ts`, `indicators.ts`, `indicatorsTree.ts`; the `*Tree` files and the panels load on the
  first open, so keep them out of the entry). Shared look-alike CSS lives once in `viewer/src/app.css` as `om-*` classes
  (gzip is per file, so a copy in every stylesheet costs): the CSS budget was met that way, not raised.
- **Statuses are statistical, never better/worse.** No ONMS colours, no ▲ ▬ ▼; glyphs `st-above|within|below`,
  `tr-up|flat|down` differ in shape, and captions say "relative to its own record".
- **The contract** (`schema/values.schema.json`, `om_indicators/contract.py`): every adapter writes through
  `contract.write_values()`, which validates rows and provenance and refuses to write on any error. Rules beyond
  JSON Schema (time aligned to its grain, unique keys, one indicator and coll per file, finite values, class on
  all rows or none) live in `validate_rows()`, each with a test.
- **Adapters read published outputs only** and never change a producer repo. The STAC items stay the provenance:
  each values file lists the exact items/files it read in `om:provenance.sources`.
- **Producers without a STAC state their dataset in `provenance.dataset`** (SDG, `eco_indicators.py` for the Copernicus
  Marine long records at a pinned eco-indicators commit, `obis.py` for the obis-h3 release's `place_exact` layer); the
  manifest prefers it for any family and cites the dataset by its own `citation` line where `PRODUCERS[fam].cite_dataset`.
  OBIS counts a record in every place that contains it: its totals across places are never summed (stated in `method`).
- **The manifest takes titles, units, providers, licences and citations from the producer's STAC**, never typed
  here. `config/indicators.yml` holds only what is ours: category tags (ONMS, NaMES, EOV), series, lead, preferred,
  kind, min_periods, status method and grain.
- **Icons: no path is typed by hand.** MDI comes from `@mdi/js` by export name (`brand/icon-map.json`), bespoke
  glyphs from `brand/glyphs.py` (primitives on the 24-px grid), EOV glyphs from `brand/eov_trace.py` (traced GOOS
  badges). All feed the generated `src/icons/icon-paths.ts`; the sprite, `icons.css` and contact sheet are built
  from it. Earlier glyphs stay byte-identical (`brand/icons.lock.json`).
- **GOOS badges are used unmodified** (`assets/goos-eov/`, resized to WebP only), always with "Credit: Global Ocean
  Observing System (GOOS)", never in the Ocean Metrics sprite, never with the GOOS logo.
- **Themes:** `brand/themes/mbon.css` (the kit's tokens as they are) and `oceanmetrics.css` (DESIGN.md mapped onto
  the kit's semantic tokens: teal brand, one sun action with dark ink). Hex values live only in theme and token
  files; components use semantic tokens (`@marinebon/ui` rules). Check both themes and 390 px.

## Conventions

2-space indent, snake_case in Python, camelCase in TypeScript, lowercase comments, `----` section headings in long
files. One test per rule with a small synthetic fixture asserting exact output; a bug fix adds a named regression
test. pytest and vitest must both be green before every commit. The `log` skill records milestones in
`~/Github/bbest/notes/om/`.
