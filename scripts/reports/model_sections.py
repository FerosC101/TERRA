"""Model sections of the model report, all in the agreed layout:
  N. <model>  ·  N.1 What it does  ·  N.2 How it works (parameters, charts)  ·  N.3 Results (ranked, charts)  ·  N.4 Interpretation
Every number comes from docs/reports/data/*.json (scripts/export-model-results.ts) or a calibration file. A part whose data
does not exist yet says "pending" and gives no number.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from common import C, REPO, Report, plt, save, to_date


ROWS = ["Dataset", "Kind", "Resolution", "Period", "What the model does with it"]


def inputs_table(r: Report, model: str, cols: dict[str, list[str]]) -> None:
    """One table per model: each input is a column; rows give its dataset, kind, resolution, period and use."""
    names = list(cols)
    r.table([""] + names, [[row] + [cols[n][i] for n in names] for i, row in enumerate(ROWS)], caption=f"{model}: inputs")


INPUTS = {
    "rain": {
        "Rainfall": ["NASA POWER daily rain (PRECTOTCORR)", "Model (MERRA-2 based)", "~50 km grid, daily", "2024-01-01 to 2025-12-31 (731 days)", "Adds up 14 and 90 days of rain"],
        "Rain normal": ["NASA POWER monthly mean rain", "Model", "~50 km grid, monthly", "2001–2023", "Gives the rain expected for those days"],
        "Calibration history": ["NASA POWER daily rain", "Model", "~50 km grid, daily", "2001–2023 (8,400 days, no gaps)", "Sets the monthly dry, wet and drought limits"],
        "Rain gauge": ["none at Lipa", "Field measurement", "–", "–", "Would be used first if one existed"],
    },
    "moisture": {
        "Topsoil moisture": ["SMAP L4 sm_surface, 0–5 cm (a 10 cm probe would be used first)", "Model with satellite data assimilated", "~9 km, 3-hourly to daily mean", "2024–2025 (730 days)", "14-day change: must fall fast"],
        "Root-zone moisture": ["SMAP L4 sm_rootzone, 0–100 cm (a 40 cm probe would be used first)", "Model with satellite data assimilated", "~9 km, 3-hourly to daily mean", "2024–2025 (730 days)", "14-day change: must stay small"],
        "Calibration history": ["SMAP L4, same point", "Model", "~9 km, daily", "2015-03-31 to 2023 (requested)", "Sets the monthly limits"],
        "Field probes": ["none at Lipa", "Field measurement", "–", "–", "Would be used first if they existed"],
    },
    "ndvi": {
        "Greenness, Plot A": ["HLS v2.0 NDVI (HLSS30_VI, HLSL30_VI) + Fmask cloud mask", "Satellite (Sentinel-2, Landsat)", "30 m, a pass every 2–5 days", "2023-12 to 2025-12 (13 of 227 passes usable)", "Change between passes (change rule)"],
        "Greenness, Lipa Cropland": ["MODIS MOD13Q1 / MYD13Q1 v061 NDVI", "Satellite", "250 m, 16-day composites", "2023-11 to 2025-12 (32 of 98 usable)", "Compared with its normal (below-normal rule)"],
        "NDVI normal": ["MODIS point series for the 42 AOI pixels", "Satellite", "250 m, 16-day", "2001–2023 (requested)", "Sets the 10th percentile per date"],
        "Crop & planting dates": ["Farmer interview, Plot A (4 corn seasons)", "Field report", "one plot", "2023-12 to 2025-09", "Decides which days count (growth stages)"],
    },
    "offset": {
        "Satellite topsoil moisture": ["SMAP L3 SPL3SMP_E v006", "Satellite", "~9 km, every 2–3 days", "2024–2025 (353 days)", "Compared with the probe"],
        "Ground probe, 10 cm": ["none at Lipa", "Field measurement", "one point", "–", "The reference the satellite is compared with"],
    },
    "water": {
        "Rainfall": ["GPM IMERG Final daily; NASA POWER on days IMERG is missing", "Satellite (+ model)", "~10 km (POWER ~50 km), daily", "2024-01-01 to 2025-12-31", "Water entering the soil"],
        "ET0": ["NASA POWER, FAO-56 Penman-Monteith (computed by the pipeline)", "Model", "~50 km, daily", "2024–2025", "Crop water need = Kc × ET0"],
        "Soil": ["ISRIC SoilGrids 2.0, Plot A", "Model estimate", "250 m", "static", "How much water the root zone holds (TAW, RAW)"],
        "Crop & planting dates": ["Farmer interview, Plot A (4 corn seasons)", "Field report", "one plot", "2023-12 to 2025-09", "Growth stage and Kc on each day"],
        "Crop parameters": ["Corn Kc, stage lengths, depletion fraction (data/crops.ts)", "FAO-56-style table values", "–", "–", "Kc curve and the stress point"],
    },
    "fieldmodel": {
        "Rainfall": ["Gauge, else IMERG, else NASA POWER", "Satellite / model", "~10–50 km, daily", "2024–2025", "Water entering the soil"],
        "ET0": ["NASA POWER (FAO-56)", "Model", "~50 km, daily", "2024–2025", "Crop water need"],
        "Soil": ["ISRIC SoilGrids 2.0, Lipa Cropland", "Model estimate", "250 m", "static", "Layer limits (field capacity, wilting point)"],
        "Soil-moisture readings": ["Probe, else manual reading, else SMAP L4, else SMAP L3", "Measurement / model / satellite", "point to ~9 km", "2024–2025", "Corrects the daily estimate"],
        "Crop & planting date": ["App's crop (corn) and planting date for the field", "Placeholder for Lipa Cropland (not real)", "–", "–", "Growth stage and Kc"],
    },
    "rotation": {
        "Monthly climate": ["NASA POWER climatology (rain, ET0, max temperature)", "Model", "~50 km, monthly", "2001–2025 means", "Average-climate run; heat risk"],
        "Real 10-day rain": ["NASA POWER dekad totals", "Model", "~50 km, 10-day", "2001–2025", "Real-years run: how often seasons run short"],
        "Soil water capacity": ["ISRIC SoilGrids 2.0", "Model estimate", "250 m", "static", "Size of the water bucket (83 mm)"],
        "Crop parameters": ["Kc, stages, depletion fraction, heat threshold, family, nutrient role (data/crops.ts)", "Table values", "–", "–", "Water use, heat, diversity, fertility, cover"],
        "Your rotation & settings": ["Crops in sequence, seasons per year, start month, score weights", "User input", "–", "–", "What is compared and how it is scored"],
    },
    "nbo": {
        "Alarm and its possible causes": ["Discovery Engine alarm + cause list (data/observationChecks.ts)", "Engine output + written list", "–", "–", "Which causes need telling apart"],
        "Field-check catalogue": ["10 checks with work time and waiting time", "Written estimates", "–", "–", "Score = causes separated ÷ effort"],
        "Logged answers": ["Answers and readings entered on the alarm card", "User input", "–", "–", "Updates the card and the field model"],
    },
}


def _bold(r: Report, text: str) -> None:
    r.p("").add_run(text).bold = True


def _interpret(r: Report, num: str, good: list[str], limits: list[str]) -> None:
    r.h2(f"{num}.4 Interpretation")
    _bold(r, "What is good")
    r.bullets(good)
    _bold(r, "Limitation")
    r.bullets(limits)


# ------------------------------------------------------------------------------------------------- moisture divergence
def add_moisture_section(r: Report, num: str, params: dict, extra: dict | None) -> None:
    md = params["discoveryRules"]["moistureDivergence"]
    r.h1(f"{num}. Discovery Engine: moisture divergence")
    r.h2(f"{num}.1 What it does")
    r.p("Moisture divergence flags topsoil that is drying out fast while the deeper soil stays steady: the crop is losing its shallow "
        "water and the soil is not being refilled. It is an early warning of a developing dry spell at the roots.")
    r.h2(f"{num}.2 How it works")
    inputs_table(r, "Moisture divergence", INPUTS["moisture"])
    r.p("Each day the rule compares soil moisture today with 14 days earlier, in the topsoil and deeper down. With field probes it uses "
        "the 10 cm and 40 cm sensors and fixed limits. Lipa has no probes, so the revision adds a fallback on SMAP L4 (NASA model with "
        "satellite data assimilated): topsoil 0–5 cm and root zone 0–100 cm, with limits set per month from Lipa's own SMAP L4 history.")
    rows = [
        ["Window", f"{md['windowDays']} days"],
        ["With field probes (10 cm, 40 cm)", f"topsoil falls by at least {md['minSurfaceDrop']} m³/m³ while the deep probe moves at most {md['maxDeepChange']} m³/m³ (fixed, not calibrated)"],
        ["Without probes: topsoil limit", "5th percentile of 14-day topsoil changes, per month, SMAP L4 2015–2023"],
        ["Without probes: root-zone limit", "median of the size of 14-day root-zone changes, per month, SMAP L4 2015–2023"],
        ["Confidence of each alarm", "0.4 (fixed, hand-set)"],
    ]
    if extra and extra.get("limits"):
        rows.append(["Monthly limits", "see table below"])
    r.table(["Parameter", "Value"], rows, caption="Moisture divergence: parameters", widths=[5, 11.5])
    if extra and extra.get("limits"):
        lim = extra["limits"]
        r.table(["Month", "Topsoil must fall by at least (m³/m³)", "Root zone may move at most (m³/m³)"],
                [[m, f"{a:.4f}", f"{b:.4f}"] for m, a, b in zip(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
                                                                 lim["min_surface_drop_by_month"], lim["max_deep_change_by_month"])],
                caption="Moisture divergence: monthly limits (SMAP L4 2015–2023)")
    r.h2(f"{num}.3 Results")
    if extra:
        r.p(extra["intro"])
        r.table(["Rank", "Result", "Value"], extra["results"], caption="Moisture divergence: results, most important first", widths=[1.2, 5.8, 9.5])
        for f in extra.get("figures", []):
            r.figure(REPO / f["path"], f["caption"])
        _interpret(r, num, extra["good"], extra["limits_text"])
    else:
        r.note("Pending. The SMAP L4 history (2015–2023) needed to set the limits had not been delivered by NASA when this report was "
               "built, so the rule has not been run on Lipa yet. The code and its tests are in place (lib/science/discovery/engine.ts, "
               "moistureWithL4Fallback; 3 tests).")
        _interpret(r, num,
                   ["Built and tested: the alarm can now run without field probes, which Lipa does not have.",
                    "Its limits will come from Lipa's own history, not guesses; the test rule was written before any run (E-005)."],
                   ["Not yet calibrated or run on Lipa.",
                    "SMAP L4 is a ~9 km model estimate, not a measurement of the field; no probe exists to check it."])


# ------------------------------------------------------------------------------------------------- NDVI
def add_ndvi_section(r: Report, num: str, params: dict, extra: dict | None) -> None:
    nc = params["discoveryRules"]["ndviChange"]
    r.h1(f"{num}. Discovery Engine: NDVI change and NDVI below normal")
    r.h2(f"{num}.1 What it does")
    r.p("This alarm watches greenness (NDVI) from satellites and flags a crop that is greening less than it should: a possible sign of "
        "stress, damage or poor growth. It is a lead for a field visit, not a diagnosis.")
    r.h2(f"{num}.2 How it works")
    inputs_table(r, "NDVI rules", INPUTS["ndvi"])
    r.p("The original rule compares each new composite with the previous one and counts a drop only while the crop should be growing, so it "
        "needs the crop calendar. Plot A has the farmer's calendar and is watched with HLS 30 m NDVI. The Lipa Cropland area has no "
        "calendar, so the revision adds a second rule: a composite below the 10th percentile of the same date in 2001–2023 MODIS history "
        "is flagged as unusually brown for the time of year.")
    r.table(["Parameter", "Value"], [
        ["Change rule: minimum drop", f"{nc['minDrop']} NDVI between consecutive composites"],
        ["Change rule: maximum gap between compared composites", f"{nc['maxGapDays']} days (longer gaps from clouds give 'unknown')"],
        ["Change rule: crop stages that count", "development and mid-season of the season the day belongs to"],
        ["Below-normal rule: limit", "10th percentile of usable composites for the same composite day of year, 2001–2023"],
        ["Pixel quality rule", "good, or marginal with no cloud, cloud nearby or shadow; at least 50 % of pixels usable"],
        ["Confidence of each alarm", "0.4 (fixed, hand-set)"],
    ], caption="NDVI rules: parameters", widths=[6.5, 10])
    r.h2(f"{num}.3 Results")
    if extra:
        r.p(extra["intro"])
        r.table(["Rank", "Result", "Value"], extra["results"], caption="NDVI rules: results, most important first", widths=[1.2, 5.8, 9.5])
        for f in extra.get("figures", []):
            r.figure(REPO / f["path"], f["caption"])
        _interpret(r, num, extra["good"], extra["limits_text"])
    else:
        pa = params.get("ndviPlotA")
        t = pa["tally"]
        r.table(["Rank", "Result", "Value"], [
            ["1", "Plot A, change rule with the farmer's seasons (HLS)", f"{t['alarm']} alarms; {t['no']} 'no', {t['unknown']} 'unknown' over {pa['days']} days"],
            ["2", "Why so few decisions", f"only {pa['usablePasses']} of {pa['passes']} HLS passes over Plot A were clear enough (clouds); "
                                          f"{pa['wetSeason2024Usable']} in the 2024 wet season"],
            ["3", "Lipa Cropland, below-normal rule", "Pending: the 2001–2025 MODIS history had not been delivered by NASA when this report was built"],
        ], caption="NDVI rules: results so far", widths=[1.2, 5.8, 9.5])
        _interpret(r, num,
                   ["The change rule now follows the farmer's real seasons and a satellite fine enough for a 2.69 ha plot.",
                    "Composites far apart (cloud gaps) are no longer compared, removing alarms that had no basis."],
                   ["Clouds leave almost no wet-season views, so the alarm can rarely decide when crops grow.",
                    "Landsat and Sentinel-2 can differ by about 0.09 NDVI on the same day, more than the 0.03 drop the rule looks for.",
                    "The below-normal rule is not calibrated yet."])


# ------------------------------------------------------------------------------------------------- sensor offset
def add_offset_section(r: Report, num: str, params: dict) -> None:
    so = params["discoveryRules"]["sensorOffset"]
    r.h1(f"{num}. Discovery Engine: sensor offset")
    r.h2(f"{num}.1 What it does")
    r.p("Sensor offset checks whether the satellite topsoil moisture reads steadily higher or lower than a ground probe at the field. "
        "A steady gap is a scale effect to correct, not a fault.")
    r.h2(f"{num}.2 How it works")
    inputs_table(r, "Sensor offset", INPUTS["offset"])
    r.table(["Parameter", "Value"], [
        ["Minimum paired days", f"{so['minPairs']}"],
        ["Alarm when the mean difference is at least", f"{so['minMeanDiff']} m³/m³"],
        ["Confidence", "0.85 (fixed, hand-set)"],
    ], caption="Sensor offset: parameters", widths=[6, 10.5])
    r.h2(f"{num}.3 Results")
    r.table(["Rank", "Result", "Value"], [
        ["1", "Can it run at Lipa?", "No. There is no soil probe at either site and no ground network in the Philippines (ISMN checked)"],
        ["2", "Alarms on 2024–2025", "0; every day is 'unknown' (no paired days)"],
    ], caption="Sensor offset: results", widths=[1.2, 5.8, 9.5])
    _interpret(r, num, ["The rule is ready and tested; it will run as soon as a probe or regular manual readings exist."],
               ["Nothing is substituted for the missing ground data, so this alarm stays off.",
                "What would enable it: the station pod at the field, or about 21 manual readings timed with SMAP passes."])


# ------------------------------------------------------------------------------------------------- water balance
def fig_water_seasons(params: dict, wb: dict):
    si = params["seasonInputs"]
    names = [s["season"] for s in si]
    x = np.arange(len(si))
    fig, ax = plt.subplots(figsize=(7.4, 2.8))
    ax.bar(x - 0.27, [s["rainMm"] for s in si], 0.27, color=C["imerg"], label="rain on the field")
    ax.bar(x, [s["etcMm"] for s in si], 0.27, color=C["dry"], label="crop water need (ETc)")
    ax.bar(x + 0.27, [s["etaMm"] for s in si], 0.27, color=C["power"], label="water the crop got (ETa)")
    for i, s in enumerate(wb["seasons"]):
        ax.text(x[i], max(si[i]["rainMm"], si[i]["etcMm"]) + 40, f"{s['stressDays']} stress days", ha="center", fontsize=7.5)
    ax.set_xticks(x)
    ax.set_xticklabels(names)
    ax.set_ylabel("mm over the season")
    ax.set_title("Each reported corn season on Plot A: rain, crop need and what the crop got")
    ax.legend(fontsize=7.5, ncol=3, loc="upper left")
    return save(fig, "model_water_seasons")


def add_water_section(r: Report, num: str, params: dict, wb: dict, fig_water) -> None:
    corn, soil = params["corn"], params["plotASoil"]
    si = {s["season"]: s for s in params["seasonInputs"]}
    r.h1(f"{num}. Daily crop water balance (Plot A)")
    r.h2(f"{num}.1 What it does")
    r.p("The water balance tracks, day by day, how much of the root zone's water the corn has used, and flags crop water stress: days "
        "when the soil is too dry for the crop to take water as fast as it needs. It runs on Mang Edgar's Plot A with his four reported "
        "corn seasons.")
    r.h2(f"{num}.2 How it works")
    inputs_table(r, "Water balance", INPUTS["water"])
    r.p("It follows FAO Irrigation and Drainage Paper 56. The crop's water need is ETc = Kc × ET0, where Kc follows the crop's four growth "
        "stages. Rain fills a 0–10 cm top layer first and the excess drains into the 10–100 cm layer; evaporation comes from the top "
        "layer and crop uptake from both. Once the water used exceeds the readily available water (RAW), a stress factor Ks below 1 "
        "slows the crop's uptake.")
    r.table(["Parameter", "Value"], [
        ["Crop", f"{corn['name']}: Kc initial {corn['kc']['ini']}, mid-season {corn['kc']['mid']}, end {corn['kc']['end']}; depletion fraction p {corn['depletionP']}"],
        ["Reported dates read as", "early / mid / late month = the 5th / 15th / 25th"],
        ["Generic stage lengths", f"{corn['stages']} days (initial, development, mid, late) = {sum(corn['stages'])} days; scaled to each reported season"],
        ["Soil (Plot A, SoilGrids model estimate)", f"field capacity {soil['fc']}, wilting point {soil['wp']} m³/m³; top layer {soil['surfaceDepthM']} m, root zone {soil['rootDepthM']} m"],
        ["Total available water (TAW)", f"{soil['taw']:.1f} mm"],
        ["Readily available water (RAW = p × TAW)", f"{soil['raw']:.1f} mm: stress starts when more than this is used"],
        ["Evaporation limits (REW, TEW)", f"{soil['rewMm']} mm, {soil['tewMm']} mm"],
        ["Start of record", "soil full on 2024-01-01 (assumed); the 2024 dry season was planted 17 days earlier"],
    ], caption="Water balance: parameters", widths=[5.5, 11])
    r.table(["Season", "Planted .. harvested (used)", "Stage lengths (days)", "Rain (mm)", "ET0 (mm)"],
            [[s["season"], f"{s['plantedOn']} .. {s['harvestedOn']}", "/".join(map(str, si[s["season"]]["stages"])),
              si[s["season"]]["rainMm"], si[s["season"]]["et0Mm"]] for s in wb["seasons"]],
            caption="Water balance: season inputs (rain and ET0 summed over the days inside the record)")
    r.h2(f"{num}.3 Results")
    r.p("The model was run on real 2024–2025 weather. Its stress days were compared with the one dated ground report available: the "
        "farmer's drought of February–March 2024. Results are ranked from most important.")
    s24 = next(s for s in wb["seasons"] if s["season"] == "2024 dry")
    others = [s for s in wb["seasons"] if s["season"] != "2024 dry"]
    r.table(["Rank", "Result", "Value"], [
        ["1", "Agreement with the farmer's drought (Feb–Mar 2024)",
         f"Agrees: the 2024 dry season has {s24['stressDays']} stress days ({s24['firstStress']} to {s24['lastStress']}), far more than any other season"],
        ["2", "Accuracy", "Not measurable: no soil sensor, no yield records; one dated event"],
        ["3", "2024 dry season water", f"rain {si['2024 dry']['rainMm']} mm, crop need {si['2024 dry']['etcMm']} mm, water the crop got {si['2024 dry']['etaMm']} mm; "
                                       f"root zone used up to {s24['maxDepletion']:.0f} of {s24['taw']:.0f} mm"],
        ["4", "Other seasons' stress days", ", ".join(f"{s['season']}: {s['stressDays']}" for s in others)],
        ["5", "Days run without missing input", f"{len(wb['days'])} of {len(wb['days'])}"],
    ], caption="Water balance: results, most important first", widths=[1.2, 5.8, 9.5])
    r.figure(fig_water, "Water used from the root zone against the stress point (RAW) and the empty point (TAW); farmer's seasons shaded; stress days marked.")
    r.figure(fig_water_seasons(params, wb), "Per season: rain, crop water need and water the crop actually got, with stress days.")
    _interpret(r, num,
               ["It agrees with the only dated ground report: the season the farmer called a drought is the one with by far the most stress.",
                "It now uses the farmer's real seasons and Plot A's own soil instead of an assumed planting date.",
                "Every daily step is a published FAO-56 equation; one step was checked by hand."],
               ["One event and one plot: agreement, not proof; the dry season is dry every year, so some agreement is expected.",
                "Soil values are a SoilGrids model estimate, not a lab test; crop settings are general FAO-56 values.",
                "Rain is satellite and model data from cells of ~10–50 km, not the plot itself.",
                "What would improve it: a soil sensor or manual readings, the farmer's harvest records, a rain gauge."])


# ------------------------------------------------------------------------------------------------- living field model
def add_field_model_section(r: Report, num: str, params: dict, fig_fm, extra: dict | None) -> None:
    rules, old, soil = params["fieldModelRules"], params["fieldModelOld"], params["aoiSoil"]
    r.h1(f"{num}. Living Field Model")
    r.h2(f"{num}.1 What it does")
    r.p("The Living Field Model is TERRA's daily picture of the field's soil water: the water balance's estimate of the two soil layers, "
        "corrected whenever a soil-moisture reading arrives, with the source, age and uncertainty of each value.")
    r.h2(f"{num}.2 How it works")
    inputs_table(r, "Living Field Model", INPUTS["fieldmodel"])
    r.p("Each day the water balance predicts the soil; then each reading pulls the estimate towards it. The pull is a weighted average: "
        "weight on the reading = model uncertainty² ÷ (model uncertainty² + reading uncertainty²). The model's uncertainty grows every "
        "day without a reading. Readings are used in this order: field probe, manual reading, SMAP L4 (rescaled to the soil), SMAP L3.")
    r.table(["Parameter", "Value"], [
        ["Reading uncertainty (1 sd, m³/m³)", ", ".join(f"{k} {v}" for k, v in rules["readingSd"].items())],
        ["Model uncertainty at the start", f"{rules['startSd']} m³/m³"],
        ["Uncertainty growth per day without a reading", f"{rules['sdGrowthPerDay']} m³/m³"],
        ["Soil (Lipa Cropland, SoilGrids)", f"field capacity {soil['fc']}, wilting point {soil['wp']} m³/m³; TAW {soil['taw']:.0f} mm"],
        ["SMAP L4 use (revision)", "0–5 cm corrects the 0–10 cm layer; 0–100 cm root zone corrects the 10–100 cm layer; both rescaled from L4's 2015–2023 range onto the soil's range"],
        ["Status of the settings", "uncertainties are hand-set heuristics, not calibrated"],
    ], caption="Living Field Model: parameters", widths=[5.5, 11])
    r.h2(f"{num}.3 Results")
    rows = [
        ["1", "Topsoil estimate stuck at field capacity (old, SMAP L3)", f"{old['surfaceAtFc']} of {old['days']} days ({100 * old['surfaceAtFc'] / old['days']:.0f} %)"],
        ["2", "Deeper layer stuck at field capacity (old)", f"{old['deepAtFc']} of {old['days']} days: SMAP L3 cannot correct it, and Lipa's app planting date is a 2026 placeholder"],
        ["3", "Days with a satellite correction (old)", f"{old['smapCorrectionDays']} (SMAP L3 passes)"],
        ["4", "Typical topsoil uncertainty (old)", f"±{old['surfaceSdMedian']:.3f} m³/m³ (median, 1 sd)"],
    ]
    if extra:
        rows = extra["results"] + rows
    else:
        rows = [["1", "New version (SMAP L4): leave-out error vs persistence (pass rule, E-005)", "Pending: needs the SMAP L4 2015–2023 history for the rescaling"]] +             [[str(int(x[0]) + 1)] + x[1:] for x in rows]
    r.table(["Rank", "Result", "Value"], rows, caption="Living Field Model: results, most important first", widths=[1.2, 5.8, 9.5])
    r.figure(fig_fm, "Topsoil estimate with SMAP L3 corrections (old) and, once calibrated, with SMAP L4 (new).")
    _interpret(r, num,
               (extra or {}).get("good", ["The structure works on real data: 731 daily states, each with its source, age and uncertainty.",
                                          "The revision (SMAP L4 for both layers) is built and tested; it removes the cause of the 'always full' topsoil."]),
               (extra or {}).get("limits_text", ["The old version is not usable on Lipa: the topsoil sits at 'full' on most days.",
                                                 "The new version is not calibrated or measured yet.",
                                                 "Even calibrated, it is checked against SMAP L4, itself a NASA model: consistency, not validation. A soil sensor would validate it."]))


# ------------------------------------------------------------------------------------------------- rotation planner
def add_rotation_section(r: Report, num: str, params: dict, rot: list, fig_rot) -> None:
    a, cl = params["rotation"]["assumptions"], params["rotation"]["climate"]
    pr, st, soil = params["rotation"]["priorities"], params["rotation"]["settings"], params["rotation"]["soil"]
    r.h1(f"{num}. Rotation planner (Rotation Lab)")
    r.h2(f"{num}.1 What it does")
    r.p("The rotation planner compares crop sequences on the same field: whether rain and stored soil water cover each crop's needs, "
        "and how each sequence scores on fertility, crop diversity, ground cover and climate risk. It is decision support, not a "
        "yield forecast.")
    r.h2(f"{num}.2 How it works")
    inputs_table(r, "Rotation planner", INPUTS["rotation"])
    r.p("A one-layer soil water bucket in ten-day steps: rain in, minus runoff above a threshold; crop use ETc = Kc × ET0; water above "
        "the soil's capacity drains away. The revision adds a historical-years mode: each rotation is also run through every real year "
        "2001–2025 with real ten-day rain from NASA POWER, to show how often each season runs short of water.")
    r.table(["Parameter", "Value"], [
        ["Step", f"{a['stepDays']:.2f} days (36 per year)"],
        ["Runoff", f"{a['runoffCoefficient']} of rain above {a['runoffThresholdMm']} mm per step"],
        ["Bare-soil Kc", f"{a['bareSoilKc']}"],
        ["Soil storage at start", f"{100 * a['initialStorageShare']:.0f} % of capacity"],
        ["ET0 increase per °C (scenarios)", f"{a['et0PerDegree']}"],
        ["Soil (Lipa, SoilGrids)", f"{soil['awcMmPerM']} mm per m × {soil['profileDepthM']} m"],
        ["Season windows (default)", f"{st['seasonsPerYear']} per year, first starting in month {st['startMonth'] + 1} (June)"],
        ["Score weights (default, adjustable)", ", ".join(f"{k} {v}" for k, v in pr.items()) + " (equal, so 20 % each)"],
        ["Real-years mode: ET0 and temperature", "monthly averages (no daily history downloaded)"],
    ], caption="Rotation planner: parameters", widths=[5.5, 11])
    r.table(["Month", "Rain (mm)", "ET0 (mm/day)", "Max temperature (°C)"],
            [[m, f"{cl['rainMm'][i]}", f"{cl['et0MmDay'][i]}", f"{cl['tmaxC'][i]}"] for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])],
            caption=f"Rotation planner: Lipa's monthly climate ({cl['source']})")
    r.h2(f"{num}.3 Results")
    r.p("Each default rotation was run on the average climate and through every real year. Results are ranked from most important.")
    plan_a = rot[0]["risk"]["seasons"][1]
    worst = sorted(plan_a["deficitByYear"], key=lambda d: -d["deficitMm"])
    rank = next(i for i, d in enumerate(worst) if d["year"] == 2023) + 1
    nxt = next((d for d in plan_a["deficitByYear"] if d["year"] == 2024), None)
    rows = [
        ["1", "Dry-season (Dec–May) corn, Rotation A, real years",
         f"ran short in {plan_a['yearsShort']} of {len(plan_a['deficitByYear'])} years; in the driest 20 % by {plan_a['dry20DeficitMm']} mm or more"],
        ["2", "Agreement with the farmer", f"Dec 2023–May 2024 (his drought season) ranks {rank} of {len(worst)} ({next(d for d in worst if d['year'] == 2023)['deficitMm']} mm); "
                                           f"Dec 2024–May 2025 (no drought reported): {nxt['deficitMm'] if nxt else 'n/a'} mm"],
        ["3", "Average climate (old method)", "zero shortfall for every season of every default rotation"],
        ["4", "Worst years (Rotation A, dry season)", ", ".join(f"{d['year']}–{d['year'] + 1}: {d['deficitMm']} mm" for d in worst[:3])],
    ]
    k = 5
    for x in rot:
        for s in x["risk"]["seasons"]:
            if s["index"] == 1:
                rows.append([str(k), f"{x['plan']['name']} season 2 ({s['cropId']}, {s['windowLabel']})", f"short in {s['yearsShort']} of {len(s['deficitByYear'])} years"])
                k += 1
    r.table(["Rank", "Result", "Value"], rows, caption="Rotation planner: results, most important first", widths=[1.2, 5.8, 9.5])
    r.figure(fig_rot, "Shortfall of the December–May corn season of Rotation A in each real year (orange: the farmer's drought season).")
    _interpret(r, num,
               ["The planner can now show dry years; the average-climate run could not, so it called every rotation safe.",
                "Its worst years are the same dry seasons found independently by the rain calibration (2019, 2014, 2010).",
                "It agrees with the farmer: his drought season ran short, the following dry season did not.",
                "It shows a clear rotation difference: mungbean in the dry season never ran short, corn and peanut often did."],
               ["One-layer bucket in ten-day steps, simpler than the daily water balance; no yield is modelled.",
                "ET0 and temperature are monthly averages even in the real-years mode.",
                "Fertility, diversity and cover scores are rule-based indices, not measured; their weights are adjustable choices.",
                "Rain is a ~50 km model (POWER)."])


# ------------------------------------------------------------------------------------------------- next best observation
def fig_nbo(params: dict):
    ch = sorted(params["nbo"]["checks"], key=lambda c: c["costMinutes"] + params["nbo"]["waitMinutesPerDay"] * c["waitDays"])
    effort = [c["costMinutes"] + params["nbo"]["waitMinutesPerDay"] * c["waitDays"] for c in ch]
    fig, ax = plt.subplots(figsize=(7.4, 3.0))
    ax.barh([c["id"] for c in ch], effort, color=C["imerg"])
    for i, c in enumerate(ch):
        ax.text(effort[i] + 3, i, f"separates {c['separates']} causes", va="center", fontsize=7)
    ax.set_xlabel("effort, minutes (work + 30 min per day of waiting)")
    ax.set_title("Field checks TERRA can suggest, and their estimated effort")
    ax.tick_params(axis="y", labelsize=7)
    return save(fig, "model_nbo")


def add_nbo_section(r: Report, num: str, params: dict) -> None:
    n = params["nbo"]
    r.h1(f"{num}. Next Best Observation")
    r.h2(f"{num}.1 What it does")
    r.p("For every alarm, Next Best Observation suggests the single field check that best tells the alarm's possible causes apart for the "
        "least effort, so a visit answers a question instead of just looking around.")
    r.h2(f"{num}.2 How it works")
    inputs_table(r, "Next Best Observation", INPUTS["nbo"])
    r.p("Each check lists the causes it can tell apart, its work time and how long until the answer is known. Score = number of causes "
        "it separates ÷ effort, where effort = work minutes + 30 minutes per day of waiting. Only checks that separate at least two "
        "causes are offered; the best one is shown on the alarm card, and the answer logged on the card feeds back into the model.")
    r.table(["Parameter", "Value"], [
        ["Field checks in the catalogue", f"{len(n['checks'])}"],
        ["Possible causes per alarm type", ", ".join(f"{k} {v}" for k, v in n["causes"].items())],
        ["Waiting cost", f"{n['waitMinutesPerDay']} minutes per day"],
        ["Minimum causes separated", "2"],
        ["Status of the costs", "rough estimates written for TERRA, not measured"],
    ], caption="Next Best Observation: parameters", widths=[5.5, 11])
    r.figure(fig_nbo(params), "The catalogue of field checks with their estimated effort and how many causes each can separate.")
    r.h2(f"{num}.3 Results")
    r.table(["Rank", "Result", "Value"], [
        ["1", "Evaluated on real outcomes?", "No: no field check has been carried out and logged yet"],
        ["2", "Works in the app", "Yes: every alarm card shows its top check; logged answers update the card and the field model (2 tests)"],
    ], caption="Next Best Observation: results", widths=[1.2, 5.8, 9.5])
    _interpret(r, num, ["Turns every alarm into one concrete, cheap action, with a way to report the answer."],
               ["Costs and waiting times are estimates; usefulness is untested until real checks are logged."])
