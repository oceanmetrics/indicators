# the SDG adapter: values.json of the eez_indicators prototype -> latest-year rows, one test per rule.
import datetime as dt
from pathlib import Path

from om_indicators import contract as c
from om_indicators.adapters import sdg

VALUES = Path(__file__).parent / "fixtures" / "sdg" / "values.json"


def row(code, mrgid, year, value, unit, m49, basis):
  return {"place_id": f"MRGID:{mrgid}", "coll": "mr_eez", "indicator": f"sdg:{code}", "time_grain": "year",
          "time": dt.date(year, 1, 1), "class": None, "value": value, "n": None, "unit": unit,
          "x_m49": m49, "x_basis": basis}


def test_rows_are_the_latest_year_per_eez_with_m49_and_basis(tmp_path):
  summary = sdg.run(VALUES, tmp_path)
  mpa, _ = c.read_values(c.values_path(tmp_path, "sdg:ER_MRN_MPA", "mr_eez"))
  unf, _ = c.read_values(c.values_path(tmp_path, "sdg:ER_REG_UNFCIM", "mr_eez"))
  assert mpa.to_pylist() == [row("ER_MRN_MPA", 1001, 2025, 96.5, "%", 56, "territory"),
                             row("ER_MRN_MPA", 1002, 2024, 10.0, "%", 250, "sovereign")]
  assert unf.to_pylist() == [row("ER_REG_UNFCIM", 1001, 2026, 5.0, "score 1-5", 56, "territory"),
                             row("ER_REG_UNFCIM", 1002, 2025, 3.0, "score 1-5", 250, "sovereign"),
                             row("ER_REG_UNFCIM", 1004, 2023, 1.0, "score 1-5", 840, "territory")]
  assert [(f["indicator"], f["rows"]) for f in summary["files"]] == [("sdg:ER_MRN_MPA", 2), ("sdg:ER_REG_UNFCIM", 3)]
  assert summary["eezs"] == 4 and summary["empty"] == []


def test_eez_without_a_single_state_value_gets_no_row(tmp_path):
  sdg.run(VALUES, tmp_path)
  for ind in ("sdg:ER_MRN_MPA", "sdg:ER_REG_UNFCIM"):
    table, _ = c.read_values(c.values_path(tmp_path, ind, "mr_eez"))
    assert "MRGID:1003" not in table.column("place_id").to_pylist()
  mpa, _ = c.read_values(c.values_path(tmp_path, "sdg:ER_MRN_MPA", "mr_eez"))
  assert "MRGID:1004" not in mpa.column("place_id").to_pylist()


def test_files_validate_and_carry_the_provenance(tmp_path):
  sdg.run(VALUES, tmp_path)
  assert c.validate_tree(tmp_path) == {}
  _, p = c.read_values(c.values_path(tmp_path, "sdg:ER_MRN_MPA", "mr_eez"))
  assert p["producer"] == {"name": "places/proto/eez_indicators",
                           "url": "https://github.com/oceanmetrics/places/tree/main/proto/eez_indicators", "version": None}
  assert p["sources"][0] == {"href": "https://unstats.un.org/sdgapi/v1/sdg/Series/Data?seriesCode=ER_MRN_MPA",
                             "title": "Average proportion of Marine KBAs covered by protected areas (%)"}
  assert p["sources"][1]["href"].startswith("values.json (oceanmetrics/places proto/eez_indicators, built 20")
  assert p["method"].startswith("latest year with a numeric value per M49 area from the UN SDG Global Database")
  assert p["license"] == "CC-BY-4.0" and p["rows"] == 2
  assert p["code"]["adapter"] == "om_indicators.adapters.sdg"


def test_a_series_without_values_writes_no_file(tmp_path):
  import json
  data = json.loads(VALUES.read_text())
  for e in data["eez"].values():
    e["ER_MRN_MPA"] = None
  f = tmp_path / "values.json"
  f.write_text(json.dumps(data))
  summary = sdg.run(f, tmp_path / "out")
  assert summary["empty"] == ["sdg:ER_MRN_MPA"]
  assert not c.values_path(tmp_path / "out", "sdg:ER_MRN_MPA", "mr_eez").exists()


def test_provenance_carries_the_dataset(tmp_path):
  """contract 1.1: the series metadata travels with the values, so the manifest needs no values.json."""
  from om_indicators import contract
  from om_indicators.adapters import sdg
  fixture = Path(__file__).parent / "fixtures" / "sdg" / "values.json"
  sdg.run(fixture, tmp_path)
  _, prov = contract.read_values(contract.values_path(tmp_path, "sdg:ER_MRN_MPA", "mr_eez"))
  ds = prov["dataset"]
  assert ds["id"] == "ER_MRN_MPA"
  assert ds["title"] == "Average proportion of Marine KBAs covered by protected areas (%) (SDG 14.5.1)"
  assert ds["providers"][1]["name"] == "UN Statistics Division, SDG Global Database"
  assert ds["license"] == "other" and prov["contract"] == contract.CONTRACT_VERSION
