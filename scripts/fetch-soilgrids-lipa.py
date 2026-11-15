"""Fetch ISRIC SoilGrids 2.0 soil water retention and texture over the Lipa Cropland AOI.

Why: the Living Field Model uses an indicative soil (data/soils.ts, FC 0.32 m3/m3) and 83 % of the real
SMAP values at Lipa are above it (F-012). SoilGrids gives a published, model-estimated value per 250 m cell.

Source: ISRIC SoilGrids 2.0 WCS (https://maps.isric.org), CC-BY-4.0. Water retention layers:
Turek et al. 2023, Int. Soil Water Conserv. Res. 11(2) 225-239, doi:10.1016/j.iswcr.2022.08.001.
Mapped units (ISRIC SoilGrids FAQ, read 2026-11-15): wv* 1e-3 cm3/cm3; clay/sand/silt g/kg; bdod cg/cm3.
These are MODEL ESTIMATES (quantile random forest), not measurements of this field.

The ISRIC point-query REST API timed out on 2026-11-15, so each coverage is requested through WCS,
reprojected by the server to EPSG:4326 (MapServer default resampling), over a bbox around the AOI.
Cells whose centre lies inside the AOI polygon are averaged.

Run from the repo root (stdlib + numpy only):
  "docs/Data Pipeline/.venv/Scripts/python.exe" -I scripts/fetch-soilgrids-lipa.py
  ... scripts/fetch-soilgrids-lipa.py --aoi "Lipa Plot A.geojson" --name lipa_plot_a   (another polygon)
For a polygon smaller than one cell (no cell centre inside), the cell nearest the polygon's vertex mean is used.

Outputs (docs/Data Pipeline/data/external/soilgrids/):
  raw/<coverage>.tif           server responses, unchanged
  soilgrids_lipa_cells.csv     every cell value inside the AOI
  soilgrids_lipa_summary.csv   per coverage: n cells, mean, min, max (converted units)
  request.json
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script folder from sys.path
from tiffmini import read_tiff  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
PIPE = REPO / "docs" / "Data Pipeline"
AOI_FILE = PIPE / "Lipa Cropland.geojson"
OUT = PIPE / "data" / "external" / "soilgrids"
RAW = OUT / "raw"

BBOX = (121.17, 13.97, 121.20, 14.00)  # lon_min, lat_min, lon_max, lat_max; contains the Lipa Cropland AOI bbox
DEPTHS = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm"]
# property -> (statistics, divisor to the converted unit, converted unit)
PROPS = {
    "wv0010": (["mean", "Q0.05", "Q0.95"], 1000, "m3/m3"),
    "wv0033": (["mean", "Q0.05", "Q0.95"], 1000, "m3/m3"),
    "wv1500": (["mean", "Q0.05", "Q0.95"], 1000, "m3/m3"),
    "clay": (["mean"], 10, "%"),
    "sand": (["mean"], 10, "%"),
    "silt": (["mean"], 10, "%"),
    "bdod": (["mean"], 100, "g/cm3"),
}
WCS = "https://maps.isric.org/mapserv?map=/map/{prop}.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage" \
      "&COVERAGEID={cov}&FORMAT=image/tiff&SUBSET=long({x0},{x1})&SUBSET=lat({y0},{y1})" \
      "&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326"


def inside(lon: float, lat: float, rings: list[list[list[float]]]) -> bool:
    """Even-odd ray casting over every ring of the AOI."""
    hit = False
    for ring in rings:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
            if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
                hit = not hit
    return hit


def aoi_rings(aoi_file: Path) -> list[list[list[float]]]:
    g = json.loads(aoi_file.read_text(encoding="utf-8"))
    rings = []
    for f in g.get("features", [g]):
        geom = f["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for poly in polys:
            rings.extend([[list(p[:2]) for p in ring] for ring in poly])
    return rings


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--aoi", default=None, help="GeoJSON file name in docs/Data Pipeline (default: Lipa Cropland.geojson)")
    ap.add_argument("--name", default="lipa", help="output name: soilgrids_<name>_*.csv, raw/<name>/ for non-default AOIs")
    args = ap.parse_args()
    aoi_file = PIPE / args.aoi if args.aoi else AOI_FILE
    rings = aoi_rings(aoi_file)
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    if args.aoi:
        bbox = (round(min(xs) - 0.005, 4), round(min(ys) - 0.005, 4), round(max(xs) + 0.005, 4), round(max(ys) + 0.005, 4))
        raw = RAW / args.name
        out_dir = OUT / args.name
    else:
        bbox, raw, out_dir = BBOX, RAW, OUT
    centre = (sum(xs) / len(xs), sum(ys) / len(ys))
    raw.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    cells, summary, urls = [], [], {}
    for prop, (stats, div, unit) in PROPS.items():
        for depth in DEPTHS:
            for stat in stats:
                cov = f"{prop}_{depth}_{stat}"
                url = WCS.format(prop=prop, cov=cov, x0=bbox[0], x1=bbox[2], y0=bbox[1], y1=bbox[3])
                urls[cov] = url
                dest = raw / f"{cov}.tif"
                if not dest.exists() or dest.stat().st_size == 0:
                    with urllib.request.urlopen(url, timeout=180) as r:
                        if "tiff" not in r.headers.get("Content-Type", ""):
                            raise RuntimeError(f"{cov}: got {r.headers.get('Content-Type')}")
                        dest.write_bytes(r.read())
                arr, (x0, y0, sx, sy), nodata = read_tiff(dest)
                vals = []
                picked = [(i, j) for i in range(arr.shape[0]) for j in range(arr.shape[1])
                          if inside(x0 + (j + 0.5) * sx, y0 - (i + 0.5) * sy, rings)]
                selection = "cell centres inside the polygon"
                if not picked:  # polygon smaller than a cell
                    picked = [min(((i, j) for i in range(arr.shape[0]) for j in range(arr.shape[1])),
                                  key=lambda ij: (x0 + (ij[1] + 0.5) * sx - centre[0]) ** 2 + (y0 - (ij[0] + 0.5) * sy - centre[1]) ** 2)]
                    selection = "nearest cell to the polygon's vertex mean (no cell centre inside)"
                for i, j in picked:
                    lon, lat = x0 + (j + 0.5) * sx, y0 - (i + 0.5) * sy
                    v = arr[i, j]
                    if nodata is not None and v == nodata:
                        continue
                    vals.append(v / div)
                    cells.append({"coverage": cov, "lon": round(lon, 6), "lat": round(lat, 6),
                                  "raw_value": int(v), "value": v / div, "unit": unit})
                summary.append({
                    "property": prop, "depth": depth, "statistic": stat, "unit": unit, "n_cells": len(vals),
                    "aoi_mean": round(float(np.mean(vals)), 4) if vals else "",
                    "aoi_min": round(float(np.min(vals)), 4) if vals else "",
                    "aoi_max": round(float(np.max(vals)), 4) if vals else "",
                    "cell_size_deg": f"{sx:.6f}x{sy:.6f}",
                    **({"selection": selection} if args.aoi else {}),
                })
                print(f"{cov:28s} n={len(vals):3d} mean={summary[-1]['aoi_mean']}")

    for name, rows in ((f"soilgrids_{args.name}_cells.csv", cells), (f"soilgrids_{args.name}_summary.csv", summary)):
        with (out_dir / name).open("w", newline="", encoding="utf-8") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            wr.writeheader()
            wr.writerows(rows)
    git = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
    dirty = bool(subprocess.run(["git", "status", "--porcelain"], cwd=REPO, capture_output=True, text=True).stdout.strip())
    (out_dir / "request.json").write_text(json.dumps({
        "script": "scripts/fetch-soilgrids-lipa.py",
        "run_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_commit": git, "git_dirty": dirty,
        "product": "ISRIC SoilGrids 2.0 (250 m), WCS https://maps.isric.org, licence CC-BY-4.0",
        "water_retention_reference": "Turek et al. 2023, doi:10.1016/j.iswcr.2022.08.001",
        "provenance": "model estimate (quantile random forest), not a measurement of this field",
        "bbox_lon_lat": bbox, "aoi": str(aoi_file.relative_to(REPO)),
        "aggregation": "mean of cells whose centre lies inside the AOI polygon, after server reprojection to EPSG:4326; "
                       "if none, the cell nearest the polygon's vertex mean",
        "unit_conversion": {p: f"raw / {d} -> {u}" for p, (_, d, u) in PROPS.items()},
        "urls": urls,
    }, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
