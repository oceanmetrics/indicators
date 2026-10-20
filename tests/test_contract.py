# the value contract: one test per rule, each on a small synthetic fixture with exact expectations.
import datetime as dt
import json

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from om_indicators import contract as c

IND = "erddap:dhw_5km:CRW_SST:mean"


def row(**kw):
  base = {"place_id": "NMS:TEST", "coll": "places", "indicator": IND, "time_grain": "year",
          "time": dt.date(2020, 1, 1), "class": None, "value": 15.25, "n": 12.0, "unit": "degree_C"}
  return {**base, **kw}


def prov(**kw):
  base = {"producer": {"name": "erddap-places", "url": "https://github.com/oceanmetrics/erddap-places"},
          "sources": [{"href": "https://example.org/stats/items/x.json"}],
          "method": "mean of the daily area-weighted means in each month",
          "code": {"name": "om-indicators", "version": "0.1.0", "adapter": "test"},
          "created": "2026-10-20T00:00:00Z", "license": "CC-BY-4.0"}
  return {**base, **kw}


# rows ----
def test_valid_rows_have_no_errors():
  rows = [row(), row(time=dt.date(2021, 1, 1), value=15.5),
          row(time_grain="month", time=dt.date(2021, 3, 1), value=14.0, n=31.0),
          row(time_grain="all", time=None, value=15.0, n=None),
          row(time_grain="decade", time=dt.date(2010, 1, 1)),
          row(time_grain="day", time=dt.date(2021, 3, 17))]
  assert c.validate_rows(rows) == []


def test_time_must_be_null_for_all():
  assert c.validate_rows([row(time_grain="all", time=dt.date(2020, 1, 1))]) == [
    "row 0: time must be null for time_grain 'all', got datetime.date(2020, 1, 1)"]


def test_time_required_for_a_grain():
  assert c.validate_rows([row(time=None)]) == ["row 0: time is required for time_grain 'year'"]


@pytest.mark.parametrize("grain, t, start", [
  ("year", dt.date(2020, 7, 1), "2020-01-01"),
  ("month", dt.date(2020, 7, 15), "2020-07-01"),
  ("decade", dt.date(2015, 1, 1), "2010-01-01"),
])
def test_time_is_the_start_of_its_period(grain, t, start):
  assert c.validate_rows([row(time_grain=grain, time=t)]) == [
    f"row 0: time {t.isoformat()} is not the start of a {grain} (expected {start})"]


def test_unknown_grain_is_rejected():
  errs = c.validate_rows([row(time_grain="week")])
  assert errs == ["row 0: time_grain: 'week' is not one of ['all', 'decade', 'year', 'month', 'day']"]


def test_place_id_needs_an_authority():
  errs = c.validate_rows([row(place_id="CINMS")])
  assert errs == ["row 0: place_id: 'CINMS' does not match '^[A-Za-z][A-Za-z0-9_]*:\\\\S+$'"]


def test_indicator_id_grammar():
  assert c.validate_rows([row(indicator="sdg:ER_MRN_MPA")]) == []
  assert c.validate_rows([row(indicator="obis:sp:seaTurtles")]) == []
  errs = c.validate_rows([row(indicator="SST mean")])
  assert len(errs) == 1 and errs[0].startswith("row 0: indicator: 'SST mean' does not match")


def test_value_must_be_finite():
  assert c.validate_rows([row(value=float("nan"))]) == ["row 0: value must be finite or null, got nan"]
  assert c.validate_rows([row(value=float("inf"))]) == ["row 0: value must be finite or null, got inf"]
  assert c.validate_rows([row(value=None)]) == []


def test_n_is_not_negative():
  assert c.validate_rows([row(n=-1.0)]) == ["row 0: n: -1.0 is less than the minimum of 0"]


def test_duplicate_keys_are_rejected():
  errs = c.validate_rows([row(), row(value=1.0)])
  assert errs == ["row 1: duplicate of row 0 on (place_id, indicator, time_grain, time, class) = "
                  f"NMS:TEST, {IND}, year, 2020-01-01, None"]


def test_same_time_different_class_is_not_a_duplicate():
  rows = [row(indicator="erddap:dhw_5km:CRW_BAA:share", unit="1", **{"class": k}, value=v)
          for k, v in (("0", 0.75), ("1", 0.25))]
  assert c.validate_rows(rows) == []


def test_one_indicator_and_one_coll_per_file():
  errs = c.validate_rows([row(), row(indicator="sdg:ER_MRN_MPA", place_id="MRGID:1", coll="mr_eez")])
  assert errs == ["a values file holds one indicator, found 2: ['erddap:dhw_5km:CRW_SST:mean', 'sdg:ER_MRN_MPA']",
                  "a values file holds one coll, found 2: ['mr_eez', 'places']"]
  assert c.validate_rows([row(), row(indicator="sdg:X", coll="mr_eez")], one_file=False) == []


def test_class_on_all_rows_or_none():
  errs = c.validate_rows([row(), row(time=dt.date(2021, 1, 1), **{"class": "1"})])
  assert errs == ["class must be set on every row (categorical) or none (continuous): 1 set, 1 null"]


def test_extra_columns_must_be_x_prefixed():
  assert c.validate_rows([row(x_basis="territory")]) == []
  errs = c.validate_rows([row(basis="territory")])
  assert errs == ["row 0: row: 'basis' does not match any of the regexes: '^x_[a-z0-9_]+$'"]


def test_class_column_is_required():
  r = row()
  del r["class"]
  assert c.validate_rows([r]) == ["row 0: row: 'class' is a required property"]


# periods ----
@pytest.mark.parametrize("grain, d, start", [
  ("all", dt.date(2020, 5, 6), None),
  ("decade", dt.date(2019, 12, 31), dt.date(2010, 1, 1)),
  ("year", dt.date(2020, 5, 6), dt.date(2020, 1, 1)),
  ("month", dt.date(2020, 5, 6), dt.date(2020, 5, 1)),
  ("day", dt.date(2020, 5, 6), dt.date(2020, 5, 6)),
])
def test_period_start(grain, d, start):
  assert c.period_start(grain, d) == start


# provenance ----
def test_provenance_requires_its_fields():
  p = {**prov(), "contract": "1.0.0", "indicator": IND, "coll": "places", "rows": 1}
  assert c.validate_provenance(p) == []
  del p["method"]
  assert c.validate_provenance(p) == ["provenance: root: 'method' is a required property"]


def test_provenance_sources_not_empty():
  p = {**prov(sources=[]), "contract": "1.0.0", "indicator": IND, "coll": "places", "rows": 1}
  assert c.validate_provenance(p) == ["provenance: sources: [] should be non-empty"]


# files ----
def test_write_and_read_round_trip(tmp_path):
  rows = [row(time=dt.date(2021, 1, 1), value=15.5), row(), row(time_grain="month", time=dt.date(2020, 2, 1), n=29.0)]
  path = c.write_values(rows, tmp_path, prov())
  assert path == tmp_path / "values" / f"indicator={IND}" / "coll=places" / "data.parquet"
  table, p = c.read_values(path)
  assert table.schema == c.ARROW_SCHEMA
  # stable order: place, grain (all < decade < year < month < day), time
  assert table.to_pylist() == [
    row(), row(time=dt.date(2021, 1, 1), value=15.5), row(time_grain="month", time=dt.date(2020, 2, 1), n=29.0)]
  assert p == {**prov(), "contract": c.CONTRACT_VERSION, "indicator": IND, "coll": "places", "rows": 3}
  assert c.validate_file(path) == []


def test_write_refuses_bad_rows(tmp_path):
  with pytest.raises(c.ContractError) as e:
    c.write_values([row(time=dt.date(2020, 6, 1))], tmp_path, prov())
  assert e.value.errors == ["row 0: time 2020-06-01 is not the start of a year (expected 2020-01-01)"]
  assert not (tmp_path / "values").exists()


def test_write_refuses_bad_provenance(tmp_path):
  with pytest.raises(c.ContractError) as e:
    c.write_values([row()], tmp_path, prov(license=None))
  assert e.value.errors == ["provenance: license: None is not of type 'string'"]


def test_x_columns_are_written_after_the_core(tmp_path):
  path = c.write_values([row(x_basis="territory", x_m49=56)], tmp_path, prov())
  table, _ = c.read_values(path)
  assert table.schema.names == [*c.CORE, "x_basis", "x_m49"]


def test_file_must_agree_with_its_path(tmp_path):
  path = c.write_values([row()], tmp_path, prov())
  moved = tmp_path / "values" / "indicator=sdg:OTHER" / "coll=places" / "data.parquet"
  moved.parent.mkdir(parents=True)
  path.rename(moved)
  assert c.validate_file(moved) == [
    f"{moved}: rows' indicator differs from the path's 'sdg:OTHER'",
    f"{moved}: provenance indicator '{IND}' differs from the path's 'sdg:OTHER'"]


def test_file_types_are_checked(tmp_path):
  path = tmp_path / "values" / f"indicator={IND}" / "coll=places" / "data.parquet"
  path.parent.mkdir(parents=True)
  t = c.to_table([row()]).set_column(6, "value", pa.array(["15.25"]))
  meta = {c.PROVENANCE_KEY: json.dumps({**prov(), "contract": "1.0.0", "indicator": IND, "coll": "places", "rows": 1})}
  pq.write_table(t.replace_schema_metadata(meta), path)
  assert c.validate_file(path) == [f"{path}: column 'value' is string, expected double"]


def test_file_without_provenance(tmp_path):
  path = tmp_path / "values" / f"indicator={IND}" / "coll=places" / "data.parquet"
  path.parent.mkdir(parents=True)
  pq.write_table(c.to_table([row()]), path)
  assert c.validate_file(path) == [f"{path}: missing key-value metadata 'om:provenance'"]


def test_validate_tree_reports_only_bad_files(tmp_path):
  good = c.write_values([row()], tmp_path, prov())
  bad = tmp_path / "values" / "indicator=sdg:X" / "coll=mr_eez" / "data.parquet"
  bad.parent.mkdir(parents=True)
  pq.write_table(c.to_table([row(indicator="sdg:X", coll="mr_eez", place_id="MRGID:1")]), bad)
  out = c.validate_tree(tmp_path)
  assert list(out) == [str(bad)] and str(good) not in out
