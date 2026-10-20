"""the requests workflow's safety rules, read from the YAML: the issue never reaches a script through ${{ }}, a Copernicus
Marine request runs only on a maintainer's `run` label, and the producer is chosen from the checked job."""
import re
from pathlib import Path

import yaml

WF = yaml.safe_load((Path(__file__).resolve().parent.parent / ".github" / "workflows" / "requests.yml").read_text())
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
  erddap = steps["compute the place (erddap-places precompute)"]
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
