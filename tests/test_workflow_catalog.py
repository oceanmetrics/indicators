"""the catalog workflow's change-feed step (build week 5, step 1), read from the YAML: it exists, runs after the build and
before the publish, diffs against the PUBLISHED coverage, and never blocks the catalog; the publish script uploads the
change files and feeds after coverage.parquet and before indicators.json; the requests workflow writes them too."""
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CATALOG = yaml.safe_load((ROOT / ".github" / "workflows" / "catalog.yml").read_text())
STEPS = CATALOG["jobs"]["catalog"]["steps"]
PUBLISHED = "https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/indicators/coverage.parquet"


def _at(pred) -> int:
  hits = [i for i, s in enumerate(STEPS) if pred(s)]
  assert len(hits) == 1, f"{len(hits)} steps match"
  return hits[0]


def test_the_change_step_runs_after_the_build_and_before_the_publish():
  build = _at(lambda s: "scripts/build_catalog.sh" in s.get("run", ""))
  changes = _at(lambda s: "changes:build" in s.get("run", ""))
  publish = _at(lambda s: "scripts/publish_catalog.sh" in s.get("run", ""))
  assert build < changes < publish


def test_the_change_step_diffs_against_the_published_coverage_and_never_blocks_the_catalog():
  step = STEPS[_at(lambda s: "changes:build" in s.get("run", ""))]
  assert step.get("continue-on-error") is True
  assert f"npm run -s changes:build -- catalog --prev {PUBLISHED}" in step["run"]
  assert "if" not in step, "the diff runs on every build, published or not"


def test_the_publish_uploads_changes_and_feeds_between_coverage_and_the_manifest():
  pub = (ROOT / "scripts" / "publish_catalog.sh").read_text()
  cov = pub.index('"$OUT/coverage.parquet" "$DEST/coverage.parquet"')
  ch = pub.index('scripts/publish_changes.sh "$OUT"')
  man = pub.index('"$OUT/indicators.json" "$DEST/indicators.json"')
  assert cov < ch < man
  assert 'if [ -f "$OUT/changes/latest.json" ]' in pub


def test_publish_changes_writes_latest_json_last_and_deletes_nothing():
  sh = (ROOT / "scripts" / "publish_changes.sh").read_text()
  lines = [l for l in sh.splitlines() if l.startswith("aws s3")]
  assert lines[-1].startswith('aws s3 cp "$OUT/changes/latest.json"')
  assert "--delete" not in sh
  assert 'application/atom+xml; charset=utf-8' in sh
  for schema in ("changes-latest", "feeds-index"):
    assert f"om-catalog validate {schema}" in sh


def test_a_request_run_writes_the_change_files_before_its_publish():
  req = yaml.safe_load((ROOT / ".github" / "workflows" / "requests.yml").read_text())
  run = next(s for s in req["jobs"]["run"]["steps"] if s.get("name") == "rebuild and publish the catalog")["run"]
  assert run.index("scripts/build_catalog.sh") < run.index("changes:build") < run.index("scripts/publish_catalog.sh")
  assert f"--prev {PUBLISHED}" in run.replace("\\\n", "").replace("  ", " ")
