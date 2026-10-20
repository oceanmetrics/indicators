"""builds a tiny local copy of the published gazetteer layout for the erddap-places adapter tests:

  <root>/gazetteer/stats/collection.json, items/<dataset>_<variable>_<place with : -> ->.json,
  <root>/gazetteer/stats/<dataset>/<variable>/<place_id>.parquet
  <root>/gazetteer/erddap/<dataset>/collection.json
  <root>/gazetteer/index/places_index.parquet
"""
import datetime as dt
import hashlib
import json
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

UPDATED = "2026-10-19T20:59:51Z"


def daterange(start: dt.date, end: dt.date, step: int = 1) -> list[dt.date]:
  return [start + dt.timedelta(days=i) for i in range(0, (end - start).days + 1, step)]


def continuous_table(series: list[tuple[dt.date, float | None]]) -> pa.Table:
  """the published columns of a continuous stats file (only date and mean_wt matter to the adapter)."""
  return pa.table({"date": pa.array([d for d, _ in series], pa.date32()),
                   "n": pa.array([None if v is None else 10 for _, v in series], pa.int64()),
                   "mean_wt": pa.array([v for _, v in series], pa.float64())})


def categorical_table(rows: list[tuple[dt.date, int, float]]) -> pa.Table:
  return pa.table({"date": pa.array([d for d, _, _ in rows], pa.date32()),
                   "class": pa.array([c for _, c, _ in rows], pa.int64()),
                   "frac_area": pa.array([f for _, _, f in rows], pa.float64())})


def entry(dataset: str, variable: str, place: str, table: pa.Table, categorical: bool = False,
          status: str | None = "complete", link_status: str | None = "complete", **kw) -> dict:
  return {"dataset": dataset, "variable": variable, "place": place, "table": table, "categorical": categorical,
          "status": status, "link_status": link_status, **kw}


def make_tree(root: Path, entries: list[dict], index: dict[str, list[str]] | None = None,
              href: str = "../{dataset}/{variable}/{place}.parquet") -> str:
  """write the tree and return the path of stats/collection.json. `index` maps place_id -> the collections it is in
  (default: every entry's place in 'places'); `href` is the data asset href template."""
  g = Path(root) / "gazetteer"
  stats = g / "stats"
  links, datasets = [], {}
  for e in entries:
    ds, var, place = e["dataset"], e["variable"], e["place"]
    data = stats / ds / var / f"{place}.parquet"
    data.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(e["table"], data)
    checksum = "1220" + hashlib.sha256(data.read_bytes()).hexdigest()
    props = {"title": f"{place} {var} ({ds})", "created": "2026-10-19T12:27:05Z",
             "start_datetime": "2019-12-15T12:00:00Z", "end_datetime": "2021-01-10T12:00:00Z",
             "erddap-places:place_id": place, "erddap-places:dataset_id": ds, "erddap-places:variable": var,
             "erddap-places:categorical": e["categorical"]}
    if e["status"]:
      props["erddap-places:status"] = e["status"]
    item = {"type": "Feature", "stac_version": "1.1.0", "id": f"{ds}_{var}_{place.replace(':', '-')}", "properties": props,
            "assets": {"data": {"href": href.format(dataset=ds, variable=var, place=place),
                                "file:checksum": checksum}}}
    (stats / "items").mkdir(parents=True, exist_ok=True)
    (stats / "items" / f"{item['id']}.json").write_text(json.dumps(item))
    link = {"rel": "item", "href": f"./items/{item['id']}.json", "type": "application/geo+json"}
    if e["link_status"]:
      link["erddap-places:status"] = e["link_status"]
    links.append(link)
    v = datasets.setdefault(ds, {})
    v[var] = {"unit": e.get("unit", "Celsius")}
    if e["categorical"]:
      v[var].update({"erddap-places:categorical": True, "erddap-places:classes": e.get("classes", {"0": "a", "1": "b"})})
  (stats / "collection.json").write_text(json.dumps({"type": "Collection", "id": "stats", "updated": UPDATED, "links": links}))
  for ds, cube in datasets.items():
    (g / "erddap" / ds).mkdir(parents=True, exist_ok=True)
    (g / "erddap" / ds / "collection.json").write_text(json.dumps({"type": "Collection", "id": ds, "cube:variables": cube}))
  if index is None:
    index = {e["place"]: ["places"] for e in entries}
  rows = [(pid, coll) for pid, colls in index.items() for coll in colls]
  (g / "index").mkdir(parents=True, exist_ok=True)
  pq.write_table(pa.table({"place_id": [r[0] for r in rows], "collection": [r[1] for r in rows]}),
                 g / "index" / "places_index.parquet")
  return str(stats / "collection.json")
