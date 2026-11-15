"""Field-mean NDVI for the Lipa Cropland AOI from the AppEEARS MOD13Q1/MYD13Q1 v061 area request
(scripts/appeears-lipa.py, task "modis"). Reads the downloaded GeoTIFFs unchanged; writes one row per
composite and product.

Rules (all from the AppEEARS layer metadata, /api/product, read 2026-11-15, and the bundle's lookup CSVs):
- NDVI raw int16; fill -3000; scale 0.0001; valid range -0.2..1.0.
- pixel_reliability and VI_Quality: decoded with the bundle's *-lookup.csv files (meanings copied into
  processing.json). A pixel is USABLE when NDVI is valid and either reliability is 0 ("Good data") or
  reliability is 1 ("Marginal") with VI_Quality "Adjacent cloud detected" = No, "Mixed Clouds" = No and
  "Possible shadow" = No. Accepting those marginal pixels is a heuristic (UNVERIFIED): at Lipa they are
  marginal mostly for average/high aerosol or decreasing VI usefulness, not for cloud.
- AOI pixels: the cells AppEEARS returned as non-fill NDVI (it masks cells outside the polygon).
- Field value: mean of usable pixels, only if usable pixels are at least MIN_GOOD_SHARE of the AOI pixels
  (heuristic, UNVERIFIED); otherwise blank, with the counts kept. Good-only means are kept for comparison.
- Period: the nominal 16-day window from the file's start day (doyYYYYDDD) + 15 days. The actual
  acquisition days of the pixels (composite_day_of_the_year) are reported as pixel_day_min/max.

Run from the repo root:
  "docs/Data Pipeline/.venv/Scripts/python.exe" -I scripts/process-modis-ndvi-lipa.py
Output: docs/Data Pipeline/data/external/modis_ndvi/modis_ndvi_lipa.csv (+ processing.json)
"""

from __future__ import annotations

import csv
import glob
import json
import re
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script folder from sys.path
from tiffmini import read_tiff  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
DIR = REPO / "docs" / "Data Pipeline" / "data" / "external" / "modis_ndvi"
FILES = DIR / "files"
FILL, SCALE, VMIN, VMAX = -3000, 0.0001, -0.2, 1.0
MIN_GOOD_SHARE = 0.5


def layer(product: str, name: str, doy: str) -> Path:
    hits = glob.glob(str(FILES / f"{product}.061_*" / f"{product}.061__250m_16_days_{name}_doy{doy}_aid0001.tif"))
    if len(hits) != 1:
        raise FileNotFoundError(f"{product} {name} doy{doy}: {len(hits)} files")
    return Path(hits[0])


def lookup(product: str, layer_name: str) -> list[dict[str, str]]:
    f = FILES / f"{product}-061-250m-16-days-{layer_name}-lookup.csv"
    with f.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def clear_mask(q: np.ndarray, vi_lookup: list[dict[str, str]]) -> np.ndarray:
    """True where VI_Quality reports no adjacent cloud, no mixed clouds and no shadow."""
    clear_values = [int(r["Value"]) for r in vi_lookup
                    if r["Adjacent cloud detected"] == "No" and r["Mixed Clouds"] == "No" and r["Possible shadow"] == "No"]
    return np.isin(q.astype(int), clear_values)


def main() -> int:
    rows, lookups = [], {}
    for product in ("MOD13Q1", "MYD13Q1"):
        lookups[product] = {"pixel_reliability": lookup(product, "pixel-reliability"), "VI_Quality": lookup(product, "VI-Quality")}
        doys = sorted({re.search(r"_doy(\d{13})_", p).group(1)
                       for p in glob.glob(str(FILES / f"{product}.061_*" / "*_NDVI_doy*.tif"))})
        for doy in doys:
            ndvi, g1, nd1 = read_tiff(layer(product, "NDVI", doy))
            rel, g2, _ = read_tiff(layer(product, "pixel_reliability", doy))
            cdoy, g3, _ = read_tiff(layer(product, "composite_day_of_the_year", doy))
            viq, g4, _ = read_tiff(layer(product, "VI_Quality", doy))
            if not (g1 == g2 == g3 == g4) or not (ndvi.shape == rel.shape == cdoy.shape == viq.shape):
                raise ValueError(f"{product} {doy}: layers are on different grids")
            aoi = ndvi != FILL
            valid = aoi & (ndvi * SCALE >= VMIN) & (ndvi * SCALE <= VMAX)
            good = valid & (rel == 0)
            marginal = valid & (rel == 1)
            usable = good | (marginal & clear_mask(viq, lookups[product]["VI_Quality"]))
            start = datetime.strptime(doy[:7], "%Y%j").date()
            year = start.year
            used_days = cdoy[usable]
            # composite_day_of_the_year is a day of `year`; a value below the start day would mean the next year.
            to_date = lambda d: (date(year, 1, 1) + timedelta(days=int(d) - 1)) if d >= start.timetuple().tm_yday else (date(year + 1, 1, 1) + timedelta(days=int(d) - 1))
            n_aoi, n_good, n_usable = int(aoi.sum()), int(good.sum()), int(usable.sum())
            ok = n_aoi > 0 and n_usable >= MIN_GOOD_SHARE * n_aoi
            rows.append({
                "product": product,
                "file_doy": doy[:7],
                "composite_start": start.isoformat(),
                "composite_end_nominal": (start + timedelta(days=15)).isoformat(),
                "n_aoi_pixels": n_aoi,
                "n_good": n_good,
                "n_marginal": int(marginal.sum()),
                "n_usable": n_usable,
                "n_reliability_2": int((aoi & (rel == 2)).sum()),
                "n_reliability_3": int((aoi & (rel == 3)).sum()),
                "ndvi_mean_good": round(float(ndvi[good].mean() * SCALE), 4) if n_good else "",
                "ndvi_mean_good_or_marginal": round(float(ndvi[good | marginal].mean() * SCALE), 4) if (good | marginal).any() else "",
                "ndvi_mean_all_valid": round(float(ndvi[valid].mean() * SCALE), 4) if valid.any() else "",
                "ndvi_field": round(float(ndvi[usable].mean() * SCALE), 4) if ok else "",
                "pixel_day_min": to_date(used_days.min()).isoformat() if n_usable else "",
                "pixel_day_max": to_date(used_days.max()).isoformat() if n_usable else "",
            })

    rows.sort(key=lambda r: (r["composite_start"], r["product"]))
    with (DIR / "modis_ndvi_lipa.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    git = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
    (DIR / "processing.json").write_text(json.dumps({
        "script": "scripts/process-modis-ndvi-lipa.py",
        "run_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_commit": git,
        "ndvi": {"fill": FILL, "scale": SCALE, "valid_range": [VMIN, VMAX], "source": "AppEEARS /api/product/MOD13Q1.061 and MYD13Q1.061"},
        "pixel_used_when": "NDVI valid and (pixel_reliability == 0, or pixel_reliability == 1 with VI_Quality adjacent cloud, mixed clouds and shadow all 'No')",
        "min_good_share": MIN_GOOD_SHARE,
        "lookups": lookups,
        "rows": len(rows),
        "rows_with_field_value": sum(1 for r in rows if r["ndvi_field"] != ""),
    }, indent=1), encoding="utf-8")
    print(f"{len(rows)} composites, {sum(1 for r in rows if r['ndvi_field'] != '')} with a field value")
    return 0


if __name__ == "__main__":
    sys.exit(main())
