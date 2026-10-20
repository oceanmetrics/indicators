"""SDG adapter: the eez_indicators prototype's derived table -> one latest-year row per (EEZ, SDG series).

input is `values.json` of `oceanmetrics/places` `proto/eez_indicators` (a public derived table, no geometry):

  {"series": {code: {indicator, short, units, domain, group, description, source, link}},
   "eez": {"<MRGID>": {"name", "pol_type", "<code>": {"value", "year", "m49", "basis"} | null}},
   "eez_attribution": str}

each series code becomes the indicator `sdg:<code>` in coll `mr_eez`, with place_id `MRGID:<key>`, time_grain 'year',
time = 1 January of the value's year (the latest year the UN reports for the area), n = None (the UN gives none), unit
= the series `units` verbatim, and the extra columns x_m49 (the UN M49 area the value came from) and x_basis
("territory" | "sovereign"). an EEZ whose entry is null (joint regimes, overlapping claims, unreported) gets no row.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

from om_indicators import __version__, contract
from om_indicators.adapters.erddap_places import _commit

COLL = "mr_eez"
UN_API = "https://unstats.un.org/sdgapi/v1/sdg/Series/Data?seriesCode="
PRODUCER = {"name": "places/proto/eez_indicators",
            "url": "https://github.com/oceanmetrics/places/tree/main/proto/eez_indicators", "version": None}
LICENSE = "CC-BY-4.0"
ADAPTER = "om_indicators.adapters.sdg"
METHOD = ("latest year with a numeric value per M49 area from the UN SDG Global Database; an EEZ takes its territory's "
          "value (un_ter1), else its sovereign's (un_sov1); joint regimes and overlapping claims get none")


def series_rows(code: str, series: dict, eez: dict[str, dict]) -> list[dict]:
  """contract rows of one series over every EEZ that has a value."""
  rows = []
  for key, e in eez.items():
    v = e.get(code)
    if not v:
      continue
    rows.append({"place_id": f"MRGID:{key}", "coll": COLL, "indicator": f"sdg:{code}", "time_grain": "year",
                 "time": dt.date(int(v["year"]), 1, 1), "class": None, "value": float(v["value"]), "n": None,
                 "unit": series["units"], "x_m49": int(v["m49"]), "x_basis": v["basis"]})
  return rows


def run(values: Path, out: Path) -> dict:
  """write one values file per series of `values.json` under `out`; returns a summary."""
  values = Path(values)
  data = json.loads(values.read_text())
  built = dt.datetime.fromtimestamp(values.stat().st_mtime, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
  summary: dict = {"files": [], "empty": [], "eezs": len(data["eez"])}
  for code, series in data["series"].items():
    rows = series_rows(code, series, data["eez"])
    if not rows:
      summary["empty"].append(f"sdg:{code}")
      continue
    prov = {"producer": PRODUCER,
            "sources": [{"href": UN_API + code, "title": series.get("description")},
                        {"href": f"values.json (oceanmetrics/places proto/eez_indicators, built {built})"}],
            "source_version": None, "method": METHOD,
            "code": {"name": "om-indicators", "version": __version__, "commit": _commit(), "adapter": ADAPTER},
            "license": LICENSE, "created": contract.utc_now()}
    path = contract.write_values(rows, out, prov)
    summary["files"].append({"indicator": f"sdg:{code}", "coll": COLL, "path": str(path), "rows": len(rows),
                             "places": len(rows)})
  return summary
