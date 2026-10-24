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
  auto, approvable = cond.split("(needs.triage.outputs.approvable", 1)
  approvable = "(needs.triage.outputs.approvable" + approvable
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


UNIT_SH = (Path(__file__).resolve().parent.parent / "scripts" / "stats_unit.sh").read_text()


def unit_fn(name):
  """the body of one function of scripts/stats_unit.sh"""
  return UNIT_SH.split(f"\n{name}() {{\n", 1)[1].split("\n}\n", 1)[0]


def test_the_erddap_path_is_om_extract_run_on_the_chunked_engine_with_its_stats_item():
  engine = step("compute the place (om-extract, the chunked engine and its stats item)")
  assert "scripts/stats_unit.sh compute out" in engine["run"]
  cmd = " ".join(unit_fn("compute").replace("\\\n", " ").replace('"$out/', "out/").split())
  assert "uv run om-extract run" in cmd
  for flag in ('--place "$REQ_PLACE"', '--coll "$REQ_COLL"', '--var "$REQ_VARIABLE"', "--chunks ", "--stats-dir out/gazetteer/stats",
               'gazetteer/erddap/$REQ_DATASET/collection.json'):
    assert flag in cmd, flag
  assert "--t0" not in cmd and "--geometry" not in cmd          # the whole record; the place from the gazetteer
  # erddap-places is no longer checked out or run
  assert not any("erddap-places" in str(s.get("with", {}).get("repository", "")) for s in RUN["steps"])
  assert not any("precompute" in s.get("run", "") for s in RUN["steps"])


STATS_STEP = "list the stats files and decide the mode (OM_STATS_PUBLISH, or the dispatch's publish)"
UPLOAD_STEP = "upload the stats files (publish mode and the gate's PASS only)"
GATE_STEP = "the compare gate (om-extract compare against the published file)"


def test_the_stats_upload_is_a_dry_run_unless_om_stats_publish_is_publish():
  st = step(STATS_STEP)
  assert st["id"] == "stats" and st["env"]["OM_STATS_PUBLISH"] == "${{ vars.OM_STATS_PUBLISH }}"
  script = st["run"]
  assert "mode=dry-run\n" in script and 'elif [ "${OM_STATS_PUBLISH:-}" = publish ]; then' in script
  assert "OM_PUBLISH" not in script and "stats_unit.sh publish" not in script
  up = step(UPLOAD_STEP)
  assert "steps.stats.outputs.mode == 'publish'" in up["if"] and "scripts/stats_unit.sh publish out" in up["run"]
  # om-publish.sh (both stores), the parquet first, then the provenance, then the item; never aws, never a delete
  upload = unit_fn("publish")
  assert '"$OM_PUBLISH" --really' in upload and upload.rstrip().endswith("stats gazetteer/stats")
  assert upload.index("--last '*.provenance.json'") < upload.index("--last 'items/*'")
  for text in (script, up["run"], UNIT_SH):
    assert "aws s3 cp" not in text and "aws s3 sync" not in text and "--delete" not in text
  assert "it waited on the parity criterion, ledger 2026-10-23" in script
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


# ---- the refresh label and the manual dispatch (2026-10-23) ----

ON = WF.get("on", WF.get(True))                      # PyYAML reads the key `on` as True


def test_the_dispatch_takes_a_place_a_collection_a_dataset_a_variable_and_publish_off_by_default():
  inputs = ON["workflow_dispatch"]["inputs"]
  assert set(inputs) == {"place", "coll", "dataset", "variable", "publish", "reference_version", "daily", "units"}
  for k in ("place", "coll", "dataset", "variable"):
    # not required since the daily dispatch (2026-10-24), which takes none; check-job refuses an empty one
    assert inputs[k]["required"] is False and inputs[k]["type"] == "string"
  assert inputs["publish"]["type"] == "boolean" and inputs["publish"]["default"] is False
  assert "issues" in ON                                  # the issue events are still there


def test_a_dispatch_runs_the_same_run_job_without_triage_and_the_job_survives_the_skipped_triage():
  cond = " ".join(RUN["if"].split())
  assert RUN["needs"] == "triage"
  assert cond.startswith("!cancelled() && ((github.event_name == 'workflow_dispatch' && !inputs.daily) ||")
  assert "github.event_name == 'workflow_dispatch'" not in WF["jobs"]["triage"].get("if", "")
  assert "github.event.issue.state == 'open'" in WF["jobs"]["triage"]["if"]          # no issue, no triage
  assert RUN["env"]["EVENT"] == "${{ github.event_name }}"


def test_the_dispatch_job_is_built_from_environment_and_checked_like_any_other():
  s = step("the job from the dispatch inputs, checked")
  assert s["if"] == "github.event_name == 'workflow_dispatch'"
  assert s["env"] == {"IN_PLACE": "${{ inputs.place }}", "IN_COLL": "${{ inputs.coll }}",
                      "IN_DATASET": "${{ inputs.dataset }}", "IN_VARIABLE": "${{ inputs.variable }}"}
  assert "check-job job.json" in s["run"] and '"erddap:" + $dataset + ":" + $variable + ":mean"' in s["run"]
  assert "inputs." not in s["run"]
  # the issue's own steps do not run on a dispatch
  assert step("check the job again")["if"] == "github.event_name != 'workflow_dispatch'"
  dl = next(x for x in RUN["steps"] if x.get("uses", "").startswith("actions/download-artifact"))
  assert dl["if"] == "github.event_name != 'workflow_dispatch'"
  assert step_by_id("cap")["if"].startswith("github.event_name == 'issues'")


def step_by_id(i):
  return next(s for s in RUN["steps"] if s.get("id") == i)


def test_publish_true_sets_the_same_mode_as_the_variable_and_a_dispatch_ignores_the_variable():
  st = step(STATS_STEP)
  assert st["env"]["DISPATCH_PUBLISH"] == "${{ inputs.publish }}"
  script = st["run"]
  assert 'if [ "$EVENT" = workflow_dispatch ]; then' in script
  assert 'if [ "${DISPATCH_PUBLISH:-}" = true ]; then mode=publish; fi' in script
  assert 'elif [ "${OM_STATS_PUBLISH:-}" = publish ]; then\n  mode=publish' in script
  assert script.count("mode=publish") == 2 and "mode=dry-run\n" in script
  # a test reference never publishes
  assert 'if [ -n "${REF_VERSION:-}" ] && [ "$mode" = publish ]; then' in script


def test_a_dispatch_neither_comments_nor_closes_and_writes_the_summary_instead():
  for name in ("answer the issue", "answer the issue (a dry run, computed but not published)", "say so when it failed"):
    assert "github.event_name == 'issues'" in step(name)["if"], name
  assert step("daily cap (automatic runs only; a maintainer's `run` label is not capped)")["if"].startswith("github.event_name == 'issues'")
  summ = step("write the summary (a dispatch)")
  assert "github.event_name == 'workflow_dispatch'" in summ["if"] and "$GITHUB_STEP_SUMMARY" in summ["run"]
  assert "gh issue" not in summ["run"]


def test_a_refresh_label_counts_only_from_someone_with_write_access():
  assert "refresh" in WF["jobs"]["triage"]["outputs"]
  tri = next(s for s in WF["jobs"]["triage"]["steps"] if s.get("id") == "triage")
  assert tri["env"]["SENDER"] == "${{ github.event.sender.login }}"
  script = tri["run"]
  assert 'gh api "repos/$REPO/collaborators/$SENDER/permission"' in script
  assert "admin|maintain|write) runflag=(--run-label)" in script and '"${runflag[@]}"' in script
  # a refresh is announced on the issue, though the `run` label otherwise re-checks silently
  assert '[ "$ACTION" != labeled ] || [ "$refresh" = true ]' in script
  # the run job takes it as it takes an approved request: only on the `run` label
  assert "outputs.approvable == 'true'" in RUN["if"] and "github.event.label.name == 'run'" in RUN["if"]


def test_every_upload_of_the_run_job_goes_through_om_publish_from_a_platform_checkout():
  assert RUN["env"]["OM_PUBLISH"] == "${{ github.workspace }}/.om-platform/scripts/om-publish.sh"
  co = [s for s in RUN["steps"] if s.get("with", {}).get("repository") == "oceanmetrics/platform"]
  assert len(co) == 1 and co[0]["with"]["path"] == ".om-platform" and co[0]["with"]["sparse-checkout"] == "scripts/om-publish.sh"
  assert RUN["steps"].index(co[0]) == 1, "after the repo's own checkout, which cleans the workspace"
  for name, script in scripts(RUN):
    assert "aws s3 cp" not in script and "aws s3 sync" not in script, name
  rebuild = next(s for s in RUN["steps"] if s.get("name") == "rebuild and publish the catalog")["run"]
  assert '"$OM_PUBLISH" --really --cache-control "public, max-age=300" requested_items.json indicators/requests --as items.json' in rebuild
