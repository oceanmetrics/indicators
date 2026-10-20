"""`om-ind`: build and check the indicator catalog.

  om-ind erddap-places [--base URL] [--cache DIR] [--out catalog] [--only dataset/variable ...]
  om-ind sdg [--values PATH] [--out catalog]
  om-ind eco-indicators [--out catalog] [--ref SHA] [--cache DIR]
  om-ind obis [--out catalog] [--release vYYYYMMDD] [--cache DIR]
  om-ind manifest [--out catalog] [--sdg-values PATH] [--version YYYY.MM.DD]
  om-ind validate [catalog]
  om-ind pull --family sdg [--base URL] [--out catalog]

to add a subcommand, write `_add_<name>(sub)` that registers the parser and sets `func` (taking the parsed args and
returning an exit code), and list it in COMMANDS.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Callable, Sequence

from om_indicators import contract


# summaries ----
def print_summary(summary: dict) -> None:
  """files with rows and places, then the lists (empty, partial, ...)."""
  files = summary.get("files", [])
  for f in files:
    print(f"{f['rows']:>8} rows {f['places']:>4} places  {f['indicator']}  coll={f['coll']}")
  print(f"{len(files)} files, {sum(f['rows'] for f in files)} rows")
  for key, v in summary.items():
    if key in ("files",) or v in ([], 0, None):
      continue
    if isinstance(v, list):
      print(f"{key} ({len(v)}):")
      for x in v:
        print(f"  {x if isinstance(x, str) else json.dumps(x)}")
    elif key in ("seconds", "items", "eezs"):
      print(f"{key}: {v}")


# erddap-places ----
def _add_erddap_places(sub: argparse._SubParsersAction) -> None:
  from om_indicators.adapters import erddap_places
  p = sub.add_parser("erddap-places", help="published gazetteer/stats daily files -> month and year rows")
  p.add_argument("--base", default=erddap_places.DEFAULT_BASE, help="the stats collection.json (URL or path)")
  p.add_argument("--cache", type=Path, default=Path("cache/erddap-places"))
  p.add_argument("--out", type=Path, default=Path("catalog"))
  p.add_argument("--only", nargs="+", metavar="dataset/variable", help="limit to these variables")
  p.add_argument("--extra-items", metavar="JSON", help="a JSON list of item hrefs (items/<id>.json) computed on request, "
                 "which the stats collection does not link (a path or URL; a missing URL is an empty list)")

  def func(a: argparse.Namespace) -> int:
    extra = erddap_places.read_extra_items(a.extra_items) if a.extra_items else []
    print_summary(erddap_places.run(a.out, base=a.base, cache=a.cache, only=a.only, extra_items=extra))
    return 0
  p.set_defaults(func=func)


# sdg ----
def _add_sdg(sub: argparse._SubParsersAction) -> None:
  p = sub.add_parser("sdg", help="the eez_indicators prototype's values.json -> latest-year rows")
  p.add_argument("--values", type=Path, default=Path("../places/proto/eez_indicators/data/values.json"))
  p.add_argument("--out", type=Path, default=Path("catalog"))

  def func(a: argparse.Namespace) -> int:
    from om_indicators.adapters import sdg
    print_summary(sdg.run(a.values, a.out))
    return 0
  p.set_defaults(func=func)


# eco-indicators ----
def _add_eco_indicators(sub: argparse._SubParsersAction) -> None:
  p = sub.add_parser("eco-indicators", help="noaa-onms/eco-indicators Copernicus Marine sanctuary means -> month and year rows")
  p.add_argument("--out", type=Path, default=Path("catalog"))
  p.add_argument("--ref", help="commit of the repo to read (default: the latest on main that touched data/copernicus.csv)")
  p.add_argument("--cache", type=Path, default=Path("cache/eco-indicators"))

  def func(a: argparse.Namespace) -> int:
    from om_indicators.adapters import eco_indicators
    s = eco_indicators.run(a.out, ref=a.ref, cache=a.cache)
    print(f"noaa-onms/eco-indicators @ {s['ref']} ({s['commit_date']})")
    print_summary(s)
    return 0
  p.set_defaults(func=func)


# obis ----
def _add_obis(sub: argparse._SubParsersAction) -> None:
  p = sub.add_parser("obis", help="the obis-h3 release's exact place indicators -> year, decade and all-years rows")
  p.add_argument("--out", type=Path, default=Path("catalog"))
  p.add_argument("--release", help="obis-h3 release, e.g. v20261012 (default: latest.json)")
  p.add_argument("--cache", type=Path, default=Path("cache/obis"))

  def func(a: argparse.Namespace) -> int:
    from om_indicators.adapters import obis
    s = obis.run(a.out, release=a.release, cache=a.cache)
    print(f"obis-h3 {s['release']}, OBIS snapshot {s['obis_snapshot']}, WoRMS {s['worms_version']}")
    print_summary(s)
    return 0
  p.set_defaults(func=func)


# manifest ----
def _add_manifest(sub: argparse._SubParsersAction) -> None:
  p = sub.add_parser("manifest", help="config + vocabularies + values + producer STAC -> indicators.json")
  p.add_argument("--out", type=Path, default=Path("catalog"))
  p.add_argument("--sdg-values", type=Path, default=Path("../places/proto/eez_indicators/data/values.json"),
                 help="the prototype's values.json, for the SDG series metadata")
  p.add_argument("--cache", type=Path, default=Path("cache/manifest"))
  p.add_argument("--version", help="manifest version (default: today, YYYY.MM.DD)")

  def func(a: argparse.Namespace) -> int:
    from om_indicators import manifest
    s = manifest.run(a.out, sdg_values=a.sdg_values, cache=a.cache, version=a.version)
    print(f"{s['indicators']} indicators, version {s['version']} -> {s['path']}")
    if s["config_without_values"]:
      print(f"in config/indicators.yml without values ({len(s['config_without_values'])}):")
      for i in s["config_without_values"]:
        print(f"  {i}")
    return 0
  p.set_defaults(func=func)


# pull ----
def _add_pull(sub: argparse._SubParsersAction) -> None:
  from om_indicators import publish
  p = sub.add_parser("pull", help="copy published values files of producer families this run does not rebuild")
  p.add_argument("--family", nargs="+", required=True, help="indicator id families, e.g. sdg")
  p.add_argument("--base", default=publish.PUBLIC_BASE, help="the published catalog (URL or directory)")
  p.add_argument("--out", type=Path, default=Path("catalog"))

  def func(a: argparse.Namespace) -> int:
    got = publish.pull(a.base, a.out, a.family)
    for f in got:
      print(f"pulled {f}")
    print(f"{len(got)} values files from {a.base}")
    return 0
  p.set_defaults(func=func)


# validate ----
def _add_validate(sub: argparse._SubParsersAction) -> None:
  p = sub.add_parser("validate", help="every values file under a catalog against the contract")
  p.add_argument("catalog", nargs="?", type=Path, default=Path("catalog"))

  def func(a: argparse.Namespace) -> int:
    problems = contract.validate_tree(a.catalog)
    n = len(list(Path(a.catalog).glob("values/indicator=*/coll=*/data.parquet")))
    for errs in problems.values():
      for e in errs:
        print(e)
    print(f"{n} values files, {len(problems)} with problems")
    cov = Path(a.catalog) / "coverage.parquet"
    cov_errors = contract.validate_coverage(cov) if cov.exists() else []
    for e in cov_errors[:50]:
      print(e)
    if cov.exists():
      print(f"coverage.parquet: {len(cov_errors)} problems")
    return 1 if problems or cov_errors else 0
  p.set_defaults(func=func)


COMMANDS: list[Callable[[argparse._SubParsersAction], None]] = [
  _add_erddap_places, _add_sdg, _add_eco_indicators, _add_obis, _add_manifest, _add_validate, _add_pull]


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(prog="om-ind", description="Ocean Metrics Indicators")
  sub = parser.add_subparsers(dest="command", required=True)
  for add in COMMANDS:
    add(sub)
  return parser


def main(argv: Sequence[str] | None = None) -> int:
  args = build_parser().parse_args(argv)
  return int(args.func(args))


if __name__ == "__main__":
  sys.exit(main())
