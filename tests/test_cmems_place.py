"""the Copernicus Marine place producer: the cell-centre mean, the windows, the rows, the provenance and the output folder.
one test per rule on a synthetic grid whose values name their cells; no Copernicus call, no login. the tests that read the
published gazetteer or the Copernicus catalogue are marked `network` (OM_OFFLINE=1 skips them)."""
import json
import math
import os
import types

import pytest

np = pytest.importorskip("numpy")                # the `cmems` dependency group; the module is skipped without it

from cmems_fixture import INFO, LAYERS, NO3, box, date, grid, months, shapely, xr
from om_indicators import contract
from om_indicators.producers import cmems_place as cp, geometry_kind, source_id_of

TWO_CELLS = box(0.5, 0.5, 2.5, 1.5)        # the centres (lon 1 and 2, lat 1): the cells 11 and 12 of month 0


# ---- the request ----

def test_an_indicator_must_be_a_cmems_mean_we_publish():
  assert cp.parse_indicator(NO3) == ("cmems_mod_glo_bgc_my_0.25deg_P1M-m", "no3")
  for bad in ["erddap:dhw_5km:CRW_SST:mean", "cmems:cmems_mod_glo_bgc_my_0.25deg_P1M-m:no3:sd", "cmems:x:y:mean",
              "cmems:cmems_mod_glo_bgc_my_0.25deg_P1M-m:bogus:mean", "cmems:cmems_mod_glo_bgc_my_0.25deg_P1M-m:no3:mean;ls", ""]:
    with pytest.raises(ValueError):
      cp.parse_indicator(bad)


def test_geometry_kind_and_source_id():
  assert geometry_kind(LAYERS["layers"][0]) == "reference" and geometry_kind(LAYERS["layers"][1]) == "vector"
  assert geometry_kind(LAYERS["layers"][2]) is None                       # derived: internal geometry
  assert geometry_kind({"kind": "raster", "raster": {"tiles": ["https://x/{z}/{x}/{y}"]}}) is None
  assert geometry_kind(None) is None
  assert source_id_of("MRGID:5670") == "5670" and cp.place_slug("MRGID:5670") == "MRGID-5670"


# ---- the polygon ----

def test_a_vector_place_is_one_row_of_the_published_parquet():
  seen = []
  geom, src = cp.fetch_geometry("NMS:A", LAYERS["layers"][1], wkb_reader=lambda url, pid: seen.append((url, pid)) or shapely.to_wkb(TWO_CELLS))
  assert seen == [("https://storage.example/gazetteer/places/places.parquet", "NMS:A")]
  assert geom.equals(TWO_CELLS) and src == {"kind": "vector", "url": "https://storage.example/gazetteer/places/places.parquet"}


def test_a_reference_place_is_the_publishers_single_feature(tmp_path):
  """without a private copy (tmp_path holds none) the publisher's WFS answers"""
  asked = []
  feature = {"type": "Feature", "geometry": shapely.geometry.mapping(TWO_CELLS)}
  resp = types.SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"features": [feature]})
  geom, src = cp.fetch_geometry("MRGID:5670", LAYERS["layers"][0], http_get=lambda url, timeout: asked.append(url) or resp,
                                internal_dir=tmp_path)
  assert asked == ["https://geo.example/wfs?CQL_FILTER=mrgid=5670"]
  assert geom.equals(TWO_CELLS) and src["kind"] == "reference"


def test_a_reference_place_the_publisher_does_not_serve_is_an_error(tmp_path):
  resp = types.SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"features": []})
  with pytest.raises(ValueError, match="is not served by"):
    cp.fetch_geometry("MRGID:1", LAYERS["layers"][0], http_get=lambda url, timeout: resp, internal_dir=tmp_path)


def test_a_reference_place_is_read_from_the_private_copy_when_this_machine_holds_it(tmp_path):
  """issue #3 (Albanian EEZ, 2026-10-21): the run masks with the private full-resolution parquet, the copy erddap-places
  reads, and never asks the publisher; the provenance names the product's DOI, not the local path"""
  (tmp_path / "mr_eez").mkdir()
  (tmp_path / "mr_eez" / "places.parquet").write_bytes(b"")
  layer = {**LAYERS["layers"][0], "raster": {**LAYERS["layers"][0]["raster"], "link": "https://doi.org/10.14284/632"}}
  seen = []
  geom, src = cp.fetch_geometry("MRGID:5670", layer, internal_dir=tmp_path,
                                wkb_reader=lambda url, pid: seen.append((url, pid)) or shapely.to_wkb(TWO_CELLS),
                                http_get=lambda url, timeout: pytest.fail("the publisher was asked"))
  assert seen == [(str(tmp_path / "mr_eez" / "places.parquet"), "MRGID:5670")]
  assert geom.equals(TWO_CELLS) and src == {"kind": "reference", "url": "https://doi.org/10.14284/632", "copy": "internal"}


def test_a_derived_layer_needs_a_maintainer():
  with pytest.raises(cp.NeedsMaintainer, match=r"FAO:21 \(collection fao_high_seas\).*a maintainer has to run it"):
    cp.fetch_geometry("FAO:21", LAYERS["layers"][2])


# ---- windows ----

def test_one_window_is_the_bbox_grown_by_a_cell_and_clamped_to_the_dataset():
  assert cp.windows(box(10, 40, 12, 42), 0.25, 0.25) == [(9.75, 39.75, 12.25, 42.25)]
  assert cp.windows(box(-179.9, -79.9, -178, -70), 0.25, 0.25, (-180, 179.75), (-80, 90)) == [(-180, -80, -177.75, -69.75)]


def test_a_place_across_the_antimeridian_gets_one_window_per_side():
  # stored split at +/-180: the plain bbox is the whole globe, so each side is windowed from its own parts
  fiji = shapely.MultiPolygon([box(177.0, -20.0, 180.0, -15.0), box(-180.0, -19.0, -178.0, -16.0)])
  east, west = cp.windows(fiji, 0.25, 0.25, (-180, 179.75), (-80, 90))
  assert east == (176.75, -20.25, 179.75, -14.75)
  assert west == (-180, -19.25, -177.75, -15.75)


def test_a_multipolygon_inside_one_hemisphere_is_one_window():
  assert len(cp.windows(shapely.MultiPolygon([box(-10, 0, -9, 1), box(5, 2, 6, 3)]), 0.25, 0.25)) == 1


def test_window_cells_counts_the_cells_the_toolbox_returns():
  assert cp.window_cells((9.75, 39.75, 12.25, 42.25), 0.25, 0.25) == 11 * 11


# ---- the mean over the cells under the polygon ----

def test_the_mean_is_over_the_cells_whose_centres_are_inside_exact_values():
  s = cp.cell_means([grid()], TWO_CELLS)
  assert s.cells == 2 and s.n_cells == [2, 2, 2]
  assert s.times == [date(2020, 1), date(2020, 2), date(2020, 3)]
  assert s.mean == [11.5, 111.5, 211.5]
  assert s.sd == [pytest.approx(math.sqrt(0.5))] * 3         # sample SD of 11 and 12


def test_a_cell_whose_centre_is_outside_is_not_counted_however_much_of_it_overlaps():
  # the cells are 1 degree wide: the cell centred (lon 1, lat 1) spans 0.5 to 1.5 and the one centred (2, 0) overlaps too,
  # but only the centre (2, 1) is inside this polygon
  s = cp.cell_means([grid()], box(1.2, 0.2, 2.4, 1.4))
  assert s.cells == 1 and s.mean == [12.0, 112.0, 212.0] and s.sd == [None, None, None]


def test_nan_cells_are_skipped_and_a_single_cell_has_no_sd():
  a = grid()
  a[0, 1, 1] = np.nan                                         # month 0, cell 11
  s = cp.cell_means([a], TWO_CELLS)
  assert s.mean == [12.0, 111.5, 211.5] and s.n_cells == [1, 2, 2]
  assert s.sd[0] is None and s.sd[1] == pytest.approx(math.sqrt(0.5))


def test_a_month_with_every_cell_nan_has_no_mean():
  a = grid()
  a[1, :, :] = np.nan
  s = cp.cell_means([a], TWO_CELLS)
  assert s.mean == [11.5, None, 211.5] and s.sd[1] is None and s.n_cells == [2, 0, 2]


def test_a_polygon_with_no_cell_centre_inside_is_too_small_for_the_grid():
  with pytest.raises(cp.NoCellsError, match="too small for this grid"):
    cp.cell_means([grid()], box(0.1, 0.1, 0.4, 0.4))


def test_cells_that_are_all_masked_are_not_a_mean_of_nothing():
  a = grid() * np.nan
  with pytest.raises(cp.NoCellsError, match="2 cell centres inside the place polygon have no value"):
    cp.cell_means([a], TWO_CELLS)


def test_a_cell_centred_on_the_polygon_boundary_counts():
  # the cells centred at lon 1 and 2 sit on the edges of this polygon
  s = cp.cell_means([grid()], box(1.0, 0.5, 2.0, 1.5))
  assert s.cells == 2 and s.mean == [11.5, 111.5, 211.5]


def test_two_windows_are_one_set_of_cells_and_overlap_counts_once():
  a = grid(lon=(0.0, 1.0, 2.0, 3.0))
  b = grid(lon=(2.0, 3.0, 4.0, 5.0))                          # shares lon 2.0 with a (same cell values: not here, so compare keys)
  b = b.copy(data=a.values[:, :, :1].repeat(4, axis=2))       # every cell of b reads lon index 0; only (lat 1, lon 2) overlaps a
  s = cp.cell_means([a, b], box(0.5, 0.5, 4.5, 1.5))          # centres lon 1, 2, 3 (a) and 2, 3, 4 (b), lat 1
  assert s.cells == 4                                         # lon 1, 2, 3, 4: lon 2 and 3 are seen twice, counted once (a wins)
  assert s.mean[0] == pytest.approx((11 + 12 + 13 + 10) / 4)


def test_a_cell_centred_on_minus_180_is_inside_the_western_part_of_a_split_place():
  west = grid(lon=(-180.0, -179.0, -178.0, -177.0))
  s = cp.cell_means([west], box(-180.0, 0.5, -178.5, 1.5))    # centres -180 and -179 at lat 1
  assert s.cells == 2 and s.mean[0] == 10.5


def test_windows_with_different_time_steps_are_refused():
  with pytest.raises(ValueError, match="different time steps"):
    cp.cell_means([grid(3), grid(2)], TWO_CELLS)


def test_the_surface_is_the_shallowest_depth_level():
  t = np.array(months(1), dtype="datetime64[ns]")
  da = xr.DataArray(np.array([[[[1.0]], [[2.0]], [[3.0]]]]), dims=("time", "depth", "latitude", "longitude"),
                    coords={"time": t, "depth": [30.0, 0.5, 5.0], "latitude": [0.0], "longitude": [0.0]})
  s = cp.surface(da)
  assert float(s["depth"]) == 0.5 and s.values.tolist() == [[[2.0]]]


def test_the_toolbox_is_asked_for_the_window_and_the_surface_and_its_netcdf_is_read_back(tmp_path, monkeypatch):
  cm = pytest.importorskip("copernicusmarine")
  asked = {}

  def fake_subset(**kw):
    asked.update(kw)
    # the file the Toolbox would write: two depth levels, the deeper one first
    t = np.array(months(2), dtype="datetime64[ns]")
    da = xr.DataArray(np.array([[[[9.0]], [[1.0]]], [[[8.0]], [[2.0]]]]), dims=("time", "depth", "latitude", "longitude"),
                      coords={"time": t, "depth": [40.0, 0.5], "latitude": [1.0], "longitude": [1.0]}, name="no3",
                      attrs={"units": "mmol m-3"})
    path = tmp_path / kw["output_filename"]
    da.to_dataset().to_netcdf(path)
    return types.SimpleNamespace(file_path=path)

  monkeypatch.setattr(cm, "subset", fake_subset)
  da = cp.toolbox_subset("cmems_x", "no3", (-0.5, -0.5, 3.5, 2.5), "2020-01-01", None, tmp_path, "w0")
  assert asked["dataset_id"] == "cmems_x" and asked["variables"] == ["no3"] and asked["disable_progress_bar"] is True
  assert (asked["minimum_longitude"], asked["minimum_latitude"], asked["maximum_longitude"], asked["maximum_latitude"]) == (-0.5, -0.5, 3.5, 2.5)
  assert (asked["minimum_depth"], asked["maximum_depth"]) == (0.0, 0.51) and asked["start_datetime"] == "2020-01-01"
  assert asked["end_datetime"] is None and asked["overwrite"] is True
  assert da.dims == ("time", "latitude", "longitude") and da.values.ravel().tolist() == [1.0, 2.0] and float(da["depth"]) == 0.5
  assert da.attrs["units"] == "mmol m-3"


def test_a_toolbox_failure_says_where_the_login_lives(tmp_path, monkeypatch):
  cm = pytest.importorskip("copernicusmarine")

  def refuse(**kw):
    raise PermissionError("bad credentials")
  monkeypatch.setattr(cm, "subset", refuse)
  with pytest.raises(RuntimeError, match=r"subset of cmems_x failed \(PermissionError: bad credentials\).*~/.copernicusmarine"):
    cp.toolbox_subset("cmems_x", "no3", (0, 0, 1, 1), None, None, tmp_path)


# ---- rows ----

def test_three_months_are_three_month_rows_through_the_contract():
  s = cp.cell_means([grid()], TWO_CELLS)
  rows = cp.place_rows("MRGID:5670", "mr_eez", NO3, "mmol m-3", s)
  assert [(r["time_grain"], r["time"], r["value"], r["n"]) for r in rows] == [
    ("month", date(2020, 1), 11.5, 1.0), ("month", date(2020, 2), 111.5, 1.0), ("month", date(2020, 3), 211.5, 1.0)]
  assert {(r["place_id"], r["coll"], r["indicator"], r["unit"], r["class"]) for r in rows} == {
    ("MRGID:5670", "mr_eez", NO3, "mmol m-3", None)}
  assert [r["sd"] for r in rows] == [pytest.approx(math.sqrt(0.5))] * 3
  assert contract.validate_rows(rows) == []


def test_a_complete_year_adds_a_year_row_that_is_the_mean_of_its_twelve_months():
  s = cp.cell_means([grid(14)], TWO_CELLS)                    # 2020-01 .. 2021-02
  rows = cp.place_rows("MRGID:5670", "mr_eez", NO3, "mmol m-3", s)
  years = [r for r in rows if r["time_grain"] == "year"]
  assert [(r["time"], r["n"]) for r in years] == [(date(2020, 1, 1), 12.0)]
  assert years[0]["value"] == pytest.approx(sum(100.0 * k + 11.5 for k in range(12)) / 12) == pytest.approx(561.5)
  assert len([r for r in rows if r["time_grain"] == "month"]) == 14
  assert contract.validate_rows(rows) == []


def test_a_month_with_no_value_has_no_row_and_blocks_its_year():
  a = grid(12)
  a[5, :, :] = np.nan
  rows = cp.place_rows("MRGID:5670", "mr_eez", NO3, "mmol m-3", cp.cell_means([a], TWO_CELLS))
  assert len(rows) == 11 and {r["time_grain"] for r in rows} == {"month"}


# ---- provenance, folder, index ----

def produce(tmp_path, place="MRGID:5670", arrays=None, **kw):
  arrays = arrays if arrays is not None else [grid(3, depth=0.5057)]
  return cp.produce(place, "mr_eez", NO3, tmp_path / "out", layers=LAYERS, info=lambda ds, v: INFO,
                    geometry=lambda pid, layer: (TWO_CELLS, {"kind": "reference", "url": "https://geo.example/wfs?mrgid=5670"}),
                    subset=lambda ds, v, w, s, e: arrays[0], created="2026-10-20T12:00:00Z", commit="abc1234",
                    toolbox_version="2.5.0", **kw)


def test_a_job_writes_one_parquet_and_its_provenance_beside_it(tmp_path):
  s = produce(tmp_path)
  folder = tmp_path / "out" / "cmems_mod_glo_bgc_my_0.25deg_P1M-m" / "no3" / "MRGID-5670"
  assert sorted(p.name for p in folder.iterdir()) == ["data.parquet", "provenance.json"]
  table, prov = contract.read_values(folder / "data.parquet")
  assert table.num_rows == 3 and set(table.column("coll").to_pylist()) == {"mr_eez"} and s["rows"] == 3
  assert contract.validate_provenance(prov) == []
  assert prov["producer"] == {"name": cp.PRODUCER_NAME, "url": cp.REPO_URL, "version": "abc1234"}


def test_the_provenance_states_the_dataset_the_depth_the_polygon_and_the_run(tmp_path):
  produce(tmp_path)
  p = json.loads((tmp_path / "out" / "cmems_mod_glo_bgc_my_0.25deg_P1M-m" / "no3" / "MRGID-5670" / "provenance.json").read_text())
  assert p["dataset_id"] == "cmems_mod_glo_bgc_my_0.25deg_P1M-m" and p["variable"] == "no3" and p["unit"] == "mmol m-3"
  assert p["dataset"]["id"] == "GLOBAL_MULTIYEAR_BGC_001_029" and p["dataset"]["doi"] == "https://doi.org/10.48670/moi-00019"
  assert p["dataset"]["citation"] == ("E.U. Copernicus Marine Service Information; Global Ocean Biogeochemistry Hindcast; "
                                      "https://doi.org/10.48670/moi-00019")
  assert p["product_doi"] == "https://doi.org/10.48670/moi-00019" and p["dataset_version"] == "202406"
  assert p["depth"] == {"requested": [0.0, 0.51], "used_m": 0.5057}
  assert p["windows"] == [[-0.5, -0.5, 3.5, 2.5]]
  assert p["grid"] == {"lon_step": 1.0, "lat_step": 1.0} and p["cells"] == 2
  assert p["time_range"] == ["2020-01-01", "2020-03-01"]
  assert p["polygon"] == {"kind": "reference", "url": "https://geo.example/wfs?mrgid=5670"}
  assert p["copernicusmarine_version"] == "2.5.0" and p["code"]["commit"] == "abc1234" and p["run_time"] == "2026-10-20T12:00:00Z"
  assert p["method"] == cp.METHOD and "centres fall inside the place polygon" in p["method"]
  assert p["rows"] == 3 and p["sha256"].startswith("sha256:")
  assert [(s["role"], s["item"]) for s in p["sources"]] == [("data", None), ("product", None), ("geometry", None)]
  assert p["sources"][2]["href"] == "https://geo.example/wfs?mrgid=5670" and p["sources"][0]["href"] == f"copernicusmarine:{p['dataset_id']}"
  assert p["sources"][1]["href"].endswith("/product/GLOBAL_MULTIYEAR_BGC_001_029/description")


def test_the_index_entry_names_the_files_and_their_checksum(tmp_path):
  e = produce(tmp_path)["entry"]
  assert e == {"indicator": NO3, "place_id": "MRGID:5670", "coll": "mr_eez", "dataset": "cmems_mod_glo_bgc_my_0.25deg_P1M-m",
               "variable": "no3", "path": "cmems_mod_glo_bgc_my_0.25deg_P1M-m/no3/MRGID-5670/data.parquet",
               "provenance": "cmems_mod_glo_bgc_my_0.25deg_P1M-m/no3/MRGID-5670/provenance.json", "rows": 3,
               "sha256": cp.sha256_of(tmp_path / "out" / e["path"]), "time_range": ["2020-01-01", "2020-03-01"],
               "created": "2026-10-20T12:00:00Z"}


def test_the_check_run_resolves_the_job_and_writes_nothing(tmp_path):
  s = produce(tmp_path, check=True)
  assert s["windows"] == [(-0.5, -0.5, 3.5, 2.5)]
  assert s["grid_cells"] == 5 * 4 and s["grid_values"] == 5 * 4 * 3          # 5 x 4 cells of 1 degree, 3 time steps
  assert not (tmp_path / "out").exists()


def test_a_job_over_the_limit_is_refused_before_any_download(tmp_path):
  with pytest.raises(ValueError, match="about 60 grid values .* is over the 5 limit"):
    produce(tmp_path, max_values=5)


def test_a_place_too_small_for_the_grid_writes_nothing(tmp_path):
  with pytest.raises(cp.NoCellsError, match="too small"):
    cp.produce("MRGID:1", "mr_eez", NO3, tmp_path / "out", layers=LAYERS, info=lambda ds, v: INFO,
               geometry=lambda pid, layer: (box(0.1, 0.1, 0.4, 0.4), {"kind": "reference", "url": "u"}),
               subset=lambda ds, v, w, s, e: grid(3), toolbox_version="2.5.0")
  assert not (tmp_path / "out").exists()


def test_malformed_names_never_reach_a_command(tmp_path):
  for place, coll in [("MRGID:1;ls", "mr_eez"), ("MRGID:1", "mr eez"), ("nocolon", "mr_eez")]:
    with pytest.raises(ValueError, match="malformed"):
      cp.produce(place, coll, NO3, tmp_path, layers=LAYERS)


def test_the_index_merges_by_indicator_place_and_collection():
  a = {"indicator": NO3, "place_id": "MRGID:1", "coll": "mr_eez", "rows": 1}
  b = {"indicator": NO3, "place_id": "MRGID:2", "coll": "mr_eez", "rows": 1}
  a2 = {**a, "rows": 9}
  merged = cp.merge_index({"entries": [b, a]}, [a2], "2026-10-20T00:00:00Z")
  assert merged == {"version": 1, "updated": "2026-10-20T00:00:00Z", "entries": [a2, b]}
  assert cp.merge_index(None, [b], "t")["entries"] == [b]


def test_publish_uploads_the_place_files_first_and_the_merged_index_last(tmp_path):
  e = produce(tmp_path)["entry"]
  base = tmp_path / "published"
  base.mkdir()
  other = {"indicator": NO3, "place_id": "MRGID:9", "coll": "mr_eez"}
  (base / "index.json").write_text(json.dumps({"version": 1, "updated": "x", "entries": [other]}))
  calls = []
  idx = cp.publish(tmp_path / "out", [e], dest="indicators/producers/cmems", base=str(base),
                   created="2026-10-20T13:00:00Z", run=lambda cmd, check: calls.append(cmd), publisher="om-publish.sh")
  # om-publish.sh <file> <prefix>: the file keeps its name under the prefix of its folder; both stores, never a delete
  assert [c[-2:] for c in calls] == [
    [str(tmp_path / "out" / e["path"]), "indicators/producers/cmems/" + e["path"].rsplit("/", 1)[0]],
    [str(tmp_path / "out" / e["provenance"]), "indicators/producers/cmems/" + e["provenance"].rsplit("/", 1)[0]],
    [str(tmp_path / "out" / "index.json"), "indicators/producers/cmems"]]
  assert all(c[:4] == ["om-publish.sh", "--really", "--cache-control", "public, max-age=300"] for c in calls)
  assert not any("aws" in a or a.startswith("--delete") for c in calls for a in c)
  assert [x["place_id"] for x in idx["entries"]] == ["MRGID:5670", "MRGID:9"]
  assert json.loads((tmp_path / "out" / "index.json").read_text()) == idx


def test_a_producer_folder_that_does_not_exist_yet_has_no_index(tmp_path):
  assert cp.read_index(str(tmp_path / "nothing")) is None


# ---- the catalogue ----

def coords(**kw):
  return [types.SimpleNamespace(coordinate_id=k, minimum_value=v[0], maximum_value=v[1], step=v[2], values=v[3] if len(v) > 3 else None)
          for k, v in kw.items()]


def catalogue(dataset="cmems_x", var="no3", step=0.25):
  v = types.SimpleNamespace(short_name=var, units="mmol m-3", coordinates=coords(
    time=(None, None, None, [1, 2, 3]), longitude=(-180, 179.75, step), latitude=(-80, 90, step)))
  svc = lambda name, vs: types.SimpleNamespace(service_name=name, variables=vs)
  part = types.SimpleNamespace(services=[svc("original-files", [types.SimpleNamespace(short_name=var, units="u", coordinates=[])]),
                                          svc("arco-geo-series", [v])])
  ds = types.SimpleNamespace(dataset_id=dataset, digital_object_identifier="10.48670/moi-00019",
                             versions=[types.SimpleNamespace(label="202406", parts=[part])])
  return types.SimpleNamespace(products=[types.SimpleNamespace(product_id="P1", title="Product one", datasets=[ds])])


def test_the_catalogue_gives_the_grid_units_doi_and_the_number_of_time_steps():
  info = cp.info_from_catalogue(catalogue(), "cmems_x", "no3")
  assert info == {"product_id": "P1", "product_title": "Product one", "doi": "https://doi.org/10.48670/moi-00019",
                  "units": "mmol m-3", "version": "202406", "lon_step": 0.25, "lat_step": 0.25,
                  "lon_range": (-180.0, 179.75), "lat_range": (-80.0, 90.0), "n_times": 3}


def test_a_dataset_or_variable_the_catalogue_does_not_describe_is_an_error():
  with pytest.raises(ValueError, match="not in the Copernicus Marine catalogue"):
    cp.info_from_catalogue(catalogue(), "cmems_other", "no3")
  with pytest.raises(ValueError, match="no gridded longitude/latitude"):
    cp.info_from_catalogue(catalogue(), "cmems_x", "po4")


# ---- the real services (network) ----

@pytest.mark.network
@pytest.mark.skipif(os.environ.get("OM_OFFLINE") == "1", reason="OM_OFFLINE=1")
def test_the_albanian_eez_is_fetched_from_marine_regions_and_windowed():
  layers = cp.load_layers()
  geom, src = cp.fetch_geometry("MRGID:5670", cp.find_layer(layers, "mr_eez"))
  x0, y0, x1, y1 = geom.bounds
  assert 18 < x0 < 20 and 39 < y0 < 40 and 19 < x1 < 21 and 41 < y1 < 43 and src["kind"] == "reference"
  assert len(cp.windows(geom, 0.25, 0.25, (-180, 179.75), (-80, 90))) == 1


@pytest.mark.network
@pytest.mark.skipif(os.environ.get("OM_OFFLINE") == "1", reason="OM_OFFLINE=1")
def test_a_sanctuary_is_one_row_of_the_published_places_parquet():
  geom, src = cp.fetch_geometry("NMS:CINMS", cp.find_layer(cp.load_layers(), "places"))
  assert src["kind"] == "vector" and -121 < geom.bounds[0] < -120 and 33 < geom.bounds[1] < 34


@pytest.mark.network
@pytest.mark.skipif(os.environ.get("OM_OFFLINE") == "1", reason="OM_OFFLINE=1")
def test_the_catalogue_describes_the_biogeochemistry_hindcast_without_a_login():
  info = cp.dataset_info("cmems_mod_glo_bgc_my_0.25deg_P1M-m", "no3")
  assert info["product_id"] == "GLOBAL_MULTIYEAR_BGC_001_029" and info["lon_step"] == 0.25 and info["units"] == "mmol m-3"
