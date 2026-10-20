"""eco-indicators adapter: long-record Copernicus Marine means over the sanctuaries -> month and year contract rows.

reads the published outputs of the public repo noaa-onms/eco-indicators at one pinned commit:

  data/copernicus.csv             nms,dataset,var,time,stat,value   monthly polygon `mean` and spatial `sd` per sanctuary
  data/copernicus_variables.csv   dataset_id,product_id,product_title,variable,units,...   titles and units

the means were made by that repo's copernicus.qmd (terra::extract mean over each sanctuary polygon of the Copernicus
Marine grid; polygons are noaa-onms/climate-dashboard's sanctuaries.rds). indicators:

  cmems:<dataset_id>:<var>:mean   var cleaned of its depth suffix (`thetao_depth=0.49402499` -> `thetao`), coll `places`

rules (each one a named function below, each tested):

  places     `place_id()`: eco-indicators' NMS code -> the gazetteer id `NMS:<code>`, with CPNMS (Chumash Proposed
             Action) mapped to NMS:CHNMS (Chumash Heritage); the Monterey Bay sub-areas MBNMS-david and MBNMS-main are
             dropped (`DROPPED`); any other code raises, so a new sanctuary is a decision, not a silent loss.
  variables  `DATASETS`: the physics, biogeochemistry and plankton variables kept, per dataset. the myint (interim)
             physics dataset duplicates the my record and is dropped, as are the `*_uncertainty` and `flags` variables.
  month      `month_rows()`: value = the monthly mean, n = 1, x_sd = the spatial SD; a month with no mean gets no row.
  year       `year_rows()`: only for years with all 12 month rows; value = mean of the 12 monthly means, n = 12.
  pin        `resolve_commit()`: the latest commit on main that touched data/copernicus.csv (GitHub API, unauthenticated),
             else `--ref`; the files are fetched at that sha (immutable, cached under cache/eco-indicators/<sha>/) and
             their sha256 and the commit date go to om:provenance.sources.
"""
from __future__ import annotations

import csv
import datetime as dt
import hashlib
import io
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable

from om_indicators import __version__, contract
from om_indicators.adapters import erddap_places as ep

REPO = "noaa-onms/eco-indicators"
REPO_URL = f"https://github.com/{REPO}"
RAW = f"https://raw.githubusercontent.com/{REPO}"
API_COMMITS = f"https://api.github.com/repos/{REPO}/commits"
PATH_VALUES = "data/copernicus.csv"
PATH_VARIABLES = "data/copernicus_variables.csv"
COLL = "places"
LICENSE = "CC-BY-4.0"
ADAPTER = "om_indicators.adapters.eco_indicators"
CMEMS_LICENCE = "https://marine.copernicus.eu/user-corner/service-commitments-and-licence"
GAZETTEER_INDEX = ep._child(ep._join(ep.DEFAULT_BASE, "../"), "index/places_index.parquet")

# eco-indicators' NMS code -> gazetteer place_id. the polygons are climate-dashboard's, matched to the gazetteer by
# code. CPNMS is "Chumash Proposed Action" in eco-indicators' sanctuaries.geojson, which the gazetteer names Chumash
# Heritage National Marine Sanctuary (NMS:CHNMS).
PLACE_IDS = {
  "CBNMS": "NMS:CBNMS", "CINMS": "NMS:CINMS", "CPNMS": "NMS:CHNMS", "FGBNMS": "NMS:FGBNMS", "FKNMS": "NMS:FKNMS",
  "GFNMS": "NMS:GFNMS", "GRNMS": "NMS:GRNMS", "HIHWNMS": "NMS:HIHWNMS", "MBNMS": "NMS:MBNMS", "MNMS": "NMS:MNMS",
  "NMSAS": "NMS:NMSAS", "OCNMS": "NMS:OCNMS", "SBNMS": "NMS:SBNMS",
}
# sub-areas of Monterey Bay that the gazetteer does not have (the whole sanctuary is MBNMS)
DROPPED = frozenset({"MBNMS-david", "MBNMS-main"})

# dataset id -> the variables kept (cleaned names). myint (2021-07 to 2024-12) duplicates the my record.
DATASETS = {
  "cmems_mod_glo_phy_my_0.083deg_P1M-m": ("thetao", "bottomT", "so", "mlotst"),
  "cmems_obs-oc_glo_bgc-plankton_my_l4-multi-4km_P1M": (
    "CHL", "DIATO", "DINO", "GREEN", "HAPTO", "MICRO", "NANO", "PICO", "PROCHLO", "PROKAR"),
  "cmems_obs-oc_glo_bgc-pp_my_l4-multi-4km_P1M": ("PP",),
  "cmems_mod_glo_bgc_my_0.25deg_P1M-m": ("chl", "fe", "no3", "nppv", "o2", "ph", "phyc", "po4", "si", "spco2"),
}
# the product DOIs (DataCite, checked 2026-10-20 against the product titles of copernicus_variables.csv); the CSV and
# eco-indicators' copernicus.bib (papers only) carry none
PRODUCT_DOIS = {
  "GLOBAL_MULTIYEAR_PHY_001_030": "https://doi.org/10.48670/moi-00021",
  "OCEANCOLOUR_GLO_BGC_L4_MY_009_104": "https://doi.org/10.48670/moi-00281",
  "GLOBAL_MULTIYEAR_BGC_001_029": "https://doi.org/10.48670/moi-00019",
}
PRODUCER_NAME = REPO
METHOD = (
  "monthly means over each sanctuary polygon of Copernicus Marine Service products, extracted by noaa-onms/eco-indicators "
  "(copernicus.qmd: terra::extract mean over the polygon, with the spatial SD); the polygons are noaa-onms/climate-dashboard's "
  "sanctuaries.rds, matched to gazetteer ids by NMS code (CPNMS, Chumash Proposed Action, to NMS:CHNMS; the Monterey Bay "
  "sub-areas are dropped). month = the monthly mean (n = 1, x_sd = the spatial SD); year = the mean of the 12 monthly "
  f"means, written only for years with all 12 months. Copernicus Marine Service licence: {CMEMS_LICENCE}")


# rules (pure) ----
def place_id(nms: str) -> str | None:
  """the gazetteer place_id of an eco-indicators NMS code; None for the dropped sub-areas; raises on an unknown code."""
  if nms in DROPPED:
    return None
  if nms not in PLACE_IDS:
    raise ValueError(f"unknown sanctuary code {nms!r}: map it to a gazetteer id in PLACE_IDS or list it in DROPPED")
  return PLACE_IDS[nms]


def clean_var(var: str) -> str:
  """the variable without its depth suffix: `thetao_depth=0.49402499` -> `thetao`."""
  return re.sub(r"_depth=[0-9.]+$", "", var)


def indicator_id(dataset: str, var: str) -> str:
  return f"cmems:{dataset}:{var}:mean"


def keep(dataset: str, var: str) -> bool:
  """whether a (dataset, cleaned variable) is one we publish."""
  return var in DATASETS.get(dataset, ())


def _date(t: str) -> dt.date:
  """a timestamp such as 1993-01-01T00:00:00Z -> the first day of its month."""
  return contract.period_start("month", dt.date.fromisoformat(t[:10]))


def _num(v: Any) -> float | None:
  return ep._finite(v) if v not in (None, "", "NA") else None


def read_means(text: str) -> dict[tuple[str, str, str], dict[str, dict[dt.date, float | None]]]:
  """copernicus.csv -> {(nms, dataset, cleaned var): {"mean": {month: value}, "sd": {month: value}}} for the variables we keep."""
  out: dict = defaultdict(lambda: {"mean": {}, "sd": {}})
  for r in csv.DictReader(io.StringIO(text)):
    var = clean_var(r["var"])
    if not keep(r["dataset"], var) or r["stat"] not in ("mean", "sd"):
      continue
    out[(r["nms"], r["dataset"], var)][r["stat"]][_date(r["time"])] = _num(r["value"])
  return dict(out)


def month_rows(pid: str, ind: str, unit: str, mean: dict[dt.date, float | None], sd: dict[dt.date, float | None],
               coll: str = COLL) -> list[dict]:
  """month rows of one place and variable: value = the monthly mean, n = 1, x_sd = the spatial SD; no row without a mean.
  `coll` is the sanctuaries' `places` here; the place producer (om_indicators/producers/cmems_place.py) shares these rules
  for any other collection."""
  return [{"place_id": pid, "coll": coll, "indicator": ind, "time_grain": "month", "time": m, "class": None,
           "value": v, "n": 1.0, "unit": unit, "x_sd": sd.get(m)}
          for m, v in sorted(mean.items()) if v is not None]


def year_rows(pid: str, ind: str, unit: str, months: list[dict], coll: str = COLL) -> list[dict]:
  """year rows: only years with all 12 month rows; value = the mean of the 12 monthly means, n = 12."""
  return [{"place_id": pid, "coll": coll, "indicator": ind, "time_grain": "year", "time": y["time"], "class": None,
           "value": y["value"], "n": y["n"], "unit": unit, "x_sd": None}
          for y in ep.year_rows(months)]


def dataset_meta(product_id: str, title: str) -> dict:
  """the Copernicus Marine product as provenance.dataset (contract 1.1); titles come from copernicus_variables.csv."""
  doi = PRODUCT_DOIS.get(product_id)
  return {
    "id": product_id, "title": title, "via": REPO_URL,
    "providers": [
      {"name": "Copernicus Marine Service (Mercator Ocean International)", "roles": ["producer", "licensor"],
       "url": "https://marine.copernicus.eu"},
      {"name": REPO, "roles": ["processor"], "url": REPO_URL},
    ],
    "license": "other",
    "citation": f"E.U. Copernicus Marine Service Information; {title}; {doi}" if doi else f"E.U. Copernicus Marine Service Information; {title}",
    "doi": doi,
  }


def read_variables(text: str) -> dict[tuple[str, str], dict]:
  """copernicus_variables.csv -> {(dataset_id, variable): row}"""
  return {(r["dataset_id"], r["variable"]): r for r in csv.DictReader(io.StringIO(text))}


def indicator_rows(means: dict, variables: dict[tuple[str, str], dict]) -> dict[str, dict]:
  """per indicator id: {"rows", "dataset" (provenance.dataset), "places"} from read_means() and read_variables()."""
  out: dict[str, dict] = {}
  for (nms, dataset, var), s in sorted(means.items()):
    pid = place_id(nms)
    if pid is None:
      continue
    meta = variables.get((dataset, var))
    if meta is None:
      raise ValueError(f"{dataset}/{var} is not in copernicus_variables.csv")
    if not meta.get("units"):
      raise ValueError(f"{dataset}/{var} has no units in copernicus_variables.csv")
    ind = indicator_id(dataset, var)
    months = month_rows(pid, ind, meta["units"], s["mean"], s["sd"])
    e = out.setdefault(ind, {"rows": [], "dataset": dataset_meta(meta["product_id"], meta["product_title"])})
    e["rows"] += months + year_rows(pid, ind, meta["units"], months)
  return out


# i/o ----
def resolve_commit(ref: str | None, fetcher: ep.Fetcher, api: str = API_COMMITS) -> tuple[str, str | None]:
  """(sha, commit date). without `ref`: the latest commit on main that touched data/copernicus.csv (the GitHub API,
  unauthenticated); when the API fails, `ref` is the fallback and, without it, the error says to pass --ref."""
  try:
    url = f"{api}/{ref}" if ref else f"{api}?sha=main&path={PATH_VALUES}&per_page=1"
    c = json.loads(fetcher.read_bytes(url))
    c = c[0] if isinstance(c, list) else c
    return c["sha"], c["commit"]["committer"]["date"]
  except (RuntimeError, KeyError, IndexError, ValueError) as e:
    if not ref:
      raise RuntimeError(f"cannot find the latest commit of {PATH_VALUES} ({e}); pass --ref <sha>") from e
    return ref, None


def run(out: Path, ref: str | None = None, cache: Path = Path("cache/eco-indicators"), raw: str = RAW,
        index: str | Path | None = None, resolve: Callable = resolve_commit) -> dict:
  """write month and year values files under `out` from noaa-onms/eco-indicators at the pinned commit; returns a summary.
  `raw` is the base URL (or directory) holding <sha>/<path>; `index` the gazetteer places_index.parquet (default: the
  published one)."""
  f = ep.Fetcher(Path(cache))
  sha, date = resolve(ref, f)
  texts: dict[str, str] = {}
  sources = []
  for path in (PATH_VALUES, PATH_VARIABLES):
    url = f"{raw}/{sha}/{path}" if raw.startswith("http") else str(Path(raw) / sha / path)
    cached = Path(cache) / sha / Path(path).name
    if not cached.exists():
      cached.parent.mkdir(parents=True, exist_ok=True)
      cached.write_bytes(f.read_bytes(url))
    data = cached.read_bytes()
    texts[path] = data.decode()
    sources.append({"href": url, "title": f"{REPO} {path}", "updated": date, "end_datetime": None,
                    "checksum": "sha256:" + hashlib.sha256(data).hexdigest()})

  inds = indicator_rows(read_means(texts[PATH_VALUES]), read_variables(texts[PATH_VARIABLES]))
  index_path = Path(index) if index else f.cached(GAZETTEER_INDEX, "places_index", None)
  ep.resolve_places(index_path, {r["place_id"] for e in inds.values() for r in e["rows"]})

  summary: dict = {"files": [], "ref": sha, "commit_date": date}
  for ind, e in sorted(inds.items()):
    prov = {"producer": {"name": PRODUCER_NAME, "url": REPO_URL, "version": sha}, "sources": sources,
            "source_version": f"{REPO} {sha[:7]}" + (f", {date[:10]}" if date else ""), "method": METHOD,
            "dataset": e["dataset"],
            "code": {"name": "om-indicators", "version": __version__, "commit": ep._commit(), "adapter": ADAPTER},
            "license": LICENSE, "created": contract.utc_now()}
    path = contract.write_values(e["rows"], out, prov)
    summary["files"].append({"indicator": ind, "coll": COLL, "path": str(path), "rows": len(e["rows"]),
                             "places": len({r["place_id"] for r in e["rows"]})})
  return summary
