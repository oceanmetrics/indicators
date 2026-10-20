# the erddap-places adapter: daily stats -> month and year rows. one test per rule, exact expected rows.
import datetime as dt
import os

import pytest
import requests

from erddap_tree import categorical_table, continuous_table, daterange, entry, make_tree
from om_indicators import contract as c
from om_indicators.adapters import erddap_places as ep

D = dt.date
DAYS_2020 = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


def daily_series(nulls=()):
  """2019-12-15 .. 2021-01-10, value = month + day/100 (closed form), None on `nulls`."""
  return [(d, None if d in nulls else d.month + d.day / 100) for d in daterange(D(2019, 12, 15), D(2021, 1, 10))]


def month_value(m):
  """the closed-form mean of month + day/100 over the days 1..D of 2020 month m."""
  return m + (DAYS_2020[m - 1] + 1) / 200


# native step ----
@pytest.mark.parametrize("dates, step", [
  (daterange(D(2020, 1, 1), D(2020, 3, 1)), 1.0),
  (daterange(D(2020, 1, 1), D(2020, 12, 31), 8), 8.0),
  ([D(2020, m, 15) for m in range(1, 13)], 31.0),
  ([D(2020, 1, 1)], 1.0),
  ([D(2020, 1, 2), D(2020, 1, 2), D(2020, 1, 3)], 1.0),
])
def test_native_step_is_the_median_gap_of_distinct_dates(dates, step):
  assert ep.native_step(dates) == step


def test_monthly_or_coarser_starts_at_28_days():
  assert [ep.is_monthly_or_coarser(s) for s in (1, 8, 27.5, 28, 30, 31)] == [False, False, False, True, True, True]


def test_month_end():
  assert [ep.month_end(D(y, m, 1)) for y, m in ((2020, 2), (2021, 2), (2020, 12), (2020, 4))] == [
    D(2020, 2, 29), D(2021, 2, 28), D(2020, 12, 31), D(2020, 4, 30)]


# month completeness ----
@pytest.mark.parametrize("first, last, step, complete", [
  (D(2019, 12, 15), D(2021, 1, 10), 1.0, [False, True, False]),     # Dec 2019 partial first, Jan 2021 running
  (D(2019, 12, 1), D(2021, 1, 31), 1.0, [True, True, True]),         # whole months at both ends
  (D(2019, 12, 8), D(2021, 1, 24), 8.0, [True, True, True]),         # within (step - 1) days of both ends
  (D(2019, 12, 9), D(2021, 1, 23), 8.0, [False, True, False]),       # one day too late / too early
  (D(2019, 12, 15), D(2021, 1, 10), 30.0, [True, True, True]),       # monthly or coarser: every month
])
def test_month_is_complete(first, last, step, complete):
  months = (D(2019, 12, 1), D(2020, 6, 1), D(2021, 1, 1))
  assert [ep.month_is_complete(m, first, last, step) for m in months] == complete


# continuous month and year rows ----
def test_daily_record_gives_exactly_the_complete_2020_months_and_one_year():
  nulls = {D(2020, 3, 10), D(2020, 3, 11)}
  months = ep.month_rows(daily_series(nulls))
  assert [m["time"] for m in months] == [D(2020, m, 1) for m in range(1, 13)]   # 2019-12 and 2021-01 are dropped
  expected = [month_value(m) for m in range(1, 13)]
  expected[2] = 3 + (496 - 10 - 11) / 29 / 100                                  # March without its 10th and 11th
  assert [m["value"] for m in months] == pytest.approx(expected, abs=1e-12)
  assert [m["n"] for m in months] == [31, 29, 29, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  years = ep.year_rows(months)
  assert years == [{"time": D(2020, 1, 1), "value": pytest.approx(sum(expected) / 12, abs=1e-12), "n": 364.0}]


def test_eight_day_record():
  dates = daterange(D(2020, 1, 1), D(2021, 1, 3), 8)                   # 47 steps, 8 days apart
  months = ep.month_rows([(d, float(i)) for i, d in enumerate(dates)])
  # Jan 2020 starts within 7 days of the first date, Dec 2020 ends within 7 days of the last; Jan 2021 does not
  assert [m["time"] for m in months] == [D(2020, m, 1) for m in range(1, 13)]
  by_month = {m: [i for i, d in enumerate(dates) if d.year == 2020 and d.month == m] for m in range(1, 13)}
  assert [m["value"] for m in months] == [sum(v) / len(v) for v in by_month.values()]
  assert [m["n"] for m in months] == [float(len(v)) for v in by_month.values()]
  assert len(ep.year_rows(months)) == 1


def test_eight_day_record_starting_late_in_january_drops_january():
  series = [(d, 1.0) for d in daterange(D(2020, 1, 9), D(2020, 3, 31), 8)]
  # first date Jan 9 > Jan 1 + 7 drops January; the last date Mar 29 >= Mar 31 - 7 keeps March
  assert [m["time"] for m in ep.month_rows(series)] == [D(2020, 2, 1), D(2020, 3, 1)]
  series = [(d, 1.0) for d in daterange(D(2020, 1, 8), D(2020, 3, 31), 8)]
  assert D(2020, 1, 1) in [m["time"] for m in ep.month_rows(series)]


def test_monthly_record_keeps_every_month_and_a_year_needs_twelve():
  dates = [D(y, m, 15) for y in (2019, 2020, 2021) for m in range(1, 13) if (y, m) >= (2019, 6) and (y, m) <= (2021, 2)]
  series = [(d, float(i)) for i, d in enumerate(dates)]
  months = ep.month_rows(series)
  assert [m["time"] for m in months] == [D(d.year, d.month, 1) for d in dates]    # all 21, first and last included
  assert all(m["n"] == 1.0 for m in months)
  assert [y["time"] for y in ep.year_rows(months)] == [D(2020, 1, 1)]             # 2019 has 7 months, 2021 has 2
  without_may = [(d, v) for d, v in series if d != D(2020, 5, 15)]
  assert ep.year_rows(ep.month_rows(without_may)) == []                           # 11 months: no year row


def test_year_is_the_mean_of_monthly_means_not_of_days():
  # January has 31 days at 10, February 29 days at 20: months weigh the same in the year
  months = [{"time": D(2020, m, 1), "value": 10.0 if m == 1 else 20.0, "n": 31.0 if m == 1 else 29.0} for m in range(1, 13)]
  assert ep.year_rows(months) == [{"time": D(2020, 1, 1), "value": pytest.approx((10 + 11 * 20) / 12), "n": 31 + 11 * 29}]


def test_month_with_only_null_values_gets_no_row():
  series = [(d, None if d.month == 2 else 1.5) for d in daterange(D(2020, 1, 1), D(2020, 3, 31))]
  months = ep.month_rows(series)
  assert [m["time"] for m in months] == [D(2020, 1, 1), D(2020, 3, 1)]
  assert ep.year_rows(months) == []


def test_nan_counts_as_null():
  series = [(d, float("nan") if d.day == 1 else 2.0) for d in daterange(D(2020, 1, 1), D(2020, 1, 31))]
  assert ep.month_rows(series) == [{"time": D(2020, 1, 1), "value": 2.0, "n": 30.0}]


def test_continuous_rows_are_contract_rows():
  rows = ep.continuous_rows("NMS:T", "erddap:dhw_5km:CRW_SST:mean", "Celsius", daily_series())
  assert len(rows) == 13 and c.validate_rows(rows) == []
  assert rows[0] == {"place_id": "NMS:T", "coll": "places", "indicator": "erddap:dhw_5km:CRW_SST:mean",
                     "time_grain": "month", "time": D(2020, 1, 1), "class": None,
                     "value": pytest.approx(month_value(1)), "n": 31.0, "unit": "Celsius"}
  assert rows[-1]["time_grain"] == "year" and rows[-1]["time"] == D(2020, 1, 1) and rows[-1]["n"] == 366.0


# categorical shares ----
def two_class_year():
  """2020 daily: on Jan 1-10 classes 0 and 1 share the place 50/50; on every other day class 0 has all of it. class 2 never
  appears."""
  rows = []
  for d in daterange(D(2020, 1, 1), D(2020, 12, 31)):
    if d.month == 1 and d.day <= 10:
      rows += [(d, "0", 0.5), (d, "1", 0.5)]
    else:
      rows += [(d, "0", 1.0)]
  return rows


def test_class_month_shares_count_an_absent_class_as_zero_and_omit_zero_shares():
  months = ep.class_month_rows(two_class_year())
  assert [(m["time"], m["class"]) for m in months] == [(D(2020, 1, 1), "0"), (D(2020, 1, 1), "1")] + [
    (D(2020, m, 1), "0") for m in range(2, 13)]
  jan = {m["class"]: m for m in months if m["time"] == D(2020, 1, 1)}
  assert jan["1"]["value"] == pytest.approx(5 / 31) and jan["0"]["value"] == pytest.approx(26 / 31)
  assert jan["1"]["n"] == 31.0
  assert {m["value"] for m in months if m["time"] != D(2020, 1, 1)} == {1.0}


def test_class_year_is_the_mean_of_12_monthly_shares_and_shares_sum_to_one():
  months = ep.class_month_rows(two_class_year())
  years = ep.class_year_rows(months)
  assert [(y["time"], y["class"]) for y in years] == [(D(2020, 1, 1), "0"), (D(2020, 1, 1), "1")]
  y = {r["class"]: r for r in years}
  assert y["1"]["value"] == pytest.approx(5 / 31 / 12) and y["0"]["value"] == pytest.approx((26 / 31 + 11) / 12)
  assert y["0"]["n"] == 366.0
  for period in (D(2020, m, 1) for m in range(1, 13)):
    assert sum(m["value"] for m in months if m["time"] == period) == pytest.approx(1.0)
  assert sum(r["value"] for r in years) == pytest.approx(1.0)


def test_class_months_follow_the_completeness_rule():
  rows = [(d, "0", 1.0) for d in daterange(D(2019, 12, 15), D(2021, 1, 10))]
  assert [m["time"] for m in ep.class_month_rows(rows)] == [D(2020, m, 1) for m in range(1, 13)]


def test_categorical_rows_are_contract_rows():
  rows = ep.categorical_rows("NMS:T", "erddap:dhw_5km:CRW_BAA:share", two_class_year())
  assert c.validate_rows(rows) == []
  assert {r["unit"] for r in rows} == {"1"} and {r["class"] for r in rows} == {"0", "1"}
  assert len(rows) == 13 + 2


# parquet tables ----
def test_table_rows_read_the_published_columns():
  rows = ep.table_rows(continuous_table(daily_series()), "NMS:T", "erddap:dhw_5km:CRW_SST:mean", "Celsius", False)
  assert len(rows) == 13
  cat = ep.table_rows(categorical_table([(d, int(k), s) for d, k, s in two_class_year()]), "NMS:T",
                      "erddap:dhw_5km:CRW_BAA:share", "1", True)
  assert {r["class"] for r in cat} == {"0", "1"}


def test_an_empty_file_yields_no_rows():
  assert ep.table_rows(continuous_table([]), "NMS:MNMS", "erddap:dhw_5km:CRW_SST:mean", "Celsius", False) == []
  assert ep.table_rows(categorical_table([]), "NMS:MNMS", "erddap:dhw_5km:CRW_BAA:share", "1", True) == []


# run(): a local copy of the published layout ----
def sst(place, offset=0.0):
  return entry("dhw_5km", "CRW_SST", place, continuous_table([(d, v + offset) for d, v in daily_series()]))


def test_run_writes_valid_files_whose_provenance_lists_the_items_read(tmp_path):
  base = make_tree(tmp_path / "pub", [sst("NMS:CINMS"), sst("NMS:FKNMS", 10.0)])
  summary = ep.run(tmp_path / "cat", base=base, cache=tmp_path / "cache")
  ind = "erddap:dhw_5km:CRW_SST:mean"
  path = c.values_path(tmp_path / "cat", ind, "places")
  assert c.validate_file(path) == [] and c.validate_tree(tmp_path / "cat") == {}
  table, prov = c.read_values(path)
  assert table.num_rows == 26
  assert summary["files"] == [{"indicator": ind, "coll": "places", "path": str(path), "rows": 26, "places": 2}]
  assert summary["empty"] == [] and summary["partial"] == [] and summary["places"] == ["NMS:CINMS", "NMS:FKNMS"]
  years = [r for r in table.to_pylist() if r["time_grain"] == "year"]
  assert [(r["place_id"], r["time"], r["unit"], r["n"]) for r in years] == [
    ("NMS:CINMS", D(2020, 1, 1), "Celsius", 366.0), ("NMS:FKNMS", D(2020, 1, 1), "Celsius", 366.0)]
  assert years[1]["value"] == pytest.approx(years[0]["value"] + 10.0)
  stats = tmp_path / "pub" / "gazetteer" / "stats"
  assert [s["href"] for s in prov["sources"]] == [str(stats / "items" / "dhw_5km_CRW_SST_NMS-CINMS.json"),
                                                  str(stats / "items" / "dhw_5km_CRW_SST_NMS-FKNMS.json")]
  assert all(s["checksum"].startswith("1220") and s["updated"] == "2026-10-19T12:27:05Z" for s in prov["sources"])
  assert prov["producer"] == ep.PRODUCER and prov["license"] == "CC-BY-4.0"
  assert prov["source_version"] == "gazetteer/stats updated 2026-10-19T20:59:51Z"
  assert prov["code"]["adapter"] == "om_indicators.adapters.erddap_places" and prov["code"]["name"] == "om-indicators"


def test_run_writes_categorical_shares_with_class(tmp_path):
  tab = categorical_table([(d, int(k), s) for d, k, s in two_class_year()])
  base = make_tree(tmp_path / "pub", [entry("dhw_5km", "CRW_BAA", "NMS:CINMS", tab, categorical=True, unit="1")])
  summary = ep.run(tmp_path / "cat", base=base, cache=tmp_path / "cache")
  path = c.values_path(tmp_path / "cat", "erddap:dhw_5km:CRW_BAA:share", "places")
  assert c.validate_file(path) == []
  table, _ = c.read_values(path)
  assert table.num_rows == 15 and set(table.column("unit").to_pylist()) == {"1"}
  assert summary["unknown_classes"] == []


def test_run_lists_empty_files_and_does_not_fail_on_them(tmp_path):
  base = make_tree(tmp_path / "pub", [sst("NMS:CINMS"), entry("dhw_5km", "CRW_SST", "NMS:MNMS", continuous_table([]))])
  summary = ep.run(tmp_path / "cat", base=base, cache=tmp_path / "cache")
  assert summary["empty"] == ["dhw_5km/CRW_SST/NMS:MNMS"]
  assert summary["files"][0]["places"] == 1
  _, prov = c.read_values(c.values_path(tmp_path / "cat", "erddap:dhw_5km:CRW_SST:mean", "places"))
  assert len(prov["sources"]) == 2     # the empty file was read too


def test_a_variable_with_only_empty_files_writes_no_file(tmp_path):
  base = make_tree(tmp_path / "pub", [sst("NMS:CINMS"), entry("dhw_5km", "CRW_SSTX", "NMS:MNMS", continuous_table([]))])
  summary = ep.run(tmp_path / "cat", base=base, cache=tmp_path / "cache")
  assert [f["indicator"] for f in summary["files"]] == ["erddap:dhw_5km:CRW_SST:mean"]
  assert summary["empty"] == ["dhw_5km/CRW_SSTX/NMS:MNMS"]


def test_partial_status_is_taken_from_the_item_or_else_the_collection_link(tmp_path):
  # regression: published items written before the status existed carry none; their collection link says "partial"
  base = make_tree(tmp_path / "pub", [sst("NMS:CINMS"), entry("dhw_5km", "CRW_SST", "NMS:PMNM", continuous_table(daily_series()),
                                                             status=None, link_status="partial"),
                                      entry("dhw_5km", "CRW_SST", "NMS:FKNMS", continuous_table(daily_series()), status="partial")])
  summary = ep.run(tmp_path / "cat", base=base, cache=tmp_path / "cache")
  assert summary["partial"] == ["dhw_5km/CRW_SST/NMS:FKNMS", "dhw_5km/CRW_SST/NMS:PMNM"]


def test_a_place_missing_from_the_index_raises_naming_it(tmp_path):
  base = make_tree(tmp_path / "pub", [sst("NMS:CINMS"), sst("NMS:GHOST")], index={"NMS:CINMS": ["places"]})
  with pytest.raises(ValueError, match=r"place_id 'NMS:GHOST' resolves to 0 rows"):
    ep.run(tmp_path / "cat", base=base, cache=tmp_path / "cache")
  assert not (tmp_path / "cat").exists()


def test_a_place_only_in_another_collection_does_not_resolve(tmp_path):
  base = make_tree(tmp_path / "pub", [sst("MRGID:8439")], index={"MRGID:8439": ["mr_eez"]})
  with pytest.raises(ValueError, match=r"place_id 'MRGID:8439' resolves to 0 rows"):
    ep.run(tmp_path / "cat", base=base, cache=tmp_path / "cache")


def test_a_place_in_places_and_a_reference_collection_resolves_to_places(tmp_path):
  # regression: MRGID:8439 is a row of mr_eez and of places in the published index
  base = make_tree(tmp_path / "pub", [sst("MRGID:8439")], index={"MRGID:8439": ["mr_eez", "places"]})
  summary = ep.run(tmp_path / "cat", base=base, cache=tmp_path / "cache")
  assert summary["files"][0]["coll"] == "places"


def test_published_items_point_one_level_too_high_and_the_documented_path_is_used(tmp_path):
  # regression: the published item hrefs are ../../<dataset>/<variable>/<place>.parquet, which leaves stats/
  base = make_tree(tmp_path / "pub", [sst("NMS:CINMS")], href="../../{dataset}/{variable}/{place}.parquet")
  summary = ep.run(tmp_path / "cat", base=base, cache=tmp_path / "cache")
  assert summary["files"][0]["rows"] == 13


def test_a_file_url_base_works(tmp_path):
  base = make_tree(tmp_path / "pub", [sst("NMS:CINMS")])
  summary = ep.run(tmp_path / "cat", base="file://" + base, cache=tmp_path / "cache")
  assert summary["files"][0]["rows"] == 13


def test_only_limits_the_run_to_dataset_variable(tmp_path):
  base = make_tree(tmp_path / "pub", [sst("NMS:CINMS"), entry("dhw_5km", "CRW_SSTX", "NMS:CINMS", continuous_table(daily_series()))])
  summary = ep.run(tmp_path / "cat", base=base, cache=tmp_path / "cache", only=["dhw_5km/CRW_SSTX"])
  assert [f["indicator"] for f in summary["files"]] == ["erddap:dhw_5km:CRW_SSTX:mean"] and summary["items"] == 1
  with pytest.raises(ValueError, match="matches no item"):
    ep.run(tmp_path / "cat", base=base, cache=tmp_path / "cache", only=["dhw_5km/NOPE"])
  with pytest.raises(ValueError, match="dataset/variable"):
    ep.run(tmp_path / "cat", base=base, cache=tmp_path / "cache", only=["dhw_5km"])


# the cache ----
def test_cache_is_keyed_by_the_checksum(tmp_path, monkeypatch):
  calls = []
  f = ep.Fetcher(tmp_path / "cache")
  monkeypatch.setattr(f, "read_bytes", lambda loc: calls.append(loc) or b"x")
  a = f.cached("https://example.org/a.parquet", "ds/var/NMS_T", "1220aaaaaaaaaaaaaaaaaaaa")
  assert f.cached("https://example.org/a.parquet", "ds/var/NMS_T", "1220aaaaaaaaaaaaaaaaaaaa") == a
  assert len(calls) == 1                                                        # same checksum: no refetch
  b = f.cached("https://example.org/a.parquet", "ds/var/NMS_T", "1220bbbbbbbbbbbbbbbbbbbb")
  assert b != a and len(calls) == 2                                             # changed checksum: refetched
  f.cached("https://example.org/a.parquet", "idx", None)
  f.cached("https://example.org/a.parquet", "idx", None)
  assert len(calls) == 4                                                        # no checksum: always refetched


# network ----
def _bucket_reachable() -> bool:
  try:
    return requests.head(ep.DEFAULT_BASE, timeout=10).status_code == 200
  except requests.RequestException:
    return False


@pytest.mark.network
@pytest.mark.skipif(os.environ.get("OM_OFFLINE") == "1", reason="OM_OFFLINE=1")
def test_published_cinms_sst_has_complete_years_1986_to_2025(tmp_path):
  if not _bucket_reachable():
    pytest.skip("bucket unreachable")
  ep.run(tmp_path, cache=tmp_path / "cache", only=["dhw_5km/CRW_SST"])
  table, _ = c.read_values(c.values_path(tmp_path, "erddap:dhw_5km:CRW_SST:mean", "places"))
  rows = [r for r in table.to_pylist() if r["place_id"] == "NMS:CINMS"]
  years = [r for r in rows if r["time_grain"] == "year"]
  assert [r["time"].year for r in years] == list(range(1986, 2026))          # the record starts 1985-04-01
  months = [r["time"] for r in rows if r["time_grain"] == "month"]
  assert all(sum(1 for t in months if t.year == y) == 12 for y in range(1986, 2026))
  assert all(10 < r["value"] < 20 for r in years)             # annual means; monthly peaks reach ~21.5 in late summer
  assert all(10 < r["value"] < 25 for r in rows) and {r["unit"] for r in rows} == {"Celsius"}
