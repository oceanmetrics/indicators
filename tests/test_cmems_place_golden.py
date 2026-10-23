"""the place producer's output folder against the files it wrote before it became a call into om-extract's copernicus
reader (tests/fixtures/cmems_place/, written 2026-10-23 by om_indicators/producers/cmems_place.py at indicators 7bcbd7d):
the same synthetic grids, polygons and run stamps must give the same data.parquet, provenance.json and index.json, the
files the cmems-places adapter reads. the recipe is `golden_run()`; regenerate the fixture only for an intended change
(`uv run --group cmems python tests/test_cmems_place_golden.py`)."""
import json
import sys
from pathlib import Path

import pytest

np = pytest.importorskip("numpy")                # the `cmems` dependency group

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cmems_fixture import INFO, LAYERS, NO3, box, grid, shapely  # noqa: E402
from om_indicators.producers import cmems_place as cp  # noqa: E402

GOLDEN = Path(__file__).resolve().parent / "fixtures" / "cmems_place"
# one place in one window (14 months: a complete 2020 and a NaN cell in 2020-03), one split at the antimeridian (two
# windows, east and west, each answered by its own grid)
FIJI = shapely.MultiPolygon([box(176.5, 0.5, 180.0, 1.5), box(-180.0, 0.5, -178.5, 1.5)])


def _albania_grid():
  a = grid(14, depth=0.5057)
  a[2, 1, 1] = np.nan
  return a


def _fiji_subset(ds, v, w, s, e):
  if w[0] > 0:
    return grid(14, lon=(176.0, 177.0, 178.0, 179.0), depth=0.5057)
  return grid(14, lon=(-180.0, -179.0, -178.0, -177.0), depth=0.5057) + 1000.0


JOBS = [
  ("MRGID:5670", "mr_eez", box(0.5, 0.5, 2.5, 1.5), {"kind": "reference", "url": "https://geo.example/wfs?mrgid=5670"},
   lambda ds, v, w, s, e: _albania_grid(), "2026-10-20T12:00:00Z"),
  ("MRGID:8325", "mr_eez", FIJI, {"kind": "reference", "url": "https://geo.example/wfs?mrgid=8325"}, _fiji_subset,
   "2026-10-21T12:00:00Z"),
]
FILES = ["index.json"] + [f"cmems_mod_glo_bgc_my_0.25deg_P1M-m/no3/{p.replace(':', '-')}/{f}"
                          for p, *_ in JOBS for f in ("data.parquet", "provenance.json")]


def golden_run(out: Path) -> list[dict]:
  """the producer over JOBS into `out`, then the index as `publish()` merges it (nothing published before)"""
  entries = []
  for place, coll, geom, src, subset, created in JOBS:
    s = cp.produce(place, coll, NO3, out, layers=LAYERS, info=lambda ds, v: INFO, geometry=lambda pid, layer, g=geom, x=src: (g, x),
                   subset=subset, created=created, commit="abc1234", toolbox_version="2.5.0")
    entries.append(s["entry"])
  cp.publish(out, entries, dest="s3://bucket/x", base=str(out / "nothing-published-yet"), created="2026-10-21T13:00:00Z",
             run=lambda cmd, check: None)
  return entries


def test_the_output_folder_is_the_files_the_producer_wrote_before_the_reader(tmp_path):
  golden_run(tmp_path)
  for rel in FILES:
    if rel.endswith(".json"):
      assert (tmp_path / rel).read_text() == (GOLDEN / rel).read_text(), rel
  pq = pytest.importorskip("pyarrow.parquet")
  for rel in (f for f in FILES if f.endswith(".parquet")):
    a, b = pq.ParquetFile(tmp_path / rel), pq.ParquetFile(GOLDEN / rel)
    assert a.read().equals(b.read()), rel
    assert a.schema_arrow.metadata == b.schema_arrow.metadata, rel           # the embedded provenance, key for key
    if a.metadata.created_by == b.metadata.created_by:
      assert (tmp_path / rel).read_bytes() == (GOLDEN / rel).read_bytes(), rel


def test_the_golden_numbers_are_the_cell_centre_means():
  """the fixture itself, read back: the mean of the cells whose centres fall inside, NaN skipped, the two windows one set"""
  pq = pytest.importorskip("pyarrow.parquet")
  t = pq.read_table(GOLDEN / FILES[1]).to_pylist()
  months = [r for r in t if r["time_grain"] == "month"]
  assert [r["value"] for r in months[:3]] == [11.5, 111.5, 212.0]          # 2020-03: cell 11 is NaN, cell 12 alone
  fiji = [r for r in pq.read_table(GOLDEN / FILES[3]).to_pylist() if r["time_grain"] == "month"]
  assert fiji[0]["value"] == (11 + 12 + 13 + 1010 + 1011) / 5               # east: lon 177, 178, 179; west: -180, -179
  idx = json.loads((GOLDEN / "index.json").read_text())
  assert [e["place_id"] for e in idx["entries"]] == ["MRGID:5670", "MRGID:8325"]


if __name__ == "__main__":
  import shutil
  shutil.rmtree(GOLDEN, ignore_errors=True)
  golden_run(GOLDEN)
  print("\n".join(str(GOLDEN / f) for f in FILES))
