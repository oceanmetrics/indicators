# assemble the mockup's data.json: places, indicators and cells (real values; statuses for the rest)
import json, sys, glob, statistics
from pathlib import Path
import pyarrow.parquet as pq
M = Path(sys.argv[1]); VALUES = Path(sys.argv[2])
NMS = [("ONMS:monterey-bay-national-marine-sanctuary", "MBNMS", "Monterey Bay"),
       ("ONMS:greater-farallones-national-marine-sanctuary", "GFNMS", "Greater Farallones"),
       ("ONMS:cordell-bank-national-marine-sanctuary", "CBNMS", "Cordell Bank"),
       ("ONMS:chumash-heritage-national-marine-sanctuary", "CHNMS", "Chumash Heritage"),
       ("ONMS:olympic-coast-national-marine-sanctuary", "OCNMS", "Olympic Coast"),
       ("ONMS:stellwagen-bank-national-marine-sanctuary", "SBNMS", "Stellwagen Bank"),
       ("ONMS:gray-s-reef-national-marine-sanctuary", "GRNMS", "Gray's Reef"),
       ("ONMS:florida-keys-national-marine-sanctuary", "FKNMS", "Florida Keys"),
       ("ONMS:papahanaumokuakea-national-marine-sanctuary", "PMNM", "Papahānaumokuākea")]
EEZ = [("MRGID:8371", "Senegal"), ("MRGID:8369", "Mauritania"), ("MRGID:48964", "Senegal / Guinea-Bissau (joint regime)"),
       ("MRGID:8362", "Cabo Verde"), ("MRGID:8400", "Ghana"), ("MRGID:3293", "Belgium"), ("MRGID:5668", "Netherlands"),
       ("MRGID:8457", "Belize"), ("MRGID:8403", "Ecuador (Galápagos)")]
ERD = {"sst": ("dhw_5km/CRW_SST", 2), "chl": ("cmems_biogeochem_phyto/chl", 3), "ph": ("cmems_biogeochem_carbon/ph", 3),
       "o2": ("cmems_biogeochem_pp/o2", 1), "npp": ("moda_npp_mo_glob/npp", 0)}
def annual(path):
  t = pq.read_table(path, columns=["date", "mean_wt"]).to_pylist()
  by = {}
  for r in t:
    if r["mean_wt"] is not None:
      by.setdefault(r["date"].year, []).append(r["mean_wt"])
  months = {y: len({1}) for y in by}
  return [[y, statistics.fmean(v)] for y, v in sorted(by.items()) if len(v) >= (300 if len(t) > 5000 else 10)]
places, cells = [], {}
for pid, code, name in NMS:
  places.append({"id": pid, "code": code, "name": name, "coll": "noaa_sanctuaries"})
  c = cells.setdefault(pid, {})
  for k, (p, dp) in ERD.items():
    f = M / "stats" / p / f"NMS:{code}.parquet"
    if f.exists():
      s = annual(f)
      if s: c[k] = {"status": "ready", "grain": "year", "series": [[y, round(v, dp + 1)] for y, v in s]}
  c["sdg1451"] = {"status": "na"}
for pid, name in EEZ:
  places.append({"id": pid, "code": pid, "name": name, "coll": "mr_eez"})
  cells.setdefault(pid, {})
vals = json.loads(VALUES.read_text())["eez"]
for pid, name in EEZ:
  c = cells[pid]
  v = vals[pid.split(":")[1]].get("ER_MRN_MPA")
  c["sdg1451"] = {"status": "ready", "grain": "year", "series": [[v["year"], round(v["value"], 1)]], "basis": v["basis"]} if v else {"status": "na", "why": "joint regime: no single-state value"}
  c["sst"] = {"status": "live"}
  for k in ("chl", "ph", "o2", "npp"): c[k] = {"status": "small"}
for f in sorted((M / "obis").glob("*.json")):
  o = json.loads(f.read_text())
  c = cells[o["place_id"]]
  dec = sorted((int(d), v) for d, v in o["decades"].items())
  c["obis_records"] = {"status": "ready", "grain": "decade", "series": [[d, v["records"]] for d, v in dec],
                       "total": o["total"].get("records"), "years": [[y["year"], y["records"]] for y in o["years"]]}
  c["obis_species"] = {"status": "ready", "grain": "decade", "series": [[d, v["species"]] for d, v in dec], "total": o["total"].get("species")}
  c["obis_es50"] = {"status": "large"}
# a few demo request states (clearly labelled as examples in the page)
cells["MRGID:8400"]["chl"] = {"status": "running", "since": "4 min"}
cells["MRGID:8457"]["npp"] = {"status": "queued"}
json.dump({"places": places, "cells": cells, "built": "2026-10-19"}, open(M / "data.json", "w"), separators=(",", ":"))
print(len(places), sum(len(v) for v in cells.values()), (M / "data.json").stat().st_size)
