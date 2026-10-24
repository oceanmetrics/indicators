"""scripts/stats_unit.sh, the compare gate of requests.yml (ledger 2026-10-24, week 1), run against fakes: `uv run om-extract
run` writes a unit's three stats files from a synthetic table, `uv run om-extract compare` and `uv run python` are the
real ones, curl serves a published file (or a 404, or a 500) and om-publish records its calls. Asserted: a PASS is
published and a FAIL is not; no published file is the first publish; an outage of the storage host refuses; the daily
loop retries a failing compute, skips it, lists it and publishes nothing of it; and the workflow wires the gate before
the upload, and the daily job to the 36 parity units."""
import datetime as dt
import json
import os
import subprocess
import sys
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import yaml

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "stats_unit.sh"
WF = yaml.safe_load((ROOT / ".github" / "workflows" / "requests.yml").read_text())
ON = WF.get("on", WF.get(True))
RUN, DAILY = WF["jobs"]["run"], WF["jobs"]["daily"]
D = [dt.date(2026, 10, d) for d in (20, 21, 22, 23)]


def stats(dates=D, bump=0.0):
  return pa.table({"date": pa.array(dates, pa.date32()), "n": pa.array([6] * len(dates), pa.int64()),
                   "mean": pa.array([10.0 * d.day * (1 + bump) for d in dates], pa.float64()),
                   "max": pa.array([10.0 * d.day + 1 for d in dates], pa.float64()),
                   "place_id": pa.array(["NMS:CINMS"] * len(dates), pa.string())})


FAKE_UV = f"""#!/bin/sh
# fake uv: `run om-extract run` writes the unit from $FAKE_ENGINE (or fails while $FAKE_FAIL_FILE counts down);
# `run om-extract compare` and `run python` are the real ones
[ "$1" = run ] && shift
[ "$1" = --group ] && shift 2
if [ "$1" = om-extract ] && [ "$2" = run ]; then
  echo "$REQ_PLACE" >> "$FAKE_LOG.compute"
  if [ -n "${{FAKE_FAIL:-}}" ] && echo "$REQ_PLACE" | grep -Eq "$FAKE_FAIL"; then echo "HTTP 503 from PacIOOS" >&2; exit 1; fi
  while [ $# -gt 0 ]; do [ "$1" = --stats-dir ] && sd=$2; shift; done
  d="$sd/$REQ_DATASET/$REQ_VARIABLE"; mkdir -p "$d" "$sd/items"
  cp "$FAKE_ENGINE" "$d/$REQ_PLACE.parquet"; echo '{{}}' > "$d/$REQ_PLACE.provenance.json"
  echo '{{}}' > "$sd/items/x.json"
  exit 0
fi
if [ "$1" = om-extract ]; then shift; exec {sys.executable} -c 'import sys; from om_extract.cli import main; sys.exit(main(sys.argv[1:]))' "$@"; fi
if [ "$1" = python ]; then shift; exec {sys.executable} "$@"; fi
exit 9
"""

FAKE_CURL = """#!/bin/sh
# fake curl: -o FILE gets $FAKE_REF when $FAKE_CODE is 200; -w prints the code
while [ $# -gt 0 ]; do case "$1" in -o) out=$2; shift ;; esac; shift; done
echo "$FAKE_CODE" >> "$FAKE_LOG.curl"
[ "$FAKE_CODE" = 200 ] && cp "$FAKE_REF" "$out"
[ "$FAKE_CODE" = 200 ] || echo 'not found' > "$out"
printf '%s' "$FAKE_CODE"
"""


def setup(tmp_path, engine, ref=None, code=200, fail=""):
  b = tmp_path / "bin"
  b.mkdir()
  for name, text in (("uv", FAKE_UV), ("curl", FAKE_CURL)):
    (b / name).write_text(text)
  (b / "om-publish").write_text(f"#!{sys.executable}\nimport json, os, sys\n"
                                "open(os.environ['FAKE_LOG'] + '.publish', 'a').write(json.dumps(sys.argv[1:]) + '\\n')\n")
  for f in b.iterdir():
    f.chmod(0o755)
  pq.write_table(engine, tmp_path / "engine.parquet")
  if ref is not None:
    pq.write_table(ref, tmp_path / "ref.parquet")
  return {**os.environ, "PATH": f"{b}:{os.environ['PATH']}", "FAKE_ENGINE": str(tmp_path / "engine.parquet"),
          "FAKE_REF": str(tmp_path / "ref.parquet"), "FAKE_CODE": str(code), "FAKE_FAIL": fail,
          "FAKE_LOG": str(tmp_path / "log"), "OM_PUBLISH": str(b / "om-publish"), "OM_RETRY_WAIT": "0",
          "REQ_PLACE": "NMS:CINMS", "REQ_COLL": "places", "REQ_DATASET": "dhw_5km", "REQ_VARIABLE": "CRW_SST"}


def sh(env, *args):
  return subprocess.run(["bash", str(SCRIPT), *args], env=env, cwd=ROOT, capture_output=True, text=True)


def published(tmp_path):
  f = tmp_path / "log.publish"
  return [json.loads(x) for x in f.read_text().splitlines()] if f.exists() else []


def unit(tmp_path, env):
  out = tmp_path / "out"
  assert sh(env, "compute", str(out)).returncode == 0
  g = sh(env, "gate", str(out))
  p = sh(env, "publish", str(out))
  return g, p, (out / "compare" / "verdict.txt").read_text().strip()


# ---- one unit: compute, gate, publish ----

def test_a_unit_identical_to_the_published_file_passes_and_is_published(tmp_path):
  g, p, line = unit(tmp_path, setup(tmp_path, stats(), stats()))
  assert g.returncode == 0 and line == "dhw_5km/CRW_SST/NMS:CINMS verdict: PASS -> exact"
  assert p.returncode == 0 and len(published(tmp_path)) == 1
  assert published(tmp_path)[0][-2:] == ["stats", "gazetteer/stats"]


def test_newer_days_pass_the_gate(tmp_path):
  g, p, line = unit(tmp_path, setup(tmp_path, stats(), stats(D[:3])))
  assert g.returncode == 0 and "PASS -> exact; 1 newer date(s) after the published 2026-10-22 (2026-10-23" in line
  assert p.returncode == 0 and len(published(tmp_path)) == 1


def test_a_sum_1e10_off_passes_and_1e8_off_is_refused_and_not_published(tmp_path):
  g, p, line = unit(tmp_path, setup(tmp_path, stats(bump=1e-10), stats()))
  assert g.returncode == 0 and "within the criterion" in line
  t2 = tmp_path / "b"
  t2.mkdir()
  g, p, line = unit(t2, setup(t2, stats(bump=1e-8), stats()))
  assert g.returncode == 1 and line.startswith("dhw_5km/CRW_SST/NMS:CINMS verdict: FAIL -> differs") and "mean: max rel" in line
  assert p.returncode == 1 and "no PASS from the gate" in p.stderr and published(t2) == []


def test_a_missing_middle_day_is_refused(tmp_path):
  g, p, line = unit(tmp_path, setup(tmp_path, stats([D[0], D[1], D[3]]), stats()))
  assert g.returncode == 1 and published(tmp_path) == []
  assert line == ("dhw_5km/CRW_SST/NMS:CINMS verdict: FAIL -> differs: "
                  "1 key(s) only in the published file (first ['2026-10-22'])")


def test_no_published_file_is_the_first_publish(tmp_path):
  g, p, line = unit(tmp_path, setup(tmp_path, stats(), None, code=404))
  assert g.returncode == 0 and line == ("dhw_5km/CRW_SST/NMS:CINMS verdict: PASS -> first publish (no published file; "
                                        "the engine's 4 rows)")
  assert len(published(tmp_path)) == 1


def test_a_storage_host_error_refuses(tmp_path):
  g, p, line = unit(tmp_path, setup(tmp_path, stats(), stats(), code=503))
  assert g.returncode == 1 and published(tmp_path) == []
  assert line.startswith("dhw_5km/CRW_SST/NMS:CINMS verdict: FAIL -> the published file could not be read (HTTP 503")


def test_publish_refuses_anything_but_one_whole_unit(tmp_path):
  env = setup(tmp_path, stats(), stats())
  out = tmp_path / "out"
  sh(env, "compute", str(out))
  assert sh(env, "gate", str(out)).returncode == 0
  (out / "gazetteer/stats/items/x.json").unlink()
  p = sh(env, "publish", str(out))
  assert p.returncode == 1 and "not one whole unit" in p.stderr and published(tmp_path) == []


# ---- the daily loop ----

def units_tsv(tmp_path, places=("NMS:CINMS", "NMS:MBNMS", "NMS:OCNMS")):
  f = tmp_path / "units.tsv"
  f.write_text("# a comment\nplace\tcoll\tdataset\tvariable\n"
               + "".join(f"{p}\tplaces\tdhw_5km\tCRW_SST\n" for p in places))
  return f


def test_daily_publishes_every_passing_unit(tmp_path):
  env = {**setup(tmp_path, stats(), stats(D[:3])), "PUBLISH": "true"}
  r = sh(env, "daily", str(units_tsv(tmp_path)), str(tmp_path / "daily"))
  assert r.returncode == 0, r.stdout + r.stderr
  assert len(published(tmp_path)) == 3
  pub = (tmp_path / "daily/published.txt").read_text().split()
  assert pub == ["dhw_5km/CRW_SST/NMS:CINMS", "dhw_5km/CRW_SST/NMS:MBNMS", "dhw_5km/CRW_SST/NMS:OCNMS"]
  assert "- published (PASS): 3" in (tmp_path / "daily/summary.md").read_text()


def test_daily_dry_run_publishes_nothing(tmp_path):
  env = {**setup(tmp_path, stats(), stats()), "PUBLISH": "false"}
  r = sh(env, "daily", str(units_tsv(tmp_path)), str(tmp_path / "daily"))
  assert r.returncode == 0 and published(tmp_path) == []
  assert "- PASS, not published (a dry run): 3" in r.stdout
  # regression (run 40058284122): an empty list was one newline, so the catalog step ran and found no items list
  assert (tmp_path / "daily/published.txt").read_text() == ""


def test_daily_retries_a_failing_compute_then_skips_and_lists_it_and_publishes_nothing_of_it(tmp_path):
  env = {**setup(tmp_path, stats(), stats(), fail="MBNMS"), "PUBLISH": "true", "OM_TRIES": "4"}
  r = sh(env, "daily", str(units_tsv(tmp_path)), str(tmp_path / "daily"))
  assert r.returncode == 0, r.stdout + r.stderr                      # an outage is a warning, not a red run
  tries = (tmp_path / "log.compute").read_text().split()
  assert tries.count("NMS:MBNMS") == 4 and tries.count("NMS:CINMS") == 1 and tries.count("NMS:OCNMS") == 1
  assert "retry 3 of 3" in r.stdout and "::warning::skipped (not published): dhw_5km/CRW_SST/NMS:MBNMS" in r.stdout
  assert "- skipped (compute failed, a PacIOOS outage?; not published): 1\n  - `dhw_5km/CRW_SST/NMS:MBNMS`" in r.stdout
  assert len(published(tmp_path)) == 2 and not (tmp_path / "daily/dhw_5km_CRW_SST_NMS-MBNMS/unit").exists()


def test_daily_after_a_skip_the_next_unit_gets_one_try_until_one_computes(tmp_path):
  env = {**setup(tmp_path, stats(), stats(), fail="MBNMS|OCNMS"), "PUBLISH": "true", "OM_TRIES": "4"}
  r = sh(env, "daily", str(units_tsv(tmp_path, ("NMS:MBNMS", "NMS:OCNMS", "NMS:CINMS"))), str(tmp_path / "daily"))
  tries = (tmp_path / "log.compute").read_text().split()
  assert tries == ["NMS:MBNMS"] * 4 + ["NMS:OCNMS", "NMS:CINMS"]
  assert r.returncode == 0 and len(published(tmp_path)) == 1


def test_daily_a_refused_unit_is_a_red_run_and_the_others_still_publish(tmp_path):
  env = {**setup(tmp_path, stats([D[0], D[1], D[3]]), stats()), "PUBLISH": "true"}
  r = sh(env, "daily", str(units_tsv(tmp_path, ("NMS:CINMS",))), str(tmp_path / "daily"))
  assert r.returncode == 1 and published(tmp_path) == [] and "- refused (FAIL, not published): 1" in r.stdout


def test_daily_filter_and_check_job(tmp_path):
  env = {**setup(tmp_path, stats(), stats()), "PUBLISH": "true", "UNITS_FILTER": "OCNMS"}
  r = sh(env, "daily", str(units_tsv(tmp_path, ("NMS:CINMS", "NMS:OCNMS", "bad place;"))), str(tmp_path / "daily"))
  assert r.returncode == 0 and (tmp_path / "log.compute").read_text().split() == ["NMS:OCNMS"]
  env["UNITS_FILTER"] = "bad"
  r = sh(env, "daily", str(units_tsv(tmp_path, ("bad place;",))), str(tmp_path / "daily2"))
  assert r.returncode == 1 and "a malformed unit" in r.stdout


def cadence_tsv(tmp_path, cadences=("daily", "weekly", "monthly")):
  f = tmp_path / "units.tsv"
  places = ("NMS:CINMS", "NMS:MBNMS", "NMS:OCNMS")
  f.write_text("place\tcoll\tdataset\tvariable\tcadence\n"
               + "".join(f"{p}\tplaces\tdhw_5km\tCRW_SST\t{c}\n" for p, c in zip(places, cadences)))
  return f


def computed(tmp_path):
  f = tmp_path / "log.compute"
  return f.read_text().split() if f.exists() else []


def test_daily_runs_a_unit_only_on_its_cadence_days_a_week_on_mondays_a_month_on_the_1st(tmp_path):
  # CINMS daily, MBNMS weekly, OCNMS monthly; the day is the UTC date (OM_TODAY in a test)
  env = {**setup(tmp_path, stats(), stats()), "PUBLISH": "true"}
  for today, want in (("2026-11-04", ["NMS:CINMS"]),                          # a Wednesday, not the 1st
                      ("2026-11-02", ["NMS:CINMS", "NMS:MBNMS"]),              # a Monday
                      ("2026-11-01", ["NMS:CINMS", "NMS:OCNMS"]),              # the 1st, a Sunday
                      ("2027-02-01", ["NMS:CINMS", "NMS:MBNMS", "NMS:OCNMS"])):  # the 1st and a Monday
    (tmp_path / "log.compute").unlink(missing_ok=True)
    r = sh({**env, "OM_TODAY": today}, "daily", str(cadence_tsv(tmp_path)), str(tmp_path / f"d{today}"))
    assert r.returncode == 0, r.stdout + r.stderr
    assert computed(tmp_path) == want, today
    assert f"- not due on {today}: {3 - len(want)}" in (tmp_path / f"d{today}/summary.md").read_text()


def test_daily_with_cadence_all_runs_every_unit_whatever_the_day(tmp_path):
  env = {**setup(tmp_path, stats(), stats()), "PUBLISH": "false", "OM_TODAY": "2026-11-04", "OM_CADENCE": "all"}
  r = sh(env, "daily", str(cadence_tsv(tmp_path)), str(tmp_path / "daily"))
  assert r.returncode == 0 and computed(tmp_path) == ["NMS:CINMS", "NMS:MBNMS", "NMS:OCNMS"]


def test_daily_a_unit_without_a_cadence_column_is_daily(tmp_path):
  env = {**setup(tmp_path, stats(), stats()), "PUBLISH": "false", "OM_TODAY": "2026-11-04"}
  r = sh(env, "daily", str(units_tsv(tmp_path)), str(tmp_path / "daily"))
  assert r.returncode == 0 and len(computed(tmp_path)) == 3


def test_daily_an_unknown_cadence_is_a_malformed_unit_and_a_red_run(tmp_path):
  env = {**setup(tmp_path, stats(), stats()), "PUBLISH": "true", "OM_TODAY": "2026-11-01"}
  r = sh(env, "daily", str(cadence_tsv(tmp_path, ("daily", "hourly", "monthly"))), str(tmp_path / "daily"))
  assert r.returncode == 1 and computed(tmp_path) == ["NMS:CINMS", "NMS:OCNMS"]
  assert "dhw_5km/CRW_SST/NMS:MBNMS (an unknown cadence: hourly)" in r.stdout
  env["OM_CADENCE"] = "sometimes"
  r = sh(env, "daily", str(cadence_tsv(tmp_path)), str(tmp_path / "daily2"))
  assert r.returncode == 2 and "OM_CADENCE" in r.stderr


# ---- the workflow ----

def steps(job):
  return {s.get("name", s.get("uses", "")): s for s in job["steps"]}


def test_the_gate_runs_after_the_compute_and_before_the_upload_which_needs_its_pass():
  names = [s.get("name", "") for s in RUN["steps"]]
  i_compute = names.index("compute the place (om-extract, the chunked engine and its stats item)")
  i_gate = names.index("the compare gate (om-extract compare against the published file)")
  i_up = names.index("upload the stats files (publish mode and the gate's PASS only)")
  assert i_compute < i_gate < i_up
  gate = RUN["steps"][i_gate]
  assert gate["id"] == "gate" and "scripts/stats_unit.sh gate out" in gate["run"] and "exit 1" in gate["run"]
  assert "steps.gate.outputs.verdict == 'PASS'" in RUN["steps"][i_up]["if"]
  assert "--allow-newer" in SCRIPT.read_text() and "om-extract compare" in SCRIPT.read_text()
  # the comparison is an artifact, uploaded whatever the verdict
  art = next(s for s in RUN["steps"] if s.get("with", {}).get("name") == "compare")
  assert art["if"].startswith("always()") and art["with"]["path"] == "out/compare/"


def test_a_test_reference_reaches_the_gate_and_never_publishes():
  inputs = ON["workflow_dispatch"]["inputs"]
  assert inputs["reference_version"]["default"] == ""
  s = steps(RUN)
  assert s["the compare gate (om-extract compare against the published file)"]["env"]["REF_VERSION"] == "${{ inputs.reference_version }}"
  stats_step = s["list the stats files and decide the mode (OM_STATS_PUBLISH, or the dispatch's publish)"]
  assert stats_step["env"]["REF_VERSION"] == "${{ inputs.reference_version }}"
  assert 'echo "reference_version is set (a test of the gate): a dry run, whatever publish says"\n  mode=dry-run' in stats_step["run"]


def test_the_daily_job_runs_the_parity_units_at_0930_on_the_quick_runner_one_at_a_time():
  assert ON["schedule"] == [{"cron": "30 9 * * *"}]
  assert DAILY["if"] == "github.event_name == 'schedule' || (github.event_name == 'workflow_dispatch' && inputs.daily)"
  assert DAILY["runs-on"] == ["self-hosted", "macmini-quick"]
  assert DAILY["concurrency"] == RUN["concurrency"] == {"group": "requests-run", "cancel-in-progress": False}
  u = next(s for s in DAILY["steps"] if s.get("id") == "units")
  assert 'if grep -q . out/daily/published.txt' in u["run"]
  assert "scripts/stats_unit.sh daily scripts/parity_units.tsv out/daily" in u["run"]
  assert u["env"]["PUBLISH"] == "${{ github.event_name == 'schedule' || inputs.publish }}"
  # the schedule runs the units due that day; a dispatch every unit unless it asks for `due` (ledger week 6)
  assert u["env"]["OM_CADENCE"] == "${{ github.event_name == 'schedule' && 'due' || inputs.cadence }}"
  cad = ON["workflow_dispatch"]["inputs"]["cadence"]
  assert cad["type"] == "choice" and cad["options"] == ["all", "due"] and cad["default"] == "all"
  assert next(s for s in DAILY["steps"] if s.get("with", {}).get("name") == "compare-daily")["if"] == "always()"
  # the run job does not take the daily dispatch
  assert "!inputs.daily" in RUN["if"]
  for s in DAILY["steps"]:
    assert "${{" not in s.get("run", ""), s.get("name")


# the sanctuaries series the engine takes from erddap-places (ledger week 6, 2026-10-24), each with its cadence: the 17
# monthly series of the USF re-serves (frozen upstreams, 2023-12 to 2025-09) run monthly, seascapes (8-day) weekly
NMS18 = {"NMS:CBNMS", "NMS:CHNMS", "NMS:CINMS", "NMS:FGBNMS", "NMS:FKNMS", "NMS:GFNMS", "NMS:GRNMS", "NMS:HIHWNMS",
         "NMS:LONMS", "NMS:MBNMS", "NMS:MBPR", "NMS:MNMS", "NMS:NMSAS", "NMS:OCNMS", "NMS:PMNM", "NMS:SBNMS", "NMS:TBNMS",
         "NMS:WSCNMS"}
REEF4 = {"NMS:FKNMS", "NMS:HIHWNMS", "NMS:NMSAS", "NMS:PMNM"}
MONTHLY = [("IMERG_monthly_global_precip", "precipitation"), ("moda_npp_mo_glob", "npp"), ("cmems_salinity", "so"),
           *(("cmems_biogeochem_nutrients", v) for v in ("fe", "no3", "po4", "si")),
           ("cmems_biogeochem_phyto", "chl"), ("cmems_biogeochem_phyto", "phyc"), ("cmems_biogeochem_pp", "nppv"),
           ("cmems_biogeochem_pp", "o2"), ("cmems_biogeochem_carbon", "dissic"), ("cmems_biogeochem_carbon", "ph"),
           ("cmems_biogeochem_co2", "spco2"), ("cmems_biogeochem_zoo", "zooc"), ("cmems_altimetry", "mlotst"),
           ("cmems_altimetry", "tob")]
SERIES_CADENCE = {("dhw_5km", "CRW_SST"): "daily", ("dhw_5km", "CRW_BAA"): "daily",
                  **{s: "monthly" for s in MONTHLY}, ("noaa_aoml_seascapes_8day", "CLASS"): "weekly"}


def unit_rows():
  rows = [l.split("\t") for l in (ROOT / "scripts/parity_units.tsv").read_text().splitlines()
          if l and not l.startswith("#")]
  return rows[0], rows[1:]


def test_the_parity_units_are_the_sanctuaries_by_each_series_the_engine_owns_with_its_cadence():
  head, units = unit_rows()
  assert head == ["place", "coll", "dataset", "variable", "cadence"]
  assert all(len(u) == 5 for u in units) and len({tuple(u[:4]) for u in units}) == len(units)
  assert {u[1] for u in units} == {"places"}
  series = {(u[2], u[3]) for u in units}
  # the series move one by one (week 6): each one in the TSV is a known one, with its cadence; dhw_5km (week 1) and
  # IMERG (the first of week 6) are there
  assert len(SERIES_CADENCE) == 20 and series <= set(SERIES_CADENCE)
  assert {("dhw_5km", "CRW_SST"), ("dhw_5km", "CRW_BAA"), ("IMERG_monthly_global_precip", "precipitation")} <= series
  for ds, var in series:
    mine = [u for u in units if (u[2], u[3]) == (ds, var)]
    want = REEF4 if ds == "noaa_aoml_seascapes_8day" else NMS18
    assert {u[0] for u in mine} == want, (ds, var)
    assert {u[4] for u in mine} == {SERIES_CADENCE[(ds, var)]}, (ds, var)


def test_the_dhw_5km_units_are_the_36_daily_ones_of_week_1():
  _, units = unit_rows()
  dhw = [u for u in units if u[2] == "dhw_5km"]
  assert len(dhw) == 36 and {u[4] for u in dhw} == {"daily"}
  for p in NMS18:
    assert sorted(u[3] for u in dhw if u[0] == p) == ["CRW_BAA", "CRW_SST"]
