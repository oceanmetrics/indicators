"""the manifest: indicators.json, built from config/indicators.yml, the vocabularies, the values themselves and the
producers' published metadata (schema/indicators.schema.json).

what is ours (category tags, series, lead, preferred, kind, status method and grain, display hints) comes from
config/; what is the producer's (dataset titles, providers, licences, DOIs, upstream links) comes from its STAC or
output, never typed here; what exists (collections, place counts, rows, grains, time ranges) comes from the values.
the rules (one lead per series, one preferred per variable, tags in their vocabularies, kind matching the values)
are checked by check_manifest(), each with a test.
"""
from __future__ import annotations

import datetime as dt
import json
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable

import pyarrow.compute as pc
import yaml

from . import contract
from .contract import load_schema

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"
GOOS_MANIFEST = ROOT / "assets" / "goos-eov" / "manifest.json"
GAZETTEER = "https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer"
VALUES_LICENSE = "CC-BY-4.0"
SITE = "https://oceanmetrics.io/indicators/"

PRODUCERS = {
  "erddap": {
    "name": "erddap-places", "url": "https://github.com/oceanmetrics/erddap-places",
    "catalog": "https://storage.oceanmetrics.io/gazetteer/stats/collection.json",
    "n_meaning": "time steps of the dataset averaged into the period (days, 8-day composites or months)",
    "method": {
      "kind": "precomputed-exact",
      "code": "https://github.com/oceanmetrics/indicators/blob/main/om_indicators/adapters/erddap_places.py",
      "continuous": (
        "The place polygon masks the dataset's own grid (a cell is in when its centre falls inside; boundary cells "
        "carry their partial-area weight) and erddap-places averages each time step over the place "
        "(sql/stats_daily.sql). A month is the mean of its time steps, written only when the record covers the "
        "whole month; a year is the mean of its 12 months."),
      "categorical": (
        "The place polygon masks the dataset's own grid (cell centre inside, partial-area weights on the boundary) "
        "and erddap-places gives each time step's area share per class (sql/stats_categorical.sql). A month's share "
        "is the mean of its steps' shares, written only when the record covers the whole month; a year's is the "
        "mean of its 12 months."),
    },
  },
  "sdg": {
    "name": "places/proto/eez_indicators",
    "url": "https://github.com/oceanmetrics/places/tree/main/proto/eez_indicators",
    "catalog": None,
    "n_meaning": "none: a country value",
    "method": {
      "kind": "precomputed-external",
      "code": "https://github.com/oceanmetrics/indicators/blob/main/om_indicators/adapters/sdg.py",
      "continuous": (
        "The UN SDG Global Database's latest year with a value for each M49 area. An EEZ takes its territory's "
        "value, else its sovereign's; joint regimes and overlapping claims get none."),
    },
  },
  "cmems": {
    "name": "noaa-onms/eco-indicators", "url": "https://github.com/noaa-onms/eco-indicators",
    "catalog": None,
    "n_meaning": "months averaged into the period: 1 for a monthly mean, 12 for a yearly mean",
    "cite_dataset": True,
    "method": {
      "kind": "precomputed-external",
      "code": "https://github.com/oceanmetrics/indicators/blob/main/om_indicators/adapters/eco_indicators.py",
      "continuous": (
        "Monthly means of a Copernicus Marine Service product over each sanctuary polygon, extracted by "
        "noaa-onms/eco-indicators (mean of the grid cells under the polygon, with the spatial SD in x_sd). A year is the "
        "mean of its 12 monthly means, written only when all 12 months have a value."),
    },
  },
  "obis": {
    "name": "obisindicators", "url": "https://github.com/marinebon/obisindicators",
    "catalog": "https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/obis-h3/latest.json",
    "n_meaning": "OBIS occurrence records inside the place in the period (every metric of a place and EOV shares one n)",
    "cite_dataset": True,
    "method": {
      "kind": "precomputed-exact",
      "code": "https://github.com/oceanmetrics/indicators/blob/main/om_indicators/adapters/obis.py",
      "continuous": (
        "Exact point-in-polygon on an OBIS snapshot (no H3 binning): the indicators are computed from the occurrence "
        "records inside the place's true polygon, by year, by decade and over all years; EOV membership follows the IOOS "
        "Marine Life Data Network taxonomy seeds. A record counts in every place whose polygon contains it (Marine "
        "Regions joint regimes overlap their parties' 200 NM zones), so totals across places exceed the distinct records "
        "and are never summed. The snapshot's own year is incomplete and not published. Yearly counts track sampling "
        "effort, so they are shown as values, not as a status."),
    },
  },
}


# config ----
def load_config(config: Path = CONFIG) -> tuple[dict, dict[str, dict]]:
  """(indicators.yml with defaults applied per entry, vocabularies by name)"""
  raw = yaml.safe_load((config / "indicators.yml").read_text())
  defaults = raw.get("defaults", {})
  entries = {e["id"]: {**defaults, **e} for e in raw["indicators"]}
  vocabs = {p.stem: yaml.safe_load(p.read_text()) for p in sorted((config / "vocab").glob("*.yml"))}
  return entries, vocabs


def vocabularies(vocabs: dict[str, dict], goos: dict | None) -> dict[str, dict]:
  """the vocabularies as the manifest carries them: eov terms get their glyph and, where GOOS has one, its badge."""
  out = {}
  badges = {e["id"]: e for e in (goos or {}).get("items", [])}
  for name, v in vocabs.items():
    terms = []
    for t in v["terms"]:
      t = dict(t)
      if name == "eov":
        t["glyph"] = f"eov-{t['id']}"
        b = badges.get(t["id"])
        if b:
          t["badge"] = f"goos-eov/{b['webp128']}"
          if b.get("kind") == "eov":  # GOOS's own EOV names (assets/goos-eov/manifest.json labels_from)
            t["label"] = b["label"]
      terms.append(t)
    out[name] = {k: v[k] for k in ("title", "source", "note", "credit") if k in v} | {"terms": terms}
  return out


# what the values hold ----
def scan_values(root: Path) -> dict[str, dict]:
  """per indicator: unit, kind (from class), grains, time range, and per coll the places, rows and path."""
  out: dict[str, dict] = {}
  for f in sorted(Path(root).glob("values/indicator=*/coll=*/data.parquet")):
    table, prov = contract.read_values(f)
    ind = table.column("indicator")[0].as_py()
    coll = table.column("coll")[0].as_py()
    times = [t for t in table.column("time").to_pylist() if t is not None]
    units = set(table.column("unit").to_pylist())
    if len(units) != 1:
      raise ValueError(f"{f}: one unit per values file, found {sorted(units)}")
    e = out.setdefault(ind, {"units": set(), "grains": set(), "times": [], "classes": set(), "colls": [], "prov": prov})
    e["units"] |= units
    e["grains"] |= set(table.column("time_grain").to_pylist())
    e["times"] += times
    e["classes"] |= {c for c in table.column("class").to_pylist() if c is not None}
    e["colls"].append({
      "coll": coll,
      "places": len(pc.unique(table.column("place_id"))),
      "rows": table.num_rows,
      "path": str(f.relative_to(root)),
      "time_range": [min(times).isoformat(), max(times).isoformat()] if times else [None, None],
    })
  return out


# producer metadata ----
def erddap_dataset(dataset_id: str, fetch: Callable[[str], dict]) -> dict:
  """dataset title, providers, licence, DOI, upstream page and classes from erddap/<id>/collection.json"""
  c = fetch(f"{GAZETTEER}/erddap/{dataset_id}/collection.json")
  links = c.get("links", [])
  doi = next((l["href"] for l in links if "doi.org/" in l.get("href", "")), None)
  via = next((l["href"] for l in links if l.get("rel") == "via"), None)
  license_link = next((l["href"] for l in links if l.get("rel") == "license"), None)
  return {
    "id": dataset_id, "title": c["title"], "stac": f"{GAZETTEER}/erddap/{dataset_id}/collection.json", "via": via or license_link,
    "providers": [{k: p[k] for k in ("name", "roles", "url") if k in p} for p in c.get("providers", [])],
    "license": c.get("license", "other"), "citation": c.get("sci:citation"), "doi": doi,
    "_variables": c.get("cube:variables", {}),
  }


def sdg_dataset(code: str, sdg_values: dict) -> dict:
  """the UN series' metadata, from the prototype's values.json"""
  s = sdg_values["series"][code]
  return {
    "id": code, "title": f"{s['description']} (SDG {s['indicator']})", "via": s["link"],
    "providers": [
      {"name": s["source"].split(". ")[0].strip(), "roles": ["producer"]},
      {"name": "UN Statistics Division, SDG Global Database", "roles": ["host"], "url": "https://unstats.un.org/sdgs/dataportal"},
    ],
    "license": "other", "citation": s["source"], "doi": None,
  }


def producer_family(indicator: str) -> str:
  return indicator.split(":", 1)[0]


def citation(ind: dict, version: str, extra: str | None = None, cite_dataset: bool = False) -> str:
  """how to cite one indicator's values: the upstream producers, the dataset, then these derived values. a producer
  whose dataset states its own citation line (Copernicus Marine, OBIS) is cited by that line."""
  ds = ind["dataset"]
  who = "; ".join(p["name"] for p in ds["providers"] if "producer" in p.get("roles", [])) or ds["providers"][0]["name"]
  link = ds.get("doi") or ds.get("via") or ds.get("stac")
  if cite_dataset and ds.get("citation"):
    parts = [ds["citation"].rstrip(".") + "."]
  else:
    parts = [f"{who}. {ds['title']}." + (f" {link}." if link else "")]
  if extra:
    parts.append(extra)
  parts.append(f"Values: Ocean Metrics Indicators, manifest {version}, {ind['id']}, CC BY 4.0, {SITE}")
  return " ".join(parts)


# assembly ----
def build_manifest(values: dict[str, dict], entries: dict[str, dict], vocabs: dict[str, dict],
                   dataset_of: Callable[[str], dict], version: str, created: str,
                   goos: dict | None = None, eez_attribution: str | None = None) -> tuple[dict, list[str]]:
  """the manifest dict and the list of config entries without values. raises ValueError on a broken rule."""
  inds = []
  for ind_id in sorted(values):
    if ind_id not in entries:
      raise ValueError(f"values for {ind_id} but no entry in config/indicators.yml")
    e, v = entries[ind_id], values[ind_id]
    fam = producer_family(ind_id)
    prod = PRODUCERS[fam]
    # the producer's own statement of its dataset (provenance.dataset, contract 1.1) wins over any lookup
    stated = (v.get("prov") or {}).get("dataset")
    ds = dict(stated) if stated else dataset_of(ind_id)
    kind = e.get("kind", "continuous")
    variables = ds.pop("_variables", {})
    out = {
      "id": ind_id, "title": e["title"], "short": e["short"],
      "description": " ".join(e["description"].split()) if e.get("description") else None,
      "unit": next(iter(v["units"])), "unit_label": e.get("unit_label", next(iter(v["units"]))),
      "decimals": e.get("decimals", 2), "kind": kind,
      "category": dict(e["category"]), "eov_match": e.get("eov_match", "exact"),
      "series": e["series"], "series_title": e.get("series_title"),
      "lead": bool(e.get("lead")), "preferred": bool(e.get("preferred")), "variable": e.get("variable", ind_id),
      "min_periods": e["min_periods"], "status_grain": e["status_grain"], "status_method": e["status_method"],
      "recent": e["recent"],
      "time_grains": sorted(v["grains"], key=contract.GRAINS.index),
      "time_range": [min(v["times"]).isoformat(), max(v["times"]).isoformat()] if v["times"] else [None, None],
      "method": {"kind": prod["method"]["kind"], "summary": prod["method"][kind], "code": prod["method"]["code"]},
      "n_meaning": prod["n_meaning"],
      "producer": {k: prod[k] for k in ("name", "url", "catalog") if prod.get(k)},
      "dataset": ds, "license": VALUES_LICENSE, "citation": "",
      "collections": sorted(v["colls"], key=lambda c: c["coll"]),
    }
    if kind == "categorical":
      var = ind_id.split(":")[2] if fam == "erddap" else None
      classes = variables.get(var, {}).get("erddap-places:classes") if var else None
      out["classes"] = classes or {c: c for c in sorted(v["classes"], key=lambda c: (len(c), c))}
      if e.get("ordinal"):
        out["ordinal"] = True  # the classes are ordered as listed (e.g. bleaching alert levels)
    elif e.get("ordinal"):
      raise ValueError(f"{ind_id}: ordinal applies to categorical indicators only")
    if out["description"] is None:
      what = variables.get(ind_id.split(":")[2], {}).get("description") if fam == "erddap" else None
      out["description"] = (f"{(what or e['title']).capitalize()} from {ds['title']}, " +
                            ("area-weighted over the place, as monthly and yearly means." if fam == "erddap" else "joined to the place."))
    eez_note = f"EEZ boundaries: {eez_attribution}" if fam == "sdg" and eez_attribution and not stated else None
    out["citation"] = citation(out, version, eez_note, bool(prod.get("cite_dataset")))
    inds.append({k: x for k, x in out.items() if x is not None})
  # series titles follow the lead
  titles = {i["series"]: i["series_title"] for i in inds if i.get("series_title")}
  for i in inds:
    if i["series"] in titles:
      i["series_title"] = titles[i["series"]]
  manifest = {"version": version, "contract": contract.CONTRACT_VERSION, "created": created,
              "vocabularies": vocabularies(vocabs, goos), "indicators": inds}
  errors = check_manifest(manifest, values)
  if errors:
    raise ValueError("manifest rules broken:\n  " + "\n  ".join(errors))
  return manifest, sorted(set(entries) - set(values))


def check_manifest(m: dict, values: dict[str, dict] | None = None) -> list[str]:
  """the rules json schema cannot state."""
  errors = []
  import jsonschema  # local: only the builder and tests need it
  v = jsonschema.validators.validator_for(load_schema("indicators"))(load_schema("indicators"))
  errors += [f"schema: {'/'.join(map(str, e.path))}: {e.message}" for e in v.iter_errors(m)]
  terms = {name: {t["id"] for t in voc["terms"]} for name, voc in m.get("vocabularies", {}).items()}
  leads, preferred = defaultdict(list), defaultdict(list)
  for i in m.get("indicators", []):
    for voc, tag in i.get("category", {}).items():
      if voc not in terms:
        errors.append(f"{i['id']}: category vocabulary {voc!r} is not in the manifest")
      elif tag not in terms[voc]:
        errors.append(f"{i['id']}: {tag!r} is not a term of {voc}")
    if i.get("lead"):
      leads[i["series"]].append(i["id"])
    if i.get("preferred"):
      preferred[i.get("variable", i["id"])].append(i["id"])
    if values is not None and i["id"] in values:
      has_class = bool(values[i["id"]]["classes"])
      if (i["kind"] == "categorical") != has_class:
        errors.append(f"{i['id']}: kind {i['kind']} but its values {'carry' if has_class else 'carry no'} class")
    if i["kind"] == "categorical" and i["status_method"] in ("iea-sd", "names-pct"):
      errors.append(f"{i['id']}: a categorical indicator cannot use {i['status_method']}")
  for s in sorted({i["series"] for i in m.get("indicators", [])}):
    if len(leads[s]) != 1:
      errors.append(f"series {s}: {len(leads[s])} leads {leads[s]}, needs exactly one")
  for var in sorted({i.get("variable", i["id"]) for i in m.get("indicators", [])}):
    if len(preferred[var]) != 1:
      errors.append(f"variable {var}: {len(preferred[var])} preferred {preferred[var]}, needs exactly one")
  return errors


# i/o ----
def _fetcher(cache: Path) -> Callable[[str], dict]:
  import hashlib
  import requests

  def fetch(url: str) -> dict:
    f = cache / (hashlib.sha256(url.encode()).hexdigest()[:16] + ".json")
    if not f.exists():
      r = requests.get(url, timeout=60)
      r.raise_for_status()
      f.parent.mkdir(parents=True, exist_ok=True)
      f.write_text(r.text)
    return json.loads(f.read_text())
  return fetch


def run(out: Path = Path("catalog"), sdg_values: Path | None = None, cache: Path = Path("cache/manifest"),
        version: str | None = None, config: Path = CONFIG) -> dict:
  """write <out>/indicators.json; returns a summary."""
  entries, vocabs = load_config(config)
  values = scan_values(out)
  fetch = _fetcher(cache)
  sdg = json.loads(Path(sdg_values).read_text()) if sdg_values and Path(sdg_values).exists() else None

  def dataset_of(ind_id: str) -> dict:
    fam, rest = ind_id.split(":", 1)
    if fam == "erddap":
      return erddap_dataset(rest.split(":")[0], fetch)
    if fam == "sdg":
      if sdg is None:
        raise ValueError(f"{ind_id}: its values carry no provenance.dataset; pass --sdg-values (the prototype's values.json)")
      return sdg_dataset(rest, sdg)
    raise ValueError(f"{ind_id}: no metadata source for producer family {fam!r}")

  created = contract.utc_now()
  version = version or dt.datetime.now(dt.timezone.utc).strftime("%Y.%m.%d")
  goos = json.loads(GOOS_MANIFEST.read_text()) if GOOS_MANIFEST.exists() else None
  manifest, missing = build_manifest(values, entries, vocabs, dataset_of, version, created, goos,
                                     sdg.get("eez_attribution") if sdg else None)
  path = Path(out) / "indicators.json"
  path.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n")
  return {"path": str(path), "version": version, "indicators": len(manifest["indicators"]),
          "config_without_values": missing}
