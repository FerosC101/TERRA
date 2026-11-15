"""NASA POWER daily rain (PRECTOTCORR) 2001-01-01..2023-12-31 at the Lipa Cropland AOI centroid, the same point
and community the pipeline uses (collectors/nasa_power.py: community AG, daily point API). Used to calibrate the
rain-departure rule on 23 years of real data (DATA-MANIFEST.md section 12).

Run from the repo root:
  "docs/Data Pipeline/.venv/Scripts/python.exe" -I scripts/fetch-power-history.py
Outputs (docs/Data Pipeline/data/external/power_history/):
  raw/power_daily_PRECTOTCORR_2001_2023.json   API response, unchanged
  power_daily_rain_lipa_2001_2023.csv           date, rain_mm (fill values left blank)
  request.json
"""

from __future__ import annotations

import csv
import json
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "docs" / "Data Pipeline" / "data" / "external" / "power_history"
URL = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR&community=AG"
       "&longitude=121.184648&latitude=13.983842&start=20010101&end=20231231&format=JSON")


def main() -> int:
    raw = OUT / "raw" / "power_daily_PRECTOTCORR_2001_2023.json"
    raw.parent.mkdir(parents=True, exist_ok=True)
    if not raw.exists():
        with urllib.request.urlopen(URL, timeout=300) as r:
            raw.write_bytes(r.read())
    d = json.loads(raw.read_text(encoding="utf-8"))
    fill = d["header"]["fill_value"]
    series = d["properties"]["parameter"]["PRECTOTCORR"]
    rows = [{"date": f"{k[:4]}-{k[4:6]}-{k[6:]}", "rain_mm": "" if v == fill else v} for k, v in sorted(series.items())]
    with (OUT / "power_daily_rain_lipa_2001_2023.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["date", "rain_mm"])
        w.writeheader()
        w.writerows(rows)
    git = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
    (OUT / "request.json").write_text(json.dumps({
        "script": "scripts/fetch-power-history.py",
        "run_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_commit": git, "url": URL,
        "header": {k: d["header"].get(k) for k in ("title", "api", "sources", "fill_value", "time_standard", "start", "end")},
        "geometry": d.get("geometry"),
        "units": d.get("parameters", {}).get("PRECTOTCORR"),
        "days": len(rows), "fill_days": sum(1 for r in rows if r["rain_mm"] == ""),
    }, indent=1, default=str), encoding="utf-8")
    print(f"{len(rows)} days, {sum(1 for r in rows if r['rain_mm'] == '')} fill")
    return 0


if __name__ == "__main__":
    sys.exit(main())
