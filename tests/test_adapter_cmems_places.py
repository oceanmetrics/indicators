"""the cmems-places adapter: the place producer's published folder -> one values file per indicator x collection.
the folder is made by the producer itself on synthetic grids (tests/cmems_fixture.py), so the two cannot drift."""
import datetime as dt
import json

import pytest

from cmems_fixture import INFO, LAYERS, NO3, box, grid
from om_indicators import contract
from om_indicators.adapters import cmems_places as adapter
from om_indicators.producers import cmems_place as cp

SOURCE = {"kind": "reference", "url": "https://geo.example/wfs?mrgid=5670"}


def make_folder(tmp_path, places=(("MRGID:5670", "mr_eez"), ("MRGID:5671", "mr_eez"))):
  """a published producer folder (files + index.json) for `places`, each computed over the same two-cell polygon"""
  folder = tmp_path / "producer"
  entries = []
  for k, (place, coll) in enumerate(places):
    s = cp.produce(place, coll, NO3, folder, layers=LAYERS, info=lambda ds, v: INFO,
                   geometry=lambda pid, layer: (box(0.5, 0.5, 2.5, 1.5), SOURCE), subset=lambda ds, v, w, s, e: grid(3, depth=0.5057) + k,
                   created=f"2026-10-2{k}T12:00:00Z", commit="abc1234", toolbox_version="2.5.0")
    entries.append(s["entry"])
  cp.publish(folder, entries, dest="s3://bucket/x", base=str(tmp_path / "nothing-published-yet"), run=lambda cmd, check: None)
  return folder


def test_the_places_of_one_indicator_and_collection_become_one_values_file_exact_rows(tmp_path):
  folder = make_folder(tmp_path)
  out = tmp_path / "catalog"
  summary = adapter.run(out, base=str(folder), cache=tmp_path / "cache")
  path = contract.values_path(out, NO3, "mr_eez")
  assert summary["files"] == [{"indicator": NO3, "coll": "mr_eez", "path": str(path), "rows": 6, "places": 2}]
  table, prov = contract.read_values(path)
  rows = sorted(((r["place_id"], r["time"].isoformat(), r["value"], r["n"]) for r in table.to_pylist()))
  assert rows == [("MRGID:5670", "2020-01-01", 11.5, 1.0), ("MRGID:5670", "2020-02-01", 111.5, 1.0), ("MRGID:5670", "2020-03-01", 211.5, 1.0),
                  ("MRGID:5671", "2020-01-01", 12.5, 1.0), ("MRGID:5671", "2020-02-01", 112.5, 1.0), ("MRGID:5671", "2020-03-01", 212.5, 1.0)]
  assert set(table.column("coll").to_pylist()) == {"mr_eez"} and "sd" in table.schema.names
  assert contract.validate_tree(out) == {}


def test_the_provenance_lists_the_exact_producer_files_read_and_states_the_dataset(tmp_path):
  folder = make_folder(tmp_path)
  out = tmp_path / "catalog"
  adapter.run(out, base=str(folder), cache=tmp_path / "cache")
  _, prov = contract.read_values(contract.values_path(out, NO3, "mr_eez"))
  index = json.loads((folder / "index.json").read_text())
  assert [(s["href"], s["checksum"], s["updated"], s["end_datetime"]) for s in prov["sources"]] == [
    (str(folder / e["path"]), e["sha256"], e["created"], "2020-03-01") for e in index["entries"]]
  assert prov["dataset"]["id"] == "GLOBAL_MULTIYEAR_BGC_001_029" and prov["dataset"]["doi"] == "https://doi.org/10.48670/moi-00019"
  assert prov["producer"] == {"name": cp.PRODUCER_NAME, "url": cp.REPO_URL, "version": "abc1234"}
  assert prov["code"]["adapter"] == adapter.ADAPTER and prov["license"] == "CC-BY-4.0"
  assert prov["source_version"] == "2 places computed on request, latest 2026-10-21"
  assert prov["method"] == cp.METHOD


def test_a_collection_another_adapter_already_wrote_is_left_alone_and_listed(tmp_path):
  # eco-indicators owns coll=places: the producer's rows for a sanctuary never overwrite its values file
  folder = make_folder(tmp_path, places=(("NMS:A", "places"), ("MRGID:5670", "mr_eez")))
  out = tmp_path / "catalog"
  eco_rows = [{"place_id": "NMS:B", "coll": "places", "indicator": NO3, "time_grain": "year", "time": dt.date(2020, 1, 1),
               "class": None, "value": 1.0, "n": 12.0, "unit": "mmol m-3"}]
  eco_prov = {"producer": {"name": "noaa-onms/eco-indicators", "url": "https://example.org/eco"}, "sources": [{"href": "https://example.org/x"}],
              "method": "the eco-indicators rows",
              "dataset": {"id": "P", "title": "a product", "providers": [{"name": "CMEMS"}], "license": "other"}, "code": {"name": "om-indicators", "version": "0", "adapter": "eco"},
              "created": "2026-10-20T00:00:00Z", "license": "CC-BY-4.0"}
  eco_path = contract.write_values(eco_rows, out, eco_prov)
  before = eco_path.read_bytes()
  summary = adapter.run(out, base=str(folder), cache=tmp_path / "cache")
  assert summary["skipped"] == [f"{NO3} coll=places: the values file exists already, written by another adapter"]
  assert [f["coll"] for f in summary["files"]] == ["mr_eez"]
  assert eco_path.read_bytes() == before


def test_a_data_file_that_differs_from_the_index_is_a_half_published_folder(tmp_path):
  folder = make_folder(tmp_path)
  e = json.loads((folder / "index.json").read_text())["entries"][0]
  (folder / e["path"]).write_bytes((folder / e["path"]).read_bytes() + b"x")
  with pytest.raises(ValueError, match="half published"):
    adapter.run(tmp_path / "catalog", base=str(folder), cache=tmp_path / "cache")
  assert not contract.values_path(tmp_path / "catalog", NO3, "mr_eez").exists()


def test_a_path_that_leaves_the_producer_folder_is_refused(tmp_path):
  folder = make_folder(tmp_path)
  idx = json.loads((folder / "index.json").read_text())
  idx["entries"][0]["path"] = "../../etc/passwd"
  (folder / "index.json").write_text(json.dumps(idx))
  with pytest.raises(ValueError, match="unexpected producer path"):
    adapter.run(tmp_path / "catalog", base=str(folder), cache=tmp_path / "cache")


def test_a_producer_folder_that_does_not_exist_yet_is_an_empty_run(tmp_path):
  assert adapter.run(tmp_path / "catalog", base=str(tmp_path / "nothing"), cache=tmp_path / "cache") == {"files": [], "skipped": [], "places": 0}
  assert not (tmp_path / "catalog").exists()
