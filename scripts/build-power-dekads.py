"""10-day (dekad) rain totals at the Lipa AOI point from NASA POWER, 2001-2025, for the rotation planner's
historical-years mode (D-014). Dekads: days 1-10, 11-20, 21-end of each month (36 per year), matching the
planner's 3 steps per month.

Sources: 2001-2023 power_daily_rain_lipa_2001_2023.csv (scripts/fetch-power-history.py); 2024-2025 the pipeline's
POWER record (terra_daily_merged.json, precipitation_mm). Same API (POWER Daily v2.10.3, community AG) and point.

Run from the repo root:
  "docs/Data Pipeline/.venv/Scripts/python.exe" -I scripts/build-power-dekads.py
Output: data/nasa/lipa-power-dekads.json
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
EXT = REPO / "docs" / "Data Pipeline" / "data"


def main() -> int:
    daily: dict[str, float] = {}
    with (EXT / "external" / "power_history" / "power_daily_rain_lipa_2001_2023.csv").open(encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            daily[r["date"]] = float(r["rain_mm"])
    merged = json.loads((EXT / "processed" / "terra_daily_merged.json").read_text(encoding="utf-8"))
    for r in merged:
        o = r["observations"].get("precipitation_mm")
        if o and o.get("value") is not None:
            daily[r["date"]] = float(o["value"])
    years: dict[str, list[float]] = {}
    for y in range(2001, 2026):
        dk = [0.0] * 36
        n = [0] * 36
        for d, v in daily.items():
            if int(d[:4]) != y:
                continue
            m, day = int(d[5:7]), int(d[8:10])
            k = (m - 1) * 3 + (0 if day <= 10 else 1 if day <= 20 else 2)
            dk[k] += v
            n[k] += 1
        if min(n) == 0:
            raise ValueError(f"{y}: a dekad has no days")
        years[str(y)] = [round(x, 1) for x in dk]
    out = {
        "source": "NASA POWER daily PRECTOTCORR (MODEL), 121.185 E 13.984 N; 2001-2023 from power_history, 2024-2025 from the pipeline record",
        "dekads": "1-10, 11-20, 21-end of each month; index 0 = 1-10 January",
        "years": years,
    }
    (REPO / "data" / "nasa" / "lipa-power-dekads.json").write_text(json.dumps(out, indent=0), encoding="utf-8")
    print(f"{len(years)} years written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
