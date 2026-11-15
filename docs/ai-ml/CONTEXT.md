# Context

Current state of TERRA. Keep this short and true. Last reviewed: 2026-11-15.

## State

- Baseline: commit `76019cb` (Initial TERRA web application). AI/ML work happens on branch `AI-ML`.
- **Lipa Cropland runs on its real record in the app** (D-018): `data/nasa/realRecords.ts` (compact copy of POWER,
  IMERG, SMAP L3/L4, MODIS NDVI 2024–2025, `scripts/export-lipa-record.ts`) feeds `discoveriesFor` and `livingFieldModel`
  with the calibrated settings in `data/lipaModelConfig.ts`; the discovery page charts real series. Other fields, and
  station-only panels (probes, soil temperature, EC), use the demo series in `lib/demo/series.ts`. No field station exists.
- Model revision on real data (E-005, running): rain alarm calibrated on POWER 2001–2023 with a 90-day drought check
  (D-013, F-019, F-020); rotation planner's real-years mode and SoilGrids soil for Lipa (D-014, F-021); SMAP L4 moisture
  fallback, NDVI below-normal rule and SMAP L4 field model built and tested (D-015–D-017), limits pending the SMAP L4
  2015–2023 and MODIS 2001–2025 histories requested from AppEEARS. Reports: `docs/reports/TERRA-Data-Gathering-and-
  Cleaning.docx`, `docs/reports/TERRA-Model-Description-and-Results.docx` (`scripts/reports/*.py`).
- UI integration of the model chain (plan: real NASA data → field state → anomaly → next check → rotation): the
  Discovery Center reports each rule's limits, coverage and blocked reason (`services/detectorStatusService.ts`);
  the Rotation Lab shows the real-years table (D-014). Real fields list every onset (16 at Lipa). All four rules run on Lipa: the
  three without real input on simulated probes / an assumed calendar, listed apart and labelled (D-020). Open: Living Field Model
  on real dates (Plot A session), links between stages, SMAP L4 comparison line.
- No ML models exist yet. The UI's Discoveries come from the Discovery Engine (below), run on the demo record
  through `lib/adapters/demoSeries.ts` and worded by `lib/science/discovery/cards.ts`
  (`services/discoveryService.discoveriesFor`: every onset on a real record, latest per detector on demo records). `lib/science/detect.ts` was removed 2026-11-15.
- Living Field Model (D-007, `lib/science/fieldModel/state.ts`, served by `services/fieldModelService.ts`):
  a daily two-layer FAO-56 water balance (`lib/science/water/cropWater.ts`, eq. 74 and 84 checked against
  the FAO-56 images 2026-11-15) corrected by soil-moisture readings, with source, age and uncertainty per layer.
  The Living Field Model page reads its water figures from it. Soil values are indicative (`data/soils.ts`) for demo
  fields; Lipa uses SoilGrids (`LIPA_SOILGRIDS_SOIL`, FC 0.321, WP 0.238; Plot A `LIPA_PLOT_A_SOILGRIDS_SOIL`) (F-012, F-013).
- Next Best Observation: `lib/science/nextObservation.ts` ranks the checks in `data/observationChecks.ts`;
  the top check is on every card, and answers or readings logged on a card feed back (status, field model).
- Discovery Engine v0.2.0 (`lib/science/discovery/engine.ts`, thresholds in `data/discoveryRules.ts`):
  the four rules of `detect.ts` ported to the proposed contract (D-002) in m³/m³ (only deliberate
  difference: real month lengths for expected rain). One alarm per pattern onset; days with missing
  data neither start nor end a pattern; input is checked (consecutive dates, one field, no duplicate
  values, soil moisture 0..1). Code-reviewed 2026-11-14 (verdict "with fixes"; fixes applied).
  Tested on synthetic data: E-001 (old soil) and E-002
  (FAO-56-style soil with station gaps, the current baseline; F-001, F-003, F-004). E-003 tested three
  candidate detectors (`lib/science/discovery/candidates.ts`); none met the pre-registered adoption rule,
  so the baselines stayed the default (D-004). E-004 retested `field-z` and `imerg-fill` on fresh seeds with
  a revised rule: `imerg-fill` was adopted, so the engine default (`DEFAULT_DETECTORS`) fills up to 2
  missing gauge days with IMERG for rain departure (D-005, F-006); `field-z` was not (F-005);
  `trend-break` failed in E-003 (F-007). `BASELINE_DETECTORS` stays the reference for experiments.
- Synthetic records with injected, labelled events: `lib/demo/syntheticFieldDays.ts` (all values
  tagged `simulated`). Default soil model `fao56` (`lib/science/water/soilWater.ts`, re-exported from `lib/demo/soilModel.ts`): evaporation
  only from a 0.10 m surface layer (FAO-56 stage 1/2), transpiration from a 1.0 m root zone split by
  layer thickness (10% from the surface, UNVERIFIED; real uptake is probably top-weighted), silt-loam
  values inside FAO-56 Table 19. Hand check: mid-season dry spell, 10 cm falls 0.0047 m³/m³/day
  (hand 0.0049) vs 0.0115 in the old `demo-v1` model, which E-001 still uses. Optional station gaps
  (`missing`: random days and outages). Samples: `experiments/samples/*.csv`.
- Rotation/scenario results come from a FAO-56 style water balance in `lib/science/waterBalance.ts`
  (`ETc = Kc × ET0`, ten-day soil-water bucket). Crop parameters in `data/crops.ts` are indicative
  and **not calibrated** to any real field.
- Future Earth uses fixed climate adjustments; NEX-GDDP-CMIP6 is not connected.

## Data sources

Catalogue in `data/sources.ts`: field station, SMAP, GPM IMERG, MODIS MOD13Q1, ECOSTRESS,
NASA POWER, NEX-GDDP-CMIP6. Each entry lists resolution and caveats.
The NASA pipeline (`docs/Data Pipeline/`, Python/FastAPI) has retrieved real NASA POWER (+ FAO-56 ET0),
GPM IMERG Final and SMAP L3 data for the AOI `lipa_cropland_001` (Lipa City, Batangas, 133.7 ha),
2024-01-01..2025-12-31 (collected 2026-11-15): POWER 731/731 days, IMERG Final 639 (the V07 Final
collection ends 2025-09-30), SMAP L3 353 overpass days (all flagged "not recommended", three cells mixed:
F-009). Also an IMERG monthly normal 2001–2023 (`data/nasa/lipaImergNormal.ts`) and ISRIC SoilGrids 2.0 soil
water retention and texture for the AOI (model estimate; clay loam over clay, FC ≈ 0.31 at 0–5 cm). Every dataset, its
provenance and problems: `docs/Data Pipeline/data/DATA-MANIFEST.md`. MODIS NDVI (MOD13Q1/MYD13Q1 v061)
is downloaded via AppEEARS: 98 composites, 32 with a field value, mostly none in the wet season (clouds, F-014).
SMAP L4 (`SPL4SMGP` v008, model) via AppEEARS: 730 daily means (Manila days) of surface and root zone,
`smap_l4_daily_lipa.csv`; it stays within the soil's range, while L3 reads ~0.13 wetter (F-016). Not in the engine yet. ECOSTRESS and CMIP6: not collected.
There is no real field-sensor data (no ISMN network in the Philippines); the app's Lipa station is simulated.
Crop calendar: four corn seasons 2024–2025 reported by the farmer of Plot A (`data/cropCalendar.ts`, D-010).
Plot A (`data/lipaPlotA.ts`, 2.69 ha, corners drawn on a map) lies 3.3 km WEST of the Lipa Cropland AOI, outside it;
its HLS 30 m NDVI and SMAP L4 point are requested from AppEEARS, its SoilGrids soil is in `data/soils.ts`. His reported Feb–Mar 2024 drought shows in the water balance, the
rain rule and SMAP L4 (F-017), the first comparison with a ground report.

**Real-data adapter:** `lib/adapters/nasaPipeline.ts` converts `terra_daily_merged.json` into
`FieldDay`s (D-002), keeping only contract variables, unchanged. It accepts all 731 days.
`npm run discovery:lipa`: rain departure now runs via the D-006 IMERG fallback against the IMERG normal
(626 days decided, 22 alarm onsets; outside the band on 48 % of decided days, F-008). NDVI change runs on
28 MODIS composites (`lib/adapters/modisNdvi.ts`), but its alarms depend on the assumed planting date (F-015).
Moisture divergence and sensor offset stay "unknown" (no SMAP L4 fallback, no ground sensor).
Pipeline caps found in the code: GPM keeps ≤ 31 granules and SMAP ≤ 20 per run (one SMAP file per day),
so long periods are run in half-months.
The app's bundled snapshot (`data/nasa/lipa-cropland-2024-01.json`) still holds only 2024-01-01..15.
`scripts/export-nasa-snapshot.ts` (via `lib/adapters/nasaSnapshot.ts`, tested to reproduce that file) can
write any period; switching the app to it is a UI decision (731 bars/rows; SMAP axis fixed at 30–60 %).

## Discovery Engine contract

Proposed in `docs/ai-ml/DECISIONS.md` D-002, with types in `types/discovery-contract.ts`, used by the
Discovery Engine and the synthetic generator. Example: `docs/contracts/discovery-contract.mock.json`.
Known gaps: confidence values are hand-set heuristics, not calibrated. (The old `detect.ts` gaps, fixed
offsets for `detectedOn` and IMERG evidence tagged `measurement`, are gone with the switch to cards.)

## Tooling gaps

- Test runner: Vitest 4.1.12 (`npm test`). Vitest 5 needs `@types/node` ≥ 22; the project pins ^20.
  Experiment scripts run with `tsx` (`npm run experiment:discovery`).
- No Python / ML environment in the repo.
- Superpowers plugin: each collaborator installs it once with
  `claude plugin install superpowers@claude-plugins-official` (terminal) or
  `/plugin install superpowers@claude-plugins-official` (Claude Code CLI only, not the VS Code panel).

## Open questions

- Which target variables should ML predict first, and what ground truth exists for them?
- Where will real field-station data come from, and how much history is there?
- D-002 sign-off: do the pipeline and UI owners accept the contract?
- Field sensors: logging interval, sensor models, depths, calibration, and how gaps are marked.
- Which period each NASA daily value covers: mostly answered. POWER daily: local solar time (response
  header `time_standard: LST`). IMERG: file names `S000000-E235959` (UTC day). SMAP L3: measured; the AM
  pass is 05:44–06:22 Manila on the day AFTER the file date (F-011). The adapter places SMAP at the measured
  time when given it (`smapAcquisitionUtc`). Still open: the adapter writes POWER's `period` as the UTC day.
- Which real site comes first? The pipeline covers Lipa; the demo fields are in Isabela and Bukidnon.
- Results in `experiments/E-001/` and `experiments/E-002/` record commit `76019cb` with a dirty working
  tree. After the work is committed, rerun `npm run experiment:discovery`, `experiment:e002`, `experiment:e003` and `experiment:e004`
  (outputs should be identical apart from the commit fields) so the new commit is recorded.
- How often do real gauges miss days? It sets how much F-004 matters, and whether the rain rule
  should tolerate a missing day.
- How much of corn's water comes from the top 10 cm? F-003's recall depends on it (0.56–0.92).
- History length: the pipeline now has 731 days, enough for the moisture-divergence baseline (≥ 29 days)
  once SMAP L4 is in. The SMAP–station offset rule still needs > 20 paired overpass days with a ground sensor.
