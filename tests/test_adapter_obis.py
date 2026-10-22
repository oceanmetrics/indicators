# the OBIS adapter: the obis-h3 release's exact place indicators -> year, decade and all-years rows. one test per rule,
# exact rows. fixtures are synthetic (made-up numbers in the real column layout of years.parquet / indicators.parquet).
import datetime as dt
import hashlib
import json
import os
import re

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
import requests

from om_indicators import contract as c
from om_indicators.adapters import obis

D = dt.date
REL = "v20261012"
INFO_EEZ = {"places": 2, "records_in": 110, "records_out": 50, "records_total": 150, "overlaps": 3}
INFO_HS = {"places": 1, "records_in": 20, "records_out": 130, "records_total": 150, "overlaps": 0}


def yrow(place, eov, year, n, sp, **kw):
  return {"place_id": place, "eov": eov, "year": year, "n": float(n), "sp": sp, "shannon": 1.0, "simpson": 0.5, "es": None,
          "hill_1": 2.0, "hill_2": 3.0, "bp": 0.25, "density": 0.01, **kw}


def irow(place, eov, decade, n, sp, **kw):
  return {"place_id": place, "eov": eov, "decade": decade, "n": float(n), "sp": sp, "shannon": 1.0, "simpson": 0.5, "es": None,
          "hill_1": 2.0, "hill_2": 3.0, "bp": 0.25, "density": 0.01, **kw}


# ids ----
def test_indicator_ids_for_all_taxa_and_each_eov():
  assert obis.indicator_id("species", "all") == "obis:species"
  assert obis.indicator_id("es50", "hardCorals") == "obis:es50:hard-corals"
  assert obis.indicator_id("records", "marineMammals") == "obis:records:marine-mammals"
  assert obis.indicator_id("density", "seaTurtles") == "obis:density:sea-turtles"


def test_unknown_metric_or_eov_raises():
  with pytest.raises(ValueError, match="unknown metric"):
    obis.indicator_id("chao1", "all")
  with pytest.raises(ValueError, match="unknown eov 'plankton'"):
    obis.indicator_id("species", "plankton")


def test_nine_metrics_by_eight_eovs_are_72_distinct_valid_ids():
  ids = obis.all_indicator_ids()
  assert len(ids) == 72 == len(set(ids))
  pattern = c.load_schema("values")["properties"]["indicator"]["pattern"]
  assert all(re.match(pattern, i) for i in ids)


# rows ----
def test_year_decade_and_all_rows_with_n_records_and_units():
  years = [yrow("MRGID:1", "all", 2023, 80, 12, es=9.5), yrow("MRGID:1", "all", 2024, 30, 5)]
  inds = [irow("MRGID:1", "all", 2020, 110, 15, es=11.25), irow("MRGID:1", "all", None, 400, 40, es=20.0)]
  rows = obis.place_rows(years, inds, "mr_eez", 2026)
  assert sorted(rows) == sorted(i for i in obis.all_indicator_ids() if i.count(":") == 1)      # eov all only
  base = {"place_id": "MRGID:1", "coll": "mr_eez", "class": None}
  assert rows["obis:species"] == [
    {**base, "indicator": "obis:species", "time_grain": "year", "time": D(2023, 1, 1), "value": 12, "n": 80.0, "sd": None, "unit": "species"},
    {**base, "indicator": "obis:species", "time_grain": "year", "time": D(2024, 1, 1), "value": 5, "n": 30.0, "sd": None, "unit": "species"},
    {**base, "indicator": "obis:species", "time_grain": "decade", "time": D(2020, 1, 1), "value": 15, "n": 110.0, "sd": None, "unit": "species"},
    {**base, "indicator": "obis:species", "time_grain": "all", "time": None, "value": 40, "n": 400.0, "sd": None, "unit": "species"}]
  assert [(r["time_grain"], r["value"], r["n"], r["unit"]) for r in rows["obis:records"]] == [
    ("year", 80.0, 80.0, "records"), ("year", 30.0, 30.0, "records"), ("decade", 110.0, 110.0, "records"), ("all", 400.0, 400.0, "records")]
  assert [r["value"] for r in rows["obis:es50"]] == [9.5, None, 11.25, 20.0]                   # null stays null (n < 50)
  assert {m: rows[f"obis:{m}"][0]["unit"] for m in ("shannon", "simpson", "es50", "hill1", "hill2", "bp", "density")} == {
    "shannon": "1", "simpson": "1", "es50": "species", "hill1": "1", "hill2": "1", "bp": "1", "density": "records km-2"}
  assert rows["obis:hill1"][0]["value"] == 2.0 and rows["obis:hill2"][0]["value"] == 3.0 and rows["obis:bp"][0]["value"] == 0.25


def test_regression_the_snapshot_year_is_dropped_as_a_year_but_kept_in_its_decade():
  years = [yrow("MRGID:1", "all", 2025, 50, 8), yrow("MRGID:1", "all", 2026, 7, 3)]
  inds = [irow("MRGID:1", "all", 2020, 57, 9)]
  rows = obis.place_rows(years, inds, "mr_eez", 2026)["obis:records"]
  assert [(r["time_grain"], r["time"], r["value"]) for r in rows] == [
    ("year", D(2025, 1, 1), 50.0), ("decade", D(2020, 1, 1), 57.0)]


def test_each_eov_gets_its_own_indicators_and_nan_becomes_null():
  years = [yrow("MRGID:1", "seabirds", 2000, 10, 4, simpson=float("nan")), yrow("MRGID:1", "all", 2000, 99, 20)]
  rows = obis.place_rows(years, [], "mr_eez", 2026)
  assert rows["obis:records:seabirds"][0]["value"] == 10.0 and rows["obis:records"][0]["value"] == 99.0
  assert rows["obis:simpson:seabirds"][0]["value"] is None


def test_rows_validate_against_the_contract():
  years = [yrow("MRGID:1", "fish", 2000, 10, 4)]
  inds = [irow("MRGID:1", "fish", 1990, 10, 4), irow("MRGID:1", "fish", None, 10, 4)]
  for ind, rows in obis.place_rows(years, inds, "mr_eez", 2026).items():
    assert c.validate_rows(rows) == [], ind


# the overlap rule ----
def test_overlap_note_states_the_rule_with_the_numbers_of_release_json():
  assert obis.overlap_note("mr_eez", INFO_EEZ) == (
    "a record counts in every place whose polygon contains it (Marine Regions joint regimes overlap their parties' 200 NM "
    "zones; 3 locations fall in more than one place, adding 10 to a sum of the place totals in mr_eez); totals across places therefore exceed the distinct records "
    "and are never summed")
  assert "no overlaps in mr_high_seas" in obis.overlap_note("mr_high_seas", INFO_HS)


def test_method_names_the_exact_point_in_polygon_and_the_eov_seeds():
  m = obis.method("mr_eez", INFO_EEZ, "2026-10-11")
  assert m.startswith("exact point-in-polygon on the OBIS snapshot of 2026-10-11")
  assert "IOOS Marine Life Data Network taxonomy seeds" in m and "never summed" in m and "snapshot year 2026 is incomplete" in m


# run ----
def make_release(tmp_path, with_place_exact=True, release_in_file=REL):
  root = tmp_path / "obis-h3"
  base = root / REL
  years = {"mr_eez": [yrow("MRGID:1", "all", 2024, 60, 9), yrow("MRGID:1", "all", 2026, 5, 2), yrow("MRGID:2", "all", 2024, 30, 4),
                      yrow("MRGID:1", "mangroves", 2024, 12, 3)],
           "mr_high_seas": [yrow("MRGID:9", "all", 2024, 20, 6)]}
  inds = {"mr_eez": [irow("MRGID:1", "all", None, 75, 10), irow("MRGID:2", "all", None, 35, 4), irow("MRGID:1", "mangroves", None, 12, 3)],
          "mr_high_seas": [irow("MRGID:9", "all", None, 20, 6)]}
  for coll in years:
    d = base / "place_exact" / f"coll={coll}"
    d.mkdir(parents=True)
    pq.write_table(pa.Table.from_pylist(years[coll], schema=pa.schema([
      ("place_id", pa.string()), ("eov", pa.string()), ("year", pa.int32()), ("n", pa.float64()), ("sp", pa.int32()),
      ("shannon", pa.float64()), ("simpson", pa.float64()), ("es", pa.float64()), ("hill_1", pa.float64()),
      ("hill_2", pa.float64()), ("bp", pa.float64()), ("density", pa.float64())])), d / "years.parquet")
    pq.write_table(pa.Table.from_pylist(inds[coll], schema=pa.schema([
      ("place_id", pa.string()), ("eov", pa.string()), ("decade", pa.int32()), ("n", pa.float64()), ("sp", pa.int32()),
      ("shannon", pa.float64()), ("simpson", pa.float64()), ("es", pa.float64()), ("hill_1", pa.float64()),
      ("hill_2", pa.float64()), ("bp", pa.float64()), ("density", pa.float64())])), d / "indicators.parquet")
  layers = {"place_exact": {"collections": {"mr_eez": INFO_EEZ, "mr_high_seas": INFO_HS}}} if with_place_exact else {}
  (base / "release.json").write_text(json.dumps({"release": release_in_file, "obis_snapshot": "2026-10-11", "worms_version": "2026-10-01",
                                                 "built_at": "2026-10-12T11:52:30Z", "layers": layers}))
  (root / "latest.json").write_text(json.dumps({"release": REL, "base": str(base) + "/", "obis_snapshot": "2026-10-11",
                                                "worms_version": "2026-10-01", "built_at": "2026-10-12T11:52:30Z"}))
  pq.write_table(pa.table({"place_id": ["MRGID:1", "MRGID:2", "MRGID:9"], "collection": ["mr_eez", "mr_eez", "mr_high_seas"]}),
                 tmp_path / "places_index.parquet")
  return str(root) + "/"


def run(tmp_path, root, release=None, **kw):
  return obis.run(tmp_path / "out", release=release, cache=tmp_path / "cache", root=root, index=tmp_path / "places_index.parquet", **kw)


def test_run_writes_a_file_per_indicator_and_collection_and_skips_empty_ones(tmp_path):
  s = run(tmp_path, make_release(tmp_path), release=REL)
  files = {(f["indicator"], f["coll"]): f for f in s["files"]}
  assert ("obis:records", "mr_eez") in files and ("obis:records", "mr_high_seas") in files
  assert ("obis:records:mangroves", "mr_eez") in files and ("obis:records:mangroves", "mr_high_seas") not in files   # no rows, no file
  assert ("obis:records:fish", "mr_eez") not in files
  assert (files[("obis:records", "mr_eez")]["rows"], files[("obis:records", "mr_eez")]["places"]) == (4, 2)
  assert (s["release"], s["obis_snapshot"], s["worms_version"]) == (REL, "2026-10-11", "2026-10-01")


def test_run_default_release_is_latest_json_and_rows_are_exact(tmp_path):
  s = run(tmp_path, make_release(tmp_path))
  assert s["release"] == REL
  t, _ = c.read_values(c.values_path(tmp_path / "out", "obis:species", "mr_eez"))
  assert t.to_pylist() == [
    {"place_id": "MRGID:1", "coll": "mr_eez", "indicator": "obis:species", "time_grain": "all", "time": None, "class": None,
     "value": 10.0, "n": 75.0, "sd": None, "unit": "species"},
    {"place_id": "MRGID:1", "coll": "mr_eez", "indicator": "obis:species", "time_grain": "year", "time": D(2024, 1, 1), "class": None,
     "value": 9.0, "n": 60.0, "sd": None, "unit": "species"},
    {"place_id": "MRGID:2", "coll": "mr_eez", "indicator": "obis:species", "time_grain": "all", "time": None, "class": None,
     "value": 4.0, "n": 35.0, "sd": None, "unit": "species"},
    {"place_id": "MRGID:2", "coll": "mr_eez", "indicator": "obis:species", "time_grain": "year", "time": D(2024, 1, 1), "class": None,
     "value": 4.0, "n": 30.0, "sd": None, "unit": "species"}]                                  # 2026 (the snapshot year) is not a year row


def test_run_provenance_lists_the_release_files_with_checksums(tmp_path):
  root = make_release(tmp_path)
  run(tmp_path, root, release=REL, only=["obis:records"])
  assert c.validate_tree(tmp_path / "out") == {}
  _, p = c.read_values(c.values_path(tmp_path / "out", "obis:records", "mr_eez"))
  assert p["producer"] == {"name": "obisindicators", "url": "https://github.com/marinebon/obisindicators", "version": REL}
  hrefs = [s["href"] for s in p["sources"]]
  assert hrefs == [f"{root}{REL}/release.json", f"{root}{REL}/place_exact/coll=mr_eez/years.parquet",
                   f"{root}{REL}/place_exact/coll=mr_eez/indicators.parquet"]
  with open(f"{root}{REL}/place_exact/coll=mr_eez/years.parquet", "rb") as fh:
    assert p["sources"][1]["checksum"] == "sha256:" + hashlib.sha256(fh.read()).hexdigest()
  assert p["sources"][0]["updated"] == "2026-10-12T11:52:30Z"
  # contract 1.2: release.json is the manifest, the two parquet files are the data; no source has a STAC item
  assert [(s["role"], s["item"]) for s in p["sources"]] == [("manifest", None), ("data", None), ("data", None)]
  assert p["source_version"] == "OBIS snapshot 2026-10-11, WoRMS 2026-10-01, obis-h3 v20261012"
  assert "3 locations fall in more than one place, adding 10 to a sum of the place totals in mr_eez" in p["method"]
  assert p["dataset"]["id"] == "obis" and p["dataset"]["title"] == "OBIS occurrence data" and p["dataset"]["license"] == "various"
  assert p["dataset"]["citation"] == ("OBIS (2026) Ocean Biodiversity Information System. Intergovernmental Oceanographic "
                                      "Commission of UNESCO. https://obis.org")
  assert [(x["name"], x["roles"]) for x in p["dataset"]["providers"]] == [
    ("Ocean Biodiversity Information System (OBIS)", ["producer", "licensor"]), ("obisindicators", ["processor"])]
  assert p["license"] == "CC-BY-4.0" and p["code"]["adapter"] == "om_indicators.adapters.obis"
  _, hs = c.read_values(c.values_path(tmp_path / "out", "obis:records", "mr_high_seas"))
  assert "no overlaps in mr_high_seas" in hs["method"]


def test_reconciliation_all_grain_records_summed_over_places_equal_records_in(tmp_path):
  """the 'all' rows of obis:records add up to the release's records_in for each collection (synthetic release)."""
  run(tmp_path, make_release(tmp_path), release=REL, only=["obis:records"])
  for coll, info in (("mr_eez", {"records_in": 75 + 35}), ("mr_high_seas", {"records_in": 20})):
    t, _ = c.read_values(c.values_path(tmp_path / "out", "obis:records", coll))
    assert sum(r["value"] for r in t.to_pylist() if r["time_grain"] == "all") == info["records_in"]


def test_run_refuses_a_release_without_the_place_exact_layer(tmp_path):
  with pytest.raises(ValueError, match="has no place_exact layer"):
    run(tmp_path, make_release(tmp_path, with_place_exact=False), release=REL)


def test_run_refuses_a_release_json_of_another_release(tmp_path):
  with pytest.raises(ValueError, match="is release 'v1', expected 'v20261012'"):
    run(tmp_path, make_release(tmp_path, release_in_file="v1"), release=REL)


def test_run_refuses_places_the_gazetteer_does_not_have_in_that_collection(tmp_path):
  root = make_release(tmp_path)
  pq.write_table(pa.table({"place_id": ["MRGID:1", "MRGID:2", "MRGID:9"], "collection": ["mr_eez", "mr_eez", "mr_eez"]}),
                 tmp_path / "places_index.parquet")                                  # MRGID:9 is not in mr_high_seas
  with pytest.raises(ValueError, match=r"place_id 'MRGID:9' resolves to 0 rows with collection 'mr_high_seas'"):
    run(tmp_path, root, release=REL)


# network ----
def _bucket_reachable() -> bool:
  try:
    return requests.head(obis.ROOT + "latest.json", timeout=10).status_code == 200
  except requests.RequestException:
    return False


@pytest.mark.network
@pytest.mark.skipif(os.environ.get("OM_OFFLINE") == "1", reason="OM_OFFLINE=1")
def test_published_all_grain_records_sum_to_records_in_of_release_json(tmp_path):
  if not _bucket_reachable():
    pytest.skip("bucket unreachable")
  s = obis.run(tmp_path / "out", cache=tmp_path / "cache", only=["obis:records"])
  rj = json.loads((tmp_path / "cache" / s["release"] / "release.json").read_text())
  colls = rj["layers"]["place_exact"]["collections"]
  assert set(colls) >= {"mr_eez", "mr_high_seas"}
  for coll, info in colls.items():
    t, p = c.read_values(c.values_path(tmp_path / "out", "obis:records", coll))
    rows = [r for r in t.to_pylist() if r["time_grain"] == "all"]
    assert len(rows) == info["places"]
    assert sum(r["value"] for r in rows) == info["records_in"]
    assert sum(r["n"] for r in rows) == info["records_in"]
  assert c.validate_tree(tmp_path / "out") == {}
