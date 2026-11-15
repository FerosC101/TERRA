"""Fetch the GPM IMERG Final monthly (GPM_3IMERGM V07) record over the Lipa AOI and build a
monthly rain normal, using the same grid cells and the same 2x2 IDW extraction as the
pipeline's daily IMERG (docs/Data Pipeline). The pipeline code is imported, not changed.

Run from the repo root with the pipeline's virtual environment:
  "docs/Data Pipeline/.venv/Scripts/python.exe" -I scripts/fetch-imerg-monthly-normal.py

Outputs (docs/Data Pipeline/data/external/imerg_monthly/):
  raw/*.subset.dap.nc4        OPeNDAP subsets, unchanged as served by NASA
  request.json                CMR query, OPeNDAP constraint, granule list, run info
  imerg_monthly_lipa_<y0>_<y1>.csv         one row per month
  imerg_monthly_normal_lipa_<y0>_<y1>.csv  one row per calendar month (the normal)
"""

from __future__ import annotations

import calendar
import csv
import json
import statistics
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PIPE = REPO / "docs" / "Data Pipeline"
sys.path.insert(0, str(PIPE))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(PIPE / ".env")  # token is read by EarthdataClient; never printed

from collectors.earthdata_client import EarthdataClient, build_gpm_opendap_subset_url  # noqa: E402
from processors.raster_processor import extract_aoi_from_netcdf  # noqa: E402
from processors.spatial_processor import load_and_validate_aoi  # noqa: E402

SHORT_NAME = "GPM_3IMERGM"
YEAR_START, YEAR_END = 2001, 2023
VARIABLES = ("precipitation", "gaugeRelativeWeighting")
OUT = PIPE / "data" / "external" / "imerg_monthly"
RAW = OUT / "raw"


def git_info() -> dict[str, str | bool]:
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
    dirty = bool(subprocess.run(["git", "status", "--porcelain"], cwd=REPO, capture_output=True, text=True).stdout.strip())
    return {"commit": head, "dirty_working_tree": dirty}


def subset_url(opendap_url: str, bbox: list[float]) -> str:
    # Same index formula as the daily pipeline (earthdata_client.build_gpm_opendap_subset_url).
    # The monthly HDF5 keeps its variables in the /Grid group, so each path gets that prefix.
    url = build_gpm_opendap_subset_url(opendap_url, bbox, variables=VARIABLES)
    base, ce = url.split("?dap4.ce=", 1)
    return base + "?dap4.ce=" + ";".join("/Grid" + part for part in ce.split(";"))


def main() -> int:
    aoi = load_and_validate_aoi(PIPE / "config" / "farm_config.yaml", base_dir=PIPE)
    client = EarthdataClient()
    if not client.has_credentials():
        print("EARTHDATA_TOKEN missing in docs/Data Pipeline/.env", file=sys.stderr)
        return 1

    temporal = f"{YEAR_START}-01-01T00:00:00Z,{YEAR_END}-12-31T23:59:59Z"
    granules = client.search_cmr_granules(SHORT_NAME, aoi.bbox, temporal, page_size=100, max_pages=5)
    by_month: dict[str, dict] = {}
    for g in granules:
        key = str(g["time_start"])[:7]
        if key in by_month:
            print(f"Duplicate granule for {key}: {g['title']}", file=sys.stderr)
            return 1
        by_month[key] = g
    expected = [f"{y}-{m:02d}" for y in range(YEAR_START, YEAR_END + 1) for m in range(1, 13)]
    missing = [k for k in expected if k not in by_month]
    extra = sorted(set(by_month) - set(expected))
    print(f"CMR granules: {len(granules)}; months missing: {missing or 'none'}; outside range: {extra or 'none'}")

    RAW.mkdir(parents=True, exist_ok=True)
    rows = []
    for key in expected:
        g = by_month.get(key)
        if g is None:
            continue
        if not g.get("opendap_url"):
            print(f"{key}: no OPeNDAP link; skipped", file=sys.stderr)
            continue
        url = subset_url(g["opendap_url"], aoi.bbox)
        stem = Path(str(g["title"]).split(":")[-1]).stem
        dest = RAW / f"{stem}.subset.dap.nc4"
        if not dest.exists() or dest.stat().st_size == 0:
            client.download_authenticated(url, dest)
        ex = extract_aoi_from_netcdf(dest, aoi.bbox, aoi.centroid_lon, aoi.centroid_lat, list(VARIABLES))
        p = ex["precipitation"]
        if p["unit"] != "mm/hr":
            print(f"{key}: unexpected unit {p['unit']!r}; stopping", file=sys.stderr)
            return 1
        y, m = int(key[:4]), int(key[5:7])
        days = calendar.monthrange(y, m)[1]
        rate = p["value"]
        rows.append(
            {
                "year": y,
                "month": m,
                "days_in_month": days,
                "precip_rate_mm_hr_idw": rate,
                "precip_mm_month": None if rate is None else rate * 24 * days,
                "nearest_pixel_mm_hr": p["nearest_pixel_value"],
                "neighborhood_max_mm_hr": p["neighborhood_max"],
                "valid_pixels": p["valid_pixel_count"],
                "total_pixels": p["total_pixel_count"],
                "extraction_mode": p["extraction_mode"],
                "grid_cell_center": json.dumps(p["grid_cell_center"]),
                "gauge_relative_weighting_pct_idw": ex.get("gaugeRelativeWeighting", {}).get("value"),
                "granule": g["title"],
            }
        )
        print(f"{key}: {rate} mm/hr -> {rows[-1]['precip_mm_month']} mm/month")

    tag = f"{YEAR_START}_{YEAR_END}"
    monthly_csv = OUT / f"imerg_monthly_lipa_{tag}.csv"
    with monthly_csv.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    normal_csv = OUT / f"imerg_monthly_normal_lipa_{tag}.csv"
    with normal_csv.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["month", "n_years", "mean_mm_month", "median_mm_month", "min_mm_month", "max_mm_month", "stdev_mm_month"])
        for m in range(1, 13):
            vals = [r["precip_mm_month"] for r in rows if r["month"] == m and r["precip_mm_month"] is not None]
            w.writerow(
                [m, len(vals), statistics.fmean(vals), statistics.median(vals), min(vals), max(vals),
                 statistics.stdev(vals) if len(vals) > 1 else None]
            )

    request = {
        "script": "scripts/fetch-imerg-monthly-normal.py",
        "run_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git": git_info(),
        "product": {"short_name": SHORT_NAME, "version": "07", "provider": "NASA GES DISC"},
        "cmr_query": {"short_name": SHORT_NAME, "bounding_box": aoi.bbox, "temporal": temporal},
        "opendap_variables": ["/Grid/" + v for v in VARIABLES],
        "aoi": {"location_id": aoi.location_id, "bbox": aoi.bbox,
                "centroid": {"lat": aoi.centroid_lat, "lon": aoi.centroid_lon}},
        "extraction": "pipeline processors.raster_processor.extract_aoi_from_netcdf (2x2 IDW around centroid)",
        "conversion": "precip_mm_month = precipitation (mm/hr, monthly mean rate) * 24 * days_in_month",
        "months_expected": len(expected),
        "months_written": len(rows),
        "months_missing_in_cmr": missing,
        "granules": [by_month[k] for k in expected if k in by_month],
    }
    (OUT / "request.json").write_text(json.dumps(request, indent=1), encoding="utf-8")
    print(f"Wrote {monthly_csv.name} ({len(rows)} rows), {normal_csv.name}, request.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
