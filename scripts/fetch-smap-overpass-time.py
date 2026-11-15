"""Fetch the SMAP L3 (SPL3SMP_E V006) acquisition time for every overpass day the pipeline stored
for the Lipa AOI, from the same grid cell and the same pass (AM or PM) the pipeline used.

Why: the pipeline stores each SMAP value at the file date T00:00:00Z, not at the overpass time.
The time decides which local (Asia/Manila) day the value belongs to (D-002).

Run from the repo root with the pipeline's virtual environment:
  "docs/Data Pipeline/.venv/Scripts/python.exe" -I scripts/fetch-smap-overpass-time.py

Outputs (docs/Data Pipeline/data/external/smap_l3_overpass_time/):
  raw/*.subset.dap.nc4   OPeNDAP subsets (time + lat/lon of the pass), unchanged
  smap_l3_overpass_time_lipa.csv
  request.json
"""

from __future__ import annotations

import ast
import csv
import glob
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

REPO = Path(__file__).resolve().parents[1]
PIPE = REPO / "docs" / "Data Pipeline"
sys.path.insert(0, str(PIPE))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(PIPE / ".env")

import h5py  # noqa: E402
import numpy as np  # noqa: E402

from collectors.earthdata_client import (  # noqa: E402
    EarthdataClient,
    _clean_opendap_base_url,
    build_smap_l3_opendap_subset_url,
)
from processors.spatial_processor import load_and_validate_aoi  # noqa: E402

OUT = PIPE / "data" / "external" / "smap_l3_overpass_time"
RAW = OUT / "raw"
EPOCH = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)  # per the tb_time_seconds long_name
MANILA = ZoneInfo("Asia/Manila")


def main() -> int:
    aoi = load_and_validate_aoi(PIPE / "config" / "farm_config.yaml", base_dir=PIPE)
    client = EarthdataClient()

    # OPeNDAP link per file date, from the CMR results the pipeline saved.
    links: dict[str, str] = {}
    for f in glob.glob(str(PIPE / "data" / "metadata" / "smap_cmr_SPL3SMP_E_*.json")):
        for g in json.load(open(f, encoding="utf-8")).get("granules", []):
            if g.get("opendap_url"):
                links[str(g["time_start"])[:10]] = g["opendap_url"]

    merged = json.load(open(PIPE / "data" / "processed" / "terra_daily_merged.json", encoding="utf-8"))
    rows = []
    for r in merged:
        o = r["observations"].get("soil_moisture_surface_m3_m3")
        if not o or o.get("value") is None:
            continue
        date = r["date"]
        notes = o.get("notes") or ""
        grp = re.search(r"group=(\w+)", notes).group(1)
        center = ast.literal_eval(re.search(r"grid_center=(\{[^}]*\})", notes).group(1))
        pm = grp.endswith("_PM")
        sfx = "_pm" if pm else ""

        # Same rows/cols window as the pipeline's subset; only the requested fields differ.
        pipe_url = build_smap_l3_opendap_subset_url(links[date], aoi.bbox)
        window = re.search(r"latitude\[(\d+:\d+)\]\[(\d+:\d+)\]", pipe_url)
        rr, cc = window.group(1), window.group(2)
        fields = [f"/{grp}/latitude{sfx}", f"/{grp}/longitude{sfx}", f"/{grp}/tb_time_seconds{sfx}"]
        url = _clean_opendap_base_url(links[date]) + ".dap.nc4?dap4.ce=" + ";".join(f"{x}[{rr}][{cc}]" for x in fields)

        dest = RAW / f"SMAP_L3_SM_P_E_{date.replace('-', '')}_{'PM' if pm else 'AM'}_time.subset.dap.nc4"
        if not dest.exists() or dest.stat().st_size == 0:
            client.download_authenticated(url, dest)

        with h5py.File(dest, "r") as hf:
            def ds(name: str) -> np.ndarray:
                for key in (f"{grp}/{name}", name):
                    if key in hf:
                        return np.asarray(hf[key][...], dtype=float)
                raise KeyError(name)
            lat, lon, sec = ds(f"latitude{sfx}"), ds(f"longitude{sfx}"), ds(f"tb_time_seconds{sfx}")
        idx = np.unravel_index(int(np.argmin((lat - center["lat"]) ** 2 + (lon - center["lon"]) ** 2)), lat.shape)
        s = float(sec[idx])
        if not (0 < s < 1e10):
            t_utc = None
        else:
            t_utc = EPOCH + timedelta(seconds=s)
        t_loc = t_utc.astimezone(MANILA) if t_utc else None
        rows.append(
            {
                "file_date": date,
                "pass": "PM" if pm else "AM",
                "cell_lat": round(float(lat[idx]), 6),
                "cell_lon": round(float(lon[idx]), 6),
                "pipeline_center_lat": center["lat"],
                "pipeline_center_lon": center["lon"],
                "tb_time_seconds": s,
                "acquisition_utc": t_utc.strftime("%Y-%m-%dT%H:%M:%SZ") if t_utc else "",
                "acquisition_asia_manila": t_loc.strftime("%Y-%m-%dT%H:%M:%S%z") if t_loc else "",
                "local_date": t_loc.strftime("%Y-%m-%d") if t_loc else "",
                "local_date_equals_file_date": (t_loc.strftime("%Y-%m-%d") == date) if t_loc else "",
            }
        )

    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / "smap_l3_overpass_time_lipa.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    git = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
    (OUT / "request.json").write_text(json.dumps({
        "script": "scripts/fetch-smap-overpass-time.py",
        "run_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_commit": git,
        "product": "SPL3SMP_E V006 (NASA NSIDC DAAC)",
        "variable": "tb_time_seconds / tb_time_seconds_pm: mean acquisition time of the brightness-temperature "
                    "footprints in the cell, seconds since 2000-01-01T12:00:00 UTC (file attribute long_name)",
        "cell_choice": "the cell nearest to the pipeline's recorded grid_center, in the pass group the pipeline used",
        "subset_window": "same rows/cols as collectors/earthdata_client.build_smap_l3_opendap_subset_url",
        "days": len(rows),
    }, indent=1), encoding="utf-8")
    print(f"{len(rows)} overpass days written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
