"""Daily means of SMAP L4 (SPL4SMGP v008) surface and root-zone soil moisture at the Lipa AOI centroid,
on Asia/Manila calendar days, from the AppEEARS point request (scripts/appeears-lipa.py, task "smap_l4").

Facts used (sources read 2026-11-15):
- 3-hourly TIME-AVERAGED fields (NSIDC SPL4SMGP v8 landing page: "3-hourly time average geophysical land
  surface fields"); SMAP brightness temperatures assimilated into a land surface model -> MODEL output.
- sm_surface "Top layer soil moisture (0-5 cm)", sm_rootzone "Root zone soil moisture (0-100 cm)",
  m^3/m^3, fill -9999, valid 0..0.9 (AppEEARS /api/product/SPL4SMGP.008).
- AppEEARS stamps each value at HH:30 UTC. Taken as the centre of its 3-hour window (inferred from the
  :30 stamps; UNVERIFIED). A value is assigned to the Manila day of its stamp.
A day's mean is written only with all 8 values; otherwise blank with the count.

Run from the repo root:
  "docs/Data Pipeline/.venv/Scripts/python.exe" -I scripts/process-smap-l4-lipa.py               (Lipa Cropland)
  ... scripts/process-smap-l4-lipa.py --task smap_l4_plot_a --name lipa_plot_a                      (Plot A)
  ... scripts/process-smap-l4-lipa.py --task smap_l4_history --name lipa_2015_2023 --id lipa_cropland_001_centroid
Output: docs/Data Pipeline/data/external/<task>/smap_l4_daily_<name>.csv (+ processing.json)
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

REPO = Path(__file__).resolve().parents[1]
EXT = REPO / "docs" / "Data Pipeline" / "data" / "external"
MANILA = ZoneInfo("Asia/Manila")
FILL, VMIN, VMAX = -9999.0, 0.0, 0.9
LAYERS = {"surface": "SPL4SMGP_008_Geophysical_Data_sm_surface", "rootzone": "SPL4SMGP_008_Geophysical_Data_sm_rootzone"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", default="smap_l4", help="folder under data/external (AppEEARS task)")
    ap.add_argument("--name", default="lipa", help="output: smap_l4_daily_<name>.csv")
    ap.add_argument("--id", default=None, help="keep only this point ID (requests with several points)")
    args = ap.parse_args()
    DIR = EXT / args.task
    hits = sorted((DIR / "files").glob("*-SPL4SMGP-008-results.csv"))
    if len(hits) != 1:
        raise FileNotFoundError(f"{DIR / 'files'}: expected one *-SPL4SMGP-008-results.csv, found {len(hits)}")
    SRC = hits[0]
    with SRC.open(encoding="utf-8") as fh:
        rows = [r for r in csv.DictReader(fh) if args.id is None or r["ID"] == args.id]
    if not rows:
        raise ValueError(f"no rows for ID {args.id}")
    cells = {(r["SPL4SMGP_008_Line_Y_9.00805km"], r["SPL4SMGP_008_Sample_X_9.00805km"]) for r in rows}
    if len(cells) != 1:
        raise ValueError(f"expected one EASE-Grid cell, got {cells}")
    by_day: dict[str, dict[str, list[float]]] = defaultdict(lambda: {k: [] for k in LAYERS})
    stamps: dict[str, list[str]] = defaultdict(list)
    for r in rows:
        t = datetime.strptime(r["Date"], "%Y-%m-%d %H:%M:%S UTC").replace(tzinfo=timezone.utc)
        day = t.astimezone(MANILA).date().isoformat()
        stamps[day].append(t.strftime("%H:%M"))
        for k, col in LAYERS.items():
            v = float(r[col])
            if v != FILL and VMIN <= v <= VMAX:
                by_day[day][k].append(v)
    out = []
    for day in sorted(by_day):
        n = {k: len(v) for k, v in by_day[day].items()}
        out.append({
            "local_date": day,
            "n_surface": n["surface"],
            "n_rootzone": n["rootzone"],
            "sm_surface_mean": round(sum(by_day[day]["surface"]) / 8, 4) if n["surface"] == 8 else "",
            "sm_rootzone_mean": round(sum(by_day[day]["rootzone"]) / 8, 4) if n["rootzone"] == 8 else "",
            "sm_surface_min": round(min(by_day[day]["surface"]), 4) if n["surface"] else "",
            "sm_surface_max": round(max(by_day[day]["surface"]), 4) if n["surface"] else "",
            "utc_stamps": " ".join(stamps[day]),
        })
    with (DIR / f"smap_l4_daily_{args.name}.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)
    full = sum(1 for o in out if o["sm_surface_mean"] != "" and o["sm_rootzone_mean"] != "")
    git = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
    (DIR / "processing.json").write_text(json.dumps({
        "script": "scripts/process-smap-l4-lipa.py",
        "run_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_commit": git,
        "source_csv": str(SRC.relative_to(REPO)),
        "rows_in": len(rows),
        "ease_grid_cell_line_sample": sorted(cells)[0],
        "day_rule": "Asia/Manila date of the HH:30 UTC stamp (taken as window centre, UNVERIFIED); mean only with all 8 values",
        "valid_range_m3_m3": [VMIN, VMAX], "fill": FILL,
        "days_out": len(out), "days_with_both_means": full,
    }, indent=1), encoding="utf-8")
    print(f"{len(rows)} 3-hourly rows -> {len(out)} Manila days, {full} with both daily means")
    return 0


if __name__ == "__main__":
    sys.exit(main())
