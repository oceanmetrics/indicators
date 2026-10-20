"""producers: code that COMPUTES values for a place on request, from a source nobody has published per place yet.

an adapter (om_indicators/adapters/) only reads what a producer has already published and never changes it; a producer
(this package) runs on a maintainer's machine, computes, writes contract rows and publishes its own output folder under
s3://oceanmetrics.io-public/indicators/producers/<name>/. an adapter then reads that folder into the catalog like any
other producer's output.

this module holds the stdlib-only rules that the triage (om_indicators/requests.py, which runs on a GitHub runner with
no scientific stack) shares with the producers.
"""
from __future__ import annotations


def geometry_kind(layer: dict | None) -> str | None:
  """how a place's polygon can be fetched at run time, from its gazetteer layers.json row:
  `vector` = the published places.parquet (one row read); `reference` = a reference collection (Marine Regions) whose
  publisher serves one feature at a time (`raster.feature_url`); None = neither (a derived layer such as fao_high_seas
  has internal geometry; a reference layer with tiles only has no feature service), so a maintainer has to do it."""
  if not layer:
    return None
  if layer.get("kind") == "vector":
    return "vector"
  if layer.get("kind") == "raster" and (layer.get("raster") or {}).get("feature_url"):
    return "reference"
  return None


def source_id_of(place_id: str) -> str:
  """a place's id at its publisher: the place_id without its authority prefix (`MRGID:5670` -> `5670`)"""
  return place_id.split(":", 1)[1] if ":" in place_id else place_id
