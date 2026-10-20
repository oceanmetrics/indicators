# the eco-indicators adapter: Copernicus Marine sanctuary means -> month and year rows. one test per rule, exact rows.
# the fixtures are synthetic (made-up numbers in the real column layout of copernicus.csv and copernicus_variables.csv).
import datetime as dt
import hashlib
import json
import os

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
import requests

from om_indicators import contract as c
from om_indicators.adapters import eco_indicators as eco

D = dt.date
SHA = "0dbf817bfc54c644315e1f4ba97d4d43498f5527"
PHY = "cmems_mod_glo_phy_my_0.083deg_P1M-m"
MYINT = "cmems_mod_glo_phy_myint_0.083deg_P1M-m"
PLK = "cmems_obs-oc_glo_bgc-plankton_my_l4-multi-4km_P1M"
THETAO = f"cmems:{PHY}:thetao:mean"


def stamp(y, m):
  return f"{y}-{m:02d}-01T00:00:00Z"


def csv_text(rows):
  """copernicus.csv text from (nms, dataset, var, year, month, stat, value) tuples."""
  return "nms,dataset,var,time,stat,value\n" + "".join(
    f"{n},{d},{v},{stamp(y, m)},{s},{x}\n" for n, d, v, y, m, s, x in rows)


def variables_text():
  head = "dataset_id,product_id,product_title,time_min,time_max,variable,standard_name,units\n"
  rows = [(PHY, "GLOBAL_MULTIYEAR_PHY_001_030", "Global Ocean Physics Reanalysis", "thetao", "degrees_C"),
          (PHY, "GLOBAL_MULTIYEAR_PHY_001_030", "Global Ocean Physics Reanalysis", "so", "1e-3"),
          (MYINT, "GLOBAL_MULTIYEAR_PHY_001_030", "Global Ocean Physics Reanalysis", "thetao", "degrees_C"),
          (PLK, "OCEANCOLOUR_GLO_BGC_L4_MY_009_104", "Global Ocean Colour, L4 monthly", "CHL", "milligram m-3"),
          (PLK, "OCEANCOLOUR_GLO_BGC_L4_MY_009_104", "Global Ocean Colour, L4 monthly", "CHL_uncertainty", "percent"),
          (PLK, "OCEANCOLOUR_GLO_BGC_L4_MY_009_104", "Global Ocean Colour, L4 monthly", "flags", "")]
  return head + "".join(f'{d},{p},"{t}",1993-01-01,2026-02-01,{v},std,{u}\n' for d, p, t, v, u in rows)


def year_of_means(nms, dataset, var, year, base, skip=()):
  """24 rows: a mean of base + month/100 and an sd of month/10 for each month of `year` not in `skip` ('NA' for skip)."""
  out = []
  for m in range(1, 13):
    out.append((nms, dataset, var, year, m, "mean", "NA" if m in skip else base + m / 100))
    out.append((nms, dataset, var, year, m, "sd", m / 10))
  return out


# places ----
def test_codes_map_to_gazetteer_ids_and_cpnms_is_chumash_heritage():
  assert eco.place_id("CINMS") == "NMS:CINMS"
  assert eco.place_id("CPNMS") == "NMS:CHNMS"      # "Chumash Proposed Action" in eco-indicators' sanctuaries.geojson
  assert eco.place_id("NMSAS") == "NMS:NMSAS"


def test_monterey_bay_sub_areas_are_dropped():
  assert eco.place_id("MBNMS-david") is None and eco.place_id("MBNMS-main") is None
  assert eco.place_id("MBNMS") == "NMS:MBNMS"


def test_an_unknown_code_raises_rather_than_vanish():
  with pytest.raises(ValueError, match="unknown sanctuary code 'XXNMS'"):
    eco.place_id("XXNMS")


def test_place_mapping_constants_are_consistent():
  assert all(v.startswith("NMS:") for v in eco.PLACE_IDS.values())
  assert len(set(eco.PLACE_IDS.values())) == len(eco.PLACE_IDS)
  assert not set(eco.PLACE_IDS) & eco.DROPPED
  assert len(eco.PLACE_IDS) == 13


# variables ----
def test_depth_suffix_is_cleaned():
  assert eco.clean_var("thetao_depth=0.49402499") == "thetao"
  assert eco.clean_var("so_depth=0.49402499") == "so"
  assert eco.clean_var("bottomT") == "bottomT" and eco.clean_var("CHL") == "CHL"


@pytest.mark.parametrize("dataset, var, kept", [
  (PHY, "thetao", True), (PHY, "mlotst", True), (PLK, "DIATO", True), ("cmems_obs-oc_glo_bgc-pp_my_l4-multi-4km_P1M", "PP", True),
  (MYINT, "thetao", False),                       # duplicates the my record
  (PLK, "CHL_uncertainty", False), (PLK, "flags", False), ("cmems_obs-oc_glo_bgc-pp_my_l4-multi-4km_P1M", "flags", False),
  (PHY, "uo", False),                             # not a variable we publish
])
def test_which_variables_are_kept(dataset, var, kept):
  assert eco.keep(dataset, var) is kept


def test_read_means_keeps_only_published_variables_and_reads_na_as_none():
  text = csv_text([("CINMS", PHY, "thetao_depth=0.49402499", 1993, 1, "mean", 15.5),
                   ("CINMS", PHY, "thetao_depth=0.49402499", 1993, 1, "sd", 0.5),
                   ("CINMS", PHY, "thetao_depth=0.49402499", 1993, 2, "mean", "NA"),
                   ("CINMS", MYINT, "thetao_depth=0.49402499", 2022, 1, "mean", 99),
                   ("CINMS", PLK, "CHL_uncertainty", 1998, 1, "mean", 9),
                   ("CINMS", PLK, "flags", 1998, 1, "mean", 1)])
  assert eco.read_means(text) == {("CINMS", PHY, "thetao"): {"mean": {D(1993, 1, 1): 15.5, D(1993, 2, 1): None},
                                                           "sd": {D(1993, 1, 1): 0.5}}}


def test_a_timestamp_inside_a_month_is_that_months_first_day():
  text = "nms,dataset,var,time,stat,value\n" + f"CINMS,{PHY},bottomT,1993-01-16T12:00:00Z,mean,5\n"
  assert list(eco.read_means(text)[("CINMS", PHY, "bottomT")]["mean"]) == [D(1993, 1, 1)]


# month and year rows ----
def test_month_rows_are_the_monthly_mean_with_n_one_and_the_spatial_sd():
  mean = {D(2020, 1, 1): 10.0, D(2020, 2, 1): None, D(2020, 3, 1): 12.0}
  sd = {D(2020, 1, 1): 0.5, D(2020, 2, 1): 0.6, D(2020, 3, 1): None}
  assert eco.month_rows("NMS:A", THETAO, "degrees_C", mean, sd) == [
    {"place_id": "NMS:A", "coll": "places", "indicator": THETAO, "time_grain": "month", "time": D(2020, 1, 1), "class": None,
     "value": 10.0, "n": 1.0, "unit": "degrees_C", "x_sd": 0.5},
    {"place_id": "NMS:A", "coll": "places", "indicator": THETAO, "time_grain": "month", "time": D(2020, 3, 1), "class": None,
     "value": 12.0, "n": 1.0, "unit": "degrees_C", "x_sd": None}]       # a month without a mean has no row


def test_year_rows_need_all_12_months_and_average_the_monthly_means():
  m = {D(2020, k, 1): float(k) for k in range(1, 13)} | {D(2021, k, 1): 1.0 for k in range(1, 12)}
  months = eco.month_rows("NMS:A", THETAO, "degrees_C", m, {})
  assert eco.year_rows("NMS:A", THETAO, "degrees_C", months) == [
    {"place_id": "NMS:A", "coll": "places", "indicator": THETAO, "time_grain": "year", "time": D(2020, 1, 1), "class": None,
     "value": 6.5, "n": 12.0, "unit": "degrees_C", "x_sd": None}]       # 2021 has 11 months: no row


def test_regression_a_year_with_one_na_month_gets_no_year_row():
  text = csv_text(year_of_means("CINMS", PLK, "CHL", 1998, 0.3, skip=(4,)) + year_of_means("CINMS", PLK, "CHL", 1999, 0.3))
  inds = eco.indicator_rows(eco.read_means(text), eco.read_variables(variables_text()))
  rows = inds[f"cmems:{PLK}:CHL:mean"]["rows"]
  assert [r["time"].year for r in rows if r["time_grain"] == "year"] == [1999]
  assert sum(r["time_grain"] == "month" and r["time"].year == 1998 for r in rows) == 11


def test_units_come_from_the_variables_csv_verbatim():
  text = csv_text(year_of_means("CINMS", PHY, "so_depth=0.49402499", 2000, 35.0))
  rows = eco.indicator_rows(eco.read_means(text), eco.read_variables(variables_text()))[f"cmems:{PHY}:so:mean"]["rows"]
  assert {r["unit"] for r in rows} == {"1e-3"}


def test_a_variable_missing_from_the_variables_csv_raises():
  text = csv_text(year_of_means("CINMS", PHY, "mlotst", 2000, 30.0))
  with pytest.raises(ValueError, match="not in copernicus_variables.csv"):
    eco.indicator_rows(eco.read_means(text), eco.read_variables(variables_text()))


def test_dataset_meta_is_the_product_with_its_doi_and_licence():
  assert eco.dataset_meta("GLOBAL_MULTIYEAR_PHY_001_030", "Global Ocean Physics Reanalysis") == {
    "id": "GLOBAL_MULTIYEAR_PHY_001_030", "title": "Global Ocean Physics Reanalysis",
    "via": "https://github.com/noaa-onms/eco-indicators",
    "providers": [{"name": "Copernicus Marine Service (Mercator Ocean International)", "roles": ["producer", "licensor"],
                   "url": "https://marine.copernicus.eu"},
                  {"name": "noaa-onms/eco-indicators", "roles": ["processor"], "url": "https://github.com/noaa-onms/eco-indicators"}],
    "license": "other",
    "citation": "E.U. Copernicus Marine Service Information; Global Ocean Physics Reanalysis; https://doi.org/10.48670/moi-00021",
    "doi": "https://doi.org/10.48670/moi-00021"}


# pinning ----
class FakeFetcher:
  def __init__(self, payload=None, error=None):
    self.payload, self.error, self.urls = payload, error, []

  def read_bytes(self, url):
    self.urls.append(url)
    if self.error:
      raise RuntimeError(self.error)
    return json.dumps(self.payload).encode()


def test_default_pin_is_the_latest_commit_that_touched_the_values_file():
  f = FakeFetcher([{"sha": SHA, "commit": {"committer": {"date": "2026-04-18T15:55:40Z"}}}])
  assert eco.resolve_commit(None, f) == (SHA, "2026-04-18T15:55:40Z")
  assert f.urls == ["https://api.github.com/repos/noaa-onms/eco-indicators/commits?sha=main&path=data/copernicus.csv&per_page=1"]


def test_a_named_ref_is_resolved_to_its_full_sha():
  f = FakeFetcher({"sha": SHA, "commit": {"committer": {"date": "2026-04-18T15:55:40Z"}}})
  assert eco.resolve_commit("0dbf817", f) == (SHA, "2026-04-18T15:55:40Z")
  assert f.urls == ["https://api.github.com/repos/noaa-onms/eco-indicators/commits/0dbf817"]


def test_when_the_api_fails_the_ref_is_the_fallback_and_without_one_the_error_says_so():
  assert eco.resolve_commit(SHA, FakeFetcher(error="rate limit")) == (SHA, None)
  with pytest.raises(RuntimeError, match="pass --ref"):
    eco.resolve_commit(None, FakeFetcher(error="rate limit"))


# run ----
def make_raw(tmp_path, rows, variables=None):
  raw = tmp_path / "raw"
  (raw / SHA / "data").mkdir(parents=True)
  (raw / SHA / eco.PATH_VALUES).write_text(csv_text(rows))
  (raw / SHA / eco.PATH_VARIABLES).write_text(variables or variables_text())
  return raw


def make_index(tmp_path, ids=("NMS:CINMS", "NMS:CHNMS", "NMS:MBNMS")):
  p = tmp_path / "places_index.parquet"
  pq.write_table(pa.table({"place_id": list(ids), "collection": ["places"] * len(ids)}), p)
  return p


def fixture_rows():
  return (year_of_means("CINMS", PHY, "thetao_depth=0.49402499", 2000, 15.0)
          + year_of_means("CPNMS", PHY, "thetao_depth=0.49402499", 2000, 14.0)
          + year_of_means("MBNMS-david", PHY, "thetao_depth=0.49402499", 2000, 4.0)
          + year_of_means("MBNMS-main", PHY, "thetao_depth=0.49402499", 2000, 12.0)
          + year_of_means("CINMS", MYINT, "thetao_depth=0.49402499", 2022, 16.0)
          + year_of_means("CINMS", PLK, "CHL", 2000, 0.3)
          + year_of_means("CINMS", PLK, "CHL_uncertainty", 2000, 9.0)
          + year_of_means("CINMS", PLK, "flags", 2000, 1.0))


def resolver(ref, fetcher):
  return SHA, "2026-04-18T15:55:40Z"


def test_run_writes_exact_rows_for_kept_places_and_variables(tmp_path):
  s = eco.run(tmp_path / "out", cache=tmp_path / "cache", raw=str(make_raw(tmp_path, fixture_rows())),
              index=make_index(tmp_path), resolve=resolver)
  assert [f["indicator"] for f in s["files"]] == [THETAO, f"cmems:{PLK}:CHL:mean"]       # no myint, no uncertainty, no flags
  assert s["ref"] == SHA and s["commit_date"] == "2026-04-18T15:55:40Z"
  table, _ = c.read_values(c.values_path(tmp_path / "out", THETAO, "places"))
  rows = table.to_pylist()
  assert sorted({r["place_id"] for r in rows}) == ["NMS:CHNMS", "NMS:CINMS"]              # CPNMS -> CHNMS; sub-areas dropped
  chnms = [r for r in rows if r["place_id"] == "NMS:CHNMS"]
  assert len(chnms) == 13 and chnms[0]["time_grain"] == "year"
  assert chnms[0] == {"place_id": "NMS:CHNMS", "coll": "places", "indicator": THETAO, "time_grain": "year",
                      "time": D(2000, 1, 1), "class": None, "value": pytest.approx(14.0 + 0.065), "n": 12.0,
                      "unit": "degrees_C", "x_sd": None}
  jan = chnms[1]
  assert (jan["time_grain"], jan["time"], jan["n"], jan["unit"], jan["x_sd"]) == ("month", D(2000, 1, 1), 1.0, "degrees_C", 0.1)
  assert jan["value"] == pytest.approx(14.01)


def test_run_provenance_pins_the_commit_and_checksums_every_source(tmp_path):
  raw = make_raw(tmp_path, fixture_rows())
  eco.run(tmp_path / "out", cache=tmp_path / "cache", raw=str(raw), index=make_index(tmp_path), resolve=resolver)
  assert c.validate_tree(tmp_path / "out") == {}
  _, p = c.read_values(c.values_path(tmp_path / "out", THETAO, "places"))
  assert p["producer"] == {"name": "noaa-onms/eco-indicators", "url": "https://github.com/noaa-onms/eco-indicators", "version": SHA}
  assert [s["href"] for s in p["sources"]] == [str(raw / SHA / "data" / "copernicus.csv"),
                                               str(raw / SHA / "data" / "copernicus_variables.csv")]
  assert p["sources"][0]["checksum"] == "sha256:" + hashlib.sha256((raw / SHA / eco.PATH_VALUES).read_bytes()).hexdigest()
  assert {s["updated"] for s in p["sources"]} == {"2026-04-18T15:55:40Z"}
  assert p["source_version"] == "noaa-onms/eco-indicators 0dbf817, 2026-04-18"
  assert p["dataset"]["id"] == "GLOBAL_MULTIYEAR_PHY_001_030" and p["dataset"]["license"] == "other"
  assert "https://marine.copernicus.eu/user-corner/service-commitments-and-licence" in p["method"]
  assert "sanctuaries.rds" in p["method"] and "NMS:CHNMS" in p["method"]
  assert p["license"] == "CC-BY-4.0" and p["code"]["adapter"] == "om_indicators.adapters.eco_indicators"


def test_run_refuses_a_place_the_gazetteer_does_not_have(tmp_path):
  with pytest.raises(ValueError, match=r"place_id 'NMS:CHNMS' resolves to 0 rows"):
    eco.run(tmp_path / "out", cache=tmp_path / "cache", raw=str(make_raw(tmp_path, fixture_rows())),
            index=make_index(tmp_path, ids=("NMS:CINMS",)), resolve=resolver)
  assert not (tmp_path / "out").exists()


def test_the_cache_is_keyed_by_the_commit_and_reused(tmp_path):
  raw = make_raw(tmp_path, fixture_rows())
  eco.run(tmp_path / "o1", cache=tmp_path / "cache", raw=str(raw), index=make_index(tmp_path), resolve=resolver)
  assert (tmp_path / "cache" / SHA / "copernicus.csv").exists()
  (raw / SHA / eco.PATH_VALUES).write_text("nms,dataset,var,time,stat,value\n")        # the commit is immutable: not refetched
  eco.run(tmp_path / "o2", cache=tmp_path / "cache", raw=str(raw), index=make_index(tmp_path), resolve=resolver)
  assert c.validate_tree(tmp_path / "o2") == {}


# network ----
def _api_reachable() -> bool:
  try:
    return requests.get("https://api.github.com/rate_limit", timeout=10).status_code == 200
  except requests.RequestException:
    return False


@pytest.mark.network
@pytest.mark.skipif(os.environ.get("OM_OFFLINE") == "1", reason="OM_OFFLINE=1")
def test_published_products_match_their_dois_and_titles(tmp_path):
  """the product DOIs are typed here (the CSV and the bib carry none): DataCite must title each one as the CSV does."""
  if not _api_reachable():
    pytest.skip("github api unreachable")
  f = eco.ep.Fetcher(tmp_path)
  sha, _ = eco.resolve_commit(None, f)
  assert len(sha) == 40
  titles = {r["product_id"]: r["product_title"] for r in eco.read_variables(
    f.read_bytes(f"{eco.RAW}/{sha}/{eco.PATH_VARIABLES}").decode()).values()}
  for product, doi in eco.PRODUCT_DOIS.items():
    got = json.loads(f.read_bytes("https://api.datacite.org/dois/" + doi.removeprefix("https://doi.org/")))
    assert got["data"]["attributes"]["titles"][0]["title"] == titles[product]
