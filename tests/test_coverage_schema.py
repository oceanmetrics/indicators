# the coverage table against schema/coverage.schema.json (om_indicators.schema): one test per rule. the values
# contract's own tests moved to oceanmetrics/extract tests/test_contract.py with om_extract.contract.
import pyarrow as pa
import pyarrow.parquet as pq

from om_indicators import schema as c

IND = "erddap:dhw_5km:CRW_SST:mean"


# coverage ----
def cov_row(**kw):
  base = {"place_id": "NMS:A", "place_name": "Alpha", "coll": "places", "indicator": IND, "time_grain": "year",
          "t0": "2006-01-01", "t1": "2020-01-01", "n_periods": 15, "last_time": "2020-01-01", "last_value": 9.0,
          "last_class": None, "status_method": "iea-sd", "status": "above", "trend": "up", "recent_mean": 7.0,
          "recent_from": "2016-01-01", "recent_to": "2020-01-01", "lt_mean": 2.3, "lt_sd": 3.5, "why": None,
          "sentence": "x", "spark": "[]"}
  return {**base, **kw}


def test_coverage_rows_validate(tmp_path):
  p = tmp_path / "coverage.parquet"
  pq.write_table(pa.Table.from_pylist([cov_row(), cov_row(time_grain="month", status_method=None, status=None, trend=None)]), p)
  assert c.validate_coverage(p) == []


def test_coverage_status_needs_a_method_and_unique_keys(tmp_path):
  p = tmp_path / "coverage.parquet"
  pq.write_table(pa.Table.from_pylist([cov_row(status_method=None), cov_row(status_method=None)]), p)
  assert c.validate_coverage(p) == [
    f"{p}: row 0: a status or trend without a status_method",
    f"{p}: row 1: duplicate (coll, place_id, indicator, time_grain) ('places', 'NMS:A', '{IND}', 'year')",
    f"{p}: row 1: a status or trend without a status_method"]


def test_coverage_status_words(tmp_path):
  p = tmp_path / "coverage.parquet"
  pq.write_table(pa.Table.from_pylist([cov_row(status="good")]), p)
  assert c.validate_coverage(p) == [f"{p}: row 0: status: 'good' is not one of ['above', 'within', 'below', None]"]


def test_coverage_lat_lon_are_optional_and_bounded(tmp_path):
  """lat and lon (the centre of the place's bbox, for ordering by position) may be absent, null, or inside the globe."""
  p = tmp_path / "coverage.parquet"
  pq.write_table(pa.Table.from_pylist([cov_row(), cov_row(place_id="NMS:B", lat=37.0, lon=-123.0), cov_row(place_id="NMS:C", lat=None, lon=None)]), p)
  assert c.validate_coverage(p) == []
  pq.write_table(pa.Table.from_pylist([cov_row(lat=95.0, lon=181.0)]), p)
  assert c.validate_coverage(p) == [f"{p}: row 0: lat: 95.0 is greater than the maximum of 90", f"{p}: row 0: lon: 181.0 is greater than the maximum of 180"]
