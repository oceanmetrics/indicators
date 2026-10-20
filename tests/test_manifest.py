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
  goos = {"items": [{"id": "sea-surface-temperature", "kind": "eov", "label": "Sea surface temperature (GOOS)",
                      "webp128": "webp/128/sea-surface-temperature.webp"}]}
  v = m.vocabularies(VOCABS, goos)
  sst, tdf = v["eov"]["terms"][0], v["eov"]["terms"][1]
  assert sst["glyph"] == "eov-sea-surface-temperature"
  assert sst["badge"] == "goos-eov/webp/128/sea-surface-temperature.webp"
  assert sst["label"] == "Sea surface temperature (GOOS)"
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
    variables.setdefault(e.get("variable", e["id"]), []).append(e["id"])   # the builder defaults variable to the id
  for var, ids in variables.items():
    assert sum(bool(entries[i]["preferred"]) for i in ids) == 1, var
  assert len(terms["eov"]) == 39 and len(terms["onms"]) == 7 and len(terms["names"]) == 3


# ordinal classes ----
def test_ordinal_categorical_carries_the_flag_and_others_do_not(tmp_path):
  write(tmp_path, ind=BAA, cls=["0", "1"], unit="1")
  man, _ = build(tmp_path, [entry(id=BAA, kind="categorical", status_method="values", series="heat", variable="baa", ordinal=True)])
  assert man["indicators"][0]["ordinal"] is True and list(man["indicators"][0]["classes"]) == ["0", "1"]
  man, _ = build(tmp_path, [entry(id=BAA, kind="categorical", status_method="values", series="heat", variable="baa")])
  assert "ordinal" not in man["indicators"][0]


def test_ordinal_applies_to_categorical_indicators_only(tmp_path):
  write(tmp_path)
  with pytest.raises(ValueError, match="ordinal applies to categorical indicators only"):
    build(tmp_path, [entry(ordinal=True)])


def test_repo_config_marks_the_bleaching_alert_area_ordinal():
  entries, _ = m.load_config()
  assert [i for i, e in entries.items() if e.get("ordinal")] == [BAA]


# any producer states its dataset through the provenance ----
CMEMS = "cmems:cmems_mod_glo_phy_my_0.083deg_P1M-m:thetao:mean"
OBIS = "obis:species"
DATASET = {"id": "GLOBAL_MULTIYEAR_PHY_001_030", "title": "Global Ocean Physics Reanalysis",
           "via": "https://github.com/noaa-onms/eco-indicators",
           "providers": [{"name": "Copernicus Marine Service (Mercator Ocean International)", "roles": ["producer", "licensor"]},
                         {"name": "noaa-onms/eco-indicators", "roles": ["processor"]}],
           "license": "other", "doi": "https://doi.org/10.48670/moi-00021",
           "citation": "E.U. Copernicus Marine Service Information; Global Ocean Physics Reanalysis; https://doi.org/10.48670/moi-00021"}


def write_stated(tmp_path, ind, dataset, unit="degrees_C"):
  rows = [{"place_id": "NMS:A", "coll": "places", "indicator": ind, "time_grain": "year", "time": dt.date(y, 1, 1), "class": None,
           "value": 1.0, "n": 12.0, "unit": unit} for y in (2019, 2020)]
  contract.write_values(rows, tmp_path, {**PROV, "dataset": dataset})


def no_lookup(ind_id):
  raise AssertionError(f"{ind_id}: the provenance states the dataset, nothing may be looked up")


def test_cmems_dataset_comes_from_the_provenance_and_is_cited_by_its_own_line(tmp_path):
  write_stated(tmp_path, CMEMS, DATASET)
  e = entry(id=CMEMS, variable="sst", series="cmems-physics", preferred=True)
  man, _ = m.build_manifest(m.scan_values(tmp_path), {CMEMS: e}, VOCABS, no_lookup, "2026.10.20", "2026-10-20T00:00:00Z")
  (i,) = man["indicators"]
  assert i["dataset"] == DATASET
  assert i["producer"] == {"name": "noaa-onms/eco-indicators", "url": "https://github.com/noaa-onms/eco-indicators"}
  assert i["method"]["kind"] == "precomputed-external" and i["n_meaning"].startswith("months averaged")
  assert i["citation"] == (DATASET["citation"] + ". Values: Ocean Metrics Indicators, manifest 2026.10.20, "
                           f"{CMEMS}, CC BY 4.0, {m.SITE}")


def test_obis_dataset_comes_from_the_provenance_and_the_manifest_states_the_overlap_rule(tmp_path):
  ds = {"id": "obis", "title": "OBIS occurrence data", "via": "https://obis.org", "license": "various", "doi": None,
        "providers": [{"name": "Ocean Biodiversity Information System (OBIS)", "roles": ["producer", "licensor"]}],
        "citation": "OBIS (2026) Ocean Biodiversity Information System. Intergovernmental Oceanographic Commission of UNESCO. https://obis.org"}
  write_stated(tmp_path, OBIS, ds, unit="species")
  e = entry(id=OBIS, variable=OBIS, series="obis-all", status_method="values")
  man, _ = m.build_manifest(m.scan_values(tmp_path), {OBIS: e}, VOCABS, no_lookup, "2026.10.20", "2026-10-20T00:00:00Z")
  (i,) = man["indicators"]
  assert i["dataset"] == ds and i["producer"]["name"] == "obisindicators"
  assert "never summed" in i["method"]["summary"] and "point-in-polygon" in i["method"]["summary"]
  assert i["citation"].startswith("OBIS (2026) Ocean Biodiversity Information System.")


# the config covers what the adapters write ----
def test_every_obis_indicator_is_configured_as_values_with_its_eov_tag():
  from om_indicators.adapters import obis
  entries, _ = m.load_config()
  assert {i for i in entries if i.startswith("obis:")} == set(obis.all_indicator_ids())
  goos = {None: "bioeco", "fish": "fish", "hard-corals": "hard-coral", "mangroves": "mangroves", "marine-mammals": "marine-mammals",
          "sea-turtles": "sea-turtles", "seabirds": "seabirds", "seagrasses": "seagrass"}
  for eov, slug in obis.EOVS.items():
    inds = [e for e in entries.values() if e["series"] == "obis-" + (slug or "all")]
    assert len(inds) == 9 and [e["id"] for e in inds if e["lead"]] == [obis.indicator_id("species", eov)]
    for e in inds:
      assert e["status_method"] == "values" and e["min_periods"] == 10 and e["status_grain"] == "year" and e["recent"] == 5
      assert e["category"] == {"onms": "living-resources", "names": "biological", "eov": goos[slug]}
      assert e["eov_match"] == ("discipline" if slug is None else "exact")


def test_every_published_cmems_variable_is_configured_with_status_iea_sd():
  from om_indicators.adapters import eco_indicators as eco
  entries, _ = m.load_config()
  ids = {eco.indicator_id(d, v) for d, vs in eco.DATASETS.items() for v in vs}
  assert {i for i in entries if i.startswith("cmems:")} == ids and len(ids) == 25     # 15 + the BGC hindcast's 10
  assert all(entries[i]["status_method"] == "iea-sd" and entries[i]["min_periods"] == 10 for i in ids)
  assert entries["cmems:cmems_mod_glo_phy_my_0.083deg_P1M-m:thetao:mean"]["lead"]
  assert entries["cmems:cmems_obs-oc_glo_bgc-plankton_my_l4-multi-4km_P1M:CHL:mean"]["lead"]


def test_the_bgc_hindcast_leads_the_carbonate_oxygen_nutrient_and_plankton_series():
  entries, _ = m.load_config()
  bgc = "cmems:cmems_mod_glo_bgc_my_0.25deg_P1M-m:{}:mean"
  for var, series in (("ph", "cmems-carbonate"), ("o2", "cmems-oxygen"), ("no3", "cmems-nutrients"), ("phyc", "cmems-plankton")):
    lead = [e["id"] for e in entries.values() if e["series"] == series and e["lead"]]
    assert lead == [bgc.format(var)], series


def test_long_cmems_records_are_preferred_over_the_short_erddap_ones_of_the_same_variable():
  entries, _ = m.load_config()
  for long_id, short_id in (("cmems:cmems_mod_glo_phy_my_0.083deg_P1M-m:bottomT:mean", "erddap:cmems_altimetry:tob:mean"),
                            ("cmems:cmems_mod_glo_phy_my_0.083deg_P1M-m:mlotst:mean", "erddap:cmems_altimetry:mlotst:mean"),
                            ("cmems:cmems_mod_glo_phy_my_0.083deg_P1M-m:so:mean", "erddap:cmems_salinity:so:mean"),
                            ("cmems:cmems_obs-oc_glo_bgc-plankton_my_l4-multi-4km_P1M:CHL:mean", "erddap:cmems_biogeochem_phyto:chl:mean"),
                            *((f"cmems:cmems_mod_glo_bgc_my_0.25deg_P1M-m:{v}:mean", short) for v, short in (
                              ("ph", "erddap:cmems_biogeochem_carbon:ph:mean"), ("spco2", "erddap:cmems_biogeochem_co2:spco2:mean"),
                              ("o2", "erddap:cmems_biogeochem_pp:o2:mean"), ("no3", "erddap:cmems_biogeochem_nutrients:no3:mean"),
                              ("po4", "erddap:cmems_biogeochem_nutrients:po4:mean"), ("si", "erddap:cmems_biogeochem_nutrients:si:mean"),
                              ("fe", "erddap:cmems_biogeochem_nutrients:fe:mean"), ("phyc", "erddap:cmems_biogeochem_phyto:phyc:mean")))):
    assert entries[long_id]["variable"] == entries[short_id]["variable"]
    assert entries[long_id]["preferred"] and not entries[short_id]["preferred"]


def test_the_satellite_records_stay_preferred_over_the_bgc_models_chlorophyll_and_npp():
  entries, _ = m.load_config()
  for model, satellite in (("cmems:cmems_mod_glo_bgc_my_0.25deg_P1M-m:chl:mean", "cmems:cmems_obs-oc_glo_bgc-plankton_my_l4-multi-4km_P1M:CHL:mean"),
                           ("cmems:cmems_mod_glo_bgc_my_0.25deg_P1M-m:nppv:mean", "erddap:moda_npp_mo_glob:npp:mean")):
    assert entries[model]["variable"] == entries[satellite]["variable"]
    assert entries[satellite]["preferred"] and not entries[model]["preferred"]


def test_regression_every_configured_short_fits_the_schemas_max_length():
  # "Chlorophyll-a (model, 2021–25)" (30 > 28) passed the config tests and failed only at the manifest build, 2026-10-20
  import json
  from pathlib import Path
  schema = json.loads((Path(__file__).parents[1] / "schema/indicators.schema.json").read_text())
  limit = schema["$defs"]["indicator"]["properties"]["short"]["maxLength"]
  entries, _ = m.load_config()
  assert {i: e["short"] for i, e in entries.items() if len(e["short"]) > limit} == {}
