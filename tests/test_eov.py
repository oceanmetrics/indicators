"""GOOS EOV badges (vendored, unmodified) and the monochrome `eov-` glyphs traced from them."""
import hashlib
import importlib.util
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
GOOS = ROOT / "assets" / "goos-eov"
GLYPHS = ROOT / "brand" / "glyphs"
MANIFEST = json.loads((GOOS / "manifest.json").read_text())
ITEMS = MANIFEST["items"]
EOVS = [i for i in ITEMS if i["kind"] == "eov"]

CREDIT = "Credit: Global Ocean Observing System (GOOS)"


def sha256(p: Path) -> str:
  return hashlib.sha256(p.read_bytes()).hexdigest()


def load_trace_module():
  pytest.importorskip("PIL")
  pytest.importorskip("potrace")
  pytest.importorskip("numpy")
  spec = importlib.util.spec_from_file_location("eov_trace", ROOT / "brand" / "eov_trace.py")
  mod = importlib.util.module_from_spec(spec)
  spec.loader.exec_module(mod)
  return mod


# vendored badges ----

def test_manifest_credit_and_counts():
  assert MANIFEST["credit"] == CREDIT
  assert MANIFEST["downloaded"] == "2026-10-20"
  assert len(ITEMS) == 38 and len(EOVS) == 35
  assert {i["id"] for i in ITEMS if i["kind"] == "discipline"} == {"physics", "biogeochemistry", "bioeco"}
  assert len({i["id"] for i in ITEMS}) == 38 and len({i["drive_id"] for i in ITEMS}) == 38
  assert {i["discipline"] for i in EOVS} == {"physics", "biogeochemistry", "bioeco", "cross-disciplinary"}


def test_every_png_is_vendored_byte_for_byte():
  source = (GOOS / "SOURCE.md").read_text()
  for i in ITEMS:
    p = GOOS / i["png"]
    assert p.is_file(), i["png"]
    assert sha256(p) == i["sha256"], f"{i['png']} was changed after download"
    assert i["sha256"] in source and i["drive_id"] in source
  on_disk = {str(p.relative_to(GOOS)) for p in (GOOS / "png").rglob("*.png")}
  assert on_disk == {i["png"] for i in ITEMS}, "a PNG is vendored but not in the manifest, or the reverse"


def test_source_md_carries_the_terms():
  source = (GOOS / "SOURCE.md").read_text()
  for needle in (CREDIT, "https://goosocean.org/goos-brand-assets/", "1KQnUaj8Y4MtON55tBhzfhHvSb-PPfZLo", "2026-10-20",
                 "credit only; used unmodified; no GOOS logo", "36 EOVs", "No SVGs"):
    assert needle in source, needle


@pytest.mark.parametrize("px", [64, 128])
def test_webp_derivatives_keep_the_aspect(px):
  PIL = pytest.importorskip("PIL.Image")
  for i in ITEMS:
    with PIL.open(GOOS / i["png"]) as orig, PIL.open(GOOS / i[f"webp{px}"]) as w:
      assert w.format == "WEBP"
      assert w.size == (px, round(px * orig.height / orig.width)), i["id"]


# traced glyphs ----

GLYPH_JSON = json.loads((GLYPHS / "eov.json").read_text())
META = json.loads((GLYPHS / "eov.meta.json").read_text())
TOKEN = re.compile(r"[MmLlCcQqZzHhVv]|-?(?:\d+\.?\d*|\.\d+)")


def parse_path(d: str):
  """-> list of subpaths, each a list of absolute points (beziers sampled), and all absolute control points."""
  assert re.fullmatch(r"[MmLlCcQqZzHhVv0-9.\- ]+", d), "only M L C Q Z H V commands and numbers"
  toks = TOKEN.findall(d)
  assert "".join(toks).replace(" ", "") == d.replace(" ", ""), "unparsed text in path"
  subs, ctrl, i, cmd, cur, start = [], [], 0, None, (0.0, 0.0), (0.0, 0.0)
  nargs = {"m": 2, "l": 2, "c": 6, "q": 4, "h": 1, "v": 1, "z": 0}

  def num():
    nonlocal i
    v = float(toks[i]); i += 1
    return v

  while i < len(toks):
    if re.fullmatch(r"[A-Za-z]", toks[i]):
      cmd = toks[i]; i += 1
    rel, c = cmd.islower(), cmd.lower()
    if c == "z":
      cur = start
      continue
    args = [num() for _ in range(nargs[c])]
    ox, oy = cur if rel else (0.0, 0.0)
    if c == "m":
      cur = start = (ox + args[0], oy + args[1]); subs.append([cur]); ctrl.append(cur)
      cmd = "l" if rel else "L"  # implicit lineto after a moveto
    elif c == "l":
      cur = (ox + args[0], oy + args[1]); subs[-1].append(cur); ctrl.append(cur)
    elif c == "h":
      cur = ((cur[0] if rel else 0) + args[0], cur[1]); subs[-1].append(cur); ctrl.append(cur)
    elif c == "v":
      cur = (cur[0], (cur[1] if rel else 0) + args[0]); subs[-1].append(cur); ctrl.append(cur)
    elif c == "c":
      p = [cur] + [(ox + args[k], oy + args[k + 1]) for k in (0, 2, 4)]
      for k in range(1, 9):
        u = k / 8
        f = [(1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3]
        subs[-1].append((sum(f[j] * p[j][0] for j in range(4)), sum(f[j] * p[j][1] for j in range(4))))
      ctrl += p[1:]; cur = p[3]
    elif c == "q":
      p = [cur] + [(ox + args[k], oy + args[k + 1]) for k in (0, 2)]
      for k in range(1, 9):
        u = k / 8
        f = [(1 - u) ** 2, 2 * u * (1 - u), u * u]
        subs[-1].append((sum(f[j] * p[j][0] for j in range(3)), sum(f[j] * p[j][1] for j in range(3))))
      ctrl += p[1:]; cur = p[2]
  return subs, ctrl


def test_every_eov_has_exactly_one_glyph():
  assert set(GLYPH_JSON) == {f"eov-{i['id']}" for i in EOVS}
  assert list(GLYPH_JSON) == sorted(GLYPH_JSON), "eov.json is sorted by key"
  assert set(META) == set(GLYPH_JSON)


def test_each_glyph_is_one_valid_path_on_the_grid():
  for gid, d in GLYPH_JSON.items():
    assert isinstance(d, str) and d.startswith("M") and "<" not in d, gid
    subs, ctrl = parse_path(d)
    assert subs, gid
    xs, ys = [p[0] for p in ctrl], [p[1] for p in ctrl]
    assert min(xs + ys) >= -0.01 and max(xs + ys) <= 24.01, f"{gid} leaves the 24 x 24 grid"
    px, py = [p[0] for s in subs for p in s], [p[1] for s in subs for p in s]
    assert 1.75 <= min(px + py) and max(px + py) <= 22.25, f"{gid} is outside the 2..22 box"
    assert max(max(px) - min(px), max(py) - min(py)) >= 19.5, f"{gid} is not fitted to 20 units"


def test_no_two_glyphs_share_a_path():
  assert len(set(GLYPH_JSON.values())) == len(GLYPH_JSON)


def test_holes_wind_opposite_so_nonzero_equals_evenodd():
  np = pytest.importorskip("numpy")
  gx, gy = np.meshgrid(np.arange(0.31, 24, 0.5), np.arange(0.27, 24, 0.5))
  px, py = gx.ravel(), gy.ravel()
  for gid, d in GLYPH_JSON.items():
    subs, _ = parse_path(d)
    wind, cross = np.zeros(px.shape, int), np.zeros(px.shape, int)
    for s in subs:
      for (x0, y0), (x1, y1) in zip(s, s[1:] + s[:1]):
        up, down = (y0 <= py) & (py < y1), (y1 <= py) & (py < y0)
        xc = x0 + (py - y0) * (x1 - x0) / (y1 - y0) if y1 != y0 else np.full(px.shape, np.inf)
        right = px < xc
        wind += np.where(up & right, 1, 0) - np.where(down & right, 1, 0)
        cross += (up | down) & right
    assert ((wind != 0) == (cross % 2 == 1)).all(), f"{gid}: nonzero and evenodd fills differ"


def test_regenerated_glyphs_are_byte_identical():
  mod = load_trace_module()
  glyphs, meta = mod.trace_all(GOOS / "png")
  assert mod.dumps(glyphs) == (GLYPHS / "eov.json").read_text()
  assert mod.dumps(meta) == (GLYPHS / "eov.meta.json").read_text()


def test_meta_records_source_and_fallbacks():
  mdi = ROOT / "node_modules" / "@mdi" / "js" / "mdi.js"
  mdi_text = mdi.read_text() if mdi.exists() else None
  by_id = {f"eov-{i['id']}": i for i in EOVS}
  for gid, m in META.items():
    assert m["source_sha256"] == by_id[gid]["sha256"], gid
    assert m["path_chars"] == len(GLYPH_JSON[gid])
    assert isinstance(m["readable_16"], bool)
    if m["readable_16"]:
      assert "fallback" not in m, gid
    else:
      name = m["fallback"]
      assert re.fullmatch(r"mdi[A-Z][A-Za-z0-9]+", name), f"{gid}: {name}"
      if mdi_text:
        assert f"export var {name} =" in mdi_text, f"{gid}: {name} is not an @mdi/js export"
  assert sum(not m["readable_16"] for m in META.values()) < len(META), "a glyph set where none reads is a failed trace"
