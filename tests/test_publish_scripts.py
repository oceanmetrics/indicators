"""scripts/publish_catalog.sh and publish_changes.sh run against a fake om-publish (platform scripts/om-publish.sh, the
one publisher of the bucket since 2026-10-24) that records each call: the upload order (values, coverage, the change
files and feeds with latest.json last, the manifest last of all), the prefixes, the headers, --keep-history on the two
files the change backfill reads, dry run by default only with --dry-run, and no --delete anywhere. fake uv and npx stand
in for the validators."""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
CC = "public, max-age=300"
JSON = "json=application/json; charset=utf-8"


def fake_bin(d: Path) -> Path:
  d.mkdir()
  (d / "om-publish").write_text(f"#!{sys.executable}\nimport json, os, sys\n"
                                "open(os.environ['OM_PUBLISH_LOG'], 'a').write(json.dumps(sys.argv[1:]) + '\\n')\n")
  for tool in ("uv", "npx"):
    (d / tool).write_text("#!/bin/sh\nexit 0\n")
  for f in d.iterdir():
    f.chmod(0o755)
  return d


def catalog(d: Path, change_day: bool = True) -> Path:
  for rel in ("indicators.json", "coverage.parquet", "values/erddap/coll=x/data.parquet", "changes/latest.json",
              "feeds/index.json", "feeds/all.xml", "feeds/coll=x.xml"):
    (d / rel).parent.mkdir(parents=True, exist_ok=True)
    (d / rel).write_text("x")
  if change_day:
    (d / "changes/2026-10-23.json").write_text("[]")
    (d / "changes/2026-10-23.parquet").write_text("x")
  return d


def run(tmp_path: Path, *args: str, change_day: bool = True) -> list[list[str]]:
  bin_ = fake_bin(tmp_path / "bin")
  out = catalog(tmp_path / "catalog", change_day)
  log = tmp_path / "calls.jsonl"
  env = {**os.environ, "PATH": f"{bin_}:{os.environ['PATH']}", "OM_PUBLISH": str(bin_ / "om-publish"),
         "OM_PUBLISH_LOG": str(log)}
  subprocess.run(["bash", str(ROOT / "scripts" / "publish_catalog.sh"), str(out), *args], env=env, check=True,
                 capture_output=True, text=True)
  return [json.loads(l) for l in log.read_text().splitlines()]


def target(call: list[str]) -> tuple[str, str]:
  """(the local path relative to the catalog, the prefix): the last two positional arguments"""
  pos, skip = [], False
  for a in call:
    if skip:
      skip = False
    elif a in ("--cache-control", "--type", "--include", "--exclude", "--as", "--last"):
      skip = True
    elif not a.startswith("--"):
      pos.append(a)
  return pos[-2].split("/catalog/", 1)[-1], pos[-1]


def test_the_catalog_goes_values_first_then_coverage_then_changes_and_feeds_and_the_manifest_last(tmp_path):
  calls = run(tmp_path)
  assert [target(c) for c in calls] == [
    ("values", "indicators/values"),
    ("scripts/bucket_README.md", "indicators"),
    ("coverage.parquet", "indicators"),
    ("changes", "indicators/changes"),          # the day's parquet
    ("changes", "indicators/changes"),          # the day's json, latest.json left out
    ("feeds", "indicators/feeds"),
    ("feeds/index.json", "indicators/feeds"),
    ("changes/latest.json", "indicators/changes"),
    ("indicators.json", "indicators")]
  assert all(c[0] == "--really" and "--cache-control" in c and c[c.index("--cache-control") + 1] == CC for c in calls)
  assert not any(a.startswith("--delete") for c in calls for a in c)


def test_the_two_files_the_backfill_reads_keep_their_history_and_nothing_else_does(tmp_path):
  calls = run(tmp_path)
  kept = [target(c)[0] for c in calls if "--keep-history" in c]
  assert kept == ["coverage.parquet", "indicators.json"]


def test_headers_match_what_the_aws_cli_wrote(tmp_path):
  calls = {target(c): c for c in run(tmp_path)}
  readme = next(c for t, c in calls.items() if t[0].endswith("bucket_README.md"))
  assert readme[readme.index("--as") + 1] == "README.md"
  assert calls[("indicators.json", "indicators")][-4:-2] == ["--type", JSON]
  feeds = calls[("feeds", "indicators/feeds")]
  assert feeds[feeds.index("--type") + 1] == "xml=application/atom+xml; charset=utf-8" and "*.xml" in feeds
  values = calls[("values", "indicators/values")]
  assert values[values.index("--include") + 1] == "*.parquet"


def test_the_change_json_upload_leaves_latest_json_for_last(tmp_path):
  calls = [c for c in run(tmp_path) if target(c) == ("changes", "indicators/changes")]
  assert calls[1][calls[1].index("--exclude") + 1] == "latest.json" and calls[1][calls[1].index("--include") + 1] == "*.json"


def test_a_day_without_a_change_file_uploads_only_latest_json_and_the_feeds(tmp_path):
  targets = [target(c) for c in run(tmp_path, change_day=False)]
  assert ("changes", "indicators/changes") not in targets
  assert ("changes/latest.json", "indicators/changes") in targets


def test_dry_run_is_passed_to_every_call(tmp_path):
  calls = run(tmp_path, "--dry-run")
  assert len(calls) == 9 and all(c[0] == "--dry-run" for c in calls)


def test_a_missing_publisher_stops_before_any_upload(tmp_path):
  out = catalog(tmp_path / "catalog")
  env = {**os.environ, "OM_PUBLISH": str(tmp_path / "nothing"), "HOME": str(tmp_path)}
  r = subprocess.run(["bash", str(ROOT / "scripts" / "publish_catalog.sh"), str(out)], env=env, capture_output=True,
                     text=True)
  assert r.returncode == 1 and "om-publish.sh not found" in r.stderr


def test_the_python_publisher_path_is_om_publish_env_first_then_a_platform_checkout(tmp_path, monkeypatch):
  from om_indicators.publish import om_publish_path
  f = tmp_path / "om-publish.sh"
  f.write_text("#!/bin/sh\n")
  f.chmod(0o755)
  monkeypatch.setenv("OM_PUBLISH", str(f))
  assert om_publish_path() == str(f)
  monkeypatch.setenv("OM_PUBLISH", str(tmp_path / "missing"))
  with pytest.raises(FileNotFoundError, match="set OM_PUBLISH"):
    om_publish_path()
