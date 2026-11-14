# Context

Current state of TERRA. Keep this short and true. Last reviewed: 2026-11-14.

## State

- Baseline: commit `76019cb` (Initial TERRA web application). AI/ML work happens on branch `AI-ML`.
- All data is **demo data** generated in `lib/demo/series.ts`. No NASA service or field station is connected.
- No ML models exist yet. The UI's "Discoveries" come from four fixed-threshold rules in `lib/science/detect.ts`.
- Discovery Engine v0.2.0 (`lib/science/discovery/engine.ts`, thresholds in `data/discoveryRules.ts`):
  the four rules of `detect.ts` ported to the proposed contract (D-002) in m³/m³ (only deliberate
  difference: real month lengths for expected rain). One alarm per pattern onset; days with missing
  data neither start nor end a pattern; input is checked (consecutive dates, one field, no duplicate
  values, soil moisture 0..1). Code-reviewed 2026-11-14 (verdict "with fixes"; fixes applied).
  Not wired into the UI or services yet. Tested on synthetic data only: E-001 (old soil) and E-002
  (FAO-56-style soil with station gaps, the current baseline; F-001, F-003, F-004). E-003 tested three
  candidate detectors (`lib/science/discovery/candidates.ts`); none met the pre-registered adoption rule,
  so the baselines stayed the default (D-004). E-004 retested `field-z` and `imerg-fill` on fresh seeds with
  a revised rule: `imerg-fill` was adopted, so the engine default (`DEFAULT_DETECTORS`) fills up to 2
  missing gauge days with IMERG for rain departure (D-005, F-006); `field-z` was not (F-005);
  `trend-break` failed in E-003 (F-007). `BASELINE_DETECTORS` stays the reference for experiments.
- Synthetic records with injected, labelled events: `lib/demo/syntheticFieldDays.ts` (all values
  tagged `simulated`). Default soil model `fao56` (`lib/demo/soilModel.ts`, 2026-11-14): evaporation
  only from a 0.10 m surface layer (FAO-56 stage 1/2), transpiration from a 1.0 m root zone split by
  layer thickness (10% from the surface, UNVERIFIED; real uptake is probably top-weighted), silt-loam
  values inside FAO-56 Table 19. Hand check: mid-season dry spell, 10 cm falls 0.0047 m³/m³/day
  (hand 0.0049) vs 0.0115 in the old `demo-v1` model, which E-001 still uses. Optional station gaps
  (`missing`: random days and outages). Samples: `experiments/samples/*.csv`.
- Rotation/scenario results come from a FAO-56 style water balance in `lib/science/waterBalance.ts`
  (`ETc = Kc × ET0`, ten-day soil-water bucket). Crop parameters in `data/crops.ts` are indicative
  and **not calibrated** to any real field.
- Future Earth uses fixed climate adjustments; NEX-GDDP-CMIP6 is not connected.

## Data sources (planned, none connected)

Catalogue in `data/sources.ts`: field station, SMAP, GPM IMERG, MODIS MOD13Q1, ECOSTRESS,
NASA POWER, NEX-GDDP-CMIP6. Each entry lists resolution and caveats.
Pipeline work exists on remote branch `feat/nasa-data-pipeline` (PR #1): a Python/FastAPI service
that has retrieved real NASA POWER, GPM IMERG and SMAP data for one area of interest
(`lipa_cropland_001`, Lipa City, Batangas, 133.7 ha) for 2024-01-01..15 only. It uses its own schema
(m³/m³, UTC timestamps, `location_id`, `{lat, lon}`), not `types/index.ts`. MODIS NDVI and ECOSTRESS
are not collected yet. No field-sensor schema exists on either side.

## Discovery Engine contract

Proposed in `docs/ai-ml/DECISIONS.md` D-002, with types in `types/discovery-contract.ts`, used by the
Discovery Engine and the synthetic generator. Example: `docs/contracts/discovery-contract.mock.json`.
Known gaps in the current detectors (`lib/science/detect.ts`):
- `detectedOn` dates are fixed offsets from the last day (−3, −2, first reading +30), not real detection times.
- The "Rainfall, last 14 days" evidence row mixes gauge and IMERG but is tagged `measurement`.
- Confidence values are hand-set heuristics, not calibrated.

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
- Which period each NASA daily value covers (UTC day or another window). Not yet verified against
  product documentation; it decides how values map to a field's local day.
- Which real site comes first? The pipeline covers Lipa; the demo fields are in Isabela and Bukidnon.
- Results in `experiments/E-001/` and `experiments/E-002/` record commit `76019cb` with a dirty working
  tree. After the work is committed, rerun `npm run experiment:discovery`, `experiment:e002`, `experiment:e003` and `experiment:e004`
  (outputs should be identical apart from the commit fields) so the new commit is recorded.
- How often do real gauges miss days? It sets how much F-004 matters, and whether the rain rule
  should tolerate a missing day.
- How much of corn's water comes from the top 10 cm? F-003's recall depends on it (0.56–0.92).
- History length: the pipeline has 15 days. The moisture-divergence rule needs ≥ 29 days before its
  baseline of past 14-day changes has any values, and the SMAP–station offset rule needs > 20 paired
  overpass days.
