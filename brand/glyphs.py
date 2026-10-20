# the bespoke glyphs of the Ocean Metrics icon set, DRAWN from primitives; no path is typed by hand.
#   python3 brand/glyphs.py            writes brand/glyphs/bespoke.json  {name: d}
#   python3 brand/glyphs.py --check    exits 1 when the committed json differs from what this file draws
# every glyph is ONE filled path on the 24-px grid (nonzero fill), content within about 2..22, strokes about
# 1.6-2.2 px like the MDI outline icons. solid subpaths are emitted clockwise on screen so overlaps union; holes go
# the other way. strokes are quads + round joins; waves are ribbons of sampled cubics. the primitives (poly, circle,
# seg, stroke, ribbon, wave_pts) follow CalCOFI/explore scripts/icon_glyphs.py. pure standard library.
import json
import math
import sys
from pathlib import Path

# ---- number and path formatting ----
def f(v):
  s = ('%.2f' % v).rstrip('0').rstrip('.')
  return '0' if s in ('-0', '') else s

# ---- primitives ----
def area(pts):
  return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))

def poly(pts, hole=False):
  # solid = clockwise on screen (positive shoelace area in y-down coordinates); a hole is the reverse
  if (area(pts) < 0) != hole:
    pts = pts[::-1]
  return 'M' + 'L'.join(f'{f(x)} {f(y)}' for x, y in pts) + 'Z'

def circle(cx, cy, r, hole=False):
  s = 0 if hole else 1
  return f'M{f(cx - r)} {f(cy)}A{f(r)} {f(r)} 0 1 {s} {f(cx + r)} {f(cy)}A{f(r)} {f(r)} 0 1 {s} {f(cx - r)} {f(cy)}Z'

def seg(a, b, w):
  # a stroked segment as a quad
  dx, dy = b[0] - a[0], b[1] - a[1]
  n = math.hypot(dx, dy)
  nx, ny = -dy / n * w / 2, dx / n * w / 2
  return poly([(a[0] + nx, a[1] + ny), (b[0] + nx, b[1] + ny), (b[0] - nx, b[1] - ny), (a[0] - nx, a[1] - ny)])

def stroke(pts, w, closed=False, caps=True):
  # a polyline stroked with quads + round joins (caps=False leaves the two ends square)
  d = ''
  n = len(pts)
  for i in range(n if closed else n - 1):
    d += seg(pts[i], pts[(i + 1) % n], w)
  joins = pts if (closed or caps) else pts[1:-1]
  for p in joins:
    d += circle(p[0], p[1], w / 2)
  return d

def bez(p0, p1, p2, p3, n=8):
  # sample a cubic
  out = []
  for i in range(n + 1):
    t = i / n
    out.append((
      (1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 3 * (1 - t) * t * t * p2[0] + t ** 3 * p3[0],
      (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 3 * (1 - t) * t * t * p2[1] + t ** 3 * p3[1],
    ))
  return out

def wave_pts(x0, x1, y, amp, period, n_per_half=6, phase=0):
  # a smooth wave: alternating S-curves crest <-> trough, each half period a cubic with horizontal tangents
  pts = []
  x = x0
  up = phase == 0
  while x < x1 - 1e-6:
    xe = min(x1, x + period / 2)
    ya, yb = (y + amp, y - amp) if up else (y - amp, y + amp)
    full = x + period / 2
    half = bez((x, ya), (x + period / 4, ya), (x + period / 4, yb), (full, yb), n_per_half)
    half = [p for p in half if p[0] <= xe + 1e-6]
    pts += half[1:] if pts else half
    x = full
    up = not up
  return pts

def ribbon(x0, x1, y, amp, period, t, phase=0):
  top = wave_pts(x0, x1, y - t / 2, amp, period, phase=phase)
  bot = wave_pts(x0, x1, y + t / 2, amp, period, phase=phase)
  return poly(top + bot[::-1])

def curve(p0, p1, p2, p3, n=10):
  return bez(p0, p1, p2, p3, n)

def blade(pts, w0, w1):
  # a tapered stroke along a sampled centreline: width w0 at the first point, w1 at the last
  n = len(pts)
  left, right = [], []
  for i, p in enumerate(pts):
    a = pts[max(i - 1, 0)]
    b = pts[min(i + 1, n - 1)]
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    w = (w0 + (w1 - w0) * i / (n - 1)) / 2
    nx, ny = -dy / L * w, dx / L * w
    left.append((p[0] + nx, p[1] + ny))
    right.append((p[0] - nx, p[1] - ny))
  return poly(left + right[::-1])

def sector(cx, cy, r_in, r_out, a0, a1, n=8):
  # an annular sector between two angles (degrees, 0 = up, clockwise), sampled
  def at(r, a):
    t = math.radians(a)
    return (cx + r * math.sin(t), cy - r * math.cos(t))
  outer = [at(r_out, a0 + (a1 - a0) * i / n) for i in range(n + 1)]
  inner = [at(r_in, a0 + (a1 - a0) * i / n) for i in range(n + 1)]
  return poly(outer + inner[::-1])

def ring(cx, cy, r, w):
  return circle(cx, cy, r + w / 2) + circle(cx, cy, r - w / 2, hole=True)

def dashed(pts, w, dash, gap):
  # a polyline cut into dashes (each a stroke with round ends); lengths are measured along the line
  d = ''
  run = []
  on, left = True, dash
  cur = pts[0]
  run = [cur]
  for nxt in pts[1:]:
    L = math.hypot(nxt[0] - cur[0], nxt[1] - cur[1])
    pos = 0.0
    while L - pos > 1e-9:
      step = min(left, L - pos)
      pos += step
      left -= step
      q = (cur[0] + (nxt[0] - cur[0]) * pos / L, cur[1] + (nxt[1] - cur[1]) * pos / L)
      if on:
        run.append(q)
      if left <= 1e-9:
        if on and len(run) > 1:
          d += stroke(run, w)
        on = not on
        left = dash if on else gap
        run = [q] if on else []
    cur = nxt
  if on and len(run) > 1:
    d += stroke(run, w)
  return d

# ---- the glyphs ----
GLYPH = {}

# depth-*: one wave ribbon across the top third + a disc; the DISC POSITION is the meaning (skim above, swim just
# below, dive deep with a dashed line down from the surface)
WAVE_Y = 10
def depth(disc_y, dashes=None):
  d = ribbon(2, 22, WAVE_Y, 1.0, 20 / 3, 2)
  d += circle(12, disc_y, 2.3)
  for y0, y1 in (dashes or ()):
    d += seg((12, y0), (12, y1), 1.6)
  return d
GLYPH['depth-skim'] = depth(4.5)
GLYPH['depth-swim'] = depth(15.4)
GLYPH['depth-dive'] = depth(19.7, dashes=((12.9, 14.2), (15.3, 16.6)))

# st-*: statistical status relative to a place's own record, as a ring: plus above, minus below, filled centre within,
# a dashed empty ring when there is no status (record too short). no triangles, no bars: not the ONMS symbols
R_ST, W_ST = 9, 2
GLYPH['st-above'] = ring(12, 12, R_ST, W_ST) + seg((7.6, 12), (16.4, 12), 2) + seg((12, 7.6), (12, 16.4), 2)
GLYPH['st-below'] = ring(12, 12, R_ST, W_ST) + seg((7.6, 12), (16.4, 12), 2)
GLYPH['st-within'] = ring(12, 12, R_ST, W_ST) + circle(12, 12, 3.4)
GLYPH['st-none'] = ''.join(sector(12, 12, R_ST - W_ST / 2, R_ST + W_ST / 2, k * 45 - 13, k * 45 + 13) for k in range(8))

# view-quad: the IEA quad plot, two crossing axes through the centre and five dots in the quadrants
GLYPH['view-quad'] = (
  seg((2.6, 12), (21.4, 12), 1.5) + seg((12, 2.6), (12, 21.4), 1.5)
  + circle(6.4, 6.6, 2.1) + circle(16.4, 5.6, 1.8) + circle(19, 9.4, 1.5)
  + circle(6.8, 17.6, 1.9) + circle(17.2, 18, 2.2)
)

# view-small-multiples: small multiples as a 2x2 grid of mini line charts, each an L-shaped axis pair with a short
# polyline above it (a frame per cell would blur at 16 px)
def mini(x, y, ys, s=8.6):
  # one cell with its top-left at (x, y), s px square
  d = stroke([(x, y), (x, y + s), (x + s, y + s)], 1.4, caps=False)
  n = len(ys)
  pts = [(x + 1.6 + (s - 2.4) * i / (n - 1), y + s - 2.2 - v * (s - 4.4)) for i, v in enumerate(ys)]
  return d + stroke(pts, 1.4)
GLYPH['view-small-multiples'] = (
  mini(2.6, 2.6, (0.1, 0.8, 0.4, 1.0)) + mini(12.8, 2.6, (0.9, 0.4, 0.7, 0.1))
  + mini(2.6, 12.8, (0.2, 0.3, 0.8, 0.9)) + mini(12.8, 12.8, (0.5, 1.0, 0.0, 0.6))
)

# place-sanctuary: a whale fluke (two lobes, a notch, the peduncle) rising from a wave ribbon
fluke = []
fluke += [(10.9, 18.5), (11.0, 14.2)]
fluke += curve((11.0, 14.2), (10.8, 11.2), (7.8, 10.0), (4.4, 8.4))[0:]
fluke += curve((4.4, 8.4), (3.4, 7.9), (2.7, 6.6), (2.4, 4.6))[1:]
fluke += curve((2.4, 4.6), (5.2, 4.6), (8.4, 5.4), (12, 8.6))[1:]
fluke += curve((12, 8.6), (15.6, 5.4), (18.8, 4.6), (21.6, 4.6))[1:]
fluke += curve((21.6, 4.6), (21.3, 6.6), (20.6, 7.9), (19.6, 8.4))[1:]
fluke += curve((19.6, 8.4), (16.2, 10.0), (13.2, 11.2), (13.0, 14.2))[1:]
fluke += [(13.1, 18.5)]
GLYPH['place-sanctuary'] = poly(fluke) + ribbon(2, 22, 19.6, 1.0, 20 / 3, 2)

# place-eez: a coastline land mass at the left edge and a dashed offshore limit roughly parallel to it (200 nm)
coast = [(2, 2.2), (6.4, 2.2), (7.0, 6.2), (6.0, 10), (7.2, 14), (6.4, 18), (7.0, 21.8), (2, 21.8)]
limit = curve((16.2, 2.4), (18.6, 8), (13.6, 15), (16.4, 21.6), 24)
GLYPH['place-eez'] = poly(coast) + dashed(limit, 1.8, 2.4, 2.2)

# place-province: an open-ocean province, a ring holding two short wave ribbons
GLYPH['place-province'] = ring(12, 12, 9, 2) + ribbon(6.6, 17.4, 9.6, 0.8, 5.4, 1.8) + ribbon(6.6, 17.4, 14.6, 0.8, 5.4, 1.8)

# place-ecoregion: a tessellation, three irregular polygons outlined with shared edges (a wandering inner edge from
# coast to coast and a branch up from it); no vertex squares, unlike MDI's polygon (place-contrib)
EV = [(2.6, 8), (8.6, 3.0), (16.4, 3.6), (21.4, 9.2), (20.4, 16.6), (13.6, 21.2), (5.6, 19.4), (2.8, 13.4)]
GLYPH['place-ecoregion'] = (
  stroke(EV, 1.6, closed=True)
  + stroke([EV[7], (9.4, 11.2), (14.6, 14.2), EV[4]], 1.6) + stroke([(9.4, 11.2), EV[1]], 1.6)
)

# onms-habitat: kelp / seagrass, three curved blades rising from a short base, the middle one carrying a float
kb = lambda *a: curve(*a, n=12)
d = seg((4.2, 20.8), (19.8, 20.8), 2)
d += circle(4.2, 20.8, 1) + circle(19.8, 20.8, 1)
d += blade(kb((7, 21), (5.2, 15), (9.4, 10.5), (6.2, 4.6)), 2.4, 1.3)
d += blade(kb((12.2, 21), (9.4, 15.5), (14.8, 11), (12.6, 7)), 2.4, 1.3)
d += circle(12.6, 5, 1.9)
d += blade(kb((17.2, 21), (19.6, 15), (14.8, 12), (18.4, 5.6)), 2.4, 1.3)
GLYPH['onms-habitat'] = d

# ---- output ----
OUT = Path(__file__).resolve().parent / 'glyphs' / 'bespoke.json'

def render():
  return json.dumps({k: GLYPH[k] for k in sorted(GLYPH)}, indent=2) + '\n'

if __name__ == '__main__':
  text = render()
  if '--check' in sys.argv:
    ok = OUT.exists() and OUT.read_text() == text
    print('bespoke.json up to date' if ok else 'bespoke.json differs from brand/glyphs.py', file=sys.stderr if not ok else sys.stdout)
    sys.exit(0 if ok else 1)
  OUT.parent.mkdir(parents=True, exist_ok=True)
  OUT.write_text(text)
  print(f'wrote {OUT} ({len(GLYPH)} glyphs)')
