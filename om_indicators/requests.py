"""indicator requests (plan §4, Phase 6): a public GitHub issue from the form `.github/ISSUE_TEMPLATE/indicator-request.yml`
becomes a label and a comment, and a small known job runs by itself on the macmini runner.

- **parse:** the issue body as GitHub renders a form (`### <label>` then the value; `_No response_` when empty).
- **classify:** against the published manifest, the gazetteer (layers.json and the places index) and the dataset's
  STAC grid. `auto` = an erddap-places indicator of the manifest, one place of a public vector collection, and under
  50 M grid values (the bbox slab the precompute fetches × the time steps of the whole record); `already` = the place
  has values for it now; anything else `needs-review`, with the reason in words.
- **approvable:** a `needs-review` request that a maintainer can accept with the `run` label because a producer exists
  for it: a Copernicus Marine (`cmems:`) indicator of the manifest at a place whose polygon can be fetched at run time
  (a vector collection, or a reference collection with a feature service) and a job under 10 M grid values. It is never
  run by itself (the producer uses a maintainer's own Copernicus Marine login); the sanctuaries (`places`) are
  noaa-onms/eco-indicators' and stay with a maintainer.
- **never trust the issue:** every value that reaches a command is checked against a strict pattern and against the
  published lists here, again in the job, and passed as data (environment, JSON), never spliced into a shell line.
  The requester's email never goes into the issue: the form says so, and nothing here reads one.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import re
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable

from om_indicators.producers import geometry_kind

GAZETTEER = "https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/"
CATALOG = "https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/indicators/"
VIEWER = "https://oceanmetrics.io/indicators/"
# the mockup's rule for a job that may run without a maintainer (Ben, 2026-10-19)
MAX_AUTO_VALUES = 50_000_000
# the Copernicus Marine place producer, run by a maintainer: the grid values (buffered bbox cells × time steps) it accepts.
# a 40° × 40° box of the ¼° global products is 10 M; Albania's EEZ is 44 thousand
MAX_CMEMS_VALUES = 10_000_000
CMEMS_PRODUCER = "noaa-onms/eco-indicators"

PLACE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*:[A-Za-z0-9_.\-]+$")
SLUG_RE = re.compile(r"^[a-z0-9_]+$")
INDICATOR_RE = re.compile(r"^[a-z][a-z0-9_]*:[A-Za-z0-9_.\-]+(:[A-Za-z0-9_.\-]+)*$")

# the form's labels, as GitHub renders them, to the field ids
FIELDS = {"Place": "place", "Collection": "collection", "Indicator": "indicator", "Time range": "time",
          "Time grain": "grain", "Purpose": "purpose"}


# ---- parse ----

def parse_issue_form(body: str) -> dict[str, str]:
  """the fields of an issue form body: `### Label` headings, each followed by its value; `_No response_` is empty"""
  out: dict[str, str] = {}
  parts = re.split(r"^###\s+(.+?)\s*$", body or "", flags=re.M)
  for label, value in zip(parts[1::2], parts[2::2]):
    key = FIELDS.get(label.strip())
    if not key:
      continue
    v = value.strip()
    out[key] = "" if v == "_No response_" else v
  return out


# ---- the request, checked ----

@dataclass
class Triage:
  label: str                      # auto | already | needs-review
  reasons: list[str] = field(default_factory=list)
  job: dict[str, str] | None = None
  estimate: int | None = None
  links: dict[str, str] = field(default_factory=dict)
  approvable: bool = False        # needs-review, but a maintainer can accept it with the `run` label


def _first_token(s: str) -> str:
  """the first word of a field, without backticks: people paste `NMS:CINMS` or "NMS:CINMS (Channel Islands)" """
  s = (s or "").strip().strip("`").split()
  return s[0].strip("`,;") if s else ""


def time_steps(step: str, start: dt.date, end: dt.date) -> int:
  """the number of time steps of an ISO 8601 step (P1D, P8D, P1M, P1Y …) from start to end, inclusive"""
  m = re.fullmatch(r"P(\d+)([DMY])", step or "")
  if not m:
    raise ValueError(f"unknown time step {step!r}")
  n, unit = int(m.group(1)), m.group(2)
  if unit == "D":
    return (end - start).days // n + 1
  months = (end.year - start.year) * 12 + end.month - start.month
  return (months // (12 * n) if unit == "Y" else months // n) + 1


def grid_cells(bbox: dict[str, float], dlon: float, dlat: float) -> int:
  """cells of a regular grid inside a bbox (what the precompute fetches before it masks by the polygon)"""
  width = bbox["xmax"] - bbox["xmin"]
  if width < 0:                                     # a bbox across ±180 (RFC 7946: west > east)
    width += 360
  # ceil, but a span that is a whole number of cells up to float noise (0.85 / 0.05 = 17.000000000000004) is that number
  cells = lambda span, step: max(1, math.ceil(span / step - 1e-9))
  return cells(width, dlon) * cells(bbox["ymax"] - bbox["ymin"], dlat)


def estimate_values(bbox: dict[str, float], dims: dict[str, Any], today: dt.date) -> int:
  """grid values of the whole record for one place: cells in its bbox × time steps (the STAC cube:dimensions)"""
  lon = dims.get("longitude") or dims.get("lon") or dims.get("x")
  lat = dims.get("latitude") or dims.get("lat") or dims.get("y")
  tim = dims.get("time")
  if not (lon and lat and tim and lon.get("step") and lat.get("step")):
    raise ValueError("the dataset's grid steps are unknown")
  start = dt.date.fromisoformat(str(tim["extent"][0])[:10])
  end_s = tim["extent"][1]
  end = dt.date.fromisoformat(str(end_s)[:10]) if end_s else today
  return grid_cells(bbox, abs(float(lon["step"])), abs(float(lat["step"]))) * time_steps(tim.get("step", "P1D"), start, end)


def cmems_grid_step(dataset_id: str) -> float:
  """the grid step in degrees of a Copernicus Marine dataset, from its id (`…_0.25deg_…`, `…-4km_…`); the producer reads
  the real step from the catalogue at run time, this is the triage's estimate"""
  m = re.search(r"_(\d+(?:\.\d+)?)deg_", dataset_id)
  if m:
    return float(m.group(1))
  m = re.search(r"[-_](\d+(?:\.\d+)?)km_", dataset_id)
  if m:
    return float(m.group(1)) / 111.32
  raise ValueError(f"the grid step of {dataset_id} is not in its id")


def estimate_cmems_values(bbox: dict[str, float], dataset_id: str, time_range: list | None) -> int:
  """grid values the place producer fetches: the cells of the bbox buffered by one cell × the time steps of the record
  (the step from the dataset id: `…_P1M-m` is monthly; the record from the manifest's time_range)"""
  step = cmems_grid_step(dataset_id)
  m = re.search(r"_(P\d+[DMY])(?:[-_]|$)", dataset_id)
  if not m or not time_range or not time_range[0] or not time_range[1]:
    raise ValueError("the dataset's time step or record is unknown")
  grown = {"xmin": bbox["xmin"] - step, "xmax": bbox["xmax"] + step, "ymin": bbox["ymin"] - step, "ymax": bbox["ymax"] + step}
  steps = time_steps(m.group(1), dt.date.fromisoformat(str(time_range[0])[:10]), dt.date.fromisoformat(str(time_range[1])[:10]))
  return grid_cells(grown, step, step) * steps


def _classify_cmems(ind: dict, ind_id: str, place: str, coll: str, row: dict, layers: dict, reasons: list[str],
                    links: dict[str, str]) -> Triage:
  """a Copernicus Marine indicator: never automatic (the producer uses a maintainer's login), approvable when the
  producer can do it"""
  parts = ind_id.split(":")
  if len(parts) != 4 or parts[3] != "mean":
    return Triage("needs-review", reasons + [f"{ind_id} is not a cmems:dataset:variable:mean id"], links=links)
  why = (f"{ind['short']} is a Copernicus Marine dataset: its run uses a personal Copernicus Marine login, so it is not "
         "started automatically")
  if coll == "places":
    return Triage("needs-review", reasons + [why, f"the sanctuaries' Copernicus Marine values come from {CMEMS_PRODUCER}, "
                                                  "which a maintainer reruns"], links=links)
  layer = next((l for l in layers.get("layers", []) if (l.get("collection") or l.get("slug")) == coll), None)
  if geometry_kind(layer) is None:
    return Triage("needs-review", reasons + [why, f"the geometry of {coll} is neither published nor served one place at a time, "
                                                  "so a maintainer has to run it by hand"], links=links)
  try:
    est = estimate_cmems_values(row["bbox"], parts[1], ind.get("time_range"))
  except (ValueError, KeyError, TypeError) as e:
    return Triage("needs-review", reasons + [why, f"the job size could not be estimated ({e})"], links=links)
  if est > MAX_CMEMS_VALUES:
    return Triage("needs-review", reasons + [why, f"about {est / 1e6:,.0f} M grid values, over the {MAX_CMEMS_VALUES // 1_000_000} M limit "
                                                  "for the place producer"], estimate=est, links=links)
  size = f"about {est / 1e6:,.1f} M" if est >= 100_000 else f"{est:,}"
  job = {"dataset": parts[1], "variable": parts[2], "indicator": ind_id, "coll": coll, "place": place}
  return Triage("needs-review", reasons + [why, f"{size} grid values (the place's box and the whole record): small enough for the "
                                                "place producer"], job=job, estimate=est, links=links, approvable=True)


def classify(form: dict[str, str], manifest: dict, layers: dict, place_row: Callable[[str], dict | None],
             dims: Callable[[str], dict], coverage_has: Callable[[str, str, str], bool], today: dt.date) -> Triage:
  """the label and reasons for a parsed request. `place_row(place_id)` → the gazetteer index row (place_id, name,
  collection, bbox …) or None; `dims(stac_url)` → the dataset's cube:dimensions; `coverage_has(place, coll, ind)`."""
  place = _first_token(form.get("place", ""))
  coll = _first_token(form.get("collection", ""))
  ind_id = _first_token(form.get("indicator", ""))
  reasons: list[str] = []
  if not PLACE_RE.match(place):
    return Triage("needs-review", [f"the place {place!r} is not a gazetteer place_id (like NMS:CINMS)"])
  if not INDICATOR_RE.match(ind_id):
    return Triage("needs-review", [f"the indicator {ind_id!r} is not an indicator id of the manifest; a maintainer will look at the dataset you describe"])
  row = place_row(place)
  if row is None:
    return Triage("needs-review", [f"{place} is not in the gazetteer index"])
  if coll and coll != row["collection"]:
    reasons.append(f"{place} is in the collection {row['collection']}, not {coll}; using {row['collection']}")
  coll = row["collection"]
  if not SLUG_RE.match(coll):
    return Triage("needs-review", [f"the collection {coll!r} is not a plain slug"])
  ind = next((i for i in manifest.get("indicators", []) if i["id"] == ind_id), None)
  if ind is None:
    return Triage("needs-review", reasons + [f"{ind_id} is not in the manifest: a new dataset or method needs a maintainer"])
  links = {"place": f"{VIEWER}#view=place&place={place}&coll={coll}&ind={ind_id}"}
  if coverage_has(place, coll, ind_id):
    return Triage("already", reasons + [f"{place} already has values for {ind['short']}"], links=links)
  if ind_id.startswith("cmems:") and ind["producer"]["name"] == CMEMS_PRODUCER:
    return _classify_cmems(ind, ind_id, place, coll, row, layers, reasons, links)
  if ind["producer"]["name"] != "erddap-places":
    return Triage("needs-review", reasons + [f"{ind['short']} comes from {ind['producer']['name']}, which runs only by hand (whole collections, snapshot runs)"], links=links)
  layer = next((l for l in layers.get("layers", []) if (l.get("collection") or l.get("slug")) == coll), None)
  # erddap-places reads a place's polygon from our published parquet (vector) or, for a reference collection such as
  # the Marine Regions EEZs, one feature at a time from the publisher's own service (`raster.feature_url`)
  if geometry_kind(layer) is None:
    return Triage("needs-review", reasons + [f"the geometry of {coll} is neither published nor served one place at a time, so the run needs a maintainer"], links=links)
  parts = ind_id.split(":")
  if len(parts) != 4 or not SLUG_RE.match(parts[1].lower()):
    return Triage("needs-review", reasons + [f"{ind_id} is not an erddap-places dataset:variable:stat id"], links=links)
  try:
    est = estimate_values(row["bbox"], dims(ind["dataset"]["stac"]), today)
  except (ValueError, KeyError, TypeError) as e:
    return Triage("needs-review", reasons + [f"the job size could not be estimated ({e})"], links=links)
  if est > MAX_AUTO_VALUES:
    return Triage("needs-review", reasons + [f"about {est / 1e6:,.0f} M grid values, over the {MAX_AUTO_VALUES // 1_000_000} M limit for an automatic run"], estimate=est, links=links)
  job = {"dataset": parts[1], "variable": parts[2], "indicator": ind_id, "coll": coll, "place": place}
  size = f"about {est / 1e6:,.1f} M" if est >= 100_000 else f"{est:,}"
  return Triage("auto", reasons + [f"{size} grid values: small enough to run by itself"], job=job, estimate=est, links=links)


def check_job(job: dict[str, str]) -> dict[str, str]:
  """the job again, field by field, before it reaches a command (the run job calls this, not the triage's word)"""
  ok = (PLACE_RE.match(job.get("place", "")) and SLUG_RE.match(job.get("coll", "")) and INDICATOR_RE.match(job.get("indicator", ""))
        and re.fullmatch(r"[A-Za-z0-9_.\-]+", job.get("dataset", "")) and re.fullmatch(r"[A-Za-z0-9_\-]+", job.get("variable", "")))
  if not ok:
    raise ValueError(f"refusing a malformed job: {job!r}")
  return {k: job[k] for k in ("dataset", "variable", "indicator", "coll", "place")}


def job_family(job: dict[str, str]) -> str:
  """which producer runs a job, from its indicator id (checked), never from the triage's word: `cmems` = the Copernicus
  Marine place producer (a maintainer-approved request), `erddap` = erddap-places"""
  fam = check_job(job)["indicator"].split(":", 1)[0]
  if fam not in ("cmems", "erddap"):
    raise ValueError(f"no producer runs a {fam!r} job")
  return fam


def item_href(job: dict[str, str]) -> str:
  """the stats item erddap-places writes for a job, relative to the stats folder (its id: dataset_variable_place, the
  place's ':' as '-')"""
  j = check_job(job)
  return f"items/{j['dataset']}_{j['variable']}_{j['place'].replace(':', '-')}.json"


def add_item(items: list[str], href: str) -> list[str]:
  """the requested-items list with `href` in it once, sorted"""
  if not re.fullmatch(r"items/[A-Za-z0-9_.\-]+\.json", href):
    raise ValueError(f"not a stats item href: {href!r}")
  return sorted(set(items) | {href})


def comment(t: Triage, form: dict[str, str], autorun: bool = True) -> str:
  """the bot's comment: what will happen, in words, and why. with autorun off (REQUESTS_AUTORUN not `on`) a small
  request waits for a maintainer's `run` label instead of running by itself."""
  auto = ("This request is small and uses a catalogued dataset, so it will run by itself on the Ocean Metrics runner. "
          "This issue gets a comment with the link when the values are published.") if autorun else (
          "This request is small and uses a catalogued dataset, so it is ready to run on the Ocean Metrics runner. "
          "A maintainer starts it by adding the `run` label; this issue then gets a comment with the link when the "
          "values are published.")
  review = ("This request needs a maintainer, who will reply here. A maintainer can accept it by adding the `run` label; it runs "
            "on Copernicus Marine with the maintainer's account, and this issue then gets a comment with the link when the "
            "values are published.") if t.approvable else "This request needs a maintainer, who will reply here."
  head = {
    "auto": auto,
    "already": "These values exist already.",
    "needs-review": review,
  }[t.label]
  lines = [head, ""] + [f"- {r}" for r in t.reasons]
  if t.links.get("place"):
    lines += ["", f"Place view: {t.links['place']}"]
  return "\n".join(lines).strip() + "\n"


# ---- the network side (the workflow), kept thin ----

def _load_network(manifest_base: str):
  import duckdb
  import requests

  manifest = requests.get(manifest_base + "indicators.json", timeout=60).json()
  layers = requests.get(GAZETTEER + "index/layers.json", timeout=60).json()
  con = duckdb.connect()

  def place_row(pid: str) -> dict | None:
    r = con.execute(f"SELECT place_id, name, collection, bbox FROM read_parquet('{GAZETTEER}index/places_index.parquet') "
                    "WHERE place_id = ? LIMIT 1", [pid]).fetchone()
    return None if r is None else {"place_id": r[0], "name": r[1], "collection": r[2], "bbox": r[3]}

  def dims(url: str) -> dict:
    return requests.get(url, timeout=60).json().get("cube:dimensions", {})

  def coverage_has(place: str, coll: str, ind: str) -> bool:
    n = con.execute(f"SELECT count(*) FROM read_parquet('{manifest_base}coverage.parquet') "
                    "WHERE place_id = ? AND coll = ? AND indicator = ? AND last_value IS NOT NULL", [place, coll, ind]).fetchone()[0]
    return n > 0

  return manifest, layers, place_row, dims, coverage_has


def main(argv: list[str] | None = None) -> int:
  ap = argparse.ArgumentParser(prog="python -m om_indicators.requests")
  sub = ap.add_subparsers(dest="cmd", required=True)
  t = sub.add_parser("triage", help="classify one issue body; writes the triage as JSON and the comment as markdown")
  t.add_argument("--body", type=Path, required=True, help="a file holding the issue body (never the body on the command line)")
  t.add_argument("--out", type=Path, required=True, help="triage JSON")
  t.add_argument("--comment", type=Path, required=True, help="comment markdown")
  t.add_argument("--catalog", default=CATALOG)
  t.add_argument("--autorun", default="on", help="the repo variable REQUESTS_AUTORUN: `on` runs small requests by themselves")
  c = sub.add_parser("check-job", help="re-check a job JSON; prints KEY=value lines for $GITHUB_ENV")
  c.add_argument("job", type=Path)
  ai = sub.add_parser("add-item", help="add a job's stats item to the requested-items list (read from --list, a path or URL)")
  ai.add_argument("job", type=Path)
  ai.add_argument("--list", default=CATALOG + "requests/items.json")
  ai.add_argument("--out", type=Path, required=True)
  a = ap.parse_args(argv)
  if a.cmd == "add-item":
    from om_indicators.adapters.erddap_places import read_extra_items
    items = add_item(read_extra_items(a.list), item_href(json.loads(a.job.read_text())))
    a.out.write_text(json.dumps(items, indent=1) + "\n")
    print(f"{len(items)} requested items")
    return 0
  if a.cmd == "triage":
    form = parse_issue_form(a.body.read_text())
    tri = classify(form, *_load_network(a.catalog), today=dt.date.today())
    a.out.write_text(json.dumps(asdict(tri), indent=2))
    a.comment.write_text(comment(tri, form, autorun=a.autorun == "on"))
    print(tri.label)
    return 0
  raw = json.loads(a.job.read_text())
  job = check_job(raw)
  for k, v in job.items():
    print(f"REQ_{k.upper()}={v}")
  print(f"REQ_FAMILY={job_family(raw)}")
  return 0


if __name__ == "__main__":
  sys.exit(main())
