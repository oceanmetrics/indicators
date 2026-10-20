"""indicator requests: the form is parsed, checked against the manifest and the gazetteer, and labelled; nothing from
the issue reaches a command unchecked. one test per rule, synthetic fixtures, no network."""
import datetime as dt

import pytest

from om_indicators.requests import (
  MAX_AUTO_VALUES, check_job, classify, comment, estimate_values, grid_cells, parse_issue_form, time_steps,
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

MANIFEST = {"indicators": [
  {"id": "erddap:dhw_5km:CRW_SST:mean", "short": "SST", "producer": {"name": "erddap-places"},
   "dataset": {"stac": "stac:dhw_5km"}},
  {"id": "sdg:ER_MRN_MPA", "short": "MPA coverage", "producer": {"name": "places/proto/eez_indicators"},
   "dataset": {"stac": None}},
]}
LAYERS = {"layers": [{"slug": "places", "kind": "vector"}, {"slug": "noaa_nerrs", "kind": "vector"}, {"slug": "mr_eez", "kind": "raster"}]}
ROWS = {
  "NMS:CINMS": {"place_id": "NMS:CINMS", "name": "Channel Islands", "collection": "places",
                "bbox": {"xmin": -120.64, "ymin": 33.36, "xmax": -118.91, "ymax": 34.21}},
  "NERR:ELK": {"place_id": "NERR:ELK", "name": "Elkhorn Slough", "collection": "noaa_nerrs",
               "bbox": {"xmin": -121.80, "ymin": 36.79, "xmax": -121.74, "ymax": 36.86}},
  "MRGID:8456": {"place_id": "MRGID:8456", "name": "United States EEZ", "collection": "mr_eez",
                 "bbox": {"xmin": -129.2, "ymin": 23.8, "xmax": -65.7, "ymax": 49.0}},
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


def test_needs_review_for_a_reference_collection():
  t = run({"place": "MRGID:8456", "collection": "mr_eez", "indicator": "erddap:dhw_5km:CRW_SST:mean"})
  assert t.label == "needs-review" and "not published" in t.reasons[-1]


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
