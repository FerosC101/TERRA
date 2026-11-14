# TERRA Agricultural Knowledge Package

Model-ready crop, soil, rotation, and climate data for the TERRA Rotation Lab. Everything here is research documentation plus structured data; no application code was modified.

**Version:** 1.2 · **Date:** 14 November 2026

Version 1.1 resolved five review clarifications on the water balance, nitrogen balance, diversity edge cases, cover/waterlogging thresholds, and coverage/confidence rules. Version 1.2 adds a scientific-validation audit that corrected the water and nitrogen methods and labelled the remaining conventions. See `clarifications_and_open_items.md` and `scientific_validation_audit.md`.

## File map

| File                                 | Format                    | What it contains                                                                                                 |
| ------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `crop_database.csv`                  | CSV, 5 rows × 22 columns  | Agronomic characteristics for corn, mungbean, peanut, sweet potato, and cassava, including FAO-56 depletion fraction `p` |
| `soil_reference.csv`                 | CSV, 18 rows × 23 columns | Regional soil-map classes, general texture references, and reserved field-measurement rows                       |
| `local_soil_research_notes.md`       | Markdown                  | Short local soil research document for the three demo fields                                                     |
| `rotation_rules.json`                | JSON                      | 12 implementable rotation rules with evaluation keys, thresholds, severity, and sources                          |
| `rotation_evaluation_framework.json` | JSON                      | 5 criteria, 14 indicators, formulas, weights, scoring scales, constraints, clarifications, and data requirements |
| `rotation_evaluation_framework.xlsx` | Excel workbook, 13 sheets | Human-readable version of the framework for review and calibration                                               |
| `clarifications_and_open_items.md`   | Markdown                  | Normative v1.2 definitions for water, nitrogen, diversity, cover, waterlogging, coverage, and confidence         |
| `scientific_validation_audit.md`     | Markdown                  | The v1.2 audit: findings, evidence, corrections, and what is still not validated                                |
| `climate_scenarios.csv`              | CSV, 90 rows × 19 columns | Baseline, drought, extreme heat, excessive rainfall, and combined-stress scenarios for the three fields          |
| `climate_scenarios_notes.md`         | Markdown                  | Scenario construction, dataset resolution, and limitations                                                       |
| `sources_and_references.docx`        | Word document             | Full traceability: 22 references, evidence map, validation findings, gaps, and next steps                        |

## Data conventions

- **Encoding:** UTF-8 CSV with a header row.
- **Dates:** ISO `YYYY-MM-DD` where a full date is known; a year alone where only the year is known.
- **Units:** numeric columns state units in the column name or in `units_notes`. Do not assume a unit from a column name alone.
- **Blank cells:** a blank means *not documented* or *not measured*. It never means zero.
  - In `crop_database.csv`, blank means the source did not provide the value.
  - In `soil_reference.csv`, blanks in `field_measurement_pending` rows mean no sample exists yet.
  - `nitrogen_fixation_conditions` is blank for non-legumes by design; read `nitrogen_fixation` first.
- **Multiple sources:** `crop_database.csv` stores source titles and URLs separated by ` | ` in the same order. `soil_reference.csv` stores one source per row.
- **Evidence class:** `soil_reference.csv` uses `data_source_class` with three values: `regional_soil_map`, `general_reference`, and `field_measurement_pending`. Never merge these classes into one value.
- **Uncertainty:** every CSV row has an uncertainty note. Read it before using a number.

## How the files link

| Link | Key | Notes |
|---|---|---|
| Crop record → rotation rule | `crop_name` and `crop_family` | Rules read family and nitrogen-fixation status from `crop_database.csv` |
| Crop record → soil record | `crop_name` + field identity | No direct foreign key yet; soil rows carry `location_or_context` and, for demo fields, `FM-*` IDs |
| Climate scenario → field | `location_name` | The three names match the TERRA demo fields |
| Rule → framework indicator | `linked_indicator` | Values such as `D2`, `W1`, `C3` match `indicator_id` |
| Criterion → framework | `criterion_id` | `WATER`, `FERTILITY`, `DIVERSITY`, `PROTECTION`, `CLIMATE` |
| Reference → framework | `reference_id` | `REF-01` to `REF-22` are used across the framework JSON and the Word document |

## Missing-data, coverage, and confidence

Each indicator is marked `scored`, `missing_input`, or `not_applicable`.

- `missing_input` stays in the coverage denominator and lowers coverage.
- `not_applicable` is removed from the denominator but reported separately.
- Do not impute a missing field measurement from a regional map or general reference.

Coverage and score formulas:

```text
cov_i = Σ(u_ij for scored) / Σ(u_ij for applicable)

cov_overall = Σ(w_i × cov_i) / Σ(w_i)
              over criteria with at least one applicable indicator

s_i = Σ(u_ij × score_ij for scored) / Σ(u_ij for scored)

S = Σ(w_i × s_i for criteria with at least one scored indicator)
    / Σ(w_i for those criteria)
```

`w_i` is the criterion weight, `u_ij` the local indicator weight, and `g_ij = w_i × u_ij` the global indicator weight. The two coverage forms are equivalent.

Confidence:

| Level | Rule |
|---|---|
| High | `cov_i ≥ 0.80` and every scored indicator's weakest input is measured or local |
| Medium | `cov_i ≥ 0.50` and no scored indicator relies solely on general reference or hypothetical data |
| Low | `cov_i < 0.50`, or a proxy input, or general-reference or hypothetical data |

Overall confidence is the **minimum** confidence among included criteria (weakest link), not an average.

Insufficient data: return `status = insufficient_data` when `cov_overall < 0.50` or when fewer than 3 of the five criteria have `cov_i ≥ 0.50`. Return the available criterion scores and reasons; do not output an overall score or a suitability judgement.

Rules return `triggered = false` with `status = not_evaluable` when their inputs are absent. Do not display that as a green pass.

## Weights and scoring

Criterion weights are the proposed starting values from the research specification:

| Criterion | Weight |
|---|---:|
| Water resilience | 25% |
| Soil fertility management | 25% |
| Crop diversity | 20% |
| Soil protection | 15% |
| Climate suitability | 15% |

Overall score: `S = Σ (w_i × s_i)` over criteria with at least one scored indicator, with criterion weights renormalized over those criteria. Range 0-100. Weights and thresholds are configurable and marked `proposed` where they still need expert calibration. Always display the five criterion scores, coverage, confidence, and flags alongside the overall score.

Key v1.2 clarifications:

- **Water:** use one stated method, aligned to FAO-56 Eq. 85. Use gross rainfall `P` and subtract runoff `RO` explicitly. A daily balance treats soil-moisture change as internal; a seasonal balance includes it once. Never add it twice.
- **Critical-stage stress:** use the crop-specific FAO-56 Table 22 depletion fraction `p`; stress begins below `1 − p` available water, not a flat 0.5.
- **Nitrogen:** use the Eurostat/OECD gross soil-surface balance. Count external inputs and gross fixation once; in-situ residue is an internal transfer. Report N surplus and NUE with the ratio.
- **Diversity:** `D1 = H / ln(n seasons)` is a project index, not Pielou evenness. The minimum window for the return-interval indicator is three seasons; single occurrences are not missing data.
- **Cover and waterlogging:** the 30 percent cover threshold and the 24-hour/3-day waterlogging limits are configurable conventions, not validated universal constants. Saturation days and heavy-rain proxy days are separate metrics and are never summed.
- **Threshold status:** every configurable threshold appears in the framework's `threshold_register` with its type, basis, source, and calibration owner.

The framework is a screening tool. It is methodologically supported where it claims to be and explicitly conventional where it is not. It is not an agronomically validated predictive model — see `scientific_validation_audit.md`.

## What is intentionally not included

- No field soil-test results. Samples were not taken. The demo-field rows are present but empty and labeled pending.
- No projected climate values. The scenarios are historical analogs from NASA POWER 1991-2020. NEX-GDDP-CMIP6 and GPM IMERG are documented as the next sources to add.
- No parcel-level soil series or pH assignment. Regional maps describe provincial context only.
- No guaranteed yields or variety recommendations.

## Suggested developer workflow

1. Load `crop_database.csv` and key crops by `crop_name`.
2. Load `soil_reference.csv`, filter `data_source_class`, and never backfill pending field rows with regional values.
3. Load `climate_scenarios.csv` and key by `location_name` + `scenario_id`.
4. Implement rules from `rotation_rules.json` using the `evaluation` key.
5. Score criteria using `rotation_evaluation_framework.json` indicator formulas and breakpoints.
6. Return criterion scores, flags, coverage, confidence, missing inputs, and assumptions with every result.

Read `sources_and_references.docx` before changing any threshold or weight. It records why each value exists and which gaps are deliberate.
