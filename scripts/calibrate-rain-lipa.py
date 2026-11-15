"""Calibrate the rain-departure rule for Lipa on 23 years of real NASA POWER daily rain (2001-2023).

The rule compares a 14-day rain total with the expected total from the monthly normal (ratio = total / expected).
The old thresholds (0.45 and 1.7, guessed for a gauge) are replaced by month-specific limits: the 5th and 95th
percentile of the 14-day ratio for windows ending in that calendar month. By construction about 10 % of windows
are flagged in the calibration years.

A second, long window catches droughts that build up over a season (as SPI-3 does): the 90-day ratio, with a
month-specific dry limit at the 10th percentile (W_LONG, LONG_P).

Checks (real data only):
- held-out by time: limits fitted on 2001-2018, flagged share measured on 2019-2023;
- the old fixed limits' flagged share on the same years.

Run from the repo root:
  "docs/Data Pipeline/.venv/Scripts/python.exe" -I scripts/calibrate-rain-lipa.py
Input:  docs/Data Pipeline/data/external/power_history/power_daily_rain_lipa_2001_2023.csv (scripts/fetch-power-history.py)
Output: docs/Data Pipeline/data/external/power_history/rain_calibration_lipa.json
"""

from __future__ import annotations

import calendar
import csv
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[1]
DIR = REPO / "docs" / "Data Pipeline" / "data" / "external" / "power_history"
W = 14
LOW_P, HIGH_P = 5, 95
W_LONG, LONG_P = 90, 10
OLD = (0.45, 1.7)


def load() -> tuple[list[str], np.ndarray]:
    with (DIR / "power_daily_rain_lipa_2001_2023.csv").open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    if any(r["rain_mm"] == "" for r in rows):
        raise ValueError("fill values in the POWER record")
    return [r["date"] for r in rows], np.array([float(r["rain_mm"]) for r in rows])


def monthly_normal(dates: list[str], rain: np.ndarray, years: range) -> list[float]:
    tot: dict[tuple[int, int], float] = {}
    for d, v in zip(dates, rain):
        y, m = int(d[:4]), int(d[5:7])
        if y in years:
            tot[(y, m)] = tot.get((y, m), 0.0) + v
    return [float(np.mean([t for (y, m), t in tot.items() if m == mm])) for mm in range(1, 13)]


def ratios(dates: list[str], rain: np.ndarray, normal: list[float], w: int = W) -> list[tuple[str, float]]:
    daily_expected = np.array([normal[int(d[5:7]) - 1] / calendar.monthrange(int(d[:4]), int(d[5:7]))[1] for d in dates])
    out = []
    for i in range(w - 1, len(dates)):
        e = daily_expected[i - w + 1:i + 1].sum()
        out.append((dates[i], float(rain[i - w + 1:i + 1].sum() / e)))
    return out


def low_limits(rs: list[tuple[str, float]], years: range, pct: float) -> list[float]:
    return [round(float(np.percentile(np.array([r for d, r in rs if int(d[:4]) in years and int(d[5:7]) == m]), pct)), 3)
            for m in range(1, 13)]


def low_share(rs: list[tuple[str, float]], years: range, lo: list[float]) -> dict[str, float]:
    sel = [(int(d[5:7]), r) for d, r in rs if int(d[:4]) in years]
    n = sum(1 for m, r in sel if r < lo[m - 1])
    return {"windows": len(sel), "dry_share": round(n / len(sel), 4)}


def limits(rs: list[tuple[str, float]], years: range) -> tuple[list[float], list[float]]:
    lo, hi = [], []
    for m in range(1, 13):
        a = np.array([r for d, r in rs if int(d[:4]) in years and int(d[5:7]) == m])
        lo.append(round(float(np.percentile(a, LOW_P)), 3))
        hi.append(round(float(np.percentile(a, HIGH_P)), 3))
    return lo, hi


def share(rs: list[tuple[str, float]], years: range, lo: list[float], hi: list[float]) -> dict[str, float]:
    sel = [(int(d[5:7]), r) for d, r in rs if int(d[:4]) in years]
    low = sum(1 for m, r in sel if r < lo[m - 1])
    high = sum(1 for m, r in sel if r > hi[m - 1])
    return {"windows": len(sel), "low_share": round(low / len(sel), 4), "high_share": round(high / len(sel), 4),
            "flagged_share": round((low + high) / len(sel), 4)}


def main() -> int:
    dates, rain = load()
    all_years, fit_years, test_years = range(2001, 2024), range(2001, 2019), range(2019, 2024)
    # Held-out check: normal and limits from 2001-2018 only.
    n_fit = monthly_normal(dates, rain, fit_years)
    rs_fit = ratios(dates, rain, n_fit)
    lo_fit, hi_fit = limits(rs_fit, fit_years)
    old_lo, old_hi = [OLD[0]] * 12, [OLD[1]] * 12
    heldout = {
        "fit_years": "2001-2018", "test_years": "2019-2023",
        "calibrated_on_fit_years": share(rs_fit, fit_years, lo_fit, hi_fit),
        "calibrated_on_test_years": share(rs_fit, test_years, lo_fit, hi_fit),
        "old_fixed_on_test_years": share(rs_fit, test_years, old_lo, old_hi),
    }
    rl_fit = ratios(dates, rain, n_fit, W_LONG)
    lo90_fit = low_limits(rl_fit, fit_years, LONG_P)
    heldout["long_window_on_fit_years"] = low_share(rl_fit, fit_years, lo90_fit)
    heldout["long_window_on_test_years"] = low_share(rl_fit, test_years, lo90_fit)
    # Final limits from all 23 years.
    normal = monthly_normal(dates, rain, all_years)
    rs = ratios(dates, rain, normal)
    lo, hi = limits(rs, all_years)
    rl = ratios(dates, rain, normal, W_LONG)
    lo90 = low_limits(rl, all_years, LONG_P)
    driest = sorted(((y, sum(r for (d, r) in zip(dates, rain) if int(d[:4]) == y and d[5:7] in ("02", "03", "04")))
                     for y in all_years), key=lambda t: t[1])[:5]
    git = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
    out = {
        "script": "scripts/calibrate-rain-lipa.py",
        "run_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_commit": git,
        "source": "NASA POWER daily PRECTOTCORR, 121.185 E 13.984 N, 2001-01-01..2023-12-31 (power_daily_rain_lipa_2001_2023.csv)",
        "window_days": W, "percentiles": [LOW_P, HIGH_P],
        "monthly_normal_mm": [round(x, 1) for x in normal],
        "low_ratio_by_month": lo, "high_ratio_by_month": hi,
        "long_window_days": W_LONG, "long_window_percentile": LONG_P,
        "long_low_ratio_by_month": lo90,
        "long_window_dry_share_2001_2023": low_share(rl, all_years, lo90),
        "driest_feb_apr_2001_2023_mm": [[y, round(t, 1)] for y, t in driest],
        "final_flagged_share_2001_2023": share(rs, all_years, lo, hi),
        "old_fixed_flagged_share_2001_2023": share(rs, all_years, old_lo, old_hi),
        "heldout": heldout,
    }
    (DIR / "rain_calibration_lipa.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(json.dumps({k: out[k] for k in ("monthly_normal_mm", "low_ratio_by_month", "high_ratio_by_month", "long_low_ratio_by_month",
                                          "long_window_dry_share_2001_2023", "driest_feb_apr_2001_2023_mm",
                                          "final_flagged_share_2001_2023", "old_fixed_flagged_share_2001_2023", "heldout")}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
