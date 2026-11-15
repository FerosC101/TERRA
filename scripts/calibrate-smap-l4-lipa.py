"""Calibrate the SMAP L4-based models for Lipa on SMAP L4 history (2015-03-31..2023-12-31), real data only.

1. Moisture-divergence fallback (D-015): per month of the window's last day,
   - topsoil limit = 5th percentile of 14-day topsoil (0-5 cm) changes  (alarm when the change is at or below it),
   - root-zone limit = median of |14-day root-zone (0-100 cm) changes| (alarm needs the root zone to move at most this).
   Held-out check: fitted on 2015-2020, flagged share measured on 2021-2023.
2. Living Field Model rescaling (D-017): L4's 2nd and 98th percentiles mapped linearly onto the soil's range:
   topsoil -> [FC - TEW/(1000*Ze), FC]; root zone -> [WP, FC] (soil: LIPA_SOILGRIDS_SOIL values below).

Run from the repo root (after scripts/process-smap-l4-lipa.py --task smap_l4_history --name lipa_2015_2023 --id lipa_cropland_001_centroid):
  "docs/Data Pipeline/.venv/Scripts/python.exe" -I scripts/calibrate-smap-l4-lipa.py
Output: docs/Data Pipeline/data/external/smap_l4_history/smap_l4_calibration_lipa.json
"""

from __future__ import annotations

import csv
import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[1]
DIR = REPO / "docs" / "Data Pipeline" / "data" / "external" / "smap_l4_history"
W = 14
# LIPA_SOILGRIDS_SOIL (data/soils.ts): fc 0.321, wp 0.238, Ze 0.1 m, TEW 20.9 mm.
FC, WP, ZE, TEW = 0.321, 0.238, 0.1, 20.9
SURF_LOW = FC - TEW / (1000 * ZE)


def load(name: str) -> tuple[list[str], np.ndarray, np.ndarray]:
    with (DIR / f"smap_l4_daily_{name}.csv").open(encoding="utf-8") as fh:
        rows = [r for r in csv.DictReader(fh) if r["sm_surface_mean"] and r["sm_rootzone_mean"]]
    return [r["local_date"] for r in rows], np.array([float(r["sm_surface_mean"]) for r in rows]), np.array([float(r["sm_rootzone_mean"]) for r in rows])


def changes(dates: list[str], s: np.ndarray, r: np.ndarray) -> list[tuple[str, float, float]]:
    idx = {d: i for i, d in enumerate(dates)}
    out = []
    for i, d in enumerate(dates):
        prev = (datetime.fromisoformat(d) - timedelta(days=W)).date().isoformat()
        j = idx.get(prev)
        if j is not None:
            out.append((d, float(s[i] - s[j]), float(r[i] - r[j])))
    return out


def limits(ch: list[tuple[str, float, float]], years: range) -> tuple[list[float], list[float]]:
    drop, deep = [], []
    for m in range(1, 13):
        sel = [(ds, dr) for d, ds, dr in ch if int(d[:4]) in years and int(d[5:7]) == m]
        drop.append(round(-float(np.percentile([x for x, _ in sel], 5)), 4))
        deep.append(round(float(np.median([abs(y) for _, y in sel])), 4))
    return drop, deep


def flagged(ch: list[tuple[str, float, float]], years: range, drop: list[float], deep: list[float]) -> dict[str, float]:
    sel = [(int(d[5:7]), ds, dr) for d, ds, dr in ch if int(d[:4]) in years]
    n = sum(1 for m, ds, dr in sel if ds <= -drop[m - 1] and abs(dr) <= deep[m - 1])
    return {"windows": len(sel), "flagged_share": round(n / len(sel), 4)}


def main() -> int:
    dates, s, r = load("lipa_2015_2023")
    ch = changes(dates, s, r)
    fit, test, all_y = range(2015, 2021), range(2021, 2024), range(2015, 2024)
    d_fit, k_fit = limits(ch, fit)
    drop, deep = limits(ch, all_y)
    s2, s98 = np.percentile(s, [2, 98])
    r2, r98 = np.percentile(r, [2, 98])
    lin = lambda lo, hi, a, b: {"b": round((b - a) / (hi - lo), 4), "a": round(a - (b - a) / (hi - lo) * lo, 4)}  # noqa: E731
    git = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
    out = {
        "script": "scripts/calibrate-smap-l4-lipa.py",
        "run_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_commit": git,
        "source": "SMAP L4 SPL4SMGP v008 daily Manila means at the AOI centroid, smap_l4_daily_lipa_2015_2023.csv",
        "days": len(dates), "first": dates[0], "last": dates[-1], "window_days": W,
        "moisture": {
            "min_surface_drop_by_month": drop, "max_deep_change_by_month": deep,
            "flagged_share_2015_2023": flagged(ch, all_y, drop, deep),
            "heldout": {"fit_years": "2015-2020", "test_years": "2021-2023",
                        "on_fit_years": flagged(ch, fit, d_fit, k_fit), "on_test_years": flagged(ch, test, d_fit, k_fit)},
        },
        "rescale": {
            "l4_surface_p2_p98": [round(float(s2), 4), round(float(s98), 4)],
            "l4_root_p2_p98": [round(float(r2), 4), round(float(r98), 4)],
            "soil": {"fc": FC, "wp": WP, "surface_low": round(SURF_LOW, 4)},
            "surface": lin(s2, s98, SURF_LOW, FC),
            "root": lin(r2, r98, WP, FC),
        },
    }
    (DIR / "smap_l4_calibration_lipa.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(json.dumps(out, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
