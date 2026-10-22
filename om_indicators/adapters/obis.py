"""OBIS adapter: the obis-h3 release's exact place indicators -> year, decade and all-years contract rows.

obisindicators (0.9.0) publishes, into each obis-h3 release, indicators of every place computed from the OBIS
occurrences inside its true polygon (exact point-in-polygon, no H3):

  <root>/latest.json                                   {release, base, obis_snapshot, worms_version, built_at}
  <base>release.json                                   layers.place_exact.collections.<coll> {places, records_in, records_out, records_total, overlaps}
  <base>place_exact/coll=<coll>/years.parquet          place_id, eov, year, n, sp, shannon, simpson, es, hill_1, hill_2, bp, density
  <base>place_exact/coll=<coll>/indicators.parquet     the same with `decade` (NULL = all years)

each (metric, eov) is one indicator, `obis:<metric>` for eov `all` and `obis:<metric>:<eov-slug>` for the seven EOVs
(IOOS Marine Life Data Network seeds), one values file per (indicator, coll):

  metric   column   unit            metric   column    unit
  records  n        records         hill1    hill_1    1
  species  sp       species         hill2    hill_2    1
  shannon  shannon  1               bp       bp        1
  simpson  simpson  1               density  density   records km-2
  es50     es       species

rules (each one a named function below, each tested):

  rows      `place_rows()`: `year` rows (the snapshot's own year is incomplete and is dropped), `decade` rows and one `all`
            row (time null) per place and indicator; n = the records for every metric, so a metric's sample size is
            always the same column; nulls stay null (es where n < 50).
  overlap   a record counts in every place whose polygon contains it, so totals across places exceed the distinct records
            and are never summed. `overlap_note()` states it with the numbers of release.json (the surplus in a sum of place totals =
            records_in + records_out - records_total).
  pin       the release is `latest.json` unless `--release` names one; its files are immutable, cached under
            cache/obis/<release>/, and listed with their sha256 in om:provenance.sources.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
from collections import defaultdict
from pathlib import Path

import pyarrow.parquet as pq

from om_indicators import __version__, contract
from om_indicators.adapters import erddap_places as ep

ROOT = "https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/obis-h3/"
PRODUCER = {"name": "obisindicators", "url": "https://github.com/marinebon/obisindicators"}
LICENSE = "CC-BY-4.0"
ADAPTER = "om_indicators.adapters.obis"
GAZETTEER_INDEX = ep._child(ep._join(ep.DEFAULT_BASE, "../"), "index/places_index.parquet")
CITATION = ("OBIS (2026) Ocean Biodiversity Information System. Intergovernmental Oceanographic Commission of UNESCO. "
            "https://obis.org")

# metric -> (column in the release parquet, unit)
METRICS = {
  "records": ("n", "records"), "species": ("sp", "species"), "shannon": ("shannon", "1"), "simpson": ("simpson", "1"),
  "es50": ("es", "species"), "hill1": ("hill_1", "1"), "hill2": ("hill_2", "1"), "bp": ("bp", "1"),
  "density": ("density", "records km-2"),
}
# the release's eov value -> the slug in the indicator id (None: all taxa)
EOVS = {
  "all": None, "fish": "fish", "hardCorals": "hard-corals", "mangroves": "mangroves", "marineMammals": "marine-mammals",
  "seaTurtles": "sea-turtles", "seabirds": "seabirds", "seagrasses": "seagrasses",
}


def indicator_id(metric: str, eov: str) -> str:
  """obis:<metric> for all taxa, obis:<metric>:<eov-slug> for an EOV (eov as the release writes it, e.g. hardCorals)."""
  if metric not in METRICS:
    raise ValueError(f"unknown metric {metric!r}")
  if eov not in EOVS:
    raise ValueError(f"unknown eov {eov!r} (expected one of {sorted(EOVS)})")
  return f"obis:{metric}" + (f":{EOVS[eov]}" if EOVS[eov] else "")


def all_indicator_ids() -> list[str]:
  return [indicator_id(m, e) for e in EOVS for m in METRICS]


# rows (pure) ----
def place_rows(years: list[dict], indicators: list[dict], coll: str, snapshot_year: int) -> dict[str, list[dict]]:
  """contract rows by indicator id from the rows of years.parquet and indicators.parquet. the snapshot's own year is
  incomplete and dropped; decade rows (decade not null) and the all-years row (decade null) come from `indicators`."""
  out: dict[str, list[dict]] = defaultdict(list)

  def add(r: dict, grain: str, time: dt.date | None) -> None:
    for metric, (col, unit) in METRICS.items():
      out[indicator_id(metric, r["eov"])].append({
        "place_id": r["place_id"], "coll": coll, "indicator": indicator_id(metric, r["eov"]), "time_grain": grain,
        "time": time, "class": None, "value": ep._finite(r[col]), "n": ep._finite(r["n"]), "sd": None,   # records, not cells: no cell SD
        "unit": unit})

  for r in years:
    if r["year"] < snapshot_year:
      add(r, "year", dt.date(r["year"], 1, 1))
  for r in indicators:
    if r["decade"] is None:
      add(r, "all", None)
    else:
      add(r, "decade", dt.date(r["decade"], 1, 1))
  return dict(out)


def overlap_note(coll: str, info: dict) -> str:
  """the double-counting rule with the numbers of release.json's place_exact entry for `coll`."""
  # records_in counts a record once per place it falls in: the surplus over the distinct records is what the
  # overlaps add to a sum of place totals (a record in three places adds two)
  surplus = info["records_in"] + info["records_out"] - info["records_total"]
  where = (f"{info['overlaps']:,} locations fall in more than one place, adding {surplus:,} to a sum of the place totals in {coll}" if info["overlaps"]
           else f"no overlaps in {coll}")
  return ("a record counts in every place whose polygon contains it (Marine Regions joint regimes overlap their parties' "
          f"200 NM zones; {where}); totals across places therefore exceed the distinct records and are never summed")


def method(coll: str, info: dict, snapshot: str) -> str:
  year = snapshot[:4]
  return (f"exact point-in-polygon on the OBIS snapshot of {snapshot}: each place's indicators are computed from the "
          "occurrence records inside its true polygon (no H3 binning), per year, per decade and over all years; EOV "
          "membership follows the IOOS Marine Life Data Network taxonomy seeds. "
          f"{overlap_note(coll, info)}. The snapshot year {year} is incomplete and is not published as a year; the "
          "decade containing it runs to the snapshot date")


def dataset_meta() -> dict:
  """OBIS as provenance.dataset (contract 1.1)."""
  return {
    "id": "obis", "title": "OBIS occurrence data", "via": "https://obis.org",
    "providers": [
      {"name": "Ocean Biodiversity Information System (OBIS)", "roles": ["producer", "licensor"], "url": "https://obis.org"},
      {"name": "obisindicators", "roles": ["processor"], "url": "https://github.com/marinebon/obisindicators"},
    ],
    "license": "various", "citation": CITATION, "doi": None,
  }


# i/o ----
def resolve_release(release: str | None, fetcher: ep.Fetcher, root: str = ROOT) -> tuple[str, str, dict | None]:
  """(release id, its base URL/dir with a trailing slash, latest.json or None when a release was named)."""
  if release:
    return release, ep._child(root, release) + "/", None
  latest = fetcher.read_json(ep._child(root, "latest.json"))
  base = latest["base"]
  return latest["release"], base if base.endswith("/") else base + "/", latest


def _fetch(f: ep.Fetcher, url: str, dest: Path) -> tuple[Path, str]:
  """a local copy of an immutable release file and its sha256."""
  local = ep._local(url)
  if local is not None:
    path = local
  else:
    path = dest
    if not path.exists():
      path.parent.mkdir(parents=True, exist_ok=True)
      tmp = path.with_suffix(path.suffix + ".tmp")
      tmp.write_bytes(f.read_bytes(url))
      tmp.replace(path)
  return path, hashlib.sha256(path.read_bytes()).hexdigest()


def run(out: Path, release: str | None = None, cache: Path = Path("cache/obis"), root: str = ROOT,
        index: str | Path | None = None, only: list[str] | None = None) -> dict:
  """write one values file per (indicator, place collection) of the release's place_exact layer under `out`; `only`
  limits the run to these indicator ids."""
  f = ep.Fetcher(Path(cache))
  rel, base, latest = resolve_release(release, f, root)
  rel_path, rel_sha = _fetch(f, base + "release.json", Path(cache) / rel / "release.json")
  rj = json.loads(rel_path.read_text())
  if rj.get("release") != rel:
    raise ValueError(f"{base}release.json is release {rj.get('release')!r}, expected {rel!r}")
  layer = rj["layers"].get("place_exact")
  if not layer:
    raise ValueError(f"release {rel} has no place_exact layer (obisindicators 0.9.0 publishes it)")
  snapshot = rj["obis_snapshot"]
  src_release = {"href": base + "release.json", "title": f"obis-h3 {rel} release.json", "updated": rj.get("built_at"),
                 "end_datetime": snapshot, "checksum": "sha256:" + rel_sha, "item": None, "role": "manifest"}
  index_path = Path(index) if index else f.cached(GAZETTEER_INDEX, "places_index", None)

  summary: dict = {"files": [], "release": rel, "obis_snapshot": snapshot, "worms_version": rj.get("worms_version")}
  for coll, info in sorted(layer["collections"].items()):
    srcs, tables = [src_release], {}
    for name in ("years", "indicators"):
      url = f"{base}place_exact/coll={coll}/{name}.parquet"
      path, sha = _fetch(f, url, Path(cache) / rel / f"{coll}_{name}.parquet")
      tables[name] = pq.read_table(path).to_pylist()
      srcs.append({"href": url, "title": f"obis-h3 {rel} place_exact {coll} {name}", "updated": None,
                   "end_datetime": snapshot, "checksum": "sha256:" + sha, "item": None, "role": "data"})
    ep.resolve_places(index_path, {r["place_id"] for r in tables["years"]}, coll)
    by_ind = place_rows(tables["years"], tables["indicators"], coll, int(snapshot[:4]))
    prov = {"producer": {**PRODUCER, "version": rel}, "sources": srcs,
            "source_version": f"OBIS snapshot {snapshot}, WoRMS {rj.get('worms_version')}, obis-h3 {rel}",
            "method": method(coll, info, snapshot), "dataset": dataset_meta(),
            "code": {"name": "om-indicators", "version": __version__, "commit": ep._commit(), "adapter": ADAPTER},
            "license": LICENSE, "created": contract.utc_now()}
    for ind in only or all_indicator_ids():
      rows = by_ind.get(ind)
      if not rows:
        continue
      path = contract.write_values(rows, out, prov)
      summary["files"].append({"indicator": ind, "coll": coll, "path": str(path), "rows": len(rows),
                               "places": len({r["place_id"] for r in rows})})
  return summary
