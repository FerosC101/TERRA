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

## D-006 — With no field station, detectors fall back to satellite sources, labelled and against their own normals
Date: 2026-11-15 · Status: Accepted (ML owner); rain departure implemented, moisture divergence pending
Context: The real Lipa record (`npm run discovery:lipa`) has no field station, so every detector
returns "unknown" every day. The station-based rules read gauge rain and 10/40 cm probes. Real
satellite data exists (IMERG rain now; SMAP L4 surface/root zone once collected).
Decision:
1. The station comes first. A detector uses a satellite source only when its window has **no usable
   station value at all** (no station, or a full outage). A partly gappy gauge keeps the station rule
   (fill ≤ 2 days with IMERG per D-005, else "unknown"), so all synthetic experiments are unchanged.
2. Like with like: a satellite value is compared only with a normal from the **same source**
   (`DiscoveryContext.rainNormals[source]`). With no such normal the detector stays "unknown";
   it never compares IMERG with the station or POWER normal.
3. Labelled: the signal's `source` is the satellite, `spatialSupport` is `grid-cell`, `detectorVersion`
   ends in `+satellite-fallback`, station coverage shows 0 days, and the rule text names the normal.
4. Lower confidence than any station alarm: 0.4 (heuristic), vs 0.6–0.8 for the gauge.
Rain departure: IMERG (`DISCOVERY_RULES.rainSatelliteFallback`), same window and ratio thresholds as the
gauge rule. Those thresholds are UNVERIFIED for a ~11 km satellite total.
Moisture divergence (next): SMAP L4 surface/root zone. Not switched on until it has been tested,
because its thresholds were set for probes at 10 and 40 cm.
Why: Without it, collected real data can never raise an alarm. Rejected: putting IMERG under the
`station` source in the adapter (it hides provenance), and using the POWER normal for IMERG
(on 2024-01-01..15, POWER rain totalled 48.96 mm vs IMERG 8.49 mm).
Limits: no IMERG normal for Lipa exists yet (requested in `docs/ai-ml/prompts/real-data-collection.md`),
so Lipa stays "unknown" until it does. Sensor offset cannot fall back: it needs a ground sensor.

## D-007 — Living Field Model: a daily state with source, age and uncertainty for each value
Date: 2026-11-15 · Status: Accepted (ML owner); first version built, not tested on real field data
Context: The Living Field Model page computed its figures from demo arithmetic inside UI code
(CLAUDE.md rule 5), and nothing tied the water balance, the readings and the discoveries together.
Next Best Observation needs to know which beliefs are uncertain.
Decision:
1. One `FieldState` per field per day (`lib/science/fieldModel/state.ts`): the day's water balance
   (crop stage, Kc, ETc, ETa, Ks, root-zone depletion, refill need; `lib/science/water/cropWater.ts`),
   soil moisture in two layers (0–10 cm, 10–100 cm) each with a value, a 1-sd uncertainty and the
   last reading that corrected it (source and date), today's rain and its source, and the latest NDVI.
2. Daily update: yesterday's state + today's weather → predicted state; then soil-moisture readings
   (station 10/40 cm, a person's follow-up, or SMAP when there is no 10 cm reading) nudge it by an
   uncertainty-weighted average. Uncertainty grows a fixed amount per day without a reading.
3. Settings in `data/fieldModelRules.ts`, all heuristics. Soil parameters: `data/soils.ts` (indicative).
4. Runs on `FieldDay` input (D-002), so the same code runs on demo, synthetic and real pipeline records.
Why: The simplest model that keeps provenance, age and uncertainty per value. Rejected: a Kalman filter
or ML model (no real field data to tune or check it against, CLAUDE.md rule 4); keeping the demo
bucket in `lib/demo/series.ts` (it cannot take readings and is not FAO-56 based).
Limits: probe depth vs model layer, SMAP offset and rain-source order are UNVERIFIED (assumptions in
the module header). Uncertainties are not calibrated.

## D-008 — Real IMERG daily rain stays Final-only; no Late/Early values mixed in
Date: 2026-11-15 · Status: Accepted (ML owner)
Context: NASA's `GPM_3IMERGDF` V07 (Final, gauge-calibrated) ends on 2025-09-30 (CMR `time_end`); the V08
transition is planned but no V08 Final is listed. IMERG Late (`GPM_3IMERGDL`) continues. The Lipa target
period runs to 2025-12-31, and the IMERG monthly normal is built from Final (`GPM_3IMERGM`).
Decision: the pipeline record for Lipa keeps IMERG Final V07 only. 2025-10-01..12-31 has no IMERG value
(the engine reports "unknown" there). Late values are not filled in under the same source.
Why: Final and Late are different estimates (Late is not monthly-gauge-calibrated), and D-006 compares
IMERG only with its own (Final) normal. Rejected: switching `preferred_product` to Late for Oct–Dec 2025
(mixes products in one series). Revisit when V08 Final is released, which also means rebuilding the normal.

## D-009 — The NDVI-change alarm compares composites at most 32 days apart
Date: 2026-11-15 · Status: Accepted (ML owner)
Context: on real Lipa MODIS data, clouds leave gaps of up to ~3 months between usable composites, and the
NDVI rule compared the newest composite with the previous one however old it was (F-015).
Decision: `DISCOVERY_RULES.ndviChange.maxGapDays = 32` (two 16-day composites). If the previous usable
composite is older than that, the verdict is "unknown". Tests in `engine.test.ts` (gap 33 → unknown; gap 32 → compared).
Why: a drop across months says nothing about a sudden change. Effect: E-001..E-004 rerun 2026-11-15 with identical
metrics (only commit and file hashes differed; result files left as they were). Real Lipa, 24 trial planting
dates: 20 → 16 alarms; the two removed compared composites 96 and 46 days apart.
Limits: 32 is a heuristic, not calibrated. It makes the wet season at Lipa almost entirely "unknown" (F-014).

## D-010 — Several cropping seasons per run; crop stages fitted to the reported season length
Date: 2026-11-15 · Status: Accepted (ML owner)
Context: the farmer of Plot A reported four corn seasons in 2024–2025 (91–102 days each); the engine and the water
balance took one planting date, and corn's indicative stages (data/crops.ts) total 115 days.
Decision: `CropSeason` (`lib/science/season.ts`). `DiscoveryContext.seasons` (optional) gates the NDVI rule by the
season a day belongs to (latest planting on or before it); `runSeasonalWaterBalance` runs one continuous soil
state across seasons. `fitStagesToSeason` scales the four FAO-56 stages in proportion to the reported
planting-to-harvest length. Reported approximate dates map early/mid/late → 5th/15th/25th (`data/cropCalendar.ts`).
Why: two years of record hold four seasons; a 115-day corn would still be "late" weeks after the reported harvest.
Limits: proportional scaling is a simplification (UNVERIFIED); single-season callers are unchanged (tested equal).
A calendar is used only with data for the same field: Plot A's calendar is not applied to the Lipa Cropland AOI (Plot A lies outside it).

## D-011 — SMAP L4 has its own source id, `smap_l4`; its two layers are told apart by depth
Date: 2026-11-15 · Status: Accepted (ML owner, the sole model builder); extends the proposed contract (D-002). The new catalogue entry shows on the app's sources page
Context: SMAP L3 (`SPL3SMP_E`, retrieval) and SMAP L4 (`SPL4SMGP`, land model with brightness temperatures
assimilated) differ by ~0.13 m³/m³ at Lipa (F-016). The contract allows one value per variable/source/depth per day.
Decision: `SourceId` gains `"smap_l4"` (types/discovery-contract.ts), with a `data/sources.ts` entry and a card name.
L4 values carry provenance "model". Its layers use `depthCm` = the layer's bottom: 5 (`sm_surface`, 0–5 cm) and 100
(`sm_rootzone`, 0–100 cm); the contract comment on `depthCm` says so. Adapter: `lib/adapters/smapL4.ts` (tested).
`smap` stays the L3 retrieval (its catalogue product is now `SPL3SMP_E` only).
Why: one id for both would hide which product a value is, and force one of them to be dropped on shared days.
Limits: no detector reads `smap_l4` yet; the moisture-divergence fallback must be tested first (D-006).

## D-012 — HLS NDVI has its own source id, `hls`; the NDVI rule reads the source named in the context
Date: 2026-11-15 · Status: Accepted (ML owner, the sole model builder); extends the proposed contract (D-002). The new catalogue entry shows on the app's sources page
Context: Plot A (2.69 ha) is smaller than one MODIS pixel; its NDVI comes from HLS v2.0 (30 m, Landsat + Sentinel-2).
Decision: `SourceId` gains `"hls"` (with a `data/sources.ts` entry and a card name). HLS values are "instant"
(one overpass, period = acquisition time from the granule id). When both sensors pass on one local day, the one with
more clear pixels is kept and the other named in the note (`lib/adapters/hlsNdvi.ts`, tested).
`DiscoveryContext.ndviSource` (default "modis") tells the NDVI rule which source to read; existing callers unchanged.
Why: same reason as D-011: a different product must not hide under another's id.
Limits: the "≥ 3 composites" and "≤ 32 days apart" rules (D-009) were set for 16-day MODIS composites.

## D-013 — Lipa's rain alarm uses NASA POWER with limits calibrated on 2001–2023, plus a 90-day drought check
Date: 2026-11-15 · Status: Accepted (ML owner)
Context: the fixed 0.45 / 1.7 limits flag 30 % of 14-day windows in 23 years of Lipa rain (48 % of 2024–2025 days on
IMERG, F-008). Only POWER has a long daily history here (IMERG daily history was not downloaded).
Decision: with no gauge, the fallback uses POWER against POWER's own 2001–2023 normal (`DiscoveryContext.rainFallbackSource`,
`data/nasa/lipaPowerRain.ts`). Limits per month of the window's last day: 14-day ratio below the 5th or above the 95th
percentile; plus a 90-day ratio below its 10th percentile (season-long drought). Without per-month limits the old
behaviour is unchanged. Settings in one place for scripts and app: `data/lipaModelConfig.ts`.
Why: E-005 (flagged share 18 % instead of 48 % on 2024–2025, both storms matched, the 2024 drought caught late).
Limits: POWER is a ~50 km model product; the 2019–2023 wet tail is flagged more often than the design 5 %.

## D-014 — The rotation planner also runs through real past years
Date: 2026-11-15 · Status: Accepted (ML owner)
Decision: `evaluateRotation` takes optional real ten-day rain; `rotationRisk` runs a rotation once per start year on
POWER dekads 2001–2025 (`data/nasa/lipaDekads.ts`) and reports per season how many years ran short and the driest-20 %
deficit. The app adds this to the historical scenario's notes for fields with dekads. Lipa's soil in `data/fields.ts` is
the SoilGrids estimate (83 mm/m, `source: "soilgrids"`), shown as a model estimate in the UI.
Why: average monthly climate never shows a dry season (zero deficit for every rotation at Lipa); real years do (E-005).
Limits: ET0 and temperature stay monthly averages; no yield is modelled.

## D-015 — Moisture alarm falls back to SMAP L4 when a field has no probes
Date: 2026-11-15 · Status: Accepted (ML owner); limits pending calibration (E-005)
Decision: `moistureWithL4Fallback` (default rule): with no station probe value in the 14-day window, the topsoil (L4 0–5 cm)
must fall by at least the month's limit while the root zone (L4 0–100 cm) moves at most its limit
(`DiscoveryContext.moistureFallback`). Labelled `+smap-l4-fallback`, grid-cell, confidence 0.4. Probes always come first.

## D-016 — NDVI "below normal" rule for fields without a crop calendar
Date: 2026-11-15 · Status: Accepted (ML owner); limits pending calibration (E-005)
Decision: with `DiscoveryContext.ndviNormal`, the NDVI rule flags a new composite below the field's low limit for that
day of year (10th percentile of 2001–2023) instead of a drop during growth stages. Needs no planting date.
Why: the Lipa Cropland AOI has no crop calendar (F-015), so the change rule cannot be gated there.

## D-017 — Living Field Model uses SMAP L4 for both layers, rescaled onto the field's soil; seasons supported
Date: 2026-11-15 · Status: Accepted (ML owner); rescaling pending calibration (E-005)
Decision: `runFieldModel(..., { l4, seasons })`: L4 0–5 cm corrects the 0–10 cm layer and L4 0–100 cm the 10–100 cm layer
(derived), after a linear rescaling fitted on L4 history; L4 is preferred to SMAP L3, which stays as a last resort.
Reading uncertainty 0.04 m³/m³ (heuristic). Seasons as in D-010.
Why: SMAP L3 pins the topsoil at field capacity (F-012); L4 stays in the soil's range (F-016) and covers the root zone.

## D-018 — The app runs the models on the real record for fields that have one
Date: 2026-11-15 · Status: Accepted (ML owner)
Decision: `data/nasa/realRecords.ts` holds a lossless compact copy of Lipa Cropland's real record (`scripts/export-lipa-
record.ts`, 340 KB, tested equal to a fresh build). For such a field, `discoveriesFor` and `livingFieldModel` run on it
with `REAL_FIELD_SETTINGS`; the discovery page charts real series (`getRealSeries`). Panels built on station sensors
(probes, soil temperature, EC) keep the demo series and its "simulated" labels; no real values are invented for them.

## D-020 — Every Discovery Engine rule runs on a real field, on simulated or assumed inputs where real ones are missing
Date: 2026-11-15 · Status: Accepted (user, the sole model builder: "use the synthetic data for the soil")
Context: on Lipa's real record only rain departure could fire: no probe (moisture divergence, source offset) and no crop
calendar for the AOI (NDVI change). The Discovery Center showed three rules as blocked.
Decision: for the Discovery Engine only (`discoveryInput`, `services/discoveryService.ts`; settings in
`data/simulatedInputs.ts`): (1) the planned station's SIMULATED 10/40 cm soil moisture (`lib/demo/stationModel.ts`,
driven by real rain and modelled ETc) is added to the real FieldDays as station values, provenance "simulated"
(`lib/adapters/simulatedStation.ts`); (2) Lipa Cropland's NDVI rule uses the Plot A farmer's seasons as an ASSUMED calendar.
Rain departure is unchanged (real NASA POWER). Narrows D-019 (simulated station kept out of FieldDays) for the engine only.
Guards: `realRecord()` and the Living Field Model never see these values (test in `discoveryService.test.ts`); every such
card says "simulated"/"assumed" in its title and confidence note, is graded no higher than 0.4 (Tentative), and is listed
apart from real-data alarms. The scripts behind E-005 and the model reports use `REAL_FIELD_SETTINGS` only, so these
alarms never enter an experiment, finding or report.
Limits: the alarms show the rules working on real weather, not facts about the field. Source offset compares SMAP L3
with a bucket model, so its margin is an artefact of the simulation (and of SMAP L3's wet reading, F-016). The assumed
calendar reverses F-015's caution for this display only: Plot A lies 3.3 km west, outside the AOI.
Result on Lipa Cropland 2024–2025: 16 rain (real), 24 moisture divergence, 1 source offset, 1 NDVI (2024-12-09).
