# the manifest builder: exact entries from a tiny catalog, and one test per rule it enforces.
import datetime as dt

import pytest
import yaml

from om_indicators import contract, manifest as m

SST = "erddap:dhw_5km:CRW_SST:mean"
BAA = "erddap:dhw_5km:CRW_BAA:share"
VOCABS = {
  "onms": {"title": "ONMS", "source": "https://x", "terms": [{"id": "water-quality", "label": "Water quality"},
                                                            {"id": "drivers-pressures", "label": "Drivers"}]},
  "names": {"title": "NaMES", "source": "https://y", "terms": [{"id": "physical-chemical", "label": "Physical-chemical"}]},
  "eov": {"title": "EOV", "source": "https://z", "credit": "Credit: Global Ocean Observing System (GOOS)",
          "terms": [{"id": "sea-surface-temperature", "label": "Sea surface temperature", "group": "physics"},
                    {"id": "turbulent-diapycnal-fluxes", "label": "Turbulent diapycnal fluxes", "group": "physics"}]},
}
CAT = {"onms": "water-quality", "names": "physical-chemical", "eov": "sea-surface-temperature"}
PROV = {"producer": {"name": "erddap-places", "url": "https://github.com/oceanmetrics/erddap-places"},
        "sources": [{"href": "https://example.org/item.json"}], "method": "test rows for the manifest",
        "code": {"name": "om-indicators", "version": "0.1.0", "adapter": "test"},
        "created": "2026-10-20T00:00:00Z", "license": "CC-BY-4.0"}


def entry(**kw):
  base = {"id": SST, "title": "Sea surface temperature (CRW, 5 km)", "short": "SST", "variable": "sst",
          "series": "sst", "series_title": "Sea surface temperature", "lead": True, "preferred": True,
          "kind": "continuous", "status_method": "iea-sd", "status_grain": "year", "min_periods": 10, "recent": 5,
          "unit_label": "°C", "decimals": 2, "category": dict(CAT), "eov_match": "exact"}
  return {**base, **kw}


def dataset_of(ind_id):
  return {"id": "dhw_5km", "title": "NOAA Coral Reef Watch — Daily Global 5km SST + DHW",
          "stac": "https://g/erddap/dhw_5km/collection.json", "via": "https://erddap/info/dhw_5km/index.html",
          "providers": [{"name": "NOAA Coral Reef Watch (CRW)", "roles": ["producer", "licensor"]}],
          "license": "CC0-1.0", "citation": None, "doi": None,
          "_variables": {"CRW_SST": {"description": "sea surface temperature"},
                         "CRW_BAA": {"erddap-places:classes": {"0": "No Stress", "1": "Bleaching Watch"}}}}


def write(tmp_path, ind=SST, places=(("NMS:A", (2019, 2020)),), cls=None, coll="places", unit="Celsius"):
  rows = []
  for place, years in places:
    for y in years:
      for c in (cls or [None]):
        rows.append({"place_id": place, "coll": coll, "indicator": ind, "time_grain": "year",
                     "time": dt.date(y, 1, 1), "class": c, "value": 0.5, "n": 12.0, "unit": unit})
  contract.write_values(rows, tmp_path, PROV)


def build(tmp_path, entries):
  return m.build_manifest(m.scan_values(tmp_path), {e["id"]: e for e in entries}, VOCABS, dataset_of,
                          "2026.10.20", "2026-10-20T00:00:00Z")


def test_one_indicator_entry_exactly(tmp_path):
  write(tmp_path, places=(("NMS:A", (2019, 2020)), ("NMS:B", (2018, 2019, 2020))))
  man, missing = build(tmp_path, [entry()])
  assert missing == []
  (i,) = man["indicators"]
  assert i == {
    "id": SST, "title": "Sea surface temperature (CRW, 5 km)", "short": "SST",
    "description": "Sea surface temperature from NOAA Coral Reef Watch — Daily Global 5km SST + DHW, area-weighted over the place, as monthly and yearly means.",
    "unit": "Celsius", "unit_label": "°C", "decimals": 2, "kind": "continuous", "category": CAT, "eov_match": "exact",
    "series": "sst", "series_title": "Sea surface temperature", "lead": True, "preferred": True, "variable": "sst",
    "min_periods": 10, "status_grain": "year", "status_method": "iea-sd", "recent": 5,
    "time_grains": ["year"], "time_range": ["2018-01-01", "2020-01-01"],
    "method": {"kind": "precomputed-exact", "summary": m.PRODUCERS["erddap"]["method"]["continuous"],
               "code": m.PRODUCERS["erddap"]["method"]["code"]},
    "n_meaning": m.PRODUCERS["erddap"]["n_meaning"],
    "producer": {"name": "erddap-places", "url": "https://github.com/oceanmetrics/erddap-places",
                 "catalog": "https://storage.oceanmetrics.io/gazetteer/stats/collection.json"},
    "dataset": {"id": "dhw_5km", "title": "NOAA Coral Reef Watch — Daily Global 5km SST + DHW",
                "stac": "https://g/erddap/dhw_5km/collection.json", "via": "https://erddap/info/dhw_5km/index.html",
                "providers": [{"name": "NOAA Coral Reef Watch (CRW)", "roles": ["producer", "licensor"]}],
                "license": "CC0-1.0", "citation": None, "doi": None},
    "license": "CC-BY-4.0",
    "citation": "NOAA Coral Reef Watch (CRW). NOAA Coral Reef Watch — Daily Global 5km SST + DHW. "
                "https://erddap/info/dhw_5km/index.html. Values: Ocean Metrics Indicators, manifest 2026.10.20, "
                f"{SST}, CC BY 4.0, https://oceanmetrics.io/indicators/",
    "collections": [{"coll": "places", "places": 2, "rows": 5,
                     "path": f"values/indicator={SST}/coll=places/data.parquet",
                     "time_range": ["2018-01-01", "2020-01-01"]}],
  }
  assert man["version"] == "2026.10.20" and man["contract"] == contract.CONTRACT_VERSION


def test_categorical_takes_its_classes_from_the_stac(tmp_path):
  write(tmp_path, ind=BAA, cls=["0", "1"], unit="1")
  man, _ = build(tmp_path, [entry(id=BAA, kind="categorical", status_method="values", series="heat", variable="baa")])
  assert man["indicators"][0]["classes"] == {"0": "No Stress", "1": "Bleaching Watch"}


def test_eov_terms_get_glyphs_and_goos_badges():
  v = m.vocabularies(VOCABS, {"icons": [{"id": "sea-surface-temperature"}]})
  sst, tdf = v["eov"]["terms"][0], v["eov"]["terms"][1]
  assert sst["glyph"] == "eov-sea-surface-temperature"
  assert sst["badge"] == "goos-eov/webp/128/sea-surface-temperature.webp"
  assert "badge" not in tdf and v["eov"]["credit"] == "Credit: Global Ocean Observing System (GOOS)"


def test_config_entry_without_values_is_listed_not_published(tmp_path):
  write(tmp_path)
  man, missing = build(tmp_path, [entry(), entry(id="erddap:x:y:mean", series="x", variable="x")])
  assert [i["id"] for i in man["indicators"]] == [SST]
  assert missing == ["erddap:x:y:mean"]


def test_values_without_a_config_entry_fail(tmp_path):
  write(tmp_path)
  with pytest.raises(ValueError, match="no entry in config/indicators.yml"):
    build(tmp_path, [])


def test_each_series_has_exactly_one_lead(tmp_path):
  write(tmp_path)
  with pytest.raises(ValueError, match=r"series sst: 0 leads \[\], needs exactly one"):
    build(tmp_path, [entry(lead=False)])


def test_each_variable_has_exactly_one_preferred(tmp_path):
  write(tmp_path)
  write(tmp_path, ind="erddap:jplMURSST41:analysed_sst:mean")
  with pytest.raises(ValueError, match=r"variable sst: 2 preferred"):
    build(tmp_path, [entry(), entry(id="erddap:jplMURSST41:analysed_sst:mean", lead=False)])


def test_tags_must_be_vocabulary_terms(tmp_path):
  write(tmp_path)
  with pytest.raises(ValueError, match="'habitat' is not a term of onms"):
    build(tmp_path, [entry(category={**CAT, "onms": "habitat"})])


def test_kind_must_match_the_values(tmp_path):
  write(tmp_path)
  with pytest.raises(ValueError, match="kind categorical but its values carry no class"):
    build(tmp_path, [entry(kind="categorical", status_method="values")])


def test_categorical_cannot_use_a_continuous_status(tmp_path):
  write(tmp_path, ind=BAA, cls=["0"], unit="1")
  with pytest.raises(ValueError, match="a categorical indicator cannot use iea-sd"):
    build(tmp_path, [entry(id=BAA, kind="categorical", status_method="iea-sd")])


def test_repo_config_is_consistent():
  """config/indicators.yml and the vocabularies agree with each other (no values needed)."""
  entries, vocabs = m.load_config()
  terms = {name: {t["id"] for t in v["terms"]} for name, v in vocabs.items()}
  assert set(vocabs) == {"onms", "names", "eov"}
  for e in entries.values():
    for voc, tag in e["category"].items():
      assert tag in terms[voc], f"{e['id']}: {tag} not in {voc}"
  series = {}
  for e in entries.values():
    series.setdefault(e["series"], []).append(e["id"])
  for s, ids in series.items():
    assert sum(entries[i]["lead"] for i in ids) == 1, s
  variables = {}
  for e in entries.values():
    variables.setdefault(e["variable"], []).append(e["id"])
  for var, ids in variables.items():
    assert sum(bool(entries[i]["preferred"]) for i in ids) == 1, var
  assert len(terms["eov"]) == 39 and len(terms["onms"]) == 7 and len(terms["names"]) == 3
