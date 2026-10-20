"""the value contract: schema, validation, and the one writer every adapter uses.

a contract row is (place_id, coll, indicator, time_grain, time, class, value, n, unit) plus optional x_* producer
columns (schema/values.schema.json). a values file holds one (indicator, coll) at
values/indicator=<indicator>/coll=<coll>/data.parquet, with its provenance (schema/provenance.schema.json) as JSON in
the parquet key-value metadata under `om:provenance`. json schema checks one row at a time; the rules that span rows or
need arithmetic (time aligned to its grain, unique keys, one indicator and coll per file, finite values) are here.
"""
from __future__ import annotations

import datetime as dt
import json
import math
from functools import cache
from pathlib import Path
from typing import Any, Iterable

import jsonschema
import pyarrow as pa
import pyarrow.parquet as pq

CONTRACT_VERSION = "1.1.0"
PROVENANCE_KEY = b"om:provenance"
SCHEMA_DIR = Path(__file__).resolve().parent.parent / "schema"
GRAINS = ("all", "decade", "year", "month", "day")
KEY = ("place_id", "time_grain", "time", "class")

# the core columns, in order, with their parquet types ----
ARROW_SCHEMA = pa.schema([
  ("place_id", pa.string()),
  ("coll", pa.string()),
  ("indicator", pa.string()),
  ("time_grain", pa.string()),
  ("time", pa.date32()),
  ("class", pa.string()),
  ("value", pa.float64()),
  ("n", pa.float64()),
  ("unit", pa.string()),
])
CORE = tuple(ARROW_SCHEMA.names)


class ContractError(ValueError):
  """rows or a file that break the contract; `errors` lists every problem found."""

  def __init__(self, errors: list[str]):
    self.errors = errors
    shown = "\n  ".join(errors[:20]) + (f"\n  ... and {len(errors) - 20} more" if len(errors) > 20 else "")
    super().__init__(f"{len(errors)} contract error(s):\n  {shown}")


@cache
def load_schema(name: str) -> dict:
  """a schema from schema/<name>.schema.json"""
  return json.loads((SCHEMA_DIR / f"{name}.schema.json").read_text())


@cache
def _validator(name: str) -> jsonschema.protocols.Validator:
  schema = load_schema(name)
  cls = jsonschema.validators.validator_for(schema)
  cls.check_schema(schema)
  return cls(schema)


# periods ----
def period_start(grain: str, d: dt.date) -> dt.date | None:
  """the first day of the `grain` period holding date `d` (None for `all`)."""
  if grain == "all":
    return None
  if grain == "decade":
    return dt.date(d.year - d.year % 10, 1, 1)
  if grain == "year":
    return dt.date(d.year, 1, 1)
  if grain == "month":
    return dt.date(d.year, d.month, 1)
  if grain == "day":
    return d
  raise ValueError(f"unknown time_grain {grain!r}")


def _as_date(t: Any) -> dt.date | None:
  if t is None or isinstance(t, dt.date) and not isinstance(t, dt.datetime):
    return t
  if isinstance(t, dt.datetime):
    return t.date()
  return dt.date.fromisoformat(str(t))


# validation ----
def validate_rows(rows: Iterable[dict], *, one_file: bool = True) -> list[str]:
  """every contract problem in `rows` (dicts keyed by column; `time` a date, an ISO string or None). with one_file,
  the rows must also share one indicator and one coll and, when categorical, all carry a class."""
  errors: list[str] = []
  seen: dict[tuple, int] = {}
  indicators, colls, with_class, without_class = set(), set(), 0, 0
  v = _validator("values")
  for i, r in enumerate(rows):
    t = r.get("time")
    try:
      d = _as_date(t)
    except (TypeError, ValueError):
      errors.append(f"row {i}: time {t!r} is not an ISO date")
      d = None
    as_json = {**r, "time": d.isoformat() if d else None}
    for e in sorted(v.iter_errors(as_json), key=lambda e: list(e.path)):
      where = ".".join(str(p) for p in e.path) or "row"
      errors.append(f"row {i}: {where}: {e.message}")
    g = r.get("time_grain")
    if g == "all" and t is not None:
      errors.append(f"row {i}: time must be null for time_grain 'all', got {t!r}")
    elif g in GRAINS and g != "all":
      if d is None:
        errors.append(f"row {i}: time is required for time_grain {g!r}")
      elif period_start(g, d) != d:
        errors.append(f"row {i}: time {d.isoformat()} is not the start of a {g} (expected {period_start(g, d).isoformat()})")
    val = r.get("value")
    if isinstance(val, float) and not math.isfinite(val):
      errors.append(f"row {i}: value must be finite or null, got {val!r}")
    n = r.get("n")
    if isinstance(n, float) and not math.isfinite(n):
      errors.append(f"row {i}: n must be finite or null, got {n!r}")
    key = (r.get("place_id"), r.get("indicator"), g, d, r.get("class"))
    if key in seen:
      errors.append(f"row {i}: duplicate of row {seen[key]} on (place_id, indicator, time_grain, time, class) = {key[0]}, {key[1]}, {g}, {d}, {key[4]}")
    else:
      seen[key] = i
    indicators.add(r.get("indicator"))
    colls.add(r.get("coll"))
    if r.get("class") is None:
      without_class += 1
    else:
      with_class += 1
  if one_file:
    if len(indicators) > 1:
      errors.append(f"a values file holds one indicator, found {len(indicators)}: {sorted(map(str, indicators))}")
    if len(colls) > 1:
      errors.append(f"a values file holds one coll, found {len(colls)}: {sorted(map(str, colls))}")
    if with_class and without_class:
      errors.append(f"class must be set on every row (categorical) or none (continuous): {with_class} set, {without_class} null")
  return errors


def validate_provenance(prov: Any) -> list[str]:
  """every problem with a provenance object."""
  return [f"provenance: {'.'.join(str(p) for p in e.path) or 'root'}: {e.message}"
          for e in sorted(_validator("provenance").iter_errors(prov), key=lambda e: list(e.path))]


def validate_table(table: pa.Table) -> list[str]:
  """column names and parquet types, then the rows."""
  errors: list[str] = []
  names = table.schema.names
  for f in ARROW_SCHEMA:
    if f.name not in names:
      errors.append(f"missing column {f.name!r}")
    elif not table.schema.field(f.name).type.equals(f.type):
      errors.append(f"column {f.name!r} is {table.schema.field(f.name).type}, expected {f.type}")
  for n in names:
    if n not in CORE and not n.startswith("x_"):
      errors.append(f"unexpected column {n!r} (extra columns must be named x_*)")
  if errors:
    return errors
  return validate_rows(table.to_pylist())


def values_path(root: Path | str, indicator: str, coll: str) -> Path:
  """where the values of one (indicator, coll) live under a catalog root."""
  return Path(root) / "values" / f"indicator={indicator}" / f"coll={coll}" / "data.parquet"


def validate_file(path: Path | str) -> list[str]:
  """a values file: its rows, its provenance, and that both agree with its path."""
  path = Path(path)
  errors: list[str] = []
  try:
    pf = pq.ParquetFile(path)
  except Exception as e:  # noqa: BLE001 -- any unreadable file is one error
    return [f"{path}: unreadable parquet: {e}"]
  table = pf.read()
  errors += validate_table(table)
  meta = pf.schema_arrow.metadata or {}
  if PROVENANCE_KEY not in meta:
    errors.append(f"missing key-value metadata {PROVENANCE_KEY.decode()!r}")
    prov = None
  else:
    try:
      prov = json.loads(meta[PROVENANCE_KEY])
    except json.JSONDecodeError as e:
      errors.append(f"provenance is not JSON: {e}")
      prov = None
  if prov is not None:
    errors += validate_provenance(prov)
  ind_dir, coll_dir = path.parent.parent.name, path.parent.name
  ind = ind_dir.removeprefix("indicator=") if ind_dir.startswith("indicator=") else None
  coll = coll_dir.removeprefix("coll=") if coll_dir.startswith("coll=") else None
  if path.name != "data.parquet" or ind is None or coll is None:
    errors.append(f"path must end values/indicator=<id>/coll=<slug>/data.parquet, got {path}")
  if table.num_rows and "indicator" in table.schema.names:
    if ind is not None and set(table.column("indicator").to_pylist()) != {ind}:
      errors.append(f"rows' indicator differs from the path's {ind!r}")
    if coll is not None and set(table.column("coll").to_pylist()) != {coll}:
      errors.append(f"rows' coll differs from the path's {coll!r}")
  if isinstance(prov, dict):
    if ind is not None and prov.get("indicator") != ind:
      errors.append(f"provenance indicator {prov.get('indicator')!r} differs from the path's {ind!r}")
    if coll is not None and prov.get("coll") != coll:
      errors.append(f"provenance coll {prov.get('coll')!r} differs from the path's {coll!r}")
    if isinstance(prov.get("rows"), int) and prov["rows"] != table.num_rows:
      errors.append(f"provenance says {prov['rows']} rows, the file has {table.num_rows}")
  return [f"{path}: {e}" for e in errors]


def validate_tree(root: Path | str) -> dict[str, list[str]]:
  """validate_file() for every values file under a catalog root; only files with problems are returned."""
  out = {}
  for f in sorted(Path(root).glob("values/indicator=*/coll=*/data.parquet")):
    errs = validate_file(f)
    if errs:
      out[str(f)] = errs
  return out


# writing ----
def _sort_key(r: dict) -> tuple:
  d = _as_date(r.get("time"))
  return (r["place_id"], GRAINS.index(r["time_grain"]) if r["time_grain"] in GRAINS else 99,
          d or dt.date.min, r.get("class") or "")


def to_table(rows: list[dict]) -> pa.Table:
  """rows -> an arrow table in contract column order and types, x_* columns after, rows in a stable order
  (place_id, grain, time, class)."""
  rows = sorted(rows, key=_sort_key)
  extras = sorted({k for r in rows for k in r if k.startswith("x_")})
  cols = {f.name: pa.array([_as_date(r.get(f.name)) if f.name == "time" else r.get(f.name) for r in rows], type=f.type)
          for f in ARROW_SCHEMA}
  for x in extras:
    cols[x] = pa.array([r.get(x) for r in rows])
  return pa.table(cols)


def write_values(rows: list[dict], root: Path | str, provenance: dict) -> Path:
  """validate and write one values file (one indicator, one coll) under `root`; raises ContractError on any problem.
  `provenance` gets `contract`, `indicator`, `coll` and `rows` filled in when absent."""
  if not rows:
    raise ContractError(["no rows to write"])
  table = to_table(rows)
  ind, coll = rows[0]["indicator"], rows[0]["coll"]
  prov = {"contract": CONTRACT_VERSION, "indicator": ind, "coll": coll, **provenance, "rows": table.num_rows}
  errors = validate_table(table) + validate_provenance(prov)
  if errors:
    raise ContractError(errors)
  path = values_path(root, ind, coll)
  path.parent.mkdir(parents=True, exist_ok=True)
  meta = {**(table.schema.metadata or {}), PROVENANCE_KEY: json.dumps(prov, sort_keys=True).encode()}
  pq.write_table(table.replace_schema_metadata(meta), path, compression="snappy")
  return path


def read_values(path: Path | str) -> tuple[pa.Table, dict | None]:
  """a values file's rows and its provenance."""
  pf = pq.ParquetFile(path)
  meta = pf.schema_arrow.metadata or {}
  prov = json.loads(meta[PROVENANCE_KEY]) if PROVENANCE_KEY in meta else None
  return pf.read().replace_schema_metadata(None), prov


def utc_now() -> str:
  """the created stamp, to the second."""
  return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


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
