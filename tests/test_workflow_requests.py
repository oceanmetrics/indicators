"""the requests workflow's safety rules, read from the YAML: the issue never reaches a script through ${{ }}, a Copernicus
Marine request runs only on a maintainer's `run` label, and the producer is chosen from the checked job."""
import re
from pathlib import Path

import yaml

WF_TEXT = (Path(__file__).resolve().parent.parent / ".github" / "workflows" / "requests.yml").read_text()
WF = yaml.safe_load(WF_TEXT)
RUN = WF["jobs"]["run"]


def scripts(job):
  return [(s.get("name", ""), s["run"]) for s in job["steps"] if "run" in s]


def test_no_expression_is_spliced_into_a_script():
  for job in WF["jobs"].values():
    for name, script in scripts(job):
      assert "${{" not in script, f"{name}: pass the value through env, never ${{{{ }}}} in a script"


def test_the_run_job_takes_an_approvable_request_only_on_the_run_label_never_by_itself():
  cond = " ".join(RUN["if"].split())
  auto, approvable = cond.split(") ||", 1)
  assert "REQUESTS_AUTORUN" in auto and "outputs.label == 'auto'" in auto
  assert "REQUESTS_AUTORUN" not in approvable
  for needed in ("outputs.approvable == 'true'", "github.event.action == 'labeled'", "github.event.label.name == 'run'"):
    assert needed in approvable


def test_triage_exports_whether_a_request_is_approvable():
  assert "approvable" in WF["jobs"]["triage"]["outputs"]
  assert any("approvable=" in s for _, s in scripts(WF["jobs"]["triage"]))


def test_the_producer_is_chosen_from_the_checked_job_and_the_cmems_one_uses_its_own_dependency_group():
  assert any("check-job" in s for _, s in scripts(RUN))
  steps = {s["name"]: s for s in RUN["steps"] if "name" in s}
  erddap = steps["compute the place (om-extract, the chunked engine and its stats item)"]
  cmems = steps["compute the place (Copernicus Marine place producer, with the maintainer's own login)"]
  assert "REQ_FAMILY != 'cmems'" in erddap["if"] and "REQ_FAMILY == 'cmems'" in cmems["if"]
  assert "uv run --group cmems python -m om_indicators.producers.cmems_place" in cmems["run"].replace("\\\n", "")
  assert "--publish" in cmems["run"]
  for var in ("REQ_PLACE", "REQ_COLL", "REQ_INDICATOR"):
    assert f'"${var}"' in cmems["run"]


def test_a_copernicus_marine_run_does_not_touch_the_requested_items_list():
  rebuild = next(s for s in RUN["steps"] if s.get("name") == "rebuild and publish the catalog")["run"]
  assert re.search(r'if \[ "\$REQ_FAMILY" != cmems \]; then\s+uv run python -m om_indicators.requests add-item', rebuild)
  assert "scripts/build_catalog.sh" in rebuild and "scripts/publish_catalog.sh" in rebuild


def test_short_jobs_run_on_the_quick_runner_never_behind_the_precompute():
  # regression (2026-10-20): issue #2's run waited on the one `macmini` runner while erddap-places' daily precompute held
  # it for hours; the request runs and the catalog go to the Mac mini's second runner, which no long job can take
  catalog = yaml.safe_load((Path(__file__).resolve().parent.parent / ".github" / "workflows" / "catalog.yml").read_text())
  for runs_on in (RUN["runs-on"], catalog["jobs"]["catalog"]["runs-on"]):
    assert runs_on == ["self-hosted", "macmini-quick"]


def test_the_daily_cap_counts_only_runs_that_started_by_themselves():
  # regression (2026-10-20): issue #2, accepted with the `run` label, was closed `auto-done` and so counted against the
  # automatic runs' daily cap; a maintainer-started run is `run-done`
  cap = next(s for s in RUN["steps"] if s.get("id") == "cap")["run"]
  assert "--label auto-done" in cap and "run-done" not in cap
  answer = next(s for s in RUN["steps"] if s.get("name") == "answer the issue")["run"]
  assert 'if [ "$ACTION" = labeled ]; then done=run-done; else done=auto-done; fi' in answer
  assert '--add-label "$done"' in answer and "--add-label auto-done" not in answer
  assert RUN["env"]["ACTION"] == "${{ github.event.action }}"


# ---- the ERDDAP path on the one engine (2026-10-23) ----

def step(name):
  return next(s for s in RUN["steps"] if s.get("name") == name)


def test_the_erddap_path_is_om_extract_run_on_the_chunked_engine_with_its_stats_item():
  engine = step("compute the place (om-extract, the chunked engine and its stats item)")
  cmd = " ".join(engine["run"].replace("\\\n", " ").split())
  assert "uv run om-extract run" in cmd
  for flag in ('--place "$REQ_PLACE"', '--coll "$REQ_COLL"', '--var "$REQ_VARIABLE"', "--chunks ", "--stats-dir out/gazetteer/stats",
               'gazetteer/erddap/$REQ_DATASET/collection.json'):
    assert flag in cmd, flag
  assert "--t0" not in cmd and "--geometry" not in cmd          # the whole record; the place from the gazetteer
  # erddap-places is no longer checked out or run
  assert not any("erddap-places" in str(s.get("with", {}).get("repository", "")) for s in RUN["steps"])
  assert not any("precompute" in s.get("run", "") for s in RUN["steps"])


def test_the_stats_upload_is_a_dry_run_unless_om_stats_publish_is_publish():
  st = step("list the stats files, and upload them only when OM_STATS_PUBLISH is publish")
  assert st["id"] == "stats" and st["env"]["OM_STATS_PUBLISH"] == "${{ vars.OM_STATS_PUBLISH }}"
  script = st["run"]
  assert "mode=dry-run\n" in script and '[ "${OM_STATS_PUBLISH:-}" = publish ] && mode=publish' in script
  upload, dry = script.split('if [ "$mode" = publish ]; then', 1)[1].split("else", 1)
  assert "aws s3 cp" in upload and "s3://oceanmetrics.io-public/gazetteer/$f" in upload
  assert "aws s3 cp" not in script.split('if [ "$mode" = publish ]; then', 1)[0] and "aws s3" not in dry
  assert "waits on the parity criterion, ledger 2026-10-23" in script
  # the files are listed and attached as an artifact either way (a tarball: upload-artifact refuses ':' in a name)
  assert "tar -czf ../stats.tgz stats" in script
  art = next(s for s in RUN["steps"] if s.get("uses", "").startswith("actions/upload-artifact") and s["with"]["name"] == "stats")
  assert "out/stats.tgz" in art["with"]["path"] and "REQ_FAMILY != 'cmems'" in art["if"]


def test_a_dry_run_neither_rebuilds_nor_closes_and_says_so_on_the_issue():
  for name in ("rebuild and publish the catalog", "answer the issue"):
    cond = step(name)["if"]
    assert "env.REQ_FAMILY == 'cmems' || steps.stats.outputs.mode == 'publish'" in cond, name
  dry = step("answer the issue (a dry run, computed but not published)")
  assert "steps.stats.outputs.mode != 'publish'" in dry["if"] and "REQ_FAMILY != 'cmems'" in dry["if"]
  assert "gh issue comment" in dry["run"] and "gh issue close" not in dry["run"] and "--add-label" not in dry["run"]


def test_the_header_states_why_the_default_is_a_dry_run():
  head = WF_TEXT.split("name: requests", 1)[0]
  assert "OM_STATS_PUBLISH" in head and "ledger 2026-10-23" in head and "om-extract run" in head
