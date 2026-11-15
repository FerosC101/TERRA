"""Submit, check and download the Lipa AppEEARS requests (MODIS NDVI area, SMAP L4 point).

Credentials: EARTHDATA_USERNAME / EARTHDATA_PASSWORD in docs/Data Pipeline/.env (git-ignored).
AppEEARS does not accept the Earthdata bearer token; it issues its own token at /api/login.
Nothing secret is printed or written to disk.

Usage (repo root, pipeline venv):
  PY="docs/Data Pipeline/.venv/Scripts/python.exe"
  $PY -I scripts/appeears-lipa.py submit   <task>   (modis | smap_l4 | hls_plot_a | smap_l4_plot_a; "all" resubmits every task)
  $PY -I scripts/appeears-lipa.py status
  $PY -I scripts/appeears-lipa.py download <task|all>

Each request is saved, before submission, as data/external/<dataset>/request.json; the task id
and AppEEARS responses are saved next to it as task.json. Downloaded files are kept unchanged.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import dotenv_values

REPO = Path(__file__).resolve().parents[1]
PIPE = REPO / "docs" / "Data Pipeline"
EXT = PIPE / "data" / "external"
API = "https://appeears.earthdatacloud.nasa.gov/api"

# Target period 2024-01-01..2025-12-31. MODIS starts at 2023-12-01 so the composites that
# straddle 2024-01-01 (and the one before them, for change detection) are included.
CENTROID = {"lat": 13.983842, "lon": 121.184648}  # pipeline AOI centroid (README section 5)

TASKS = {
    "modis": {
        "dir": EXT / "modis_ndvi",
        "body": {
            "task_type": "area",
            "task_name": "terra_lipa_modis_ndvi_2024_2025",
            "params": {
                "dates": [{"startDate": "12-01-2023", "endDate": "12-31-2025"}],
                "layers": [
                    {"product": p, "layer": l}
                    for p in ("MOD13Q1.061", "MYD13Q1.061")
                    for l in (
                        "_250m_16_days_NDVI",
                        "_250m_16_days_VI_Quality",
                        "_250m_16_days_pixel_reliability",
                        "_250m_16_days_composite_day_of_the_year",
                    )
                ],
                "output": {"format": {"type": "geotiff"}, "projection": "native"},
                "geo": None,  # filled from the AOI GeoJSON
            },
        },
    },
    "smap_l4": {
        "dir": EXT / "smap_l4",
        "body": {
            "task_type": "point",
            "task_name": "terra_lipa_smap_l4_2024_2025",
            "params": {
                "dates": [{"startDate": "01-01-2024", "endDate": "12-31-2025"}],
                "layers": [
                    {"product": "SPL4SMGP.008", "layer": "Geophysical_Data_sm_surface"},
                    {"product": "SPL4SMGP.008", "layer": "Geophysical_Data_sm_rootzone"},
                ],
                "coordinates": [
                    {
                        "id": "lipa_cropland_001_centroid",
                        "category": "lipa_cropland_001",
                        "latitude": CENTROID["lat"],
                        "longitude": CENTROID["lon"],
                    }
                ],
            },
        },
    },
    # Plot A (Mang Edgar's corn, 2.69 ha, corners drawn on a map; "Lipa Plot A.geojson"). Smaller than one
    # MODIS pixel, so NDVI comes from HLS 30 m. The VI products list no QA layer, so Fmask is taken from the
    # matching reflectance products (same granules).
    "hls_plot_a": {
        "dir": EXT / "hls_plot_a",
        "geo_file": "Lipa Plot A.geojson",
        "body": {
            "task_type": "area",
            "task_name": "terra_lipa_plot_a_hls_ndvi_2024_2025",
            "params": {
                "dates": [{"startDate": "12-01-2023", "endDate": "12-31-2025"}],
                "layers": [
                    {"product": "HLSS30_VI.020", "layer": "NDVI"},
                    {"product": "HLSL30_VI.020", "layer": "NDVI"},
                    {"product": "HLSS30.020", "layer": "Fmask"},
                    {"product": "HLSL30.020", "layer": "Fmask"},
                ],
                "output": {"format": {"type": "geotiff"}, "projection": "native"},
                "geo": None,
            },
        },
    },
    "smap_l4_plot_a": {
        "dir": EXT / "smap_l4_plot_a",
        "body": {
            "task_type": "point",
            "task_name": "terra_lipa_plot_a_smap_l4_2024_2025",
            "params": {
                "dates": [{"startDate": "01-01-2024", "endDate": "12-31-2025"}],
                "layers": [
                    {"product": "SPL4SMGP.008", "layer": "Geophysical_Data_sm_surface"},
                    {"product": "SPL4SMGP.008", "layer": "Geophysical_Data_sm_rootzone"},
                ],
                "coordinates": [
                    {"id": "lipa_plot_a_centre", "category": "lipa_plot_a", "latitude": 13.9838, "longitude": 121.1539}
                ],
            },
        },
    },
    # History for calibrating the moisture rule on real data (2015-03-31 is the first SPL4SMGP day).
    "smap_l4_history": {
        "dir": EXT / "smap_l4_history",
        "body": {
            "task_type": "point",
            "task_name": "terra_lipa_smap_l4_2015_2023",
            "params": {
                "dates": [{"startDate": "03-31-2015", "endDate": "12-31-2023"}],
                "layers": [
                    {"product": "SPL4SMGP.008", "layer": "Geophysical_Data_sm_surface"},
                    {"product": "SPL4SMGP.008", "layer": "Geophysical_Data_sm_rootzone"},
                ],
                "coordinates": [
                    {"id": "lipa_cropland_001_centroid", "category": "lipa_cropland_001", "latitude": CENTROID["lat"], "longitude": CENTROID["lon"]},
                    {"id": "lipa_plot_a_centre", "category": "lipa_plot_a", "latitude": 13.9838, "longitude": 121.1539},
                ],
            },
        },
    },
    # History for an NDVI-vs-normal rule: a point request at the centre of each of the 42 MODIS pixels AppEEARS
    # returned for the AOI (computed from the 2023-12-03 MOD13Q1 GeoTIFF, sinusoidal R = 6371007.181 m) plus the
    # Plot A centre. One CSV per product instead of thousands of GeoTIFFs.
    "modis_history": {
        "dir": EXT / "modis_history",
        "points_file": "modis_pixel_centres.json",
        "body": {
            "task_type": "point",
            "task_name": "terra_lipa_modis_ndvi_2001_2025",
            "params": {
                # Through 2025 so the 2024-2025 values (incl. Plot A's pixel) come from the same request.
                "dates": [{"startDate": "01-01-2001", "endDate": "12-31-2025"}],
                "layers": [
                    {"product": p, "layer": l}
                    for p in ("MOD13Q1.061", "MYD13Q1.061")
                    for l in ("_250m_16_days_NDVI", "_250m_16_days_VI_Quality", "_250m_16_days_pixel_reliability")
                ],
                "coordinates": None,  # filled from points_file
            },
        },
    },
}


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def git_commit() -> str:
    return subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()


def login() -> dict[str, str]:
    env = dotenv_values(PIPE / ".env")
    user, pw = (env.get("EARTHDATA_USERNAME") or "").strip(), (env.get("EARTHDATA_PASSWORD") or "").strip()
    if not user or not pw:
        sys.exit("EARTHDATA_USERNAME / EARTHDATA_PASSWORD are empty in docs/Data Pipeline/.env")
    r = requests.post(f"{API}/login", auth=(user, pw), timeout=60)
    if r.status_code != 200:
        sys.exit(f"AppEEARS login failed: HTTP {r.status_code} {r.text[:200]}")
    return {"Authorization": f"Bearer {r.json()['token']}"}


def logout(h: dict[str, str]) -> None:
    requests.post(f"{API}/logout", headers=h, timeout=60)


def selected(arg: str | None) -> list[str]:
    return list(TASKS) if arg in (None, "all") else [arg]


def submit(names: list[str]) -> None:
    h = login()
    try:
        for name in names:
            t = TASKS[name]
            t["dir"].mkdir(parents=True, exist_ok=True)
            body = json.loads(json.dumps(t["body"]))
            if body["task_type"] == "area":
                geo_file = t.get("geo_file", "Lipa Cropland.geojson")
                body["params"]["geo"] = json.loads((PIPE / geo_file).read_text(encoding="utf-8"))
            if t.get("points_file"):
                pts = json.loads((t["dir"] / t["points_file"]).read_text(encoding="utf-8"))
                body["params"]["coordinates"] = [
                    {"id": f"lipa_aoi_modis_px{k:02d}", "category": "lipa_cropland_001", "latitude": lat, "longitude": lon}
                    for k, (lat, lon) in enumerate(pts)
                ] + [{"id": "lipa_plot_a_centre", "category": "lipa_plot_a", "latitude": 13.9838, "longitude": 121.1539}]
            (t["dir"] / "request.json").write_text(
                json.dumps({"submitted_at_utc": now(), "git_commit": git_commit(), "api": f"{API}/task", "body": body}, indent=1),
                encoding="utf-8",
            )
            r = requests.post(f"{API}/task", json=body, headers=h, timeout=120)
            print(name, "HTTP", r.status_code, r.text[:300])
            r.raise_for_status()
            (t["dir"] / "task.json").write_text(json.dumps({"submit_response": r.json()}, indent=1), encoding="utf-8")
    finally:
        logout(h)


PRIVATE_KEYS = {"user_id", "email", "username"}  # AppEEARS replies carry the account email in user_id


def redact(obj):
    """Copy of a JSON reply with account identifiers replaced, so task.json can be committed."""
    if isinstance(obj, dict):
        return {k: ("<redacted>" if k in PRIVATE_KEYS else redact(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [redact(v) for v in obj]
    return obj


def task_id(name: str) -> str:
    return json.loads((TASKS[name]["dir"] / "task.json").read_text(encoding="utf-8"))["submit_response"]["task_id"]


def status() -> None:
    h = login()
    try:
        for name, t in TASKS.items():
            if not (t["dir"] / "task.json").exists():
                print(name, "not submitted")
                continue
            r = requests.get(f"{API}/task/{task_id(name)}", headers=h, timeout=60)
            info = r.json() if r.ok else {}
            st = info.get("status")
            if st is None:  # seen 2026-11-15: the task reply sometimes lacks fields; ask the status endpoint instead
                s = requests.get(f"{API}/status/{task_id(name)}", headers=h, timeout=60)
                st = (s.json() if s.ok else {}).get("status") or f"unknown (HTTP {r.status_code}/{s.status_code})"
            print(name, st, "| created", info.get("created"), "| completed", info.get("completed"))
    finally:
        logout(h)


def download(names: list[str]) -> None:
    h = login()
    try:
        for name in names:
            t = TASKS[name]
            tid = task_id(name)
            info = requests.get(f"{API}/task/{tid}", headers=h, timeout=60).json()
            if info.get("status") != "done":
                print(name, "status:", info.get("status"), "- not ready")
                continue
            bundle = requests.get(f"{API}/bundle/{tid}", headers=h, timeout=60).json()
            files_dir = t["dir"] / "files"
            for f in bundle["files"]:
                dest = files_dir / f["file_name"]
                dest.parent.mkdir(parents=True, exist_ok=True)
                # Resume: a file already on disk with the bundle's sha256 is kept.
                if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest() == f["sha256"]:
                    continue
                for attempt in range(1, 6):
                    # AppEEARS answers with a redirect to a short-lived signed link. The link is fetched
                    # without the AppEEARS login header.
                    r = requests.get(f"{API}/bundle/{tid}/{f['file_id']}", headers=h, timeout=300, allow_redirects=False)
                    if r.status_code in (301, 302, 303, 307, 308):
                        r = requests.get(r.headers["Location"], timeout=300)
                    if r.ok and hashlib.sha256(r.content).hexdigest() == f["sha256"]:
                        dest.write_bytes(r.content)
                        break
                    print(f"  {f['file_name']}: attempt {attempt} failed (HTTP {r.status_code} from {r.url.split('/')[2]})", flush=True)
                    if r.status_code == 403 and r.url.startswith(API):
                        # Seen 2026-11-15: after ~50 downloads AppEEARS refuses the session's token with 403;
                        # a new login is accepted at once.
                        logout(h)
                        h = login()
                    else:
                        time.sleep(10 * attempt)
                else:
                    sys.exit(f"{name}: could not download {f['file_name']} with a matching sha256")
            rec = json.loads((t["dir"] / "task.json").read_text(encoding="utf-8"))
            rec.update({"task_info": redact(info), "bundle": redact(bundle), "downloaded_at_utc": now()})
            (t["dir"] / "task.json").write_text(json.dumps(rec, indent=1), encoding="utf-8")
            print(name, "downloaded", len(bundle["files"]), "files to", files_dir)
    finally:
        logout(h)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    arg = sys.argv[2] if len(sys.argv) > 2 else None
    {"submit": lambda: submit(selected(arg)), "status": status, "download": lambda: download(selected(arg))}[cmd]()
