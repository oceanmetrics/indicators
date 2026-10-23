"""where the catalog is published, and keeping published values of producers a run does not rebuild.

the catalog lives at s3://oceanmetrics.io-public/indicators/, read by browsers at the bucket host (path-style, which
saves the storage.oceanmetrics.io redirect per request). the daily job rebuilds what it can from published inputs
(erddap-places) and pulls the rest (the SDG series, rebuilt by hand from the places prototype) from the published
catalog, so a run never drops an indicator it did not rebuild.
"""
from __future__ import annotations

import json
import os
import urllib.parse
from pathlib import Path

import requests
from om_extract.storage import storage_host_from_env, storage_url

# the catalog root on the storage host: OM_STORAGE, else om_extract.storage's default (the storage host since 0.6.3)
PUBLIC_BASE = storage_url("indicators/", host=storage_host_from_env())


def om_publish_path() -> str:
  """the one publisher of the bucket, oceanmetrics/platform `scripts/om-publish.sh` (both stores, R2 then S3; never
  deletes; a dry run unless --really): OM_PUBLISH (the workflows check platform out and set it), else a platform
  checkout beside this repo, else ~/Github/oceanmetrics/platform. scripts/om_publish_path.sh is the shell twin."""
  env = os.environ.get("OM_PUBLISH")
  cands = [Path(env)] if env else [Path(__file__).resolve().parents[2] / "platform" / "scripts" / "om-publish.sh",
                                   Path.home() / "Github" / "oceanmetrics" / "platform" / "scripts" / "om-publish.sh"]
  for c in cands:
    if c.is_file() and os.access(c, os.X_OK):
      return str(c)
  raise FileNotFoundError("om-publish.sh not found (set OM_PUBLISH to oceanmetrics/platform scripts/om-publish.sh)")


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
