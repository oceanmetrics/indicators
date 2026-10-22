"""the indicators app's own schemas in schema/: the manifest (`indicators`) and the coverage table (`coverage`).

the values contract and its schemas (`values-row`, `values-provenance`) are oceanmetrics/extract `om_extract.contract`
and oceanmetrics/platform `packages/catalog/schemas/`; om_indicators.contract re-exports the former.
"""
from __future__ import annotations

import json
from functools import cache
from pathlib import Path

import jsonschema
import pyarrow.parquet as pq

SCHEMA_DIR = Path(__file__).resolve().parent.parent / "schema"


@cache
def load_schema(name: str) -> dict:
  """a schema from schema/<name>.schema.json (`indicators`, `coverage`)"""
  return json.loads((SCHEMA_DIR / f"{name}.schema.json").read_text())


@cache
def _validator(name: str) -> jsonschema.protocols.Validator:
  schema = load_schema(name)
  cls = jsonschema.validators.validator_for(schema)
  cls.check_schema(schema)
  return cls(schema)


# coverage ----
def validate_coverage(path: Path | str) -> list[str]:
  """coverage.parquet: every row against schema/coverage.schema.json, unique (coll, place_id, indicator, time_grain),
  and status / trend only on rows that name a status method."""
  table = pq.read_table(path)
  v = _validator("coverage")
  errors, seen = [], set()
  for i, r in enumerate(table.to_pylist()):
    errors += [f"row {i}: {'.'.join(map(str, e.path)) or 'row'}: {e.message}" for e in v.iter_errors(r)]
    key = (r.get("coll"), r.get("place_id"), r.get("indicator"), r.get("time_grain"))
    if key in seen:
      errors.append(f"row {i}: duplicate (coll, place_id, indicator, time_grain) {key}")
    seen.add(key)
    if (r.get("status") is not None or r.get("trend") is not None) and r.get("status_method") is None:
      errors.append(f"row {i}: a status or trend without a status_method")
  return [f"{path}: {e}" for e in errors]
