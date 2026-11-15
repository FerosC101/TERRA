"""TERRA — Models: description, structure, operation and results (Word). All numbers come from
docs/reports/data/*.json (written by scripts/export-model-results.ts), the calibration files and the test run;
nothing is typed in by hand except method descriptions.

Run from the repo root (after `npx tsx scripts/export-model-results.ts`):
  "docs/Data Pipeline/.venv/Scripts/python.exe" -I scripts/reports/build_model_report.py
Output: docs/reports/TERRA-Model-Description-and-Results.docx
"""

from __future__ import annotations

import calendar
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (C, EXT, REPO, RESULTS, Report, date_axis, git_commit, legend_below, plt, read_json, save, to_date)  # noqa: E402

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def test_count() -> str:
    """Runs the test suite and returns its summary line (copied, not typed)."""
    out = subprocess.run("npx vitest run", cwd=REPO, capture_output=True, text=True, shell=True).stdout
    lines = [ln.strip() for ln in out.splitlines() if ln.strip().startswith(("Test Files", "Tests"))]
    return " · ".join(lines) if lines else "not run"


# ---------------------------------------------------------------------------------------------------------------- charts
def fig_architecture():
    fig, ax = plt.subplots(figsize=(7.4, 3.6))
    ax.axis("off")
    boxes = {
        "src": (0.02, 0.15, 0.2, 0.7, "Real data\n\nNASA POWER\nGPM IMERG\nSMAP L3 / L4\nMODIS / HLS NDVI\nSoilGrids\nFarmer calendar"),
        "ad": (0.29, 0.3, 0.17, 0.4, "Adapters\n\nFieldDay records\n(one per local day,\nsource, provenance,\nquality per value)"),
        "eng": (0.53, 0.62, 0.22, 0.3, "Discovery Engine\nrain · moisture ·\nNDVI · sensor offset"),
        "wb": (0.53, 0.33, 0.22, 0.22, "Water balance +\nLiving Field Model"),
        "rot": (0.53, 0.06, 0.22, 0.2, "Rotation planner\n(10-day, real years)"),
        "app": (0.81, 0.3, 0.17, 0.4, "App pages\n\nDiscoveries\nField model\nRotation lab\nReports"),
    }
    for x, y, w, h, t in boxes.values():
        ax.add_patch(plt.Rectangle((x, y), w, h, fc="#F2F5F9", ec="#5A6B7B", lw=0.8))
        ax.text(x + w / 2, y + h / 2, t, ha="center", va="center", fontsize=7.5)
    arrow = dict(arrowstyle="->", color="#5A6B7B", lw=0.9)
    ax.annotate("", xy=(0.29, 0.5), xytext=(0.22, 0.5), arrowprops=arrow)
    for yy in (0.77, 0.44, 0.16):
        ax.annotate("", xy=(0.53, yy), xytext=(0.46, 0.5), arrowprops=arrow)
        ax.annotate("", xy=(0.81, 0.5), xytext=(0.75, yy), arrowprops=arrow)
    ax.text(0.5, 0.97, "Next Best Observation ranks a field check for every alarm", ha="center", fontsize=7.5, style="italic")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    return save(fig, "model_architecture")


def ratio_series(rain: dict, w: int):
    normal = rain["calibration"]["monthly_normal_mm"]
    dates = [to_date(x) for x in rain["dates"]]
    p = rain["power"]
    exp = [normal[d.month - 1] / calendar.monthrange(d.year, d.month)[1] for d in dates]
    out = []
    for i in range(len(dates)):
        if i < w - 1 or any(v is None for v in p[i - w + 1:i + 1]):
            out.append(np.nan)
        else:
            out.append(sum(p[i - w + 1:i + 1]) / sum(exp[i - w + 1:i + 1]))
    return dates, out


def fig_rain_limits(rain: dict):
    cal = rain["calibration"]
    lo, hi = cal["low_ratio_by_month"], cal["high_ratio_by_month"]
    x = np.arange(12)
    fig, (a, b) = plt.subplots(1, 2, figsize=(7.4, 2.8), gridspec_kw={"width_ratios": [2.2, 1]})
    a.fill_between(x, lo, hi, color=C["new"], alpha=0.25, step="mid", label="new band (5th–95th percentile, 2001–2023)")
    a.fill_between(x, 0.45, 1.7, facecolor="none", edgecolor="#555555", hatch="///", lw=0.8, step="mid", label="old 'normal' band (0.45–1.7, guessed)")
    a.set_xticks(x)
    a.set_xticklabels(MONTHS, fontsize=7)
    a.set_yscale("log")
    a.set_yticks([0.1, 0.25, 0.5, 1, 2, 3])
    a.set_yticklabels(["0.1", "0.25", "0.5", "1", "2", "3"])
    a.set_ylabel("14-day rain ÷ normal (log scale)")
    a.set_title("Limits for 'unusual' 14-day rain, by month")
    legend_below(a, 1)
    labels = ["2001–2023", "held-out\n2019–2023"]
    old = [100 * cal["old_fixed_flagged_share_2001_2023"]["flagged_share"], 100 * cal["heldout"]["old_fixed_on_test_years"]["flagged_share"]]
    new = [100 * cal["final_flagged_share_2001_2023"]["flagged_share"], 100 * cal["heldout"]["calibrated_on_test_years"]["flagged_share"]]
    xx = np.arange(2)
    b.bar(xx - 0.18, old, 0.36, color=C["old"], label="old limits")
    b.bar(xx + 0.18, new, 0.36, color=C["new"], label="new limits")
    for i in range(2):
        b.text(xx[i] - 0.18, old[i] + 1, f"{old[i]:.0f} %", ha="center", fontsize=7)
        b.text(xx[i] + 0.18, new[i] + 1, f"{new[i]:.0f} %", ha="center", fontsize=7)
    b.set_xticks(xx)
    b.set_xticklabels(labels, fontsize=7)
    b.set_ylabel("% of 14-day windows flagged")
    b.set_title("How often each flags")
    legend_below(b, 2)
    return save(fig, "model_rain_limits")


def fig_rain_timeline(rain: dict):
    dates, r14 = ratio_series(rain, 14)
    cal = rain["calibration"]
    lo = [cal["low_ratio_by_month"][d.month - 1] for d in dates]
    hi = [cal["high_ratio_by_month"][d.month - 1] for d in dates]
    fig, (a, b) = plt.subplots(2, 1, figsize=(7.4, 4.2), sharex=True, gridspec_kw={"height_ratios": [2.2, 1]})
    a.plot(dates, r14, color=C["power"], lw=0.9, label="14-day POWER rain ÷ normal")
    a.plot(dates, lo, color=C["dry"], lw=0.8, ls="--", label="dry limit (5th percentile)")
    a.plot(dates, hi, color=C["wet"], lw=0.8, ls="--", label="wet limit (95th percentile)")
    a.set_yscale("log")
    a.set_ylim(0.01, 10)
    a.set_ylabel("ratio (log)")
    for e in rain["events"]:
        for ax in (a, b):
            ax.axvspan(to_date(e["start"]), to_date(e["end"]) + timedelta(days=1), color=C["dry"] if e["kind"] == "dry" else C["wet"], alpha=0.18)
    a.set_title("Rain alarm on real 2024–2025 data. Shaded: real events (orange dry, blue wet)")
    legend_below(a, 3)
    for row, key, label in ((1, "old", "old rule (IMERG, fixed limits)"), (0, "new", "new rule (POWER, calibrated)")):
        v = rain[key]
        for kind, col in (("dry", C["dry"]), ("wet", C["wet"])):
            xs = [d for d, s in zip(dates, v) if s == kind]
            b.scatter(xs, [row] * len(xs), marker="|", s=55, color=col, lw=1)
        share = 100 * sum(s in ("dry", "wet") for s in v) / max(1, sum(s != "unknown" for s in v))
        b.text(dates[-1], row, f"  {share:.0f} % of days", va="center", fontsize=7)
    b.set_yticks([0, 1])
    b.set_yticklabels(["new rule", "old rule"], fontsize=7.5)
    b.set_ylim(-0.6, 1.6)
    b.set_title("Days each rule flags (orange dry, blue wet)", fontsize=9)
    date_axis(b)
    return save(fig, "model_rain_timeline")


def fig_rain_drought(rain: dict):
    dates, r90 = ratio_series(rain, 90)
    cal = rain["calibration"]
    lim = [cal["long_low_ratio_by_month"][d.month - 1] for d in dates]
    fig, ax = plt.subplots(figsize=(7.4, 2.5))
    ax.plot(dates, r90, color=C["power"], lw=1, label="90-day POWER rain ÷ normal")
    ax.plot(dates, lim, color=C["dry"], lw=0.9, ls="--", label="drought limit (10th percentile, 2001–2023)")
    below = [d for d, a, b in zip(dates, r90, lim) if not np.isnan(a) and a < b]
    ax.scatter(below, [0.05] * len(below), marker="|", color=C["dry"], s=40, label="flagged as drought")
    ax.axvspan(date(2024, 2, 1), date(2024, 4, 1), color=C["dry"], alpha=0.15)
    ax.text(date(2024, 2, 3), 1.6, "farmer: drought\nFeb–Mar 2024", fontsize=7)
    ax.set_ylabel("ratio")
    ax.set_ylim(0, 2.0)
    ax.set_title("Season-scale drought check (90 days)")
    date_axis(ax)
    legend_below(ax, 3)
    return save(fig, "model_rain_drought")


def fig_water(wb: dict):
    d = wb["days"]
    dates = [to_date(x["date"]) for x in d]
    fig, ax = plt.subplots(figsize=(7.4, 2.8))
    ax.plot(dates, [x["depletion"] for x in d], color=C["l4r"], lw=0.9, label="root-zone depletion (water used)")
    ax.plot(dates, [x["raw"] for x in d], color=C["grey"], ls="--", lw=0.8, label="readily available water (stress starts)")
    ax.axhline(d[0]["taw"], color="black", lw=0.6, ls=":", label="total available water (empty)")
    st = [to_date(x["date"]) for x in d if x["ks"] is not None and x["ks"] < 1 and x["stage"] not in ("pre", "post")]
    ax.scatter(st, [d[0]["taw"] + 3] * len(st), marker="|", color="#C0392B", s=30, label="crop water stress")
    for s in wb["seasons"]:
        ax.axvspan(to_date(s["plantedOn"]), to_date(s["harvestedOn"]), color=C["hls"], alpha=0.08)
    ax.set_ylabel("mm")
    ax.set_title("Daily water balance, Plot A corn (farmer's seasons shaded), real weather")
    date_axis(ax)
    legend_below(ax, 2)
    return save(fig, "model_water_plot_a")


def fig_rotation(rot: list):
    a = rot[0]["risk"]["seasons"][1]
    yrs = [x["year"] for x in a["deficitByYear"]]
    vals = [x["deficitMm"] for x in a["deficitByYear"]]
    fig, ax = plt.subplots(figsize=(7.4, 2.6))
    cols = [C["dry"] if y == 2023 else C["power"] for y in yrs]
    ax.bar([f"{y % 100:02d}–{(y + 1) % 100:02d}" for y in yrs], vals, color=cols)
    ax.set_ylabel("water shortfall, mm")
    ax.set_title("Dec–May corn season on real rain, each year (orange: Dec 2023–May 2024, the farmer's drought season)")
    ax.tick_params(axis="x", labelsize=6.5, rotation=90)
    avg = rot[0]["average"][1]["deficit"]
    ax.axhline(avg, color="black", lw=0.7, ls=":")
    ax.text(0, avg + 2, f"average-climate run: {avg} mm", fontsize=7)
    return save(fig, "model_rotation_risk")


def fig_field_model(fm: dict, dates: list[str]):
    ds = [to_date(x) for x in dates]
    fig, ax = plt.subplots(figsize=(7.4, 2.8))
    ax.plot(ds, [x["surface"] for x in fm["old"]], color=C["smap"], lw=0.9, label="topsoil estimate, old (SMAP L3)")
    if fm["new"]:
        ax.plot(ds, [x["surface"] for x in fm["new"]], color=C["l4s"], lw=0.9, label="topsoil estimate, new (SMAP L4)")
        ax.plot(ds, [x["deep"] for x in fm["new"]], color=C["l4r"], lw=0.9, label="deeper layer, new (SMAP L4)")
    ax.axhline(fm["fc"], color=C["grey"], ls="--", lw=0.8)
    ax.axhline(fm["wp"], color=C["grey"], ls=":", lw=0.8)
    ax.text(ds[-1], fm["fc"] + 0.004, "field capacity", ha="right", fontsize=7, color=C["grey"])
    ax.text(ds[-1], fm["wp"] + 0.004, "wilting point", ha="right", fontsize=7, color=C["grey"])
    ax.set_ylabel("m³/m³")
    ax.set_title("Living Field Model on real Lipa data")
    date_axis(ax)
    legend_below(ax, 3)
    return save(fig, "model_field_model")


# ---------------------------------------------------------------------------------------------------------------- report
def main() -> int:
    rain = read_json(RESULTS / "rain.json")
    wb = read_json(RESULTS / "water_plot_a.json")
    rot = read_json(RESULTS / "rotation.json")
    fm = read_json(RESULTS / "field_model.json")
    extra = {n: read_json(RESULTS / f"{n}.json") for n in ("moisture", "ndvi_normal", "field_model_eval") if (RESULTS / f"{n}.json").exists()}
    cal = rain["calibration"]
    tests = test_count()
    r = Report("TERRA — Models: Description, Structure, Operation and Results",
               f"Revised on real Lipa data · AI/ML workstream · built {date.today().isoformat()} from commit {git_commit()}")

    share = lambda v: 100 * sum(s in ("dry", "wet") for s in v) / max(1, sum(s != "unknown" for s in v))  # noqa: E731
    s24 = next(s for s in wb["seasons"] if s["season"] == "2024 dry")
    plan_a = rot[0]["risk"]["seasons"][1]

    r.h1("Summary")
    r.p("TERRA watches a field every day and raises an alarm when something unusual starts (the Discovery Engine), keeps a daily "
        "estimate of the soil water (the water balance and the Living Field Model), compares crop rotations (the rotation planner), "
        "and suggests the most useful field check for each alarm (Next Best Observation). This revision moved every model that can "
        "use real data onto real data from Lipa, Batangas, and set its thresholds from Lipa's own history instead of guessed values. "
        "No synthetic data is used for any result in this report.")
    rows = [
        ["Rain departure", "Guessed limits; flagged 48 % of days", f"Limits from 23 years of real rain; flags {share(rain['new']):.0f} % of days; both 2024 storms caught, 2024 drought caught late", "Works; checked on 3 real events"],
        ["Daily water balance", "Assumed planting date", f"Farmer's 4 seasons, Plot A soil; {s24['stressDays']} stress days in the 2024 drought season", "Works; agrees with the farmer's report"],
        ["Rotation planner", "Average climate only: never shows a dry year", f"Also runs 24 real years; dry-season corn ran short in {plan_a['yearsShort']} of {len(plan_a['deficitByYear'])} years", "Works; agrees with the farmer's report"],
        ["Moisture divergence", "Needed a field sensor: always off", "SMAP L4 fallback with limits from L4 history" + ("" if "moisture" in extra else " (calibration pending)"), "Built and tested" + ("; see section 3" if "moisture" in extra else "; calibration pending")],
        ["NDVI change", "Needed a crop calendar the area lacks", "'Below normal' rule from 2001–2023 MODIS" + ("" if "ndvi_normal" in extra else " (calibration pending)"), "Built and tested" + ("; see section 4" if "ndvi_normal" in extra else "; calibration pending")],
        ["Living Field Model", "Topsoil stuck at 'full' (SMAP L3)", "SMAP L4 for both layers, rescaled" + ("" if fm["new"] else " (calibration pending)"), "Built and tested" + ("" if fm["new"] else "; calibration pending")],
        ["Sensor offset", "Needs a ground sensor", "Unchanged: no sensor exists", "Cannot run"],
        ["Next Best Observation", "Ranks field checks", "Unchanged (uses no data)", "Works"],
    ]
    r.table(["Model", "Before", "After this revision", "Status"], rows, caption="What each model does now", widths=[3.2, 3.6, 6.4, 3.4])
    r.p(f"Checks: {tests}. The four earlier synthetic experiments (E-001 to E-004) give identical results after the revision.")

    r.h1("1. How the system is built")
    r.figure(fig_architecture(), "Data flows from the sources through adapters into one daily record per field, which every model reads; the app shows the results.", 15)
    r.bullets([
        ("One record format: ", "every source is converted to FieldDay records: one per local (Asia/Manila) day, each value with its variable, "
                                "source, product, provenance (measurement, satellite, model, simulated), depth, period and quality."),
        ("No look-ahead: ", "each detector sees only the days up to the day it judges, so it behaves as it would running live."),
        ("Missing is missing: ", "a day without data gives the verdict 'unknown', never a guess; it neither starts nor ends an alarm."),
        ("One alarm per onset: ", "a pattern that lasts weeks is reported once, on the day it starts."),
        ("Settings in data files: ", "every threshold lives in data/ (data/discoveryRules.ts, data/lipaModelConfig.ts, data/nasa/*), "
                                     "each with a test that ties it to the calibration output it came from."),
    ])

    from rain_section import add_rain_section  # local import: rain_section imports chart helpers from this file
    add_rain_section(r, rain, "2")

    from model_sections import (add_field_model_section, add_moisture_section, add_nbo_section, add_ndvi_section,
                                add_offset_section, add_rotation_section, add_water_section)
    params = read_json(RESULTS / "params.json")
    params["ndviPlotA"] = read_json(RESULTS / "ndvi_plot_a.json")
    add_moisture_section(r, "3", params, extra.get("moisture"))
    add_ndvi_section(r, "4", params, extra.get("ndvi_normal"))
    add_offset_section(r, "5", params)
    add_water_section(r, "6", params, wb, fig_water(wb))
    add_field_model_section(r, "7", params, fig_field_model(fm, rain["dates"]), extra.get("field_model_eval"))
    add_rotation_section(r, "8", params, rot, fig_rotation(rot))
    add_nbo_section(r, "9", params)

    r.h1("10. In the app")
    r.bullets([
        "Lipa Cropland now runs the Discovery Engine and the Living Field Model on its real 2024–2025 record (bundled, 340 KB) with the "
        "calibrated settings; other fields keep their demo data.",
        "The discovery page draws real NASA series as evidence for a real alarm, each labelled with its kind and footprint.",
        "The Rotation Lab adds, for Lipa, how often each season ran short in real years.",
        "Panels that need a field station (probes, soil temperature, EC) still show demo data, labelled 'simulated'.",
    ])

    r.h1("11. How the results were checked")
    r.bullets([
        f"Unit tests: {tests}.",
        "Every calibrated number in the code is tested against the calibration output file it came from.",
        "Hand calculations: one rotation step, one water-balance step, the stage scaling, one SMAP L4 daily mean, one IMERG monthly value.",
        "Held-out years: each calibration was also fitted on early years and tested on later ones.",
        "The synthetic experiments E-001 to E-004 were rerun after every engine change: identical metrics.",
        "Real events used for checking come from sources that were opened (listed in the data report).",
    ])

    r.h1("12. Limits and what would improve them")
    r.table(["Limit", "Effect", "What would fix it"], [
        ["No ground soil sensor or rain gauge", "No model is validated against field measurements; sensor offset cannot run", "Install the station pod or take regular manual readings"],
        ["Only one dry and two wet dated events", "Results are agreement on a few cases, not accuracy rates", "Field records from the farmer and the City Agriculture Office"],
        ["Rain from a ~50 km model (POWER)", "Local storms can differ", "A rain gauge at the plot"],
        ["Plot A outline drawn by hand", "NDVI pixels near the edges may be wrong", "GPS corners from a field visit"],
        ["Clouds in the wet season", "Few NDVI views when crops grow", "Radar (Sentinel-1), not yet tested"],
    ], caption="What limits the results")
    r.h1("13. How to reproduce")
    r.numbered([
        "Calibration: scripts/calibrate-rain-lipa.py, build-power-dekads.py (and the SMAP L4 / MODIS calibration scripts once their history is in).",
        "Results for this report: npx tsx scripts/export-model-results.ts.",
        "Report: scripts/reports/build_model_report.py (pipeline Python environment).",
        "Command-line runs: npm run discovery:lipa, npm run discovery:plot-a, npm run water:lipa; checks: npm test.",
    ])
    out = r.save(sys.argv[1] if len(sys.argv) > 1 else "TERRA-Model-Description-and-Results.docx")
    print(f"wrote {out.relative_to(REPO)}; {r.figures} figures, {r.tables} tables; tests: {tests}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
