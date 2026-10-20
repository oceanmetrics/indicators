"""indicator requests: the form is parsed, checked against the manifest and the gazetteer, and labelled; nothing from
the issue reaches a command unchecked. one test per rule, synthetic fixtures, no network."""
import datetime as dt

import pytest

from om_indicators.requests import (
  MAX_AUTO_VALUES, MAX_CMEMS_VALUES, add_item, check_job, classify, cmems_grid_step, comment, estimate_cmems_values,
  estimate_values, grid_cells, item_href, job_family, parse_issue_form, time_steps,
)

BODY = """### Place

`NMS:CINMS` (Channel Islands)

### Collection

places

### Indicator

erddap:dhw_5km:CRW_SST:mean

### Time range

_No response_

### Purpose

A condition report.
"""

NO3 = "cmems:cmems_mod_glo_bgc_my_0.25deg_P1M-m:no3:mean"
CHL = "cmems:cmems_obs-oc_glo_bgc-plankton_my_l4-multi-4km_P1M:CHL:mean"
MANIFEST = {"indicators": [
  {"id": "erddap:dhw_5km:CRW_SST:mean", "short": "SST", "producer": {"name": "erddap-places"},
   "dataset": {"stac": "stac:dhw_5km"}},
  {"id": "sdg:ER_MRN_MPA", "short": "MPA coverage", "producer": {"name": "places/proto/eez_indicators"},
   "dataset": {"stac": None}},
  {"id": NO3, "short": "Nitrate", "producer": {"name": "noaa-onms/eco-indicators"}, "dataset": {"stac": None},
   "time_range": ["1993-01-01", "2026-08-01"]},
  {"id": CHL, "short": "Chlorophyll", "producer": {"name": "noaa-onms/eco-indicators"}, "dataset": {"stac": None},
   "time_range": ["1997-09-01", "2026-08-01"]},
]}
LAYERS = {"layers": [{"slug": "places", "kind": "vector"}, {"slug": "noaa_nerrs", "kind": "vector"},
                     {"slug": "mr_eez", "kind": "raster", "raster": {"feature_url": "https://geo.example/wfs?mrgid={source_id}"}},
                     {"slug": "fao_high_seas", "kind": "derived", "display": {"via": "fao_major_areas", "id_from": "fao_id"}},
                     {"slug": "ref_tiles_only", "kind": "raster", "raster": {"tiles": ["https://geo.example/{z}/{x}/{y}"]}}]}
ROWS = {
  "NMS:CINMS": {"place_id": "NMS:CINMS", "name": "Channel Islands", "collection": "places",
                "bbox": {"xmin": -120.64, "ymin": 33.36, "xmax": -118.91, "ymax": 34.21}},
  "NERR:ELK": {"place_id": "NERR:ELK", "name": "Elkhorn Slough", "collection": "noaa_nerrs",
               "bbox": {"xmin": -121.80, "ymin": 36.79, "xmax": -121.74, "ymax": 36.86}},
  "MRGID:8456": {"place_id": "MRGID:8456", "name": "United States EEZ", "collection": "mr_eez",
                 "bbox": {"xmin": -129.2, "ymin": 23.8, "xmax": -65.7, "ymax": 49.0}},
  "MRGID:5670": {"place_id": "MRGID:5670", "name": "Albanian EEZ", "collection": "mr_eez",
                 "bbox": {"xmin": 18.9, "ymin": 39.6, "xmax": 20.0, "ymax": 42.0}},
  "FAO:21": {"place_id": "FAO:21", "name": "High seas, FAO area 21", "collection": "fao_high_seas",
             "bbox": {"xmin": -70.0, "ymin": 35.0, "xmax": -42.0, "ymax": 60.0}},
  "REF:1": {"place_id": "REF:1", "name": "A reference place", "collection": "ref_tiles_only",
            "bbox": {"xmin": 18.9, "ymin": 39.6, "xmax": 20.0, "ymax": 42.0}},
  "BIG:1": {"place_id": "BIG:1", "name": "A big box", "collection": "noaa_nerrs",
            "bbox": {"xmin": -130, "ymin": 20, "xmax": -60, "ymax": 50}},
}
DIMS = {"time": {"extent": ["1985-04-01T12:00:00Z", None], "step": "P1D"},
        "latitude": {"extent": [-89.975, 89.975], "step": 0.05}, "longitude": {"extent": [-179.975, 179.975], "step": 0.05}}
TODAY = dt.date(2026, 10, 20)


def run(form, has=False):
  return classify(form, MANIFEST, LAYERS, ROWS.get, lambda url: DIMS, lambda p, c, i: has, TODAY)


def test_parse_reads_each_field_and_empties_no_response():
  f = parse_issue_form(BODY)
  assert f == {"place": "`NMS:CINMS` (Channel Islands)", "collection": "places", "indicator": "erddap:dhw_5km:CRW_SST:mean",
               "time": "", "purpose": "A condition report."}


def test_time_steps_by_day_month_and_year():
  assert time_steps("P1D", dt.date(2020, 1, 1), dt.date(2020, 12, 31)) == 366
  assert time_steps("P8D", dt.date(2020, 1, 1), dt.date(2020, 1, 17)) == 3
  assert time_steps("P1M", dt.date(2020, 1, 1), dt.date(2020, 12, 1)) == 12
  assert time_steps("P1Y", dt.date(2000, 1, 1), dt.date(2025, 1, 1)) == 26
  with pytest.raises(ValueError):
    time_steps("PT6H", dt.date(2020, 1, 1), dt.date(2020, 1, 2))


def test_grid_cells_rounds_up_and_crosses_the_antimeridian():
  assert grid_cells({"xmin": 0, "ymin": 0, "xmax": 1, "ymax": 0.5}, 0.05, 0.05) == 20 * 10
  assert grid_cells({"xmin": 179.9, "ymin": 0, "xmax": -179.9, "ymax": 0.1}, 0.05, 0.05) == 4 * 2


def test_estimate_is_bbox_cells_times_the_record():
  # CINMS: 35 x 17 cells of 0.05 deg; 1985-04-01 .. 2026-10-20 daily = 15,178 days
  assert estimate_values(ROWS["NMS:CINMS"]["bbox"], DIMS, TODAY) == 35 * 17 * 15178


def test_auto_for_a_small_catalogued_job_on_a_public_place():
  t = run(parse_issue_form(BODY))
  assert t.label == "auto"
  assert t.job == {"dataset": "dhw_5km", "variable": "CRW_SST", "indicator": "erddap:dhw_5km:CRW_SST:mean", "coll": "places", "place": "NMS:CINMS"}
  assert t.estimate == 35 * 17 * 15178


def test_already_when_the_place_has_values():
  assert run(parse_issue_form(BODY), has=True).label == "already"


def test_needs_review_over_the_size_limit():
  t = run({"place": "BIG:1", "indicator": "erddap:dhw_5km:CRW_SST:mean"})
  assert t.label == "needs-review" and t.estimate > MAX_AUTO_VALUES
  assert "over the 50 M limit" in t.reasons[-1]


def test_an_eez_runs_by_itself_now_that_erddap_places_reads_it_from_the_publishers_feature_service():
  t = run({"place": "MRGID:5670", "collection": "mr_eez", "indicator": "erddap:dhw_5km:CRW_SST:mean"})
  assert t.label == "auto"


def test_a_large_eez_still_needs_review_for_its_size():
  t = run({"place": "MRGID:8456", "collection": "mr_eez", "indicator": "erddap:dhw_5km:CRW_SST:mean"})
  assert t.label == "needs-review" and "over the 50 M limit" in t.reasons[-1]


def test_needs_review_for_a_reference_collection_with_tiles_only():
  t = run({"place": "REF:1", "indicator": "erddap:dhw_5km:CRW_SST:mean"})
  assert t.label == "needs-review" and "neither published nor served" in t.reasons[-1]


def test_needs_review_for_a_producer_that_runs_by_hand():
  t = run({"place": "NMS:CINMS", "indicator": "sdg:ER_MRN_MPA"})
  assert t.label == "needs-review" and "runs only by hand" in t.reasons[-1]


def test_needs_review_for_an_unknown_indicator_place_or_a_described_dataset():
  assert "not in the manifest" in run({"place": "NMS:CINMS", "indicator": "erddap:mur:sst:mean"}).reasons[-1]
  assert "not in the gazetteer" in run({"place": "NMS:NOPE", "indicator": "erddap:dhw_5km:CRW_SST:mean"}).reasons[-1]
  assert "not an indicator id" in run({"place": "NMS:CINMS", "indicator": "MUR SST please"}).reasons[-1]


def test_the_place_collection_wins_over_the_form_and_says_so():
  t = run({"place": "NERR:ELK", "collection": "places", "indicator": "erddap:dhw_5km:CRW_SST:mean"})
  assert t.label == "auto" and t.job["coll"] == "noaa_nerrs"
  assert t.reasons[0] == "NERR:ELK is in the collection noaa_nerrs, not places; using noaa_nerrs"


def test_injection_in_a_field_never_becomes_a_job():
  # either refused, or only the clean first token survives into the job
  for place in ["NMS:CINMS; rm -rf /", "$(curl x)", "NMS:CINMS`id`", "../../etc", "NMS:CINMS\nrm"]:
    t = run({"place": place, "indicator": "erddap:dhw_5km:CRW_SST:mean"})
    assert t.label == "needs-review" or t.job["place"] == "NMS:CINMS"
  with pytest.raises(ValueError):
    check_job({"dataset": "dhw_5km", "variable": "CRW_SST", "indicator": "erddap:dhw_5km:CRW_SST:mean", "coll": "places", "place": "NMS:A;ls"})
  with pytest.raises(ValueError):
    check_job({"dataset": "dhw 5km", "variable": "CRW_SST", "indicator": "erddap:dhw_5km:CRW_SST:mean", "coll": "places", "place": "NMS:A"})


def test_check_job_keeps_only_the_known_keys():
  job = {"dataset": "dhw_5km", "variable": "CRW_SST", "indicator": "erddap:dhw_5km:CRW_SST:mean", "coll": "places", "place": "NMS:CINMS", "extra": "x"}
  assert check_job(job) == {k: job[k] for k in ("dataset", "variable", "indicator", "coll", "place")}


def test_comment_states_the_outcome_and_the_reasons():
  c = comment(run(parse_issue_form(BODY)), {})
  assert c.startswith("This request is small and uses a catalogued dataset, so it will run by itself")
  assert "- about 9.0 M grid values: small enough to run by itself" in c  # 35 x 17 x 15,178
  assert "Place view: https://oceanmetrics.io/indicators/#view=place&place=NMS:CINMS&coll=places&ind=erddap:dhw_5km:CRW_SST:mean" in c


def test_with_autorun_off_a_small_request_waits_for_the_run_label():
  c = comment(run(parse_issue_form(BODY)), {}, autorun=False)
  assert c.startswith("This request is small and uses a catalogued dataset, so it is ready to run on the Ocean Metrics "
                      "runner. A maintainer starts it by adding the `run` label;")
  assert "will run by itself on" not in c


def test_item_href_is_the_erddap_places_item_id():
  job = {"dataset": "dhw_5km", "variable": "CRW_SST", "indicator": "erddap:dhw_5km:CRW_SST:mean", "coll": "noaa_nerrs", "place": "NERRS:WEL"}
  assert item_href(job) == "items/dhw_5km_CRW_SST_NERRS-WEL.json"


def test_add_item_keeps_one_of_each_and_refuses_anything_else():
  assert add_item(["items/b.json"], "items/a.json") == ["items/a.json", "items/b.json"]
  assert add_item(["items/a.json"], "items/a.json") == ["items/a.json"]
  with pytest.raises(ValueError):
    add_item([], "../items/a.json")


# ---- Copernicus Marine requests: needs-review, but a maintainer can accept them with the `run` label ----

def test_cmems_grid_step_comes_from_the_dataset_id():
  assert cmems_grid_step("cmems_mod_glo_bgc_my_0.25deg_P1M-m") == 0.25
  assert cmems_grid_step("cmems_mod_glo_phy_my_0.083deg_P1M-m") == 0.083
  assert cmems_grid_step("cmems_obs-oc_glo_bgc-plankton_my_l4-multi-4km_P1M") == pytest.approx(4 / 111.32)
  with pytest.raises(ValueError, match="not in its id"):
    cmems_grid_step("cmems_mystery_P1M")


def test_cmems_estimate_is_the_buffered_box_times_the_months_of_the_record():
  # Albanian EEZ box grown by one 0.25 deg cell each side: 1.6 x 2.9 deg = 7 x 12 cells; 1993-01 .. 2026-08 = 404 months
  assert estimate_cmems_values(ROWS["MRGID:5670"]["bbox"], "cmems_mod_glo_bgc_my_0.25deg_P1M-m", ["1993-01-01", "2026-08-01"]) == 7 * 12 * 404
  with pytest.raises(ValueError, match="time step or record is unknown"):
    estimate_cmems_values(ROWS["MRGID:5670"]["bbox"], "cmems_mod_glo_bgc_my_0.25deg_P1M-m", None)


def test_a_cmems_request_for_a_reference_place_is_approvable():
  t = run({"place": "MRGID:5670", "collection": "mr_eez", "indicator": NO3})
  assert t.label == "needs-review" and t.approvable
  assert t.job == {"dataset": "cmems_mod_glo_bgc_my_0.25deg_P1M-m", "variable": "no3", "indicator": NO3, "coll": "mr_eez", "place": "MRGID:5670"}
  assert t.estimate == 7 * 12 * 404
  assert t.reasons[0] == ("Nitrate is a Copernicus Marine dataset: its run uses a personal Copernicus Marine login, so it is "
                          "not started automatically")
  assert t.reasons[-1] == "33,936 grid values (the place's box and the whole record): small enough for the place producer"


def test_a_cmems_request_for_a_vector_place_is_approvable():
  t = run({"place": "NERR:ELK", "indicator": NO3})
  assert t.label == "needs-review" and t.approvable and t.job["coll"] == "noaa_nerrs"


def test_a_cmems_job_is_checked_like_any_other():
  t = run({"place": "MRGID:5670", "indicator": NO3})
  assert check_job(t.job)["dataset"] == "cmems_mod_glo_bgc_my_0.25deg_P1M-m"
  assert job_family(t.job) == "cmems"
  assert job_family({**t.job, "indicator": "erddap:dhw_5km:CRW_SST:mean"}) == "erddap"
  with pytest.raises(ValueError, match="no producer runs"):
    job_family({**t.job, "indicator": "sdg:ER_MRN_MPA"})
  with pytest.raises(ValueError):
    check_job({**t.job, "dataset": "cmems_x;ls"})


def test_a_cmems_request_for_a_derived_collection_is_not_approvable():
  t = run({"place": "FAO:21", "indicator": NO3})
  assert t.label == "needs-review" and not t.approvable and t.job is None
  assert "neither published nor served one place at a time" in t.reasons[-1]


def test_a_cmems_request_for_a_reference_collection_with_tiles_only_is_not_approvable():
  t = run({"place": "REF:1", "indicator": NO3})
  assert t.label == "needs-review" and not t.approvable
  assert "neither published nor served" in t.reasons[-1]


def test_a_cmems_request_for_a_sanctuary_stays_with_eco_indicators():
  t = run({"place": "NMS:CINMS", "indicator": NO3})
  assert t.label == "needs-review" and not t.approvable
  assert "come from noaa-onms/eco-indicators" in t.reasons[-1]


def test_a_cmems_request_over_the_size_limit_is_not_approvable():
  t = run({"place": "BIG:1", "indicator": NO3})
  assert t.label == "needs-review" and not t.approvable and t.estimate > MAX_CMEMS_VALUES
  assert t.reasons[-1] == "about 14 M grid values, over the 10 M limit for the place producer"


def test_a_cmems_request_whose_grid_is_unknown_is_not_approvable():
  t = classify({"place": "MRGID:5670", "indicator": "cmems:cmems_mystery_P1M:x:mean"},
               {"indicators": [{"id": "cmems:cmems_mystery_P1M:x:mean", "short": "X", "producer": {"name": "noaa-onms/eco-indicators"},
                                "dataset": {"stac": None}, "time_range": ["2000-01-01", "2001-01-01"]}]},
               LAYERS, ROWS.get, lambda url: DIMS, lambda p, c, i: False, TODAY)
  assert t.label == "needs-review" and not t.approvable and "could not be estimated" in t.reasons[-1]


def test_a_cmems_request_for_values_that_exist_is_already():
  assert run({"place": "MRGID:5670", "indicator": NO3}, has=True).label == "already"


def test_the_comment_tells_a_maintainer_how_to_accept_an_approvable_request():
  c = comment(run({"place": "MRGID:5670", "collection": "mr_eez", "indicator": NO3}), {})
  assert c.startswith("This request needs a maintainer, who will reply here. A maintainer can accept it by adding the `run` label; "
                      "it runs on Copernicus Marine with the maintainer's account,")
  assert "- Nitrate is a Copernicus Marine dataset: its run uses a personal Copernicus Marine login" in c
  assert "Place view: https://oceanmetrics.io/indicators/#view=place&place=MRGID:5670&coll=mr_eez&ind=" in c


def test_the_comment_of_a_request_nobody_can_accept_does_not_offer_the_label():
  c = comment(run({"place": "FAO:21", "indicator": NO3}), {})
  assert c.startswith("This request needs a maintainer, who will reply here.\n") and "`run` label" not in c


def test_non_cmems_needs_review_requests_are_unchanged_and_not_approvable():
  t = run({"place": "NMS:CINMS", "indicator": "sdg:ER_MRN_MPA"})
  assert t.label == "needs-review" and not t.approvable and "runs only by hand" in t.reasons[-1]
  assert not run(parse_issue_form(BODY)).approvable


def test_a_tiny_job_says_its_count_in_full():
  dims = {**DIMS, "time": {"extent": ["2025-01-01T00:00:00Z", "2025-12-31T00:00:00Z"], "step": "P1M"}}
  t = classify({"place": "NERR:ELK", "indicator": "erddap:dhw_5km:CRW_SST:mean"}, MANIFEST, LAYERS, ROWS.get, lambda url: dims, lambda p, c, i: False, TODAY)
  assert t.reasons[-1] == "48 grid values: small enough to run by itself"  # 2 x 2 cells of 0.05 deg x 12 months
