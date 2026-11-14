# Decisions

One entry per decision. Never delete; mark replaced decisions `Superseded by D-xxx`.

```
## D-xxx — Title
Date: YYYY-MM-DD · Status: Proposed | Accepted | Superseded by D-xxx
Context: what forced the choice
Decision: what we chose
Why: reasons, alternatives rejected
```

---

## D-001 — Lightweight Claude Code project setup
Date: 2026-11-14 · Status: Accepted
Context: AI/agricultural intelligence work needs consistent ML practice, scientific checking, and a record of findings.
Decision: `CLAUDE.md` plus four Markdown context files, three small project skills in `.claude/skills/`
(`mle-workflow`, `scientific-validation`, `findings-maintainer`), and the Superpowers plugin for code quality.
Why: Plain Markdown in the repo is versioned with the code and readable without tooling. No public
skills with those three names were found in the configured marketplaces, so minimal local versions were written.

## D-002 — Discovery Engine data contract (inputs and outputs)
Date: 2026-11-14 · Status: Proposed — needs agreement from the NASA pipeline and UI owners
Context: The web app (`DailyObservation`, `Discovery` in `types/index.ts`) and the NASA pipeline
(branch `feat/nasa-data-pipeline`) define different schemas. Soil moisture is % in the app and m³/m³
in the pipeline. Time is a bare `YYYY-MM-DD` in the app and a UTC ISO-8601 timestamp in the pipeline.
Location is `fieldId` + `{lat, lng}` in the app and `location_id` + `{lat, lon}` in the pipeline.
The pipeline's `precipitation_mm` is IMERG in raw IMERG records but POWER in merged daily records.
`Discovery` stores its evidence as formatted text, and its ids allow one discovery per kind per field.
Decision (types in `types/discovery-contract.ts`):
1. Input is one `FieldDay` per field per local calendar day, for consecutive dates. Each value carries
   variable, source, product/version, provenance, depth, aggregation, UTC period and quality. Values
   from different sources never share a key, and a day holds at most one value per
   variable/source/depth: adapters combine several sensors first. The engine rejects records that
   break this (added 2026-11-14 after code review).
2. One canonical unit per variable: m³/m³, °C, dS/m, mm/day, dimensionless. % only for display.
3. Value periods are UTC ISO-8601 ending in `Z`. Values are grouped into the field's local calendar
   day (an IANA time zone per field; `Asia/Manila` for every current field). A value of 24 h or
   less belongs to the local day containing its midpoint; a multi-day composite belongs to the local
   day containing its end, so it never appears before all its data exists. Limit: a UTC-day product
   assigned this way includes 8 h of the next local morning.
4. Inside the app, coordinates stay `{lat, lng}` (EPSG:4326). Adapters convert the pipeline's `lon`.
   `FieldLocation` maps `fieldId` to the pipeline's `location_id`.
5. Output is `AnomalyRecord`: numbers only, an id unique per detection, data coverage, spatial
   support, and confidence labelled `heuristic` until calibrated. Each signal states where its
   baseline came from (`own-history`, `climatology`, `other-source`, or `rule` for a fixed value).
   The UI's `Discovery` text is built from it.
Why: Keying values by variable + source removes the `precipitation_mm` ambiguity and supports
station-vs-satellite comparison, which two of the four detectors do. m³/m³ is what the pipeline
already emits. A local day matches how a farm reads its field; grouping by the UTC day would cut
the Philippine day at 08:00. Numeric output lets the Living Field Model and Next Best Observation
logic consume detections without parsing text.
Rejected: adopting the pipeline's flat variable names (same-name clash across sources); keeping %
(the pipeline already converts to m³/m³); grouping by UTC calendar day.
Open: see `docs/ai-ml/CONTEXT.md` → Open questions.

## D-003 — Event-detection results always report chance-level and attributable recall
Date: 2026-11-14 · Status: Proposed — for your review as ML owner
Context: In E-001 the moisture-divergence rule showed recall 0.96, but its background alarms matched
the same event windows 82% of the time on records with no injected event. The code review then noted
that comparing two intervals from the same seeds is a weak test.
Decision: Any detector evaluation reports, next to recall: (a) chance recall, the same event windows
scored on the record without the events (or, for real data, on comparable periods with no labelled
event); and (b) attributable recall, where an event counts only if an alarm that is absent from the
paired clean record matches it. The match window (event start to end + 14 days) is stated with the result.
Why: Recall alone rewards a detector that alarms constantly; chance recall shows that; the paired
measure shows whether the event itself changed the alarms. Rejected: precision alone, which depends
on how many events are injected.

## D-004 — The baseline rules stay the engine default after E-003
Date: 2026-11-14 · Status: Accepted (outcome of E-003's pre-registered adoption rule); for rain departure superseded by D-005
Context: E-003 tested three candidates (`field-z`, `imerg-fill`, `trend-break`) against the baselines with
an adoption rule fixed before running. None met it.
Decision: `runDiscovery` keeps `BASELINE_DETECTORS` by default. The candidates stay in
`lib/science/discovery/candidates.ts` for further testing. E-003's rule is not changed after the fact.
Why: Adopting a candidate by relaxing the rule after seeing the test results would be tuning on the test
set. Two candidates (F-005, F-006) are trade-offs the rule did not value; whether to adopt them needs
either the ML owner's explicit decision or a new experiment with a revised rule on fresh test seeds.

## D-005 — Rain departure fills up to two missing gauge days with IMERG by default
Date: 2026-11-14 · Status: Accepted (outcome of E-004's pre-registered adoption rule)
Context: A missing gauge day made the strict rule unknown for 14 days (F-004). E-003 and E-004 tested
`imerg-fill`; E-004 (fresh seeds 51–100) met every criterion of its rule.
Decision: `runDiscovery` and `detectOnDay` default to `DEFAULT_DETECTORS`: the baseline rules except
rain departure, which fills up to `DISCOVERY_RULES.rainGapFill.maxFilledDays` (2) missing gauge days
with that day's IMERG value. Records say so: `detectorVersion` ends in `+imerg-fill` and the station
coverage counts only real gauge days. `BASELINE_DETECTORS` stays unchanged as the reference for future
experiments. Supersedes D-004 for rain only; moisture, NDVI and sensor-offset keep their baselines.
Why: attributable recall 0.70 → 0.84 with clean-record alarms (3.38 per 100 days) below the same rule
without gaps (3.58). Rejected: field-z for moisture (failed E-004: weaker on short dry spells).
Limits: synthetic IMERG is kinder than real IMERG; check against real gauge and IMERG pairs when available.
