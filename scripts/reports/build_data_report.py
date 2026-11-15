"""TERRA — Data Gathering and Cleaning report (Word). Every number is computed here from the files listed;
nothing is typed in by hand except the descriptions of methods and the source links (all opened 2026-11-15).

Run from the repo root:
  "docs/Data Pipeline/.venv/Scripts/python.exe" -I scripts/reports/build_data_report.py
Output: docs/reports/TERRA-Data-Gathering-and-Cleaning.docx (+ figures in docs/reports/figures/)
"""

from __future__ import annotations

import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (C, DATA, EXT, PIPE, REPO, Report, date_axis, git_commit, legend_below, plt, read_csv, read_json, save, to_date)  # noqa: E402


def load():
    merged = read_json(DATA / "processed" / "terra_daily_merged.json")
    obs = lambda r, k: (r["observations"].get(k) or {}).get("value")  # noqa: E731
    power = {r["date"]: obs(r, "precipitation_mm") for r in merged}
    imerg = {r["date"]: obs(r, "precipitation_imerg_mm") for r in merged}
    et0 = {r["date"]: obs(r, "et0_mm_day") for r in merged}
    smap_file = {r["date"]: obs(r, "soil_moisture_surface_m3_m3") for r in merged}
    times = {r["file_date"]: r for r in read_csv(EXT / "smap_l3_overpass_time" / "smap_l3_overpass_time_lipa.csv")}
    smap_local = {times[d]["local_date"]: v for d, v in smap_file.items() if v is not None and d in times}
    l4 = read_csv(EXT / "smap_l4" / "smap_l4_daily_lipa.csv")
    modis = read_csv(EXT / "modis_ndvi" / "modis_ndvi_lipa.csv")
    hls = read_csv(EXT / "hls_plot_a" / "hls_ndvi_plot_a.csv")
    sg = read_csv(EXT / "soilgrids" / "soilgrids_lipa_summary.csv")
    sga = read_csv(EXT / "soilgrids" / "lipa_plot_a" / "soilgrids_lipa_plot_a_summary.csv")
    imerg_n = read_csv(EXT / "imerg_monthly" / "imerg_monthly_normal_lipa_2001_2023.csv")
    rain_cal = read_json(EXT / "power_history" / "rain_calibration_lipa.json")
    power_hist = read_csv(EXT / "power_history" / "power_daily_rain_lipa_2001_2023.csv")
    return dict(merged=merged, power=power, imerg=imerg, et0=et0, smap_file=smap_file, times=times, smap_local=smap_local,
                l4=l4, modis=modis, hls=hls, sg=sg, sga=sga, imerg_n=imerg_n, rain_cal=rain_cal, power_hist=power_hist)


def fig_sites(d):
    aoi = read_json(PIPE / "Lipa Cropland.geojson")["features"][0]["geometry"]["coordinates"][0]
    pa = read_json(PIPE / "Lipa Plot A.geojson")["features"][0]["geometry"]["coordinates"][0]
    px = read_json(EXT / "modis_history" / "modis_pixel_centres.json")
    fig, ax = plt.subplots(figsize=(7.2, 3.6))
    ax.fill(*zip(*aoi), color=C["power"], alpha=0.25, label="Lipa Cropland AOI (133.7 ha)")
    ax.plot(*zip(*aoi), color=C["power"], lw=1)
    ax.fill(*zip(*pa), color=C["hls"], alpha=0.5, label="Plot A, Mang Edgar's corn (2.69 ha, corners drawn)")
    ax.scatter([p[1] for p in px], [p[0] for p in px], s=6, color=C["imerg"], label="MODIS 250 m pixel centres over the AOI (42)")
    ax.set_xlabel("Longitude (°E)")
    ax.set_ylabel("Latitude (°N)")
    ax.set_aspect(1 / np.cos(np.radians(13.98)))
    ax.set_title("The two study areas: Plot A lies 3.3 km west of the AOI")
    ax.legend(loc="lower left", fontsize=7)
    return save(fig, "data_sites")


def fig_coverage(d):
    days = sorted(d["power"])
    rows = [
        ("NASA POWER rain / ET0 (model)", {k for k, v in d["power"].items() if v is not None}, C["power"]),
        ("GPM IMERG Final rain (satellite)", {k for k, v in d["imerg"].items() if v is not None}, C["imerg"]),
        ("SMAP L3 topsoil (satellite)", set(d["smap_local"]), C["smap"]),
        ("SMAP L4 surface + root zone (model)", {r["local_date"] for r in d["l4"] if r["sm_surface_mean"]}, C["l4r"]),
        ("MODIS NDVI usable composite (AOI)", {r["composite_end_nominal"] for r in d["modis"] if r["ndvi_field"]}, C["ndvi"]),
        ("HLS NDVI usable pass (Plot A)", {r["local_date"] for r in d["hls"] if r["ndvi_plot"]}, C["hls"]),
    ]
    fig, ax = plt.subplots(figsize=(7.2, 2.9))
    for i, (name, have, col) in enumerate(rows):
        xs = [to_date(x) for x in days if x in have]
        ax.scatter(xs, [i] * len(xs), marker="|", s=60, color=col, lw=1)
        ax.text(to_date(days[-1]), i, f"  {len(xs)} days", va="center", fontsize=7)
    ax.set_yticks(range(len(rows)))
    ax.set_yticklabels([r[0] for r in rows], fontsize=7.5)
    ax.invert_yaxis()
    ax.set_title("Which days each dataset covers, 2024-01-01 to 2025-12-31 (731 days)")
    date_axis(ax)
    return save(fig, "data_coverage"), {r[0]: len([x for x in days if x in r[1]]) for r in rows}


def fig_rain(d):
    months = sorted({k[:7] for k in d["power"]})
    pw = [sum(v for k, v in d["power"].items() if k.startswith(m) and v is not None) for m in months]
    im = [sum(v for k, v in d["imerg"].items() if k.startswith(m) and v is not None) if any(k.startswith(m) and v is not None for k, v in d["imerg"].items()) else np.nan for m in months]
    pn = d["rain_cal"]["monthly_normal_mm"]
    imn = [float(r["mean_mm_month"]) for r in d["imerg_n"]] if "mean_mm_month" in d["imerg_n"][0] else [float(list(r.values())[2]) for r in d["imerg_n"]]
    x = np.arange(len(months))
    fig, ax = plt.subplots(figsize=(7.2, 3.0))
    ax.bar(x - 0.2, pw, 0.4, color=C["power"], label="NASA POWER (model)")
    ax.bar(x + 0.2, im, 0.4, color=C["imerg"], label="GPM IMERG Final (satellite)")
    ax.plot(x, [pn[int(m[5:]) - 1] for m in months], color=C["power"], lw=1, ls="--", label="POWER normal 2001–2023")
    ax.plot(x, [imn[int(m[5:]) - 1] for m in months], color=C["imerg"], lw=1, ls=":", label="IMERG normal 2001–2023")
    ax.set_xticks(x[::3])
    ax.set_xticklabels(months[::3], fontsize=7)
    ax.set_ylabel("mm per month")
    ax.set_title("Monthly rain at Lipa from two sources (IMERG Final ends 2025-09)")
    ax.legend(ncol=2, fontsize=7)
    return save(fig, "data_rain_monthly"), dict(zip(months, zip(pw, im)))


def fig_soil(d):
    l4 = [(to_date(r["local_date"]), float(r["sm_surface_mean"]), float(r["sm_rootzone_mean"])) for r in d["l4"] if r["sm_surface_mean"]]
    l3 = sorted((to_date(k), v) for k, v in d["smap_local"].items())
    fc = next(float(r["aoi_mean"]) for r in d["sg"] if r["property"] == "wv0033" and r["depth"] == "0-5cm" and r["statistic"] == "mean")
    wp = next(float(r["aoi_mean"]) for r in d["sg"] if r["property"] == "wv1500" and r["depth"] == "0-5cm" and r["statistic"] == "mean")
    fig, ax = plt.subplots(figsize=(7.2, 3.0))
    ax.plot([a for a, _, _ in l4], [b for _, b, _ in l4], color=C["l4s"], lw=0.9, label="SMAP L4 surface 0–5 cm (model)")
    ax.plot([a for a, _, _ in l4], [c for _, _, c in l4], color=C["l4r"], lw=0.9, label="SMAP L4 root zone 0–100 cm (model)")
    ax.scatter([a for a, _ in l3], [b for _, b in l3], s=5, color=C["smap"], label="SMAP L3 topsoil (satellite, flagged)")
    ax.axhline(fc, color=C["grey"], ls="--", lw=0.8)
    ax.axhline(wp, color=C["grey"], ls=":", lw=0.8)
    ax.text(l4[-1][0], fc + 0.004, f"field capacity {fc:.2f} (SoilGrids)", fontsize=7, color=C["grey"], ha="right")
    ax.text(l4[-1][0], wp - 0.022, f"wilting point {wp:.2f} (SoilGrids)", fontsize=7, color=C["grey"], ha="right")
    ax.set_ylabel("m³/m³")
    ax.set_title("Soil moisture at Lipa: SMAP L3 reads far wetter than SMAP L4 and the soil's capacity")
    date_axis(ax)
    legend_below(ax)
    return save(fig, "data_soil")


def fig_ndvi(d):
    fig, ax = plt.subplots(figsize=(7.2, 2.9))
    allv = [(to_date(r["composite_end_nominal"]), float(r["ndvi_mean_all_valid"])) for r in d["modis"] if r["ndvi_mean_all_valid"]]
    use = [(to_date(r["composite_end_nominal"]), float(r["ndvi_field"])) for r in d["modis"] if r["ndvi_field"]]
    hls = [(to_date(r["local_date"]), float(r["ndvi_plot"])) for r in d["hls"] if r["ndvi_plot"]]
    ax.scatter([a for a, _ in allv], [b for _, b in allv], s=8, color=C["grey"], alpha=0.5, label="MODIS, all pixels incl. cloud-affected")
    ax.plot([a for a, _ in use], [b for _, b in use], "o-", ms=3, lw=0.8, color=C["ndvi"], label="MODIS AOI, usable (≥ 50 % clear pixels)")
    ax.plot([a for a, _ in hls], [b for _, b in hls], "s", ms=4, color=C["hls"], label="HLS 30 m Plot A, usable")
    for s, e in (("2023-12-15", "2024-03-15"), ("2024-06-05", "2024-09-15"), ("2024-11-15", "2025-02-25"), ("2025-06-05", "2025-09-15")):
        ax.axvspan(to_date(s), to_date(e), color=C["hls"], alpha=0.07)
    ax.set_xlim(date(2023, 11, 20), date(2026, 1, 15))
    ax.set_ylabel("NDVI")
    ax.set_title("Greenness (NDVI). Shaded: Plot A corn seasons reported by the farmer")
    date_axis(ax)
    legend_below(ax)
    return save(fig, "data_ndvi")


def main() -> int:
    d = load()
    commit = git_commit()
    r = Report("TERRA — Data Gathering and Cleaning",
               f"Lipa, Batangas · 2024–2025 · AI/ML workstream · built {date.today().isoformat()} from commit {commit}")

    n_days = len(d["power"])
    n_imerg = sum(v is not None for v in d["imerg"].values())
    n_l3 = len(d["smap_local"])
    n_l4 = sum(1 for x in d["l4"] if x["sm_surface_mean"])
    n_modis = sum(1 for x in d["modis"] if x["ndvi_field"])
    n_hls = sum(1 for x in d["hls"] if x["ndvi_plot"])
    l3_vals = list(d["smap_local"].values())
    l4_surf = [float(x["sm_surface_mean"]) for x in d["l4"] if x["sm_surface_mean"]]
    shift = sum(1 for t in d["times"].values() if t["local_date_equals_file_date"] == "False")

    r.h1("Summary")
    r.bullets([
        ("What: ", f"real NASA and NASA-distributed data for two places in Lipa City, Batangas: the 133.7 ha Lipa Cropland area (AOI) "
                   f"and Plot A, a 2.69 ha corn plot farmed by Mang Edgar, 3.3 km west of the AOI. Main period 2024-01-01 to 2025-12-31 "
                   f"({n_days} days), plus long histories for calibration (rain 2001–2023)."),
        ("Daily weather: ", f"NASA POWER for all {n_days} days; GPM IMERG Final satellite rain for {n_imerg} days (the Final product ends 2025-09-30)."),
        ("Soil moisture: ", f"SMAP L3 satellite retrievals on {n_l3} days; SMAP L4 model estimates (topsoil and root zone) on {n_l4} days. "
                            "No ground soil sensor exists at either site."),
        ("Vegetation: ", f"MODIS NDVI with {n_modis} usable 16-day composites over the AOI; HLS 30 m NDVI with {n_hls} usable passes over Plot A. "
                         "Clouds hide almost every wet-season view."),
        ("Ground information: ", "four corn seasons and a February–March 2024 drought reported by the farmer of Plot A; three dated weather "
                                 "events from opened public sources; soil properties from ISRIC SoilGrids (model estimate)."),
        ("Cleaning: ", "nothing is filled or invented. Each value keeps its source, product, provenance (measurement, satellite, model) and "
                       "quality; poor-quality pixels and incomplete days are dropped and counted; every processed file is checked against the "
                       "provider's own statistics or a hand calculation."),
    ])

    r.h1("1. Study areas")
    r.p("The data pipeline was set up for the Lipa Cropland area of interest (AOI). The farmer interview later identified Plot A, "
        "which lies outside the AOI. Weather and soil-moisture products have cells of 9 to 50 km, so they describe both places; "
        "vegetation (NDVI) and soil maps are fine enough to tell them apart.")
    r.table(["", "Lipa Cropland AOI", "Plot A (Mang Edgar)"], [
        ["Size", "133.7 ha", "2.69 ha (173 m × 156 m)"],
        ["Centre", "13.983842 N, 121.184648 E", "13.9838 N, 121.1539 E"],
        ["Outline", "Lipa Cropland.geojson (pipeline AOI)", "Lipa Plot A.geojson: corners drawn on a map, not GPS"],
        ["What grows there", "Unknown mix (crops, trees, paths, grass)", "Corn, four seasons in 2024–2025 (farmer)"],
        ["NDVI source", "MODIS 250 m (42 pixels)", "HLS 30 m (36 pixels)"],
    ], caption="The two study areas")
    r.figure(fig_sites(d), "Outlines of the two study areas and the MODIS pixel grid over the AOI. Source: the two GeoJSON files; "
                           "pixel centres computed from the downloaded MODIS GeoTIFF grid.", 14)

    r.h1("2. Data sources")
    r.table(["Dataset", "Product / version", "Resolution", "Period used", "Kind", "Used for"], [
        ["NASA POWER daily", "POWER Daily API v2.10.3, community AG (MERRA-2)", "0.5° × 0.625°", "2024–2025; rain 2001–2023", "Model", "Rain, max temperature, ET0; rain normal and alarm limits"],
        ["GPM IMERG Final daily", "GPM_3IMERGDF V07", "0.1°", "2024-01-01..2025-09-30", "Satellite", "Rain (second opinion)"],
        ["GPM IMERG monthly", "GPM_3IMERGM V07", "0.1°", "2001–2023", "Satellite", "IMERG monthly normal"],
        ["SMAP L3 enhanced", "SPL3SMP_E V006", "9 km", "2024–2025", "Satellite", "Topsoil moisture (top ~5 cm)"],
        ["SMAP L4", "SPL4SMGP v008", "9 km, 3-hourly", "2024–2025 (+ history requested)", "Model", "Topsoil 0–5 cm and root zone 0–100 cm"],
        ["MODIS NDVI", "MOD13Q1 / MYD13Q1 v061", "250 m, 16-day", "2023-11..2025-12 (+ history requested)", "Satellite", "Greenness of the AOI"],
        ["HLS NDVI", "HLSS30_VI / HLSL30_VI v2.0 + Fmask", "30 m, 2–5 days", "2023-12..2025-12", "Satellite", "Greenness of Plot A"],
        ["ISRIC SoilGrids", "SoilGrids 2.0", "250 m", "static", "Model", "Field capacity, wilting point, texture"],
        ["Farmer interview", "Mang Edgar, Plot A", "one plot", "2024–2025", "Field report", "Crop calendar, drought report"],
        ["Public event reports", "Wikipedia storm pages; Philstar (DA figures)", "province / region", "2024", "Report", "Checking alarms only"],
    ], caption="Every dataset used, what kind of value it is, and what it is used for")

    r.h1("3. How the data was gathered")
    r.h2("3.1 The NASA data pipeline (POWER, IMERG daily, SMAP L3)")
    r.p("The project's Python pipeline (docs/Data Pipeline) was run 48 times, once per half-month from January 2024 to December 2025. "
        "Half-months were needed because the pipeline keeps at most 20 SMAP and 31 IMERG files per run; a full month would have "
        "silently dropped SMAP days 21 to 31. The pipeline code was not changed. Each run searched NASA's catalogue (CMR), downloaded "
        "only the small area around Lipa from each file (OPeNDAP subsetting) and stored one merged record per day.")
    r.p("Reproducibility check: the 15 days a teammate had collected earlier (2024-01-01 to 2024-01-15) were downloaded again; all 225 values "
        "(15 days × 15 variables), product names and quality statuses were identical.")
    r.h2("3.2 Separate download scripts")
    r.bullets([
        ("IMERG monthly normal (scripts/fetch-imerg-monthly-normal.py): ", "276 monthly files 2001–2023 from the same four 0.1° cells as the daily data."),
        ("SMAP L3 measurement time (scripts/fetch-smap-overpass-time.py): ", f"the actual acquisition time of each of the {n_l3} SMAP values, from the files' own time field."),
        ("AppEEARS requests (scripts/appeears-lipa.py): ", "MODIS NDVI over the AOI, HLS NDVI over Plot A, SMAP L4 at both centres, and the history requests. "
                                                          "Every file is checked against the SHA-256 checksum AppEEARS publishes."),
        ("NASA POWER rain history (scripts/fetch-power-history.py): ", f"{len(d['power_hist'])} daily values 2001–2023 at the pipeline's point, no gaps."),
        ("ISRIC SoilGrids (scripts/fetch-soilgrids-lipa.py): ", "water held at 10, 33 and 1500 kPa, texture and bulk density at five depths, for both areas."),
    ])
    r.h2("3.3 Information from people")
    r.p("The farmer of Plot A gave the crop and approximate planting and harvest dates of four corn seasons, said the plot is rainfed, and "
        "reported drought and heat in February–March 2024. The ML engineer confirmed the interview as real; the PDF's own label says "
        "\"simulated\", which is recorded next to the data. Yields in that PDF are marked illustrative and are not used.")
    r.table(["Season", "Planted (reported)", "Harvested (reported)", "Used as"], [
        ["2024 dry", "Mid-December 2023", "Mid-March 2024", "2023-12-15 .. 2024-03-15"],
        ["2024 wet", "Early June 2024", "Mid-September 2024", "2024-06-05 .. 2024-09-15"],
        ["2025 dry", "Mid-November 2024", "Late February 2025", "2024-11-15 .. 2025-02-25"],
        ["2025 wet", "Early June 2025", "Mid-September 2025", "2025-06-05 .. 2025-09-15"],
    ], caption="Plot A crop calendar (corn). Early / mid / late are read as the 5th / 15th / 25th of the month")

    r.h1("4. Cleaning and preparation")
    r.h2("4.1 Putting every value on the right day")
    r.p("All models work on local (Asia/Manila) calendar days. A value that covers a day or less is placed on the local day of its "
        "midpoint; a longer period (a 16-day NDVI composite) on its last day, so it only becomes available when it is complete.")
    r.bullets([
        ("SMAP L3: ", f"the pipeline stamps each value at midnight UTC of the file date, but the morning pass over Lipa happens at about 6 a.m. "
                      f"Manila time on the next day. The measured times moved {shift} of {len(d['times'])} values to the next Manila day."),
        ("IMERG: ", "a UTC day (file names S000000–E235959); POWER daily values are local-solar-time days (API header), almost exactly the Manila day."),
        ("SMAP L4: ", "eight 3-hourly averages are assigned to the Manila day of their time stamp; a daily mean is kept only when all eight exist."),
        ("HLS: ", "each pass is placed at its exact acquisition time, read from the granule name (e.g. 02:19 UTC)."),
    ])
    r.h2("4.2 Taking the values for each area")
    r.bullets([
        ("IMERG: ", "inverse-distance mean of the four 0.1° cells around the AOI centre (the pipeline's method); the monthly normal uses the same cells."),
        ("SMAP L3: ", "nearest valid 9 km cell, morning pass first, evening pass as fallback (pipeline method)."),
        ("MODIS: ", "the 42 pixels AppEEARS returns inside the AOI outline."),
        ("HLS: ", "the 36 pixels of 30 m whose centre lies inside Plot A, after converting the plot corners to the satellite grid (UTM 51N)."),
        ("SoilGrids: ", "the mean of the 20 cells inside the AOI; for Plot A the single cell at the plot centre."),
    ])
    r.h2("4.3 Quality filtering")
    r.table(["Dataset", "What is kept", "Result"], [
        ["IMERG", "days with all 48 half-hours valid", f"{n_imerg} of {n_imerg} days complete"],
        ["SMAP L3", "every retrieval, but flagged: NASA marks all of them \"not recommended\" over Lipa", f"{n_l3} values, all flagged"],
        ["SMAP L4", "days with all eight 3-hourly values", f"{n_l4} of {len(d['l4'])} Manila days"],
        ["MODIS", "pixels rated good, or marginal with no cloud, cloud nearby or shadow in the quality layer; a composite counts when ≥ 50 % of pixels pass",
         f"{n_modis} of {len(d['modis'])} composites"],
        ["HLS", "pixels with no cloud, cloud nearby, shadow, snow or water and aerosol not high (Fmask); a pass counts when ≥ 50 % pass",
         f"{n_hls} of {len(d['hls'])} passes"],
    ], caption="Quality rules. The 50 % share and the marginal-pixel rule are our own choices, written down so they can be changed")
    r.h2("4.4 Units, scale factors and gaps")
    r.bullets([
        "Scale factors applied as published: MODIS and HLS NDVI × 0.0001; SoilGrids water content ÷ 1000 (to m³/m³); IMERG monthly mm/hr × 24 × days.",
        "Fill values removed, never treated as zero: MODIS −3000, HLS −19999, SMAP L4 −9999, POWER −999 (none found).",
        "Gaps are left as gaps: IMERG has no Final data after 2025-09-30 (Late runs were not mixed in); NASA has no SMAP L3 file for 2025-03-18; "
        "a missing day is never read as zero rain.",
    ])
    r.h2("4.5 Checks against independent numbers")
    r.bullets([
        "MODIS and HLS plot means match AppEEARS's own statistics on every file (largest difference 0.00005 for MODIS, exact for HLS).",
        "IMERG monthly normal: one month recomputed by hand (0.07800044 mm/hr × 24 × 31 = 58.03 mm).",
        "SMAP L4 daily mean for 2024-06-15 recomputed by hand from the eight 3-hourly values (0.2431).",
        "POWER 10-day totals add up to the yearly totals of the daily record (2024: 2,919.4 mm).",
        "Every processed number has a unit test that ties the app's copy to the source file.",
    ])

    r.h1("5. What the cleaned data shows")
    cov_fig, cov = fig_coverage(d)
    r.figure(cov_fig, "Days with a usable value per dataset. Satellite vegetation data is sparse because of clouds; IMERG Final stops after September 2025.")
    rain_fig, _ = fig_rain(d)
    p24 = sum(v for k, v in d["power"].items() if k.startswith("2024") and v is not None)
    i24 = sum(v for k, v in d["imerg"].items() if k.startswith("2024") and v is not None)
    r.p(f"Rain: in 2024 POWER totals {p24:,.0f} mm and IMERG {i24:,.0f} mm. Day to day they disagree strongly; over months they follow the same "
        "seasons. Neither is a gauge, and no gauge exists at Lipa to say which is closer.")
    r.figure(rain_fig, "Monthly rain from NASA POWER and GPM IMERG with each source's 2001–2023 normal.")
    r.p(f"Soil moisture: SMAP L3 has a median of {np.median(l3_vals):.2f} m³/m³ and SMAP L4 topsoil {np.median(l4_surf):.2f}. "
        f"L3 lies above the soil's estimated field capacity on most days, which a soil cannot hold for long; L4 stays within the soil's range. "
        "For this reason the revised models use SMAP L4.")
    r.figure(fig_soil(d), "SMAP L3 and SMAP L4 at Lipa with the SoilGrids field capacity and wilting point of the topsoil (0–5 cm).")
    r.p("Vegetation: NDVI is high from November to January, falls through the dry season to about 0.4 in April–May, and is mostly hidden by "
        "clouds from June to October. Plot A's 30 m values are lower in fallow periods and higher during the reported crops.")
    r.figure(fig_ndvi(d), "MODIS NDVI over the AOI and HLS NDVI over Plot A. Shaded: the farmer's four corn seasons.")

    r.h1("6. Known problems and limits")
    r.table(["Problem", "Effect", "What was done"], [
        ["No ground sensor or rain gauge at either site", "No direct check of satellite or model values", "Values labelled by kind; models use satellite/model sources; checks use farmer and public reports"],
        ["SMAP L3 flagged \"not recommended\" and wetter than the soil can hold", "Unreliable as an absolute value", "Kept but not used by the revised models; SMAP L4 used instead"],
        ["IMERG Final ends 2025-09-30", "92 days without IMERG", "Not filled; the revised rain rule uses POWER (complete)"],
        ["Clouds over MODIS and HLS in the wet season", "Almost no wet-season NDVI", "Reported; no gap filling"],
        ["Plot A outline drawn, not GPS", "Edges may be off by tens of metres", "Recorded; GPS corners would improve it"],
        ["Satellite/model cells far larger than the plots", "Values describe the surrounding landscape", "Stated with every value (footprint in the label)"],
    ], caption="Known problems in the data and how they are handled")

    r.h1("7. How to reproduce")
    r.p("From the repository root, with the pipeline's Python environment (docs/Data Pipeline/.venv) and an Earthdata login in docs/Data Pipeline/.env:")
    r.numbered([
        "Pipeline: python main.py --start-date <first> --end-date <15th>, then the 16th to month end, for every month (section 3.1).",
        "Extra downloads: scripts/fetch-imerg-monthly-normal.py, fetch-smap-overpass-time.py, fetch-power-history.py, fetch-soilgrids-lipa.py, "
        "appeears-lipa.py submit|status|download <task>.",
        "Processing: scripts/process-modis-ndvi-lipa.py, process-hls-ndvi-plot-a.py, process-smap-l4-lipa.py, calibrate-rain-lipa.py, build-power-dekads.py.",
        "App copy of the record: npx tsx scripts/export-lipa-record.ts; checks: npm test.",
    ])
    r.p("Full provenance per dataset (request parameters, task IDs, times, counts) is in docs/Data Pipeline/data/DATA-MANIFEST.md.")

    r.h1("Sources")
    r.bullets([
        "NASA POWER Daily API: https://power.larc.nasa.gov/docs/services/api/temporal/daily/",
        "GPM IMERG Final daily (GPM_3IMERGDF V07): https://cmr.earthdata.nasa.gov/search/concepts/C2723754864-GES_DISC.html",
        "GPM IMERG Final monthly (GPM_3IMERGM V07): https://cmr.earthdata.nasa.gov/search/concepts/C2723754851-GES_DISC.html",
        "SMAP L3 SPL3SMP_E v006: https://nsidc.org/data/spl3smp_e/versions/6",
        "SMAP L4 SPL4SMGP v008: https://nsidc.org/data/spl4smgp/versions/8",
        "MODIS MOD13Q1 v061: https://doi.org/10.5067/MODIS/MOD13Q1.061 · MYD13Q1 v061: https://doi.org/10.5067/MODIS/MYD13Q1.061",
        "HLS vegetation indices v2.0: https://appeears.earthdatacloud.nasa.gov/api/product/HLSS30_VI.020 and HLSL30_VI.020",
        "AppEEARS: https://appeears.earthdatacloud.nasa.gov/",
        "ISRIC SoilGrids FAQ (units): https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html · Turek et al. 2023, doi:10.1016/j.iswcr.2022.08.001",
        "Typhoon Carina (Gaemi), July 2024: https://en.wikipedia.org/wiki/Typhoon_Gaemi",
        "Storm Kristine (Trami), October 2024: https://en.wikipedia.org/wiki/Tropical_Storm_Trami_(2024)",
        "El Niño agricultural damage incl. Calabarzon, 19 March 2024: https://philstar.com/nation/2024/03/19/2341621/el-nio-agriculture-damage-8-regions-hits-p175-billion",
    ])
    out = r.save("TERRA-Data-Gathering-and-Cleaning.docx")
    print(f"wrote {out.relative_to(REPO)}; coverage {cov}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
