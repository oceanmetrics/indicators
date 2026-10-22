"""cmems-places adapter: the Copernicus Marine place producer's published output -> values files per indicator x collection.

reads what om_indicators/producers/cmems_place.py published (a maintainer accepted a request with the `run` label) under
s3://oceanmetrics.io-public/indicators/producers/cmems/:

  index.json                                 every place x indicator published, with the sha256 of its data file
  <dataset>/<var>/<place>/data.parquet       the contract rows of one place (month and year), sd included
  <dataset>/<var>/<place>/provenance.json    how they were made

and writes one values file per (indicator, home collection) at values/indicator=<id>/coll=<coll>/data.parquet, the
places of that pair together, e.g. `cmems:cmems_mod_glo_bgc_my_0.25deg_P1M-m:no3:mean` / `mr_eez`. rules:

  integrity   a data file whose sha256 differs from the index's is an error (a half-published folder), not a skip.
  one owner   a (indicator, coll) whose values file already exists in the catalog under construction belongs to the
              adapter that wrote it (eco-indicators owns `places`, the sanctuaries): it is listed under `skipped` and
              left alone, so the producer can never overwrite another producer's values.
  sources     om:provenance.sources lists the exact producer files read (href, sha256), provenance.dataset the Copernicus
              Marine product as the producer states it.
  no index    a producer folder that does not exist yet is an empty run, not an error (S3 answers 403 or 404).
"""
from __future__ import annotations

import hashlib
import re
from collections import defaultdict
from pathlib import Path

from om_indicators import __version__, contract
from om_indicators.adapters import erddap_places as ep
from om_indicators.producers import cmems_place as cp

ADAPTER = "om_indicators.adapters.cmems_places"
PATH_RE = re.compile(r"^[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+/data\.parquet$")


def run(out: Path, base: str = cp.PUBLIC_BASE, cache: Path = Path("cache/cmems-places")) -> dict:
  """write the values files under `out` from the producer folder at `base` (a URL or a directory); returns a summary."""
  summary: dict = {"files": [], "skipped": [], "places": 0}
  index = cp.read_index(base)
  if not index or not index.get("entries"):
    return summary
  f = ep.Fetcher(Path(cache))
  groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
  for e in index["entries"]:
    if not PATH_RE.match(e.get("path", "")):
      raise ValueError(f"unexpected producer path {e.get('path')!r} in {base}index.json")
    groups[(e["indicator"], e["coll"])].append(e)
  for (ind, coll), entries in sorted(groups.items()):
    if contract.values_path(out, ind, coll).exists():
      summary["skipped"].append(f"{ind} coll={coll}: the values file exists already, written by another adapter")
      continue
    rows, sources, latest = [], [], None
    for e in sorted(entries, key=lambda e: e["place_id"]):
      loc = ep._child(base, e["path"])
      data = f.read_bytes(loc)
      checksum = "sha256:" + _sha256(data)
      if checksum != e["sha256"]:
        raise ValueError(f"{loc} has {checksum}, the index says {e['sha256']}: the producer folder is half published")
      local = Path(cache) / f"{checksum[7:23]}.parquet"
      local.parent.mkdir(parents=True, exist_ok=True)
      local.write_bytes(data)
      table, prov = contract.read_values(local)
      rows += table.to_pylist()
      sources.append({"href": loc, "title": f"{e['place_id']} {ind} (om_indicators.producers.cmems_place output)",
                      "updated": e["created"], "end_datetime": e["time_range"][1], "checksum": checksum})
      if latest is None or e["created"] >= latest[0]:
        latest = (e["created"], prov)
    prov = latest[1]
    provenance = {
      "producer": {"name": cp.PRODUCER_NAME, "url": cp.REPO_URL, "version": prov["producer"].get("version")},
      "sources": sources, "source_version": f"{len(entries)} places computed on request, latest {latest[0][:10]}",
      "method": prov["method"], "dataset": prov["dataset"],
      "code": {"name": "om-indicators", "version": __version__, "commit": ep._commit(), "adapter": ADAPTER},
      "license": cp.LICENSE, "created": contract.utc_now()}
    path = contract.write_values(rows, out, provenance)
    summary["files"].append({"indicator": ind, "coll": coll, "path": str(path), "rows": len(rows),
                             "places": len({r["place_id"] for r in rows})})
    summary["places"] += len(entries)
  return summary


def _sha256(data: bytes) -> str:
  return hashlib.sha256(data).hexdigest()
