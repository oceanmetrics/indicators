# keeping published values for producers a run does not rebuild.
import datetime as dt
import json

import pytest

from om_indicators import contract, publish

PROV = {"producer": {"name": "places/proto/eez_indicators", "url": "https://github.com/oceanmetrics/places"},
        "sources": [{"href": "https://unstats.un.org/x"}],
        "dataset": {"id": "X", "title": "a series", "providers": [{"name": "UN"}], "license": "other"}, "method": "latest year per M49 area, joined to EEZs",
        "code": {"name": "om-indicators", "version": "0.1.0", "adapter": "test"},
        "created": "2026-10-20T00:00:00Z", "license": "CC-BY-4.0"}


def test_pull_copies_only_the_named_families(tmp_path):
  pub = tmp_path / "published"
  for ind in ("sdg:ER_MRN_MPA", "erddap:x:y:mean"):
    contract.write_values([{"place_id": "MRGID:1", "coll": "mr_eez", "indicator": ind, "time_grain": "year",
                            "time": dt.date(2025, 1, 1), "class": None, "value": 1.0, "n": None, "unit": "%"}], pub, PROV)
  man = {"indicators": [{"id": i, "collections": [{"coll": "mr_eez", "path": f"values/indicator={i}/coll=mr_eez/data.parquet"}]}
                        for i in ("sdg:ER_MRN_MPA", "erddap:x:y:mean")]}
  (pub / "indicators.json").write_text(json.dumps(man))
  out = tmp_path / "catalog"
  assert publish.pull(str(pub), out, ["sdg"]) == ["values/indicator=sdg:ER_MRN_MPA/coll=mr_eez/data.parquet"]
  assert contract.validate_tree(out) == {}
  assert not (out / "values" / "indicator=erddap:x:y:mean").exists()
  with pytest.raises(ValueError, match="no published indicator of family 'obis'"):
    publish.pull(str(pub), out, ["obis"])
