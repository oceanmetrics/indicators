"""erddap-places adapter: published daily place statistics -> month and year contract rows.

reads the STAC collection `gazetteer/stats` (one item per dataset x variable x place, each pointing at a parquet of
daily rows) and writes one values file per (dataset, variable) through `contract.write_values()`. indicators:

  continuous variable   erddap:<dataset>:<variable>:mean    value = mean_wt (area-weighted daily mean), unit = STAC unit
  categorical variable  erddap:<dataset>:<variable>:share   one row per (period, class), value = area-weighted share
                                                            (frac_area) of the place in that class, unit "1"

period rules (each one a named function below, each tested):

  native step    `native_step()`: the median difference in days between consecutive distinct dates of the file.
                 "monthly or coarser" means a step of 28 days or more (`MONTHLY_STEP`).
  month rows     `month_rows()`: value = mean of the non-null step values whose date falls in the month, n = how many.
                 a month is written only when it is COMPLETE (`month_is_complete()`): every month with a value when the
                 step is monthly or coarser; otherwise the record must cover the whole month, i.e. the file's first
                 date <= month start + (step - 1) days and its last date >= month end - (step - 1) days. so the running
                 current month and a backfill's partial first month are dropped. a month with no value gets no row.
  year rows      `year_rows()`: only for years with all 12 month rows; value = mean of the 12 monthly values (each month
                 weighs the same), n = sum of the monthly n.
  categorical    `class_month_rows()` / `class_year_rows()`: the same rules per class; a class absent on a step counts 0
                 that step (month) or that month (year), and a (period, class) whose share is 0 over the whole period
                 gets no row. the shares of a period sum to 1.
  time           the first day of the period (`contract.period_start`), time_grain 'month' / 'year', coll 'places'.

files with no rows (Monitor NMS, the Great Lakes on ocean products) yield no rows; `run()` lists them in its summary.
the pure period logic works on in-memory lists, apart from the I/O (`Fetcher`, `run`).
"""
from __future__ import annotations

import calendar
import datetime as dt
import json
import math
import os
import statistics
import subprocess
import time as _time
import urllib.parse
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence

import pyarrow.parquet as pq
import requests

from om_indicators import __version__, contract

DEFAULT_BASE = "https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/stats/collection.json"
COLL = "places"
MONTHLY_STEP = 28.0
PRODUCER = {"name": "erddap-places", "url": "https://github.com/oceanmetrics/erddap-places", "version": None}
LICENSE = "CC-BY-4.0"
ADAPTER = "om_indicators.adapters.erddap_places"
METHOD = ("month = mean of the non-null daily (or native-step) area-weighted values in a calendar month, written only when "
          "the record covers the whole month; year = mean of the 12 monthly values, written only for years with all 12 "
          "months. categorical indicators apply the same rules to the area share of each class.")


# periods (pure) ----
def native_step(dates: Iterable[dt.date]) -> float:
  """median difference in days between consecutive distinct dates (1.0 when there are fewer than two dates)."""
  ds = sorted(set(dates))
  if len(ds) < 2:
    return 1.0
  return float(statistics.median((b - a).days for a, b in zip(ds, ds[1:])))


def is_monthly_or_coarser(step: float) -> bool:
  return step >= MONTHLY_STEP


def month_end(month: dt.date) -> dt.date:
  """the last day of the month starting at `month`."""
  return dt.date(month.year, month.month, calendar.monthrange(month.year, month.month)[1])


def month_is_complete(month: dt.date, first: dt.date, last: dt.date, step: float) -> bool:
  """whether a record from `first` to `last` with native `step` covers the month starting at `month`."""
  if is_monthly_or_coarser(step):
    return True
  slack = dt.timedelta(days=step - 1)
  return first <= month + slack and last >= month_end(month) - slack


def _finite(v: Any) -> float | None:
  if v is None:
    return None
  v = float(v)
  return v if math.isfinite(v) else None


def month_rows(series: Iterable[tuple[dt.date, float | None]]) -> list[dict]:
  """complete months of a continuous series [(date, value|None)] -> [{time, value, n}] sorted by time."""
  series = list(series)
  if not series:
    return []
  dates = [d for d, _ in series]
  first, last, step = min(dates), max(dates), native_step(dates)
  by_month: dict[dt.date, list[float]] = defaultdict(list)
  for d, v in series:
    v = _finite(v)
    if v is not None:
      by_month[contract.period_start("month", d)].append(v)
  return [{"time": m, "value": sum(vs) / len(vs), "n": float(len(vs))}
          for m, vs in sorted(by_month.items()) if month_is_complete(m, first, last, step)]


def year_rows(months: Iterable[dict]) -> list[dict]:
  """years with all 12 month rows -> [{time, value, n}]; value = mean of the monthly values, n = sum of monthly n."""
  by_year: dict[int, list[dict]] = defaultdict(list)
  for m in months:
    by_year[m["time"].year].append(m)
  return [{"time": dt.date(y, 1, 1), "value": sum(m["value"] for m in ms) / 12, "n": sum(m["n"] for m in ms)}
          for y, ms in sorted(by_year.items()) if len({m["time"].month for m in ms}) == 12]


def class_month_rows(rows: Iterable[tuple[dt.date, str, float | None]],
                     steps: Iterable[dt.date] | None = None) -> list[dict]:
  """complete months of a categorical series [(date, class, share)] -> [{time, class, value, n}].
  the steps of the file are `steps` (default: the distinct dates of `rows`); a class absent on a step counts 0 there,
  and a (month, class) whose share is 0 over the month gets no row. n = the steps of the month."""
  rows = list(rows)
  step_dates = sorted(set(steps if steps is not None else (d for d, _, _ in rows)))
  if not step_dates:
    return []
  first, last, step = step_dates[0], step_dates[-1], native_step(step_dates)
  steps_in: dict[dt.date, set[dt.date]] = defaultdict(set)
  for d in step_dates:
    steps_in[contract.period_start("month", d)].add(d)
  total: dict[tuple[dt.date, str], float] = defaultdict(float)
  for d, cls, share in rows:
    share = _finite(share)
    if share is not None:
      total[(contract.period_start("month", d), str(cls))] += share
  out = []
  for (m, cls), s in sorted(total.items()):
    if s == 0 or not month_is_complete(m, first, last, step):
      continue
    out.append({"time": m, "class": cls, "value": s / len(steps_in[m]), "n": float(len(steps_in[m]))})
  return out


def class_year_rows(months: Iterable[dict]) -> list[dict]:
  """years with all 12 months -> [{time, class, value, n}]: per class the mean of the 12 monthly shares (a class missing
  from a month counts 0), omitted when 0 over the year; n = sum of the monthly n."""
  month_n: dict[dt.date, float] = {}
  total: dict[tuple[int, str], float] = defaultdict(float)
  for m in months:
    month_n[m["time"]] = m["n"]
    total[(m["time"].year, m["class"])] += m["value"]
  out = []
  for (y, cls), s in sorted(total.items()):
    ms = [t for t in month_n if t.year == y]
    if len(ms) == 12 and s != 0:
      out.append({"time": dt.date(y, 1, 1), "class": cls, "value": s / 12, "n": sum(month_n[t] for t in ms)})
  return out


# contract rows (pure) ----
def continuous_rows(place_id: str, indicator: str, unit: str, series: Iterable[tuple[dt.date, float | None]]) -> list[dict]:
  """month and year contract rows of one place's continuous series."""
  months = month_rows(series)
  out = []
  for grain, rs in (("month", months), ("year", year_rows(months))):
    out += [{"place_id": place_id, "coll": COLL, "indicator": indicator, "time_grain": grain, "time": r["time"],
             "class": None, "value": r["value"], "n": r["n"], "unit": unit} for r in rs]
  return out


def categorical_rows(place_id: str, indicator: str, rows: Iterable[tuple[dt.date, str, float | None]],
                     steps: Iterable[dt.date] | None = None) -> list[dict]:
  """month and year contract rows of one place's categorical series (unit '1')."""
  months = class_month_rows(rows, steps)
  out = []
  for grain, rs in (("month", months), ("year", class_year_rows(months))):
    out += [{"place_id": place_id, "coll": COLL, "indicator": indicator, "time_grain": grain, "time": r["time"],
             "class": r["class"], "value": r["value"], "n": r["n"], "unit": "1"} for r in rs]
  return out


def table_rows(table: Any, place_id: str, indicator: str, unit: str, categorical: bool) -> list[dict]:
  """contract rows of one stats parquet (arrow table with the published columns)."""
  if categorical:
    recs = table.select(["date", "class", "frac_area"]).to_pylist()
    steps = [r["date"] for r in recs]
    return categorical_rows(place_id, indicator, [(r["date"], str(int(r["class"])), r["frac_area"]) for r in recs], steps)
  recs = table.select(["date", "mean_wt"]).to_pylist()
  return continuous_rows(place_id, indicator, unit, [(r["date"], r["mean_wt"]) for r in recs])


# i/o ----
def _is_url(loc: str) -> bool:
  return loc.startswith(("http://", "https://", "file://"))


def _join(file_loc: str, rel: str) -> str:
  """`rel` resolved against the location of a file (an http(s)/file URL or a local path); a trailing '/' is kept."""
  if _is_url(file_loc):
    return urllib.parse.urljoin(file_loc, rel)
  out = os.path.normpath(os.path.join(os.path.dirname(file_loc), rel))
  return out + os.sep if rel.endswith("/") else out


def _child(dir_loc: str, rel: str) -> str:
  """`rel` inside a directory location."""
  if _is_url(dir_loc):
    return urllib.parse.urljoin(dir_loc.rstrip("/") + "/", rel)
  return os.path.normpath(os.path.join(dir_loc, rel))


def _local(loc: str) -> Path | None:
  if loc.startswith("file://"):
    return Path(urllib.request.url2pathname(urllib.parse.urlparse(loc).path))
  return None if _is_url(loc) else Path(loc)


class Fetcher:
  """reads URLs and local paths politely: a timeout, one retry, at most `workers` requests at once; data files are
  cached under `cache` keyed by their published checksum, so a changed `file:checksum` refetches."""

  def __init__(self, cache: Path, timeout: float = 60.0, workers: int = 4):
    self.cache, self.timeout, self.workers = Path(cache), timeout, workers

  def read_bytes(self, loc: str) -> bytes:
    p = _local(loc)
    if p is not None:
      return p.read_bytes()
    last: Exception | None = None
    for attempt in range(2):
      try:
        r = requests.get(loc, timeout=self.timeout)
        if r.status_code >= 500 and attempt == 0:
          _time.sleep(1.0)
          continue
        r.raise_for_status()
        return r.content
      except requests.RequestException as e:
        last = e
        if attempt == 0:
          _time.sleep(1.0)
    raise RuntimeError(f"cannot fetch {loc}: {last}")

  def read_json(self, loc: str) -> dict:
    return json.loads(self.read_bytes(loc))

  def cached(self, loc: str, name: str, checksum: str | None) -> Path:
    """a local copy of `loc`; with a checksum it is kept as <cache>/<name>.<checksum[:16]>.parquet and reused."""
    p = _local(loc)
    if p is not None:
      return p
    dest = self.cache / (f"{name}.{checksum[:16]}.parquet" if checksum else f"{name}.parquet")
    if checksum and dest.exists():
      return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp")
    tmp.write_bytes(self.read_bytes(loc))
    tmp.replace(dest)
    return dest

  def map(self, fn: Callable, items: Sequence) -> list:
    with ThreadPoolExecutor(max_workers=self.workers) as ex:
      return list(ex.map(fn, items))


def resolve_places(index_path: Path, place_ids: Iterable[str], coll: str = COLL) -> None:
  """every place must be exactly one row with collection `coll` in the gazetteer index, else raise naming it."""
  t = pq.read_table(index_path, columns=["place_id", "collection"]).to_pylist()
  count: dict[str, int] = defaultdict(int)
  for r in t:
    if r["collection"] == coll:
      count[r["place_id"]] += 1
  for pid in sorted(set(place_ids)):
    if count[pid] != 1:
      raise ValueError(f"place_id {pid!r} resolves to {count[pid]} rows with collection {coll!r} in the gazetteer index, "
                       "expected exactly 1")


def _commit() -> str | None:
  try:
    r = subprocess.run(["git", "rev-parse", "HEAD"], cwd=Path(__file__).resolve().parent, capture_output=True,
                       text=True, timeout=10)
    return r.stdout.strip() or None if r.returncode == 0 else None
  except (OSError, subprocess.SubprocessError):
    return None


def indicator_id(dataset: str, variable: str, categorical: bool) -> str:
  return f"erddap:{dataset}:{variable}:{'share' if categorical else 'mean'}"


def data_location(item_loc: str, item: dict, stats_dir: str) -> str:
  """where an item's parquet is. the asset href, unless it leaves the stats directory (the published items point two
  levels up, at gazetteer/<dataset>/..., which does not exist), then the documented path
  stats/<dataset>/<variable>/<place_id>.parquet."""
  p = item["properties"]
  href = item.get("assets", {}).get("data", {}).get("href")
  if href:
    loc = _join(item_loc, href)
    if loc.startswith(stats_dir):
      return loc
  return _child(stats_dir, f"{p['erddap-places:dataset_id']}/{p['erddap-places:variable']}/{p['erddap-places:place_id']}.parquet")


def run(out: Path, base: str = DEFAULT_BASE, cache: Path = Path("cache/erddap-places"),
        only: list[str] | None = None) -> dict:
  """read the published stats and write month and year values files under `out`. `base` is the stats collection.json
  (URL or path); `only` limits the run to ["dataset/variable", ...]. returns a summary."""
  t0 = _time.time()
  base = str(base)
  f = Fetcher(Path(cache))
  stats_dir = _join(base, "./")
  gazetteer = _join(base, "../")
  collection = f.read_json(base)
  links = [lk for lk in collection.get("links", []) if lk.get("rel") == "item"]
  item_locs = sorted(_join(base, lk["href"]) for lk in links)
  link_status = {_join(base, lk["href"]): lk.get("erddap-places:status") for lk in links}
  if only:
    for s in only:
      if s.count("/") != 1:
        raise ValueError(f"--only expects dataset/variable, got {s!r}")
    prefixes = tuple(s.replace("/", "_") + "_" for s in only)
    item_locs = [loc for loc in item_locs if os.path.basename(loc).startswith(prefixes)]
  items = f.map(lambda loc: (loc, f.read_json(loc)), item_locs)
  if only:
    items = [(loc, it) for loc, it in items
             if f"{it['properties']['erddap-places:dataset_id']}/{it['properties']['erddap-places:variable']}" in only]
    for s in only:
      if not any(f"{it['properties']['erddap-places:dataset_id']}/{it['properties']['erddap-places:variable']}" == s
                 for _, it in items):
        raise ValueError(f"--only {s!r} matches no item in {base}")
  if not items:
    raise ValueError(f"no items in {base}")

  # places must resolve before anything is fetched or written
  index_path = f.cached(_child(gazetteer, "index/places_index.parquet"), "places_index", None)
  resolve_places(index_path, (it["properties"]["erddap-places:place_id"] for _, it in items))

  datasets = {d: f.read_json(_child(gazetteer, f"erddap/{d}/collection.json"))
              for d in sorted({it["properties"]["erddap-places:dataset_id"] for _, it in items})}

  def load(entry: tuple[str, dict]) -> dict:
    loc, it = entry
    p = it["properties"]
    ds, var, pid = p["erddap-places:dataset_id"], p["erddap-places:variable"], p["erddap-places:place_id"]
    asset = it.get("assets", {}).get("data", {})
    path = f.cached(data_location(loc, it, stats_dir), f"{ds}/{var}/{pid.replace(':', '_')}", asset.get("file:checksum"))
    return {"loc": loc, "item": it, "dataset": ds, "variable": var, "place_id": pid, "path": path,
            "table": pq.read_table(path)}

  loaded = f.map(load, items)
  groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
  for e in loaded:
    groups[(e["dataset"], e["variable"])].append(e)

  summary: dict = {"files": [], "empty": [], "partial": [], "items": len(loaded), "unknown_classes": []}
  places_seen: set[str] = set()
  for (ds, var), es in sorted(groups.items()):
    meta = datasets[ds].get("cube:variables", {}).get(var)
    if meta is None:
      raise ValueError(f"variable {var!r} is not in cube:variables of dataset {ds!r}")
    cat = bool(es[0]["item"]["properties"].get("erddap-places:categorical"))
    classes = set(meta.get("erddap-places:classes") or {})
    unit = "1" if cat else meta.get("unit")
    if unit is None:
      raise ValueError(f"variable {var!r} of dataset {ds!r} has no unit in the dataset collection")
    ind = indicator_id(ds, var, cat)
    rows: list[dict] = []
    sources: list[dict] = []
    for e in sorted(es, key=lambda e: e["loc"]):
      p = e["item"]["properties"]
      tag = f"{ds}/{var}/{e['place_id']}"
      got = table_rows(e["table"], e["place_id"], ind, unit, cat)
      if not got:
        summary["empty"].append(tag)
      else:
        places_seen.add(e["place_id"])
      # an item written before the status existed has none: the collection's link then says
      if (p.get("erddap-places:status") or link_status.get(e["loc"])) == "partial":
        summary["partial"].append(tag)
      if cat and classes:
        bad = sorted({r["class"] for r in got if r["class"] not in classes})
        if bad:
          summary["unknown_classes"].append({"item": tag, "classes": bad})
      rows += got
      sources.append({"href": e["loc"], "title": p.get("title"), "updated": p.get("created"),
                      "end_datetime": p.get("end_datetime"),
                      "checksum": e["item"].get("assets", {}).get("data", {}).get("file:checksum")})
    if not rows:
      continue
    prov = {"producer": PRODUCER, "sources": sources,
            "source_version": f"gazetteer/stats updated {collection.get('updated')}", "method": METHOD,
            "code": {"name": "om-indicators", "version": __version__, "commit": _commit(), "adapter": ADAPTER},
            "license": LICENSE, "created": contract.utc_now()}
    path = contract.write_values(rows, out, prov)
    summary["files"].append({"indicator": ind, "coll": COLL, "path": str(path), "rows": len(rows),
                             "places": len({r["place_id"] for r in rows})})
  summary["places"] = sorted(places_seen)
  summary["seconds"] = round(_time.time() - t0, 1)
  return summary
