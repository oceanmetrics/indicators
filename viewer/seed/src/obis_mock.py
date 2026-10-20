# real OBIS series for the mockup: records per year and species per decade, per place polygon (values only)
import json, os, sys, time, urllib.request, io
from pathlib import Path
import requests, shapely, pyarrow.parquet as pq, pyarrow.compute as pc
from shapely.geometry import MultiPolygon, Polygon
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
S = requests.Session(); S.headers["User-Agent"] = "oceanmetrics-indicators-mockup (ben@oceanmetrics.io)"
def wkt_fit(g, maxc=7000):
  g = MultiPolygon([Polygon(p.exterior) for p in getattr(g, "geoms", [g])])
  for tol in (0, .002, .005, .01, .02, .05, .1, .2, .3, .5):
    w = shapely.to_wkt(shapely.simplify(g, tol, preserve_topology=True) if tol else g, rounding_precision=3)
    if len(w) <= maxc: return w, tol
  raise ValueError("too big")
def get(path, **p):
  for k in range(3):
    r = S.get(f"https://api.obis.org/v3/{path}", params=p, timeout=300)
    if r.ok: time.sleep(0.4); return r.json()
    time.sleep(2)
  r.raise_for_status()
def place(pid, name, g):
  f = OUT / (pid.replace(":", "_") + ".json")
  if f.exists(): return
  w, tol = wkt_fit(g)
  years = get("statistics/years", geometry=w)
  tot = get("statistics", geometry=w)
  dec = {}
  for d in range(1960, 2030, 10):
    s = get("statistics", geometry=w, startdate=f"{d}-01-01", enddate=f"{d+9}-12-31")
    dec[d] = {"records": s.get("records", 0), "species": s.get("species", 0)}
  f.write_text(json.dumps({"place_id": pid, "name": name, "tolerance": tol, "years": years, "total": tot, "decades": dec}))
  print(pid, name, tot.get("records"), tot.get("species"), "tol", tol, flush=True)
nms = pq.read_table(io.BytesIO(urllib.request.urlopen("https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/noaa_sanctuaries/places.parquet").read()), columns=["place_id", "name", "geometry"]).to_pylist()
want_nms = set(sys.argv[2].split(","))
for r in nms:
  if r["place_id"] in want_nms: place(r["place_id"], r["name"], shapely.from_wkb(r["geometry"]))
eez = pq.read_table(os.path.expanduser("~/data/oceanmetrics/places-internal/mr_eez/places.parquet"), columns=["place_id", "name", "geometry"])
for pid in sys.argv[3].split(","):
  r = eez.filter(pc.equal(eez["place_id"], pid)).to_pylist()[0]
  place(pid, r["name"], shapely.from_wkb(r["geometry"]))
