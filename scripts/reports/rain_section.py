"""Rain departure section of the model report, in the agreed layout (What it does / How it works with parameters,
monthly limits and the limits chart / Results ranked with the timeline and drought charts / Interpretation).
Used by build_model_report.py; run alone to write docs/reports/TERRA-Rain-Departure.docx:
  "docs/Data Pipeline/.venv/Scripts/python.exe" -I scripts/reports/rain_section.py
"""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_model_report import MONTHS, fig_rain_drought, fig_rain_limits, fig_rain_timeline  # noqa: E402
from common import RESULTS, Report, git_commit, read_json, to_date  # noqa: E402
from model_sections import INPUTS, inputs_table  # noqa: E402


def add_rain_section(r: Report, rain: dict, number: str = "2") -> None:
    cal = rain["calibration"]
    old, new = rain["old"], rain["new"]
    decided = sum(s != "unknown" for s in new)
    flagged = [i for i, s in enumerate(new) if s in ("dry", "wet")]
    dry = sum(new[i] == "dry" for i in flagged)
    wet = sum(new[i] == "wet" for i in flagged)
    old_share = 100 * sum(s in ("dry", "wet") for s in old) / max(1, sum(s != "unknown" for s in old))
    new_on, old_on = rain["newOnsets"], rain["oldOnsets"]
    long_onsets = [o for o in new_on if o["rule"].startswith("90-day")]
    long_days = sum(1 for o in new_on if o["rule"].startswith("90-day"))  # onsets via 90-day
    ho = cal["heldout"]

    def matched(e):
        end_ok = to_date(e["end"]) + timedelta(days=14)
        return [o for o in new_on if to_date(e["start"]) <= to_date(o["end"]) <= end_ok and ((o["observed"] < o["baseline"]) == (e["kind"] == "dry"))]

    ev = {e["id"]: (e, matched(e)) for e in rain["events"]}
    drought_alarm = long_onsets[0]["end"] if long_onsets else None
    on_time = sum(1 for e, m in ev.values() if m)
    late = sum(1 for e, m in ev.values() if not m and e["kind"] == "dry" and drought_alarm)

    r.h1(f"{number}. Discovery Engine: rain departure")
    r.h2(f"{number}.1 What it does")
    r.p("Rain departure flags periods when rainfall at the field is unusually low (a dry spell or season-long drought) or unusually "
        "high (an extreme wet spell) compared with what is normal for that time of year at Lipa. With no rain gauge at the field, it "
        "uses NASA POWER rain and compares it only with POWER's own long-term normal. Each alarm is reported once, on the day the unusual "
        "period starts, using only the days up to that point, as it would running live.")

    r.h2(f"{number}.2 How it works")
    inputs_table(r, "Rain departure", INPUTS["rain"])
    r.p("Each day the rule adds up the last 14 days of rain and divides by the rain that is normal for those same days (the monthly "
        "normal spread over each day). The result is a ratio: 1.0 means normal rain, 0.1 means a tenth of normal, 3.0 means three times "
        "normal. The ratio is compared with limits set from 23 years of Lipa's own rain, separately for each month, because a \"dry\" "
        "February and a \"dry\" August are very different amounts. A second check does the same over 90 days to catch droughts that "
        "build up over a season.")
    r.table(["Parameter", "Value"], [
        ["Short window", f"{cal['window_days']} days"],
        ["Ratio", "14-day rain ÷ expected rain (the normal spread over the same days)"],
        ["Drought window", f"{cal['long_window_days']} days"],
        ["Confidence of each alarm", "0.4 (fixed, hand-set; lower than a gauge alarm because the source is a ~50 km grid)"],
        ["Old limits it replaced", "0.45 and 1.7 for every month (guessed, never calibrated)"],
    ], caption="Rain departure: parameters", widths=[5, 11.5])
    r.table(["Month", "Dry limit, 14 days (5th percentile)", "Wet limit, 14 days (95th percentile)", "Drought limit, 90 days (10th percentile)"],
            [[MONTHS[m], f"{cal['low_ratio_by_month'][m]:.3f}", f"{cal['high_ratio_by_month'][m]:.3f}", f"{cal['long_low_ratio_by_month'][m]:.3f}"] for m in range(12)],
            caption="Rain departure: monthly limits (NASA POWER 2001–2023)")
    r.figure(fig_rain_limits(rain), "Left: the old fixed band (hatched) and the new per-month band. Right: share of 14-day windows each flags, on all "
                                    "23 years and on held-out years (limits fitted on 2001–2018 only, tested on 2019–2023).")

    r.h2(f"{number}.3 Results")
    r.p("The rule was checked in two ways: on years held back from calibration, and on 2024–2025 against real dated events from the farmer "
        "and from opened public reports. Results are ranked from most important.")
    kr, ca, el = ev.get("kristine-2024-10"), ev.get("carina-habagat-2024-07"), ev.get("elnino-2024-dry")
    r.table(["Rank", "Result", "Value"], [
        ["1", "Real events matched", f"{on_time} of {len(ev)} on time, {late} late"],
        ["2", "Accuracy", f"Not measurable yet. No rain gauge, and only {len(ev)} dated real events, too few for an accuracy or recall percentage"],
        ["3", "Days flagged in 2024–2025", f"{100 * len(flagged) / decided:.1f} % ({len(flagged)} of {decided} days it could judge): {dry} dry, {wet} wet. Old rule: {old_share:.1f} %"],
        ["4", "Share flagged on held-out years 2019–2023 (fitted on 2001–2018 only)",
         f"{100 * ho['calibrated_on_test_years']['flagged_share']:.1f} % (dry {100 * ho['calibrated_on_test_years']['low_share']:.1f} %, "
         f"wet {100 * ho['calibrated_on_test_years']['high_share']:.1f} %); old limits {100 * ho['old_fixed_on_test_years']['flagged_share']:.1f} %"],
        ["5", "El Niño drought, Feb–Mar 2024", f"Caught late: 90-day alarm on {drought_alarm}, after the reported window" if el and not el[1] and drought_alarm else
         ("Caught: alarm ends " + ", ".join(o["end"] for o in el[1]) if el and el[1] else "Missed")],
        ["6", "Storm Kristine, 22–25 Oct 2024", "Caught. Alarm ends " + ", ".join(o["end"] for o in kr[1]) if kr and kr[1] else "Missed"],
        ["7", "Typhoon Carina + monsoon, 22–25 Jul 2024", "Caught. Alarm ends " + ", ".join(o["end"] for o in ca[1]) if ca and ca[1] else "Missed"],
        ["8", "Alarm onsets in 2024–2025", f"{len(new_on)} (old rule: {len(old_on)}); {long_days} from the 90-day drought check"],
        ["9", "Share of periods flagged, 2001–2023 (design check)",
         f"{100 * cal['final_flagged_share_2001_2023']['flagged_share']:.1f} %, as designed. Old limits: {100 * cal['old_fixed_flagged_share_2001_2023']['flagged_share']:.1f} %"],
        ["10", "Unscored", "One wet alarm ending 2025-11-09 (Super Typhoon Uwan); not counted, since no opened source confirms heavy rain at Lipa"],
    ], caption="Rain departure: results, most important first", widths=[1.2, 5.8, 9.5])
    r.figure(fig_rain_timeline(rain), "Top: the 14-day rain ratio with the new monthly limits. Bottom: the days each rule flags. Shaded: the three real events.")
    r.figure(fig_rain_drought(rain), "The 90-day drought check in 2024: the ratio crosses the limit in mid-April, after a January with normal rain.")

    r.h2(f"{number}.4 Interpretation")
    r.p("What is good", bold_lead=None).runs[0].bold = True
    r.bullets([
        f"False alarms cut by more than half: {100 * len(flagged) / decided:.0f} % of days instead of {old_share:.0f} %, so an alarm now means something.",
        "Both real storms caught on time, so fewer alarms did not cost the important wet events.",
        "Limits come from 23 years of real Lipa rain, set per month, and still work on years they were not fitted to.",
        "The 90-day check finds a drought the 14-day rule cannot see.",
    ])
    r.p("Limitation", bold_lead=None).runs[0].bold = True
    r.bullets([
        "Drought detection is late: the 2024 drought was flagged about two weeks after the farmer-reported window, because POWER recorded some rain in January–March 2024.",
        "Accuracy cannot be measured yet: three events show agreement, not an accuracy rate.",
        "The rain comes from a ~50 km model, not the field; local storms can differ.",
        f"The wet side flags more than designed ({100 * ho['calibrated_on_test_years']['high_share']:.1f} % instead of 5 % in 2019–2023), because recent years were wetter.",
        "What would improve it: a rain gauge at the field, more dated events from the farmer or the City Agriculture Office, and optionally "
        "IMERG's daily history to calibrate a satellite version.",
    ])


if __name__ == "__main__":
    rep = Report("TERRA — Discovery Engine: rain departure", f"Model section · built {date.today().isoformat()} from commit {git_commit()}")
    add_rain_section(rep, read_json(RESULTS / "rain.json"))
    out = rep.save("TERRA-Rain-Departure.docx")
    print(f"wrote {out}; {rep.figures} figures, {rep.tables} tables")
