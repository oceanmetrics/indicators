"""Copernicus Marine place producer: one gazetteer place x one `cmems:<dataset>:<var>:mean` indicator -> month and year rows.

this is a PRODUCER (it computes), not an adapter (adapters only read what is published); the computation itself is
om-extract's Copernicus Marine reader (om_extract/readers/copernicus.py: the windows, the Toolbox subset, the cell-centre
mean, the month and year rows, the provenance), and this module is the request around it: the indicator check, the
polygon, the output folder, index.json and the upload. it exists because
noaa-onms/eco-indicators runs by hand over the sanctuaries only; a maintainer accepts a request for any other place
(issue label `run`, .github/workflows/requests.yml) and this runs on the Mac mini with the maintainer's own Copernicus
Marine login. the output folder is published under s3://oceanmetrics.io-public/indicators/producers/cmems/ and the
adapter om_indicators/adapters/cmems_places.py reads it into the catalog.

  polygon   fetched at run time, never stored in this repo: a vector collection's one row of the published
            gazetteer/<coll>/places.parquet; a reference collection's (Marine Regions, `mr_*`) one row of the build
            machine's private full-resolution copy (`PLACES_INTERNAL`/<coll>/places.parquet, as erddap-places reads it),
            else the publisher's single-feature service in layers.json (`raster.feature_url`). a derived collection
            (fao_high_seas) or a reference one with tiles only needs a maintainer: `NeedsMaintainer`.
  subset    (om-extract) the Copernicus Marine Toolbox, the polygon's bbox buffered by one grid cell, the surface layer only (depth
            0 to 0.51 m, the first level of the BGC multiyear dataset is 0.506 m; noaa-onms/eco-indicators asks 0 to
            0.5), the whole record or --from/--to. a bbox across the antimeridian is split into one window per side
            (`windows()`), as the gazetteer stores such places split at +/-180.
  mean      (om-extract) `cell_means()`: per time step the mean of the cells whose CENTRES fall inside the polygon (boundary
            included), NaN skipped; the spatial SD (n - 1) goes to sd. this is R `terra::extract(r, p, fun = mean,
            na.rm = TRUE)`, the method of eco-indicators, so sanctuary and EEZ values share one method.
  rows      (om-extract) `place_rows()`: the rules of eco_indicators (month = the monthly mean, n = 1, sd; year = the mean of 12
            months, only for complete years, n = 12), through contract.write_values().
  output    <out>/<dataset>/<var>/<place with ':' as '-'>/{data.parquet, provenance.json}, and <out>/index.json (the list
            of everything published, merged with the published one by `merge_index()`).

credentials: the toolbox finds its own login (~/.copernicusmarine/.copernicusmarine-credentials); nothing here reads,
prints or copies it. the scientific stack (copernicusmarine, xarray, shapely, numpy and a NetCDF backend) is the
`cmems` dependency group: `uv sync --group cmems`; it is imported inside the functions that need it.

  uv run --group cmems python -m om_indicators.producers.cmems_place --place MRGID:5670 --coll mr_eez \\
      --indicator cmems:cmems_mod_glo_bgc_my_0.25deg_P1M-m:no3:mean [--out catalog/producers/cmems] [--publish]
  ... --check        resolve the polygon and the windows and print the job size; no Copernicus call, nothing written
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path
from typing import Any, Callable, Sequence

from om_extract.readers import copernicus as om_cm
from om_extract.readers.copernicus import (DEPTH_RANGE, CellSeries, NoCellsError, cell_means, surface, window_cells,
                                           windows)
from om_indicators import __version__, contract
from om_indicators.adapters import eco_indicators as eco
from om_indicators.adapters import erddap_places as ep
from om_indicators.producers import geometry_kind, source_id_of

PRODUCER_NAME = "om-indicators/producers/cmems_place"
MODULE = "om_indicators.producers.cmems_place"
REPO_URL = "https://github.com/oceanmetrics/indicators"
GAZETTEER = "https://storage.oceanmetrics.io/gazetteer/"
LAYERS_URL = GAZETTEER + "index/layers.json"
PUBLIC_BASE = "https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/indicators/producers/cmems/"
DEST = "s3://oceanmetrics.io-public/indicators/producers/cmems"
LICENSE = "CC-BY-4.0"
# the build machine's private copies of the reference collections (the places repo's publish_collections.sh): never
# published, read in place; provenance names the product's DOI, not this path
PLACES_INTERNAL = Path(os.environ.get("PLACES_INTERNAL") or Path.home() / "data" / "oceanmetrics" / "places-internal")
MAX_VALUES = om_cm.MAX_VALUES      # grid values of one job (cells of the windows x time steps) before --max-values
PLACE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*:[A-Za-z0-9_.\-]+$")
SLUG_RE = re.compile(r"^[a-z0-9_]+$")
INDICATOR_RE = re.compile(r"^cmems:([A-Za-z0-9_.\-]+):([A-Za-z0-9_.\-]+):mean$")
METHOD = (
  "Monthly mean of the cells of a Copernicus Marine Service product whose centres fall inside the place polygon, at the "
  "surface level (0 to 0.51 m), computed on request with the Copernicus Marine Toolbox by "
  "om_indicators.producers.cmems_place (the method of noaa-onms/eco-indicators: terra::extract mean over the polygon, "
  "with the cell SD in sd). A year is the mean of its 12 monthly means, written only when all 12 months have a value.")


class NeedsMaintainer(RuntimeError):
  """a place whose polygon cannot be fetched at run time (derived layer, tiles-only reference layer)."""


# ---- the request, checked ----

def parse_indicator(indicator: str) -> tuple[str, str]:
  """(dataset id, variable) of a `cmems:<dataset>:<var>:mean` indicator we publish (eco_indicators.DATASETS); else ValueError."""
  m = INDICATOR_RE.match(indicator or "")
  if not m:
    raise ValueError(f"{indicator!r} is not a cmems:<dataset>:<variable>:mean indicator id")
  dataset, var = m.groups()
  if not eco.keep(dataset, var):
    raise ValueError(f"{indicator} is not an indicator of the catalog: {dataset} / {var} is not in eco_indicators.DATASETS")
  return dataset, var


def place_slug(place_id: str) -> str:
  """the folder name of a place: its ':' as '-' (`MRGID:5670` -> `MRGID-5670`)"""
  return place_id.replace(":", "-")


# ---- the polygon (network, injectable) ----

def read_wkb(url: str, place_id: str) -> bytes:
  """the WKB of one place of a published places.parquet: DuckDB reads only the matching row group over HTTP range requests."""
  import duckdb
  con = duckdb.connect()
  for expr in ("ST_AsWKB(geometry)", "geometry"):     # DuckDB 1.5 has a GEOMETRY type; 1.4 reads a WKB blob
    try:
      r = con.execute(f"SELECT {expr} FROM read_parquet(?) WHERE place_id = ?", [url, place_id]).fetchall()
      break
    except Exception as e:  # noqa: BLE001 -- the first expression fails on a DuckDB without the GEOMETRY type
      last = e
  else:
    raise RuntimeError(f"cannot read {place_id} from {url}: {last}")
  if len(r) != 1:
    raise ValueError(f"{place_id} resolves to {len(r)} rows in {url}, expected exactly 1")
  return bytes(r[0][0])


def feature_url(template: str, place_id: str) -> str:
  """the publisher's request for one feature: `{source_id}` replaced by the percent-encoded id"""
  return template.replace("{source_id}", urllib.parse.quote(source_id_of(place_id), safe=""))


def fetch_geometry(place_id: str, layer: dict | None, *, wkb_reader: Callable[[str, str], bytes] = read_wkb,
                   http_get: Callable[..., Any] | None = None, internal_dir: Path | None = None) -> tuple[Any, dict]:
  """(the place polygon as a shapely geometry, where it came from). raises NeedsMaintainer for a layer whose polygon
  is not fetchable at run time. a reference collection is read from the private copy in `internal_dir` (default
  PLACES_INTERNAL) when this machine holds it: the same geometry erddap-places masks with and the gazetteer's derived
  tables are built from; its provenance link is the product (`raster.link`, the DOI), never the local path."""
  import shapely
  import shapely.geometry
  kind = geometry_kind(layer)
  if kind == "vector":
    url = layer.get("parquet") or f"{GAZETTEER}{layer['collection']}/places.parquet"
    return shapely.from_wkb(wkb_reader(url, place_id)), {"kind": "vector", "url": url}
  if kind == "reference":
    coll = layer.get("collection") or layer.get("slug")
    own = (internal_dir or PLACES_INTERNAL) / coll / "places.parquet"
    if own.exists():
      link = layer["raster"].get("link") or feature_url(layer["raster"]["feature_url"], place_id)
      return shapely.from_wkb(wkb_reader(str(own), place_id)), {"kind": "reference", "url": link, "copy": "internal"}
    import requests
    url = feature_url(layer["raster"]["feature_url"], place_id)
    r = (http_get or requests.get)(url, timeout=120)
    r.raise_for_status()
    feats = r.json().get("features", [])
    if not feats:
      raise ValueError(f"{place_id} is not served by {url}")
    parts = [shapely.geometry.shape(f["geometry"]) for f in feats if f.get("geometry")]
    return shapely.union_all(parts) if len(parts) > 1 else parts[0], {"kind": "reference", "url": url}
  coll = (layer or {}).get("collection") or (layer or {}).get("slug") or "?"
  raise NeedsMaintainer(f"the polygon of {place_id} (collection {coll}) is neither published nor served one place at a time; "
                        "a maintainer has to run it")


# ---- windows, the mean over the cells under the polygon: om_extract.readers.copernicus (windows, window_cells,
# CellSeries, cell_means, surface are imported above) ----

def place_rows(place_id: str, coll: str, indicator: str, unit: str, series: CellSeries) -> list[dict]:
  """month and year contract rows of one place (the rules of eco_indicators: n = 1 and sd per month; a year is the
  mean of 12 months, only when complete)."""
  return om_cm.place_rows(place_id, coll, indicator, unit, series)


# ---- the Copernicus Marine Toolbox (network, injectable) ----

def info_from_catalogue(cat: Any, dataset: str, var: str) -> dict:
  """what the run needs from `copernicusmarine.describe()` (om-extract's), a product without a DOI of its own taking
  eco_indicators.PRODUCT_DOIS"""
  return om_cm.info_from_catalogue(cat, dataset, var, eco.PRODUCT_DOIS)


def dataset_info(dataset: str, var: str) -> dict:
  return om_cm.dataset_info(dataset, var, eco.PRODUCT_DOIS)


def toolbox_subset(dataset: str, var: str, window: tuple[float, float, float, float], start: str | None, end: str | None,
                   workdir: Path, name: str = "w0") -> Any:
  """one window through the Copernicus Marine Toolbox (om-extract's `toolbox_subset()`)"""
  return om_cm.toolbox_subset(dataset, var, window, start, end, workdir, name)


# ---- provenance and the output folder ----

PROCESSOR = {"name": "oceanmetrics/indicators", "roles": ["processor"], "url": REPO_URL}


def dataset_meta(info: dict) -> dict:
  """the Copernicus Marine product as provenance.dataset (om-extract's), with this repo as the processor: the same
  statement eco_indicators makes, so one indicator reads the same wherever its places were computed"""
  return om_cm.dataset_meta(info, PROCESSOR)


def build_provenance(x: om_cm.PlaceExtraction, reader: om_cm.CopernicusReader, polygon: dict, *, created: str,
                     commit: str | None) -> tuple[dict, dict]:
  """(the provenance embedded in the Parquet and the richer provenance.json beside it), om-extract's
  `build_provenance()` naming this producer: its name, code, method and the data title it has always published"""
  return om_cm.build_provenance(
    x, reader, polygon, created=created, producer={"name": PRODUCER_NAME, "url": REPO_URL, "version": commit},
    code={"name": "om-indicators", "version": __version__, "commit": commit, "adapter": MODULE}, processor=PROCESSOR,
    method=METHOD, source_title=f"{reader.dataset_id} {reader.variable}, Copernicus Marine Toolbox {reader.version}",
    contract_version=contract.CONTRACT_VERSION)


def sha256_of(path: Path) -> str:
  return "sha256:" + hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_outputs(out: Path, rows: list[dict], embedded: dict, sidecar: dict) -> dict:
  """validate through the contract, then write <out>/<dataset>/<var>/<place>/{data.parquet, provenance.json}; returns the
  index entry. nothing is written when the rows break the contract."""
  with tempfile.TemporaryDirectory() as tmp:
    made = contract.write_values(rows, tmp, embedded)
    folder = Path(out) / sidecar["dataset_id"] / sidecar["variable"] / place_slug(sidecar["place_id"])
    folder.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(made, folder / "data.parquet")
  sidecar = {**sidecar, "sha256": sha256_of(folder / "data.parquet")}
  (folder / "provenance.json").write_text(json.dumps(sidecar, indent=1, sort_keys=True) + "\n")
  rel = folder.relative_to(out).as_posix()
  return {"indicator": sidecar["indicator"], "place_id": sidecar["place_id"], "coll": sidecar["coll"],
          "dataset": sidecar["dataset_id"], "variable": sidecar["variable"], "path": f"{rel}/data.parquet",
          "provenance": f"{rel}/provenance.json", "rows": len(rows), "sha256": sidecar["sha256"],
          "time_range": sidecar["time_range"], "created": sidecar["created"]}


def merge_index(published: dict | None, entries: list[dict], updated: str) -> dict:
  """the index with `entries` upserted by (indicator, place_id, coll); the published entries not touched are kept"""
  keep = {(e["indicator"], e["place_id"], e["coll"]): e for e in (published or {}).get("entries", [])}
  keep.update({(e["indicator"], e["place_id"], e["coll"]): e for e in entries})
  return {"version": 1, "updated": updated, "entries": [keep[k] for k in sorted(keep)]}


def read_index(base: str) -> dict | None:
  """index.json of a producer folder (a URL or directory); None when it is not there yet (S3 answers 403 or 404)"""
  loc = ep._child(base, "index.json")
  try:
    return json.loads(ep.Fetcher(Path(tempfile.gettempdir())).read_bytes(loc))
  except (FileNotFoundError, RuntimeError) as e:
    if isinstance(e, FileNotFoundError) or re.search(r"\b(403|404)\b", str(e)):
      return None
    raise


def publish(out: Path, entries: list[dict], dest: str = DEST, base: str = PUBLIC_BASE, created: str | None = None,
            run: Callable[..., Any] = subprocess.run) -> dict:
  """upload this run's place folders, then the merged index.json last (a reader never follows the index to a file that is
  not there yet), with the host's AWS profile: the repository holds no secrets. the published index is read first and an
  unreadable one stops the run rather than being overwritten."""
  index = merge_index(read_index(base), entries, created or contract.utc_now())
  cc = "public, max-age=300"
  for e in entries:
    for rel, ctype in ((e["path"], "application/vnd.apache.parquet"), (e["provenance"], "application/json")):
      run(["aws", "s3", "cp", str(Path(out) / rel), f"{dest}/{rel}", "--only-show-errors", "--content-type", ctype,
           "--cache-control", cc], check=True)
  Path(out).mkdir(parents=True, exist_ok=True)
  (Path(out) / "index.json").write_text(json.dumps(index, indent=1) + "\n")
  run(["aws", "s3", "cp", str(Path(out) / "index.json"), f"{dest}/index.json", "--only-show-errors", "--content-type",
       "application/json", "--cache-control", cc], check=True)
  return index


# ---- one job ----

def find_layer(layers: dict, coll: str) -> dict | None:
  return next((l for l in layers.get("layers", []) if (l.get("collection") or l.get("slug")) == coll), None)


def load_layers() -> dict:
  import requests
  r = requests.get(LAYERS_URL, timeout=60)
  r.raise_for_status()
  return r.json()


def produce(place_id: str, coll: str, indicator: str, out: Path, *, start: str | None = None, end: str | None = None,
            check: bool = False, max_values: int = MAX_VALUES, layers: dict | None = None,
            geometry: Callable[..., tuple[Any, dict]] = fetch_geometry, info: Callable[[str, str], dict] = dataset_info,
            subset: Callable[..., Any] | None = None, created: str | None = None, commit: str | None = None,
            toolbox_version: str | None = None) -> dict:
  """compute one place x indicator and write its output folder (nothing with `check`: the polygon, the windows and the
  size only). the computation is om-extract's Copernicus reader (`extract_place()`); the network functions are
  parameters so tests run offline. returns a summary with the index `entry`."""
  if not PLACE_RE.match(place_id or "") or not SLUG_RE.match(coll or ""):
    raise ValueError(f"malformed place {place_id!r} or collection {coll!r}")
  dataset, var = parse_indicator(indicator)
  layer = find_layer(layers if layers is not None else load_layers(), coll)
  geom, polygon = geometry(place_id, layer)
  reader = om_cm.CopernicusReader(dataset, var, info=info(dataset, var), subset=subset, version=toolbox_version)
  try:
    x = om_cm.extract_place(reader, place_id, geom, coll, indicator=indicator, start=start, end=end,
                            max_values=max_values, check=check)
  finally:
    reader.close()
  summary = {"place_id": place_id, "coll": coll, "indicator": indicator, "windows": x.windows,
             "grid_cells": x.grid_cells, "time_steps": x.time_steps, "grid_values": x.grid_values, "polygon": polygon}
  if check:
    return summary
  embedded, sidecar = build_provenance(x, reader, polygon, created=created or contract.utc_now(),
                                       commit=commit if commit is not None else ep._commit())
  entry = write_outputs(Path(out), x.rows, embedded, sidecar)
  return {**summary, "entry": entry, "rows": len(x.rows), "cells": x.series.cells}


# ---- the command line ----

def main(argv: Sequence[str] | None = None) -> int:
  ap = argparse.ArgumentParser(prog=f"python -m {MODULE}", description=__doc__.split("\n")[0])
  ap.add_argument("--place", required=True, help="gazetteer place_id, e.g. MRGID:5670")
  ap.add_argument("--coll", required=True, help="the place's gazetteer collection, e.g. mr_eez")
  ap.add_argument("--indicator", required=True, help="cmems:<dataset>:<variable>:mean")
  ap.add_argument("--out", type=Path, default=Path("catalog/producers/cmems"))
  ap.add_argument("--from", dest="start", help="first time step (ISO date); default the whole record")
  ap.add_argument("--to", dest="end", help="last time step (ISO date)")
  ap.add_argument("--publish", action="store_true", help=f"upload the output folder to {DEST}/ (the host's AWS profile)")
  ap.add_argument("--dest", default=DEST, help="the s3:// destination of --publish")
  ap.add_argument("--check", action="store_true", help="resolve the polygon and the windows, print the size; no Copernicus call")
  ap.add_argument("--max-values", type=int, default=MAX_VALUES)
  a = ap.parse_args(argv)
  try:
    s = produce(a.place, a.coll, a.indicator, a.out, start=a.start, end=a.end, check=a.check, max_values=a.max_values)
  except (NeedsMaintainer, NoCellsError, ValueError) as e:
    print(f"cmems_place: {e}", file=sys.stderr)
    return 2
  print(f"{a.place} ({a.coll}) {a.indicator}: polygon from {s['polygon']['kind']} {s['polygon']['url']}")
  print(f"  windows {s['windows']}: {s['grid_cells']:,} grid cells x {s['time_steps']} time steps = {s['grid_values']:,} values")
  if a.check:
    return 0
  print(f"  {s['cells']} cell centres inside the polygon, {s['rows']} rows -> {a.out / s['entry']['path']}")
  if a.publish:
    publish(a.out, [s["entry"]], dest=a.dest)
    print(f"  published {a.dest}/{s['entry']['path']} and index.json")
  return 0


if __name__ == "__main__":
  sys.exit(main())
