"""Trace the GOOS EOV badges into monochrome 24 x 24 glyphs (`eov-<id>`), and vendor the badges.

Credit: adapted from the GOOS EOV icons (Martín Míguez et al. 2026, Front. Mar. Sci., CC BY): traced, monochrome,
rescaled. Article: Martín Míguez B et al. (2026), "GOOS Essential Ocean Variables: the backbone of a sustained and
evolving global ocean observing system", Front. Mar. Sci. 13:1737002, https://doi.org/10.3389/fmars.2026.1737002
(Figure 2 shows all 36 badges). The colour badges themselves (assets/goos-eov/png) are used UNMODIFIED with
"Credit: Global Ocean Observing System (GOOS)"; the only processing of a badge is the 64 and 128 px WebP resize.

Method (a script does all of it, nothing is drawn by hand):

1. The white glyph is the near-white (229, 247, 253) artwork inside the coloured disc. The badge is composited over
   black (so the translucent discs of invertebrates, microbes and marine debris drop out) and a pixel is glyph when
   its darkest channel is above 150. The disc edge is excluded by an inner circle (INNER_RADIUS x the disc radius);
   the light-blue and dark-blue accent strokes of the badges are not white and are left out.
2. The glyph's bounding box is cropped and reduced (Pillow BOX filter) to 10 bitmap pixels per grid unit, with its
   longer side fitted to 20 units (the 2..22 box of the 24 x 24 MDI grid), then thresholded at 50 %.
3. potracer (pure-Python potrace) traces the bitmap. A ladder of parameter sets (LADDER) is tried from the finest;
   the first one whose path is at most MAX_PATH_CHARS long is kept (specks below `turdsize` bitmap pixels are
   dropped, `opttolerance` merges curve pieces). The glyph is centred on the grid and written as one path `d` of
   relative M, c, l and z commands with 2 decimals. Potrace winds holes opposite to their outer contour, so the
   path fills correctly with fill-rule nonzero (tests/test_eov.py compares nonzero with evenodd).
4. Output: brand/glyphs/eov.json {"eov-<id>": d} sorted by key, and brand/glyphs/eov.meta.json with the source
   sha256, the trace parameters, the path length and the reviewed `readable_16` (+ `fallback` MDI export name).
   The same PNGs give a byte-identical eov.json.

Tasks (`--task`): trace (default), webp (64/128 px WebP of every badge), manifest (assets/goos-eov/manifest.json
and SOURCE.md), sheet (brand/glyphs/eov_review/eov_contact.png, headless Chrome), all.

    uv run --group brand brand/eov_trace.py [--png-root assets/goos-eov/png] [--task trace]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CREDIT       = "Credit: Global Ocean Observing System (GOOS)"
GLYPH_CREDIT = ("adapted from the GOOS EOV icons (Martín Míguez et al. 2026, Front. Mar. Sci., CC BY): "
                "traced, monochrome, rescaled")
SOURCE_PAGE  = "https://goosocean.org/goos-brand-assets/"
DRIVE_FOLDER = "https://drive.google.com/drive/folders/1KQnUaj8Y4MtON55tBhzfhHvSb-PPfZLo"
LABEL_PAGE   = "https://goosocean.org/what-we-do/framework/essential-ocean-variables/"
DOWNLOADED   = "2026-10-20"

# (id, GOOS label, discipline, GOOS folder, GOOS file name, Drive file id)
# discipline "discipline" marks the three discipline badges (GOOS short names bioeco, biogeo, physics)
BADGES = [
  ("bioeco", "Biology and Ecosystems EOVs", "discipline", "", "bioeco.png", "1LZST4ddvnbhK6TB7kjx-equEYLl3WG8Y"),
  ("biogeochemistry", "Biogeochemical EOVs", "discipline", "", "biogeo.png", "1f_fbJiw6X-ByZLNfIo2U_s9pznR1hah9"),
  ("dissolved-organic-carbon", "Dissolved organic carbon", "biogeochemistry", "Biogeochemistry", "Dissolved-organic-carbon.png", "13XXxECxcdnNmpES_3EUtlpjjK62zPm2c"),
  ("fish", "Fish abundance and distribution", "bioeco", "Biology and Ecosystems", "Fish.png", "1rOkxPi_PTpVbMHrHyi_LFxkwRLC5faw4"),
  ("hard-coral", "Coral cover and composition", "bioeco", "Biology and Ecosystems", "Hard-coral.png", "1fa1Om_pU_-_IcaIfy9cAujalZ8-EDo41"),
  ("inorganic-carbon", "Inorganic carbon", "biogeochemistry", "Biogeochemistry", "Inorganic-carbon.png", "1yqLN58AQ5VX3GZef6hWs-Z3W1nTna4p_"),
  ("invertebrates", "Benthic invertebrate abundance and distribution (pilot)", "bioeco", "Biology and Ecosystems", "Invertebrates.png", "1f9EOF9ZJP5mlahCYn5hv55qNJajx65Y4"),
  ("macroalgae", "Macroalgal canopy cover and composition", "bioeco", "Biology and Ecosystems", "Macroalgae.png", "1HfpMb98FObOWBgC_oQhe-pRTpU1DoF2H"),
  ("mangroves", "Mangrove cover and composition", "bioeco", "Biology and Ecosystems", "Mangroves.png", "1SWR8xiQUOE0PEEVUErqR1ApnMndRHZuD"),
  ("marine-debris", "Marine debris (pilot)", "cross-disciplinary", "Cross-disciplinary", "Marine-debris.png", "1nJ2QcrRz91CHFms-IDoh4phjkiq-yHUb"),
  ("marine-mammals", "Marine mammal abundance and distribution", "bioeco", "Biology and Ecosystems", "Marine-mammals.png", "1cb5K_yX-Qahe6IVPWklMmIGKERoF_8gy"),
  ("microbes", "Microbe biomass and diversity (pilot)", "bioeco", "Biology and Ecosystems", "Microbes.png", "1MqVAUTV8kEWuOPFtFydMPB6p2EPU9lXw"),
  ("nitrous-oxide", "Nitrous oxide", "biogeochemistry", "Biogeochemistry", "Nitrous-oxide.png", "1O7cJGWoE-MwupKH-pFSL5Cmm5UuG5vtv"),
  ("nutrients", "Nutrients", "biogeochemistry", "Biogeochemistry", "Nutrients.png", "1vd2ZBZgKdK4-kG_qqujhSuFVyJUTf44O"),
  ("ocean-bottom-pressure", "Ocean bottom pressure", "physics", "Physics", "Bottom-pressure.png", "1Sl_8LWbZv_g8MWo0Nk_WpX1jMW8Cuivv"),
  ("ocean-colour", "Ocean colour", "cross-disciplinary", "Cross-disciplinary", "Ocean-colour.png", "16Nkq377r5OACASDCI7j3_6FwYLlNXMoa"),
  ("ocean-sound", "Ocean sound", "cross-disciplinary", "Cross-disciplinary", "Ocean-sound.png", "1Kjyqf4spotyDOnFuTFx-Fy8bCd-66tfS"),
  ("ocean-surface-heat-flux", "Ocean surface heat flux", "physics", "Physics", "Surface-heat-flux.png", "1vvQFT7qpCajPawpEcLxcLn7Mi65BWH3O"),
  ("ocean-surface-stress", "Ocean surface stress", "physics", "Physics", "Surface-stress.png", "1xK0h2iHrWMiQ7U2GUD9k5nrcBblPGknM"),
  ("oxygen", "Oxygen", "biogeochemistry", "Biogeochemistry", "Oxygen.png", "157siHl5qN_bNzF8EeJXLiFafa6-kb8f-"),
  ("particulate-matter", "Particulate matter", "biogeochemistry", "Biogeochemistry", "Particulate-matter.png", "1gCxy8TSDcQrDEq00A2dwSxHf9Xg5wT7m"),
  ("physics", "Physical EOVs", "discipline", "", "physics.png", "1dOr9B0nECDUtKkFjemNyTuviAMND555H"),
  ("phytoplankton", "Phytoplankton biomass and diversity", "bioeco", "Biology and Ecosystems", "Phytoplankton.png", "1lX0iUUYwlC_dH9luKkLYJmY7rX_y62YZ"),
  ("sea-ice", "Sea ice", "physics", "Physics", "Sea-ice.png", "1kpxHaYIh6SE3PhimD3b8_nZdKvQ1b_Fe"),
  ("sea-state", "Sea state", "physics", "Physics", "Sea-state.png", "1Az7dX3E_HQCGxB0uungHszgYCsPw1wH4"),
  ("sea-surface-height", "Sea surface height", "physics", "Physics", "Surface-height.png", "1I8-g4FEk2MBYX4eeyMQsJFqmjNd8w9WZ"),
  ("sea-surface-salinity", "Sea surface salinity", "physics", "Physics", "Surface-salinity.png", "1YO0JTXKeMg1ywgID7ZUiqkXmm57lCq6K"),
  ("sea-surface-temperature", "Sea surface temperature", "physics", "Physics", "Surface-temperature.png", "1JS-uEKaLmljnnWSoTOhhkkUlp8Q8HVbB"),
  ("sea-turtles", "Sea turtles abundance and distribution", "bioeco", "Biology and Ecosystems", "Sea-turtles.png", "1g-1C6QmOdn2Jh-9GnpYwQ9ExRjL2m7eE"),
  ("seabirds", "Seabirds abundance and distribution", "bioeco", "Biology and Ecosystems", "Seabirds.png", "1tmL878ehYB63kkNl9PFhCn51F9QF7Q31"),
  ("seagrass", "Seagrass cover and composition", "bioeco", "Biology and Ecosystems", "Seagrass.png", "1mUIHP5Om1yXFX5F7OHi8Av-y3xkiwMa5"),
  ("stable-carbon-isotopes", "Stable carbon isotopes", "biogeochemistry", "Biogeochemistry", "Stable-carbon-isotopes.png", "1SN2J-Z54xLqkySVUlDOb9mED0oulB-nX"),
  ("subsurface-currents", "Subsurface currents", "physics", "Physics", "Subsurface-currents.png", "1BXV0y8RT34mEJyFRY4nYp5_rNxHrArmM"),
  ("subsurface-salinity", "Subsurface salinity", "physics", "Physics", "Subsurface-salinity.png", "1Vjku2wn7Ymj8wYwhQtSXGP5EONhYr_93"),
  ("subsurface-temperature", "Subsurface temperature", "physics", "Physics", "Subsurface-temperature.png", "1nceXF2ENA0EidJdpLX_ffPSmQjwGCw6r"),
  ("surface-currents", "Surface currents", "physics", "Physics", "Surface-currents.png", "19eo6vxqAbhmvU1K7XkvLvPZ4WvMuSedG"),
  ("transient-tracers", "Transient tracers", "biogeochemistry", "Biogeochemistry", "Transient-tracers.png", "1MwtpOnKMA-Aowq0Fz1YfeNbhHuDMc1uO"),
  ("zooplankton", "Zooplankton biomass and diversity", "bioeco", "Biology and Ecosystems", "Zooplankton.png", "1_LXUY25aIKhAF3RHvCMK5Si79gY7Yjvf"),
]

# trace parameters
GRID          = 24
FIT           = (2.0, 22.0)    # the glyph bounding box is fitted into 2..22
PX_PER_UNIT   = 10             # bitmap pixels per grid unit while tracing
LIGHT_MIN     = 150            # darkest channel (composited on black) above this is glyph
INNER_RADIUS  = 0.93           # keep the glyph inside this fraction of the disc radius
MAX_PATH_CHARS = 1500
MIN_KEEP       = 0.85          # a trace must keep this share of the glyph's area
# (turdsize in bitmap px, alphamax, opttolerance), finest first
LADDER = [(12, 1.0, 0.4), (25, 1.0, 0.8), (50, 1.1, 1.2), (100, 1.2, 2.0), (200, 1.3, 3.0)]


def sha256(path: Path) -> str:
  return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def badge_path(png_root: Path, b: tuple) -> Path:
  _id, _label, disc, folder, fname, _drive = b
  return Path(png_root) / (fname if disc == "discipline" else f"{disc}/{fname}")


def eov_badges() -> list[tuple]:
  return sorted((b for b in BADGES if b[2] != "discipline"), key=lambda b: b[0])


# glyph mask and trace ----

def glyph_mask(png: Path):
  import numpy as np
  from PIL import Image
  rgba = np.asarray(Image.open(png).convert("RGBA"), dtype=np.float64)
  alpha = rgba[..., 3] / 255.0
  dark = (rgba[..., :3] * alpha[..., None]).min(axis=2)
  ys, xs = np.nonzero(rgba[..., 3] > 0)
  cx, cy = (xs.min() + xs.max()) / 2.0, (ys.min() + ys.max()) / 2.0
  radius = (xs.max() - xs.min() + 1) / 2.0
  yy, xx = np.mgrid[0:rgba.shape[0], 0:rgba.shape[1]]
  inside = (xx - cx) ** 2 + (yy - cy) ** 2 <= (INNER_RADIUS * radius) ** 2
  return (dark > LIGHT_MIN) & inside


def _num(v: float) -> str:
  s = f"{round(v, 2):.2f}".rstrip("0").rstrip(".")
  if s in ("-0", ""):
    s = "0"
  if s.startswith("0."):
    s = s[1:]
  elif s.startswith("-0."):
    s = "-" + s[2:]
  return s


def _join(nums: list[str]) -> str:
  out = ""
  for n in nums:
    out += n if (not out or n.startswith("-")) else " " + n
  return out


def curves_to_path(curves, ox: float, oy: float, scale: float) -> str:
  """potrace curves (bitmap px, y down) -> one relative path d on the grid; no rounding drift."""
  cur = [0.0, 0.0]

  def pt(p):
    return (round(ox + p.x * scale, 2), round(oy + p.y * scale, 2))

  def rel(cmd, pts):
    nums = []
    for q in pts:
      nums += [_num(q[0] - cur[0]), _num(q[1] - cur[1])]
    cur[0], cur[1] = pts[-1]
    return cmd + _join(nums)

  parts = []
  for c in curves:
    start = pt(c.start_point)
    parts.append(rel("M" if not parts else "m", [start]))
    for s in c.segments:
      if s.is_corner:
        parts.append(rel("l", [pt(s.c)]))
        parts.append(rel("l", [pt(s.end_point)]))
      else:
        parts.append(rel("c", [pt(s.c1), pt(s.c2), pt(s.end_point)]))
    parts.append("z")
    cur[0], cur[1] = start  # z returns to the subpath start
  return "".join(parts)


def _shoelace(curve, steps: int = 8) -> float:
  """signed area of a potrace curve with its beziers flattened (holes wind the other way)."""
  cur = (curve.start_point.x, curve.start_point.y)
  pts = [cur]
  for s in curve.segments:
    if s.is_corner:
      pts += [(s.c.x, s.c.y), (s.end_point.x, s.end_point.y)]
    else:
      p1, p2, p3 = (s.c1.x, s.c1.y), (s.c2.x, s.c2.y), (s.end_point.x, s.end_point.y)
      for i in range(1, steps + 1):
        u = i / steps
        f = [(1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3]
        pts.append(tuple(f[0] * cur[j] + f[1] * p1[j] + f[2] * p2[j] + f[3] * p3[j] for j in (0, 1)))
    cur = (s.end_point.x, s.end_point.y)
  return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1])) / 2.0


def trace_png(png: Path) -> tuple[str, dict]:
  import numpy as np
  import potrace
  from PIL import Image
  mask = glyph_mask(png)
  ys, xs = np.nonzero(mask)
  x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
  w, h = int(x1 - x0), int(y1 - y0)
  k = (FIT[1] - FIT[0]) * PX_PER_UNIT / max(w, h)
  size = (max(1, round(w * k)), max(1, round(h * k)))
  img = Image.fromarray((mask[y0:y1, x0:x1] * 255).astype("uint8"), "L").resize(size, Image.BOX)
  bits = np.asarray(img) >= 128
  ox = (GRID - size[0] / PX_PER_UNIT) / 2.0
  oy = (GRID - size[1] / PX_PER_UNIT) / 2.0
  d, params = "", {}
  for turd, alphamax, opt in LADDER:
    curves = potrace.Bitmap(~bits).trace(turdsize=turd, alphamax=alphamax, opticurve=True, opttolerance=opt)
    keep = abs(sum(_shoelace(c) for c in curves)) / max(1, int(bits.sum()))
    if keep < MIN_KEEP:
      break  # a coarser step would only lose more of the glyph: keep the last one that held it
    d = curves_to_path(curves, ox, oy, 1.0 / PX_PER_UNIT)
    params = {"turdsize": turd, "alphamax": alphamax, "opttolerance": opt, "px_per_unit": PX_PER_UNIT,
              "light_min": LIGHT_MIN, "inner_radius": INNER_RADIUS, "subpaths": len(curves),
              "area_kept": round(keep, 3)}
    if len(d) <= MAX_PATH_CHARS:
      break
  return d, params


def trace_all(png_root: Path) -> tuple[dict, dict]:
  glyphs, meta = {}, {}
  for b in eov_badges():
    png = badge_path(png_root, b)
    d, params = trace_png(png)
    gid = f"eov-{b[0]}"
    glyphs[gid] = d
    review = REVIEW[b[0]]
    meta[gid] = {"source": str(png.relative_to(png_root)), "source_sha256": sha256(png), "trace": params,
                 "path_chars": len(d), "readable_16": review[0], **({"fallback": review[1]} if not review[0] else {})}
  return dict(sorted(glyphs.items())), dict(sorted(meta.items()))


def dumps(obj) -> str:
  return json.dumps(obj, indent=1, ensure_ascii=False, sort_keys=True) + "\n"


# vendoring ----

def make_webp(png_root: Path, web_root: Path) -> None:
  from PIL import Image
  for b in BADGES:
    im = Image.open(badge_path(png_root, b)).convert("RGBA")
    for px in (64, 128):
      out = Path(web_root) / str(px) / f"{b[0]}.webp"
      out.parent.mkdir(parents=True, exist_ok=True)
      im.resize((px, round(px * im.height / im.width)), Image.LANCZOS).save(out, "WEBP", lossless=True, method=6)


def manifest_items(goos_root: Path) -> list[dict]:
  from PIL import Image
  items = []
  for b in sorted(BADGES, key=lambda b: (b[2] != "discipline", b[2], b[0])):
    png = badge_path(goos_root / "png", b)
    with Image.open(png) as im:
      size = list(im.size)
    items.append({"id": b[0], "label": b[1], "kind": "discipline" if b[2] == "discipline" else "eov",
                  "discipline": b[0] if b[2] == "discipline" else b[2],
                  "goos_path": (f"{b[3]}/" if b[3] else "") + b[4],
                  "png": str(png.relative_to(goos_root)), "sha256": sha256(png), "size": size,
                  "webp64": f"webp/64/{b[0]}.webp", "webp128": f"webp/128/{b[0]}.webp", "drive_id": b[5]})
  return items


def write_manifest(goos_root: Path) -> None:
  items = manifest_items(goos_root)
  man = {"credit": CREDIT, "source": SOURCE_PAGE, "drive_folder": DRIVE_FOLDER, "labels_from": LABEL_PAGE,
         "downloaded": DOWNLOADED, "items": items}
  (goos_root / "manifest.json").write_text(dumps(man))
  rows = "\n".join(
    f"| `{i['id']}` | {i['label']} | {i['discipline']} | `EOV icons/{i['goos_path']}` | `{i['drive_id']}` | "
    f"{i['size'][0]} x {i['size'][1]} | `{i['sha256']}` | `{i['webp64']}`, `{i['webp128']}` |" for i in items)
  (goos_root / "SOURCE.md").write_text(SOURCE_MD.format(
    credit=CREDIT, source=SOURCE_PAGE, folder=DRIVE_FOLDER, labels=LABEL_PAGE, date=DOWNLOADED, rows=rows,
    glyph_credit=GLYPH_CREDIT, n=len(items)))


SOURCE_MD = """# GOOS EOV icon badges (vendored)

The Global Ocean Observing System (GOOS) EOV icon badges, vendored so the Ocean Metrics indicators can show each
indicator's Essential Ocean Variable. Not Ocean Metrics artwork.

- **Source page:** {source}
- **Drive folder:** {folder} (public; downloaded with `gdown --folder`)
- **Downloaded:** {date}
- **Credit line (verbatim):** {credit}
- **Terms:** credit only; used unmodified; no GOOS logo. Nothing here grants modification. The badges stay out of the
  Ocean Metrics sprite and brand pages.
- **Processing:** none of the PNGs is re-encoded, cropped, recoloured or stripped (byte for byte as downloaded). The
  only derivatives are the 64 and 128 px lossless WebP resizes (Lanczos, aspect kept) in `webp/`, made by
  `brand/eov_trace.py --task webp`.
- **Labels:** the official EOV names on {labels} (checked {date}). The page says "Coral cover and composition" for the
  EOV whose badge file is `Hard-coral.png` (id `hard-coral`) and marks microbes, benthic invertebrates and marine
  debris as pilot EOVs.
- **Gaps:** GOOS lists 36 EOVs; the folder holds 35 badges. Turbulent diapycnal fluxes (pilot) is missing (it appears in
  Figure 2 of the article below, a 300 ppi JPEG too small to trace). No SVGs are published.
- **Layout:** `png/<discipline>/<GOOS file>.png` (disciplines physics, biogeochemistry, bioeco, cross-disciplinary;
  GOOS's own folders are Physics, Biogeochemistry, Biology and Ecosystems and Cross-disciplinary). The three discipline
  badges sit in `png/` (GOOS short names `bioeco`, `biogeo`, `physics`; ids bioeco, biogeochemistry, physics).
  `manifest.json` is the machine-readable form of the table below.
- **Monochrome glyphs:** `brand/glyphs/eov.json` is an adaptation traced from these badges ({glyph_credit}). Its
  licence basis is the CC BY article Martín Míguez B et al. (2026), "GOOS Essential Ocean Variables: the backbone of a
  sustained and evolving global ocean observing system", Front. Mar. Sci. 13:1737002,
  https://doi.org/10.3389/fmars.2026.1737002 (Figure 2 shows all 36 badges).
- **Download note:** a second `gdown --folder` run on {date} was refused by Google ("many accesses") after the file
  list had been read, so the Drive ids come from that listing and every file was fetched again from
  `drive.usercontent.google.com/download?id=<id>`; all {n} sha256 sums equal the first download's.

| id | GOOS label | discipline | original path | Drive file id | pixels | sha256 (original PNG) | derivatives |
|---|---|---|---|---|---|---|---|
{rows}
"""


# contact sheet ----

def make_sheet(png_root: Path, glyphs: dict, meta: dict, out_dir: Path) -> Path:
  out_dir.mkdir(parents=True, exist_ok=True)
  chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  rows = []
  for b in eov_badges():
    gid = f"eov-{b[0]}"
    svg = lambda px: f'<svg width="{px}" height="{px}" viewBox="0 0 24 24"><path fill="currentColor" d="{glyphs[gid]}"/></svg>'
    m = meta[gid]
    badge = Path(badge_path(png_root, b)).resolve()
    rows.append(
      f'<tr><td class="n">{b[0]}<br><small>{m["path_chars"]} ch, {m["trace"]["subpaths"]} sp'
      f'{"" if m["readable_16"] else "<br>fallback " + m["fallback"]}</small></td>'
      f'<td><img src="file://{badge}" width="40" height="40"></td>'
      f'<td>{svg(16)}</td><td>{svg(24)}</td><td>{svg(40)}</td>'
      f'<td class="dk">{svg(16)}</td><td class="dk">{svg(24)}</td><td>{svg(64)}</td></tr>')
  per = -(-len(rows) // 3)
  tables = "".join("<table>" + "".join(rows[i:i + per]) + "</table>" for i in range(0, len(rows), per))
  html = ("<!doctype html><meta charset=utf-8><style>body{margin:8px;font:11px sans-serif;color:#102a43;background:#fff}"
          "table{border-collapse:collapse;margin-right:16px}td{padding:2px 6px;border-bottom:1px solid #ddd;vertical-align:middle}"
          ".wrap{display:flex}.n{width:150px}.dk{background:#0b1d2e;color:#e5f7fd}small{color:#678}</style>"
          "<p>EOV glyphs: badge 40 px | glyph 16, 24, 40 px | on dark 16, 24 | 64 px. "
          f"{GLYPH_CREDIT}.</p><div class=wrap>{tables}</div>")
  page = out_dir / "eov_contact.html"
  page.write_text(html)
  png = out_dir / "eov_contact.png"
  height = 70 + 74 * per
  subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                  "--allow-file-access-from-files", f"--window-size=1560,{height}", f"--screenshot={png}",
                  f"file://{page.resolve()}"], check=True, capture_output=True)
  page.unlink()
  return png


# review of the contact sheet (by eye, 2026-10-20) ----
# id -> (readable at 16 px, MDI export name when not). Every id must be listed.
REVIEW: dict[str, tuple[bool, str | None]] = {
  "dissolved-organic-carbon": (False, "mdiMolecule"),
  "fish": (True, None),
  "hard-coral": (True, None),  # the coral fan reads at 16 px; MDI has no coral (reviewed 2026-10-20)
  "inorganic-carbon": (False, "mdiMoleculeCo2"),
  "invertebrates": (True, None),
  "macroalgae": (True, None),
  "mangroves": (True, None),  # the prop roots say mangrove better than a generic tree
  "marine-debris": (True, None),
  "marine-mammals": (True, None),
  "microbes": (False, "mdiBacteria"),
  "nitrous-oxide": (False, "mdiGasCylinder"),
  "nutrients": (False, "mdiFlaskOutline"),
  "ocean-bottom-pressure": (False, "mdiGauge"),
  "ocean-colour": (False, "mdiPaletteOutline"),
  "ocean-sound": (False, "mdiWaveform"),
  "ocean-surface-heat-flux": (False, "mdiSunThermometerOutline"),
  "ocean-surface-stress": (False, "mdiWeatherWindy"),
  "oxygen": (True, None),
  "particulate-matter": (True, None),
  "phytoplankton": (True, None),
  "sea-ice": (True, None),
  "sea-state": (True, None),
  "sea-surface-height": (False, "mdiArrowExpandVertical"),
  "sea-surface-salinity": (False, "mdiShakerOutline"),
  "sea-surface-temperature": (False, "mdiThermometer"),
  "sea-turtles": (True, None),
  "seabirds": (True, None),
  "seagrass": (True, None),
  "stable-carbon-isotopes": (False, "mdiAtom"),
  "subsurface-currents": (False, "mdiArrowRightBold"),
  "subsurface-salinity": (False, "mdiShaker"),
  "subsurface-temperature": (False, "mdiThermometerLines"),
  "surface-currents": (False, "mdiWaves"),
  "transient-tracers": (False, "mdiTestTube"),
  "zooplankton": (True, None),
}


def main(argv=None) -> int:
  ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
  ap.add_argument("--png-root", default=str(ROOT / "assets/goos-eov/png"))
  ap.add_argument("--out", default=str(ROOT / "brand/glyphs/eov.json"))
  ap.add_argument("--task", choices=["trace", "webp", "manifest", "sheet", "all"], default="trace")
  a = ap.parse_args(argv)
  png_root, out = Path(a.png_root), Path(a.out)
  goos_root = png_root.parent
  if a.task in ("webp", "all"):
    make_webp(png_root, goos_root / "webp")
  if a.task in ("manifest", "all"):
    write_manifest(goos_root)
  if a.task in ("trace", "sheet", "all"):
    glyphs, meta = trace_all(png_root)
    if a.task != "sheet":
      out.write_text(dumps(glyphs))
      out.with_name("eov.meta.json").write_text(dumps(meta))
      print(f"wrote {out} ({len(glyphs)} glyphs, {sum(len(v) for v in glyphs.values())} chars)")
    if a.task in ("sheet", "all"):
      print(make_sheet(png_root, glyphs, meta, out.parent / "eov_review"))
  return 0


if __name__ == "__main__":
  sys.exit(main())
