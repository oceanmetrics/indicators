"""where the catalog is published, and keeping published values of producers a run does not rebuild.

the catalog lives at s3://oceanmetrics.io-public/indicators/, read by browsers at the bucket host (path-style, which
saves the storage.oceanmetrics.io redirect per request). the daily job rebuilds what it can from published inputs
(erddap-places) and pulls the rest (the SDG series, rebuilt by hand from the places prototype) from the published
catalog, so a run never drops an indicator it did not rebuild.
"""
from __future__ import annotations

import json
import urllib.parse
from pathlib import Path

import requests

PUBLIC_BASE = "https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/indicators/"


def _read(base: str, rel: str) -> bytes:
  if base.startswith(("http://", "https://")):
    # keys keep their colons and '=': quote only what a URL path cannot carry
    url = base.rstrip("/") + "/" + urllib.parse.quote(rel, safe="/:=")
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    return r.content
  return (Path(base) / rel).read_bytes()


def pull(base: str, out: Path, families: list[str]) -> list[str]:
  """copy the published values files of indicators in `families` (id prefixes before ':') into `out`; returns their
  relative paths. a family with no published indicator is an error (nothing to keep)."""
  manifest = json.loads(_read(base, "indicators.json"))
  got = []
  for fam in families:
    inds = [i for i in manifest["indicators"] if i["id"].split(":", 1)[0] == fam]
    if not inds:
      raise ValueError(f"no published indicator of family {fam!r} at {base}")
    for i in inds:
      for c in i["collections"]:
        dest = Path(out) / c["path"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(_read(base, c["path"]))
        got.append(c["path"])
  return got
