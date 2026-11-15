"""Plot-mean NDVI for Lipa Plot A from the AppEEARS HLS v2.0 area request (scripts/appeears-lipa.py, task
"hls_plot_a"): NDVI from HLSS30_VI / HLSL30_VI, cloud mask (Fmask) from HLSS30 / HLSL30. One row per overpass day
and sensor (S30 = Sentinel-2, L30 = Landsat).

Rules (sources read 2026-11-15):
- NDVI raw int16, scale 0.0001, fill -19999, valid -1..1 (AppEEARS /api/product/HLSS30_VI.020, HLSL30_VI.020).
- Fmask decoded with the bundle's HLS*-020-Fmask-lookup.csv. A pixel is CLEAR when Cloud, Adjacent to cloud/shadow,
  Cloud shadow, Snow/ice and Water are all "No" and the aerosol level is not "High aerosol" (our rule, UNVERIFIED).
- AppEEARS drops output files that hold only fill values (bundle README); a day with an Fmask file but no NDVI
  file is therefore a day whose NDVI is all fill. The script checks how many of those days had clear plot pixels.
- Plot pixels: 30 m UTM 51N cells whose centre lies inside "Lipa Plot A.geojson" (corners converted to UTM 51N
  with the standard transverse Mercator series, WGS84). The plot corners were drawn on a map, not GPS.
- Plot value: mean of clear pixels with valid NDVI, only if they are >= MIN_SHARE of the plot pixels (heuristic).
- Acquisition time: from the granule IDs in the bundle's granule list (e.g. HLS.S30.T51PTR.2024001T022051 =
  2024-01-01 02:20:51 UTC); the earliest granule of the day and sensor is reported.

Run from the repo root:
  "docs/Data Pipeline/.venv/Scripts/python.exe" -I scripts/process-hls-ndvi-plot-a.py
Output: docs/Data Pipeline/data/external/hls_plot_a/hls_ndvi_plot_a.csv (+ processing.json)
"""

from __future__ import annotations

import csv
import glob
import json
import math
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script folder from sys.path
from tiffmini import read_tiff  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
PIPE = REPO / "docs" / "Data Pipeline"
DIR = PIPE / "data" / "external" / "hls_plot_a"
FILES = DIR / "files"
PLOT = PIPE / "Lipa Plot A.geojson"
SCALE, FILL = 0.0001, -19999
MIN_SHARE = 0.5
MANILA = ZoneInfo("Asia/Manila")
SENSORS = {"S30": ("HLSS30_VI", "HLSS30"), "L30": ("HLSL30_VI", "HLSL30")}


def utm(lat: float, lon: float, zone: int = 51) -> tuple[float, float]:
    """WGS84 lat/lon (degrees) -> UTM easting/northing (m), northern hemisphere (Krüger series, 3 terms)."""
    a, f, k0 = 6378137.0, 1 / 298.257223563, 0.9996
    n = f / (2 - f)
    big_a = a / (1 + n) * (1 + n**2 / 4 + n**4 / 64)
    alpha = (n / 2 - 2 * n**2 / 3 + 5 * n**3 / 16, 13 * n**2 / 48 - 3 * n**3 / 5, 61 * n**3 / 240)
    phi, lam = math.radians(lat), math.radians(lon - (zone * 6 - 183))
    e = 2 * math.sqrt(n) / (1 + n)
    t = math.sinh(math.atanh(math.sin(phi)) - e * math.atanh(e * math.sin(phi)))
    xi, eta = math.atan2(t, math.cos(lam)), math.atanh(math.sin(lam) / math.sqrt(1 + t * t))
    x = eta + sum(alpha[j] * math.cos(2 * (j + 1) * xi) * math.sinh(2 * (j + 1) * eta) for j in range(3))
    y = xi + sum(alpha[j] * math.sin(2 * (j + 1) * xi) * math.cosh(2 * (j + 1) * eta) for j in range(3))
    return 500000 + k0 * big_a * x, k0 * big_a * y


def inside(x: float, y: float, ring: list[tuple[float, float]]) -> bool:
    hit = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def clear_values(lookup_csv: Path) -> tuple[list[int], list[dict[str, str]]]:
    with lookup_csv.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    ok = [int(r["Value"]) for r in rows
          if all(r[k] == "No" for k in ("Cloud", "Adjacent to cloud/shadow", "Cloud shadow", "Snow/ice", "Water"))
          and r["Aerosol level"] != "High aerosol"]
    return ok, rows


def main() -> int:
    geo = json.loads(PLOT.read_text(encoding="utf-8"))
    ring = [utm(lat, lon) for lon, lat in geo["features"][0]["geometry"]["coordinates"][0][:-1]]
    granule_times: dict[tuple[str, str], list[str]] = {}
    for line in (FILES / "terra-lipa-plot-a-hls-ndvi-2024-2025-granule-list.txt").read_text(encoding="utf-8").split():
        m = re.search(r"HLS\.(S30|L30)\.T\w+\.(\d{7})T(\d{6})\.v2\.0", line)
        if m:
            granule_times.setdefault((m.group(1), m.group(2)), []).append(m.group(3))

    rows, lookups, mask_checks = [], {}, {}
    for sensor, (vi, refl) in SENSORS.items():
        ok_values, lookups[refl] = clear_values(FILES / f"{refl}-020-Fmask-lookup.csv")
        plot_mask = None
        no_ndvi_but_clear = 0
        for fm_path in sorted(glob.glob(str(FILES / f"{refl}.020_*" / f"{refl}.020_Fmask_doy*_aid0001_*.tif"))):
            doy = re.search(r"_doy(\d{7})_", fm_path).group(1)
            fm, g_fm, _ = read_tiff(Path(fm_path))
            if plot_mask is None:
                x0, y0, sx, sy = g_fm
                plot_mask = np.array([[inside(x0 + (j + 0.5) * sx, y0 - (i + 0.5) * sy, ring)
                                       for j in range(fm.shape[1])] for i in range(fm.shape[0])])
                grid = g_fm
            if g_fm != grid or fm.shape != plot_mask.shape:
                raise ValueError(f"{sensor} {doy}: grid differs from the first file")
            clear = plot_mask & np.isin(fm.astype(int), ok_values)
            nd_hits = glob.glob(str(FILES / f"{vi}.020_*" / f"{vi}.020_NDVI_doy{doy}_aid0001_*.tif"))
            valid = np.zeros_like(clear)
            nd = None
            if nd_hits:
                nd, g_nd, _ = read_tiff(Path(nd_hits[0]))
                if g_nd != grid or nd.shape != plot_mask.shape:
                    raise ValueError(f"{sensor} {doy}: NDVI grid differs from Fmask")
                valid = clear & (nd != FILL) & (np.abs(nd * SCALE) <= 1)
            elif clear.any():
                no_ndvi_but_clear += 1
            n_plot, n_clear, n_valid = int(plot_mask.sum()), int(clear.sum()), int(valid.sum())
            day = datetime.strptime(doy, "%Y%j").date()
            times = sorted(granule_times.get((sensor, doy), []))
            t_utc = (datetime.combine(day, datetime.min.time(), timezone.utc)
                     + timedelta(hours=int(times[0][:2]), minutes=int(times[0][2:4]), seconds=int(times[0][4:]))) if times else None
            ok = n_valid >= MIN_SHARE * n_plot
            rows.append({
                "sensor": sensor,
                "date_utc": day.isoformat(),
                "acquisition_utc": t_utc.strftime("%Y-%m-%dT%H:%M:%SZ") if t_utc else "",
                "local_date": t_utc.astimezone(MANILA).date().isoformat() if t_utc else "",
                "n_plot_pixels": n_plot,
                "n_clear": n_clear,
                "n_ndvi_valid": n_valid,
                "ndvi_file": "yes" if nd_hits else "no",
                "ndvi_mean_valid": round(float(nd[valid].mean() * SCALE), 4) if n_valid else "",
                "ndvi_plot": round(float(nd[valid].mean() * SCALE), 4) if ok and n_valid else "",
            })
        mask_checks[sensor] = {"days_without_ndvi_file_but_clear_plot_pixels": no_ndvi_but_clear}

    rows.sort(key=lambda r: (r["date_utc"], r["sensor"]))
    with (DIR / "hls_ndvi_plot_a.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    git = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
    (DIR / "processing.json").write_text(json.dumps({
        "script": "scripts/process-hls-ndvi-plot-a.py",
        "run_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_commit": git,
        "plot": str(PLOT.relative_to(REPO)), "plot_corners_utm51n": [[round(x, 1), round(y, 1)] for x, y in ring],
        "plot_pixels": int(plot_mask.sum()), "grid": list(grid),
        "clear_rule": "Fmask Cloud, Adjacent to cloud/shadow, Cloud shadow, Snow/ice, Water all 'No'; Aerosol level not 'High aerosol'",
        "min_share": MIN_SHARE, "ndvi": {"scale": SCALE, "fill": FILL},
        "checks": mask_checks,
        "rows": len(rows), "rows_with_plot_value": sum(1 for r in rows if r["ndvi_plot"] != ""),
        "fmask_lookups": lookups,
    }, indent=1), encoding="utf-8")
    print(f"{len(rows)} overpass days, {sum(1 for r in rows if r['ndvi_plot'] != '')} with a plot value; "
          f"plot pixels {int(plot_mask.sum())}; checks {mask_checks}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
