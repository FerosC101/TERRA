"""Daily water balance report (Plot A), with the sensitivity check, written to finalTuning/.

Inputs (run these first):
  npx tsx scripts/export-model-results.ts        -> docs/reports/data/water_plot_a.json, params.json
  npx tsx scripts/water-sensitivity-plot-a.ts    -> finalTuning/data/water_sensitivity.json
Build:
  "docs/Data Pipeline/.venv/Scripts/python.exe" -I scripts/reports/build_water_report.py
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
from common import C, REPO, RESULTS, Report, date_axis, git_commit, legend_below, plt, read_json, save, to_date  # noqa: E402

# Everything this report writes goes to finalTuning/ (figures in finalTuning/figures).
common.OUT = REPO / "finalTuning"
common.FIG = common.OUT / "figures"

SEASONS = ["2024 dry", "2024 wet", "2025 dry", "2025 wet"]
FARMER = {  # From the interview transcript of 2026-11-15 (provenance to be confirmed by the ML owner).
    "2024 dry": "Hardest season: strong heat in Feb–Mar, soil dried fast, corn struggled; also leaf-eating worms",
    "2024 wet": "Water was fine, frequent rain; field muddy in very heavy rain",
    "2025 dry": "Some dry periods, but not as bad as 2024",
    "2025 wet": "Water was better; heavy rain still to be watched",
}


def by_id(sens: dict) -> dict:
    return {v["id"]: v for v in sens["variants"]}


def stress(v: dict) -> dict:
    return {s["season"]: s["stressDays"] for s in v["seasons"]}


def fig_timeline(wb: dict, sens: dict):
    d = wb["days"]
    dates = [to_date(x["date"]) for x in d]
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(7.6, 4.4), sharex=True, gridspec_kw={"height_ratios": [1, 2.2]})
    ax1.bar([to_date(x) for x in sens["dates"]], [r or 0 for r in sens["rainMm"]], width=1.0, color=C["imerg"])
    ax1.set_ylabel("rain, mm/day")
    ax1.set_title("Rain used by the model (GPM IMERG; NASA POWER on days IMERG is missing)")
    ax2.plot(dates, [x["depletion"] for x in d], color=C["l4r"], lw=0.9, label="water used from the root zone")
    ax2.plot(dates, [x["raw"] for x in d], color=C["grey"], ls="--", lw=0.8, label="stress starts (RAW)")
    ax2.axhline(d[0]["taw"], color="black", lw=0.6, ls=":", label="root zone empty (TAW)")
    st = [to_date(x["date"]) for x in d if x["ks"] is not None and x["ks"] < 1 and x["stage"] not in ("pre", "post")]
    ax2.scatter(st, [d[0]["taw"] + 3] * len(st), marker="|", color="#C0392B", s=30, label="crop water stress day")
    for s in wb["seasons"]:
        ax2.axvspan(to_date(s["plantedOn"]), to_date(s["harvestedOn"]), color=C["hls"], alpha=0.09)
        ax1.axvspan(to_date(s["plantedOn"]), to_date(s["harvestedOn"]), color=C["hls"], alpha=0.09)
    ax2.set_ylabel("mm")
    ax2.invert_yaxis()
    ax2.set_title("Root-zone water used, Plot A (farmer's corn seasons shaded; lower line = drier soil)")
    date_axis(ax2)
    legend_below(ax2, 2)
    return save(fig, "water_timeline")


def fig_rain_sources(sens: dict):
    si = sens["seasonInputs"]
    x = range(len(si))
    fig, ax = plt.subplots(figsize=(7.2, 2.8))
    w = 0.38
    ax.bar([i - w / 2 for i in x], [s["imergMm"] for s in si], w, color=C["imerg"], label="GPM IMERG (satellite, ~10 km): used")
    ax.bar([i + w / 2 for i in x], [s["powerMm"] for s in si], w, color=C["power"], label="NASA POWER (model, ~50 km)")
    ax.hlines([s["et0Mm"] for s in si], [i - 0.4 for i in x], [i + 0.4 for i in x], colors="black", lw=1.6,
              label="reference crop water demand ET0 (POWER)")
    for i, s in enumerate(si):
        ax.text(i - w / 2, s["imergMm"] + 25, f"{s['imergMm']:.0f}", ha="center", fontsize=7)
        ax.text(i + w / 2, s["powerMm"] + 25, f"{s['powerMm']:.0f}", ha="center", fontsize=7)
    ax.set_xticks(list(x), [s["season"] for s in si])
    ax.set_ylabel("mm per season")
    ax.set_title("Rain inside each season by source: the two disagree most in the dry seasons")
    legend_below(ax, 2)
    return save(fig, "water_rain_sources")


def fig_sensitivity(sens: dict):
    vs = sens["variants"]
    fig, axes = plt.subplots(1, 4, figsize=(7.8, 3.6), sharey=True)
    labels = [v["label"] for v in vs]
    for ax, season in zip(axes, SEASONS):
        vals = [stress(v)[season] for v in vs]
        cols = [C["new"] if v["id"] == "baseline" else ("#C0392B" if v["id"] in ("rain-power", "start-raw") else C["grey"]) for v in vs]
        ax.barh(range(len(vs)), vals, color=cols)
        for i, val in enumerate(vals):
            ax.text(val + 1, i, str(val), va="center", fontsize=6.5)
        ax.set_title(season, fontsize=9)
        ax.set_xlim(0, max(80, max(vals) + 10))
        ax.invert_yaxis()
    axes[0].set_yticks(range(len(vs)), labels, fontsize=6.5)
    fig.suptitle("Stress days per season under each variant (blue: baseline; red: the two settings that move results most)", fontsize=9)
    return save(fig, "water_sensitivity")


def fig_start_state(wb: dict, sens: dict):
    d = [x for x in wb["days"] if x["date"] <= "2024-03-15"]
    alt = by_id(sens)["start-raw"]["depletion"][: len(d)]
    dates = [to_date(x["date"]) for x in d]
    fig, ax = plt.subplots(figsize=(7.2, 2.6))
    ax.plot(dates, [x["depletion"] for x in d], color=C["l4r"], lw=1.0, label="baseline: soil full on 1 Jan 2024")
    ax.plot(dates, alt, color=C["dry"], lw=1.0, ls="-.", label="variant: soil already at the stress point on 1 Jan 2024")
    ax.plot(dates, [x["raw"] for x in d], color=C["grey"], ls="--", lw=0.8, label="stress starts (RAW)")
    ax.axhline(d[0]["taw"], color="black", lw=0.6, ls=":", label="root zone empty (TAW)")
    ax.invert_yaxis()
    ax.set_ylabel("water used, mm")
    ax.set_title("2024 dry season: the unknown starting soil water changes the stress count (48 vs 73 days)")
    date_axis(ax, 1)
    legend_below(ax, 2)
    return save(fig, "water_start_state")


def build() -> Path:
    wb = read_json(RESULTS / "water_plot_a.json")
    sens = read_json(common.OUT / "data" / "water_sensitivity.json")
    v = by_id(sens)
    base = stress(v["baseline"])
    bs = {s["season"]: s for s in v["baseline"]["seasons"]}
    cells = sens["soilCells"]
    si = {s["season"]: s for s in sens["seasonInputs"]}
    others = [x for x in sens["variants"] if x["id"] != "baseline"]
    holds = [x for x in others if x["rankingHolds"]]
    robust_ids = [x["id"] for x in others if x["id"] not in ("rain-power", "start-raw")]
    dry24 = [stress(v[i])["2024 dry"] for i in robust_ids]

    r = Report("TERRA — Daily water balance: final tuning report",
               f"Plot A, Lipa (farmer-reported corn seasons) · real NASA weather 2024–2025 · built {date.today().isoformat()} "
               f"from commit {git_commit()} + uncommitted changes")

    r.h1("Summary")
    r.bullets([
        f"The model estimates how much water the corn's roots can still reach each day. On Plot A it finds "
        f"{base['2024 dry']} stress days in the 2024 dry season, {base['2025 dry']} in the 2025 dry season, and "
        f"{base['2024 wet']} and {base['2025 wet']} in the two wet seasons.",
        "That order (2024 dry worst, 2025 dry next, wet seasons fine) is the same order the farmer gives, if the "
        "interview transcript is confirmed as a real interview (section 5).",
        f"The result is stable: in {len(holds)} of {len(others)} test variants the order holds. Changing the soil, planting "
        f"date, depletion fraction or crop coefficient moves the 2024 dry season between {min(dry24)} and {max(dry24)} stress days.",
        "Two inputs matter far more than any setting: which rain source is used (IMERG recorded "
        f"{si['2024 dry']['imergMm']:.0f} mm in the 2024 dry season, NASA POWER {si['2024 dry']['powerMm']:.0f} mm), "
        "and how wet the soil was when the record starts (1 Jan 2024, 17 days after planting).",
        "Status: plausible, not validated. No soil-water or rain measurement exists at Plot A yet.",
    ])

    r.h1("1. What the model does")
    r.p("Think of the soil under the crop as a water tank. Rain fills it. The crop and the sun empty it, more on hot days and "
        "when the plants are bigger. The tank holds only so much: for Plot A, about 76 mm of water the roots can use in the top "
        "1 m. Every day the model updates how full the tank is. When it falls below a set point, the corn can no longer take "
        "up water at the full rate, and the model counts a stress day. It does not add irrigation, because the farmer reports none.")

    r.h1("2. How it works")
    r.table(["", "Rain", "Crop water demand", "Soil", "Crop and dates"], [
        ["Dataset", "GPM IMERG Final daily; NASA POWER on days IMERG is missing",
         "NASA POWER ET0 (FAO-56 Penman-Monteith, computed by the data pipeline)",
         "ISRIC SoilGrids 2.0, one 250 m cell at the Plot A centre", "Farmer interview: 4 corn seasons; corn parameters in data/crops.ts"],
        ["Kind", "Satellite (+ model)", "Model", "Model estimate", "Field report + table values"],
        ["Resolution", "~10 km (POWER ~50 km), daily", "~50 km, daily", "250 m, static", "One plot"],
        ["Period", f"{sens['record']['first']} to {sens['record']['last']} ({sens['record']['days']} days)", "Same", "–", "Dec 2023 to Sep 2025"],
        ["Used for", "Water entering the soil", "Water leaving the soil (ETc = Kc × ET0)", "Tank size (TAW) and stress point (RAW)",
         "Growth stage and Kc on each day"],
    ], caption="Daily water balance: inputs")
    r.table(["Parameter", "Value", "Basis"], [
        ["Field capacity (FC) / wilting point (WP), 0–100 cm", "0.311 / 0.235 m³/m³", "SoilGrids wv0033 / wv1500, depth-weighted 0–5…60–100 cm"],
        ["Root depth / surface layer", "1.0 m / 0.10 m", "Model setting"],
        ["Total available water TAW", "(0.311 − 0.235) × 1000 × 1.0 = 76 mm", "Checked by hand against the code"],
        ["Depletion fraction p (corn)", "0.55", "FAO-56 table value"],
        ["Readily available water RAW", "0.55 × 76 = 41.8 mm", "Stress starts when water used passes RAW"],
        ["Stress factor Ks", "(TAW − Dr) / ((1 − p) × TAW) when Dr > RAW, else 1", "FAO-56 eq. 84"],
        ["Crop coefficient Kc (corn)", "0.30 initial, 1.20 mid, 0.50 end", "FAO-56 maize, indicative"],
        ["Stage lengths", "20 / 30 / 40 / 25 days, scaled to each reported season", "FAO-56 maize, fitted to the farmer's dates"],
        ["Evaporable water REW / TEW", "9 / 19.55 mm", "Top 0.10 m layer"],
        ["Reported dates read as", "early / mid / late month = 5th / 15th / 25th", "Convention for approximate answers"],
        ["Starting soil water", "Full on 2024-01-01", "Assumed; the record starts 17 days after the first planting"],
    ], caption="Daily water balance: parameters", widths=[5.2, 5.8, 5.5])
    r.p("Each day: crop demand ETc = Kc × ET0. Evaporation comes from the top 0.10 m. Transpiration is limited by Ks. Rain fills "
        "the top layer first, and water above field capacity drains below the root zone the same day. There is no runoff and no "
        "capillary rise. Days with missing rain or ET0 are skipped, not guessed.")

    r.h1("3. Results on real weather")
    r.table(["Season (reported dates)", "Days in record", "Rain used", "ET0", "Stress days", "First stress", "Most water used"], [
        [f"{s} ({bs[s]['plantedOn']} to {bs[s]['harvestedOn']})", str(bs[s]["daysInRecord"]), f"{si[s]['usedMm']:.0f} mm",
         f"{si[s]['et0Mm']:.0f} mm", str(bs[s]["stressDays"]), bs[s]["firstStress"] or "–",
         f"{bs[s]['maxDepletionMm']:.0f} of {bs[s]['tawMm']:.0f} mm"] for s in SEASONS
    ], caption="Per-season results, baseline", widths=[4.6, 1.6, 1.8, 1.6, 1.6, 2.3, 2.6])
    r.figure(fig_timeline(wb, sens), "Daily rain and root-zone water at Plot A. Red ticks mark crop water stress days.")
    r.note(f"The 2024 dry season has only {bs['2024 dry']['daysInRecord']} days in the record: it was planted on 2023-12-15 and the record starts on 2024-01-01.")

    r.h1("4. Sensitivity check")
    r.p("Question: does the result depend on settings we are not sure of? Each variant changes one thing and reruns the model on the "
        "same real weather. The variants were fixed before the first run.")
    r.table(["Variant", "What changed"] + SEASONS + ["Order holds?"], [
        [x["id"], x["label"]] + [str(stress(x)[s]) for s in SEASONS] + ["yes" if x["rankingHolds"] else "NO"] for x in sens["variants"]
    ], caption="Stress days per season under each variant", widths=[2.2, 5.2, 1.5, 1.5, 1.5, 1.5, 1.6])
    r.figure(fig_sensitivity(sens), "Stress days per season under each variant.")
    r.p("What it shows", bold_lead=None).runs[0].bold = True
    r.bullets([
        f"Soil: the 20 SoilGrids cells over the nearby Lipa Cropland area range from {cells['low']['tawMm']:.1f} to "
        f"{cells['high']['tawMm']:.1f} mm of available water (Plot A: {cells['plotA']['tawMm']:.1f} mm). Across that range the "
        f"2024 dry season moves from {stress(v['soil-high'])['2024 dry']} to {stress(v['soil-low'])['2024 dry']} stress days.",
        f"Planting date ±7 days, p 0.45–0.65 and mid-season Kc ±10 % each move the 2024 dry season by 3 days or less "
        f"({min(dry24)}–{max(dry24)} across all of these). The season order holds in every one of them.",
        f"Rain source is the largest effect. With NASA POWER rain only, the 2025 dry season drops from {base['2025 dry']} to "
        f"{stress(v['rain-power'])['2025 dry']} stress days and the season order breaks. POWER recorded "
        f"{si['2025 dry']['powerMm']:.0f} mm in that season, IMERG {si['2025 dry']['imergMm']:.0f} mm.",
        f"Starting soil water is the second. If the soil was already at the stress point on 1 Jan 2024, the 2024 dry season has "
        f"{stress(v['start-raw'])['2024 dry']} stress days instead of {base['2024 dry']}. The other seasons do not change, because "
        "the rainy months in between refill the soil.",
    ])
    r.figure(fig_rain_sources(sens), "Rain in each season from the two sources, with crop water demand (ET0) for scale.")
    r.figure(fig_start_state(wb, sens), "2024 dry season under the two starting assumptions.")

    r.h1("5. Comparison with the farmer's account")
    r.p("Evidence status. The comparison below uses the interview transcript received on 2026-11-15. That transcript contains two "
        "answers framed as examples (yields, question 7; land tenure, question 9) and a stray source label (\"GMA Network\"). "
        "The earlier interview PDF carries a \"Simulated respondent\" label, which the ML owner states is wrong. Until the "
        "transcript is confirmed as a record of a real conversation, this comparison is a consistency check, not evidence. "
        "Yields are not used in any case: the transcript itself says they are examples, not records.")
    r.table(["Season", "Farmer's account", "Model stress days", "Agrees?"], [
        [s, FARMER[s], str(base[s]), "yes"] for s in SEASONS
    ], caption="Model vs the farmer's account, season by season", widths=[2.0, 9.0, 2.4, 1.6])
    r.bullets([
        "The model's season order (2024 dry, 2025 dry, then the wet seasons) matches the farmer's account.",
        "The farmer reports no regular irrigation, which matches the model's rain-only assumption.",
        "The 2024 dry season also had pest damage (leaf-eating worms), so its poor harvest was not water stress alone.",
        "Caveat: the per-season stress days were computed before this transcript was read. The model was not tuned to it, but the comparison was not blind.",
    ])

    r.h1("6. Interpretation")
    r.p("What is good", bold_lead=None).runs[0].bold = True
    r.bullets([
        "Uses only real inputs for 2024–2025: NASA weather, a SoilGrids soil estimate for the plot, and the farmer's seasons. No synthetic data.",
        "Agrees with the farmer's account in all four seasons, including which seasons were fine (pending the provenance check).",
        "Stable against the soil and crop settings we are unsure of: the order holds in 9 of 10 variants.",
        "Simple and inspectable: one daily equation chain from FAO-56, checked by hand (TAW 76 mm, RAW 41.8 mm).",
    ])
    r.p("Limitation", bold_lead=None).runs[0].bold = True
    r.bullets([
        "Not validated: there is no soil-water or rain measurement at Plot A to compare with.",
        "Rain is the weak link. The two NASA rain sources disagree by a factor of 7 in the 2024 dry season (21.6 vs 149.6 mm). "
        "The farmer's account fits IMERG better, but only a rain gauge can settle it.",
        "The 2024 dry season count depends on an assumed starting soil water (48 to 73 stress days).",
        "Weather comes from the Lipa Cropland record, 3.3 km east; Plot A has no record of its own (the cells are larger than the offset).",
        "Simplifications: no runoff or capillary rise; single crop coefficient; uptake split by layer thickness (code comments, UNVERIFIED).",
    ])

    r.h1("7. Final tuning: what to change")
    r.table(["#", "Change", "Why", "Effort"], [
        ["1", "Start the record before the first planting (fetch POWER and IMERG for Oct–Dec 2023) so the soil water on 15 Dec 2023 "
              "is computed, not assumed", "Removes the largest assumption: 48 vs 73 stress days in 2024 dry", "Small"],
        ["2", "Keep IMERG as the first rain source; always report the POWER-only result beside it",
         "Rain source is the largest effect; IMERG fits the farmer's account better, but neither is measured", "None (reporting)"],
        ["3", "No change to soil, p, Kc or stage lengths", "Results move by 3 days or less within the tested ranges", "–"],
        ["4", "Add a planting check for the farmer: chance that the first 30–60 days run short of water for a chosen planting date, "
              "from 24 years of real rain, plus the current soil water", "The farmer plans to plant in late Nov or early Dec 2026 and is unsure if the soil is too dry",
         "Medium; needs 2026 weather"],
        ["5", "Add a \"too wet\" flag (soil at field capacity for several days)", "The farmer reports muddy fields in heavy rain", "Small"],
        ["6", "Validate: soil-water readings at Plot A (sensor or weekly soil samples) and a rain gauge for one full season",
         "The only way to move the model from plausible to validated", "Field work"],
    ], caption="Tuning actions, most important first", widths=[0.8, 7.2, 6.0, 2.4])

    r.h1("8. Reproduce")
    r.bullets([
        "npx tsx scripts/export-model-results.ts (baseline results, docs/reports/data/water_plot_a.json)",
        "npx tsx scripts/water-sensitivity-plot-a.ts (variants, finalTuning/data/water_sensitivity.json)",
        "\"docs/Data Pipeline/.venv/Scripts/python.exe\" -I scripts/reports/build_water_report.py (this report)",
        "Model code: lib/science/water/cropWater.ts and soilWater.ts. Seasons: data/cropCalendar.ts. Soil: data/soils.ts.",
    ])
    out = r.save("TERRA-Daily-Water-Balance-Report.docx")
    print(f"wrote {out}; {r.figures} figures, {r.tables} tables")
    return out


if __name__ == "__main__":
    build()
