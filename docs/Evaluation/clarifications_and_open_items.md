# Clarifications and Open Items

**Package:** TERRA Agricultural Knowledge Database
**Framework version:** 1.2
**Date:** 14 November 2026
**Status:** normative for implementation, except where marked open

This note records the five review clarifications from v1.1, the scientific-validation corrections added in v1.2, and the implementation test cases. It is the reference to read before implementing the scoring engine. The full audit is in `scientific_validation_audit.md`.

## Summary

| # | Review item | Resolution | Status |
|---|---|---|---|
| 1 | Water balance could double-count inputs and soil-moisture change | Two mutually exclusive methods aligned to FAO-56 Eq. 85, using gross P and explicit RO | Decided v1.2 |
| 2 | Nitrogen balance could double-count fixation and residue | Gross soil-surface balance: external inputs and gross fixation counted once; in-situ residue is an internal transfer | Decided v1.2 |
| 3 | Diversity edge cases for short sequences and return intervals | Defined for n = 0, 1, 2, no-repeat, varieties, fallow, cover crops | Decided v1.1 |
| 4 | Cover and waterlogging could be read as universal thresholds | Labeled as configurable conventions; saturation and heavy-rain proxy separated | Decided v1.1 |
| 5 | Coverage, confidence, and insufficient-data rules were incomplete | Formulas and thresholds finalized in `scoring_scales.missing_data` | Decided v1.1 |
| 6 | Scientific validity of the v1.1 assumptions | Water and nitrogen methods aligned to cited standards; diversity and thresholds labeled; normal-path tests added | Decided v1.2 |

---

## 1. Water resilience

### Problem
Version 1.0 defined `AW_season` as "effective rainfall plus applied irrigation plus net change in root-zone soil moisture." That wording allows two errors:

- Adding measured soil-moisture change on top of a daily simulation that already updates storage.
- Adding irrigation that is already included in effective rainfall.

Version 1.1 fixed the storage double count but still wrote `P_eff + ... − R`. Effective rainfall is often already net of runoff, so subtracting `R` again could double-count the runoff loss. Version 1.2 uses the FAO-56 form directly.

### Decision
Compute `AW_net` with exactly one of two methods and record `water_balance_method` with the result.

**Reference equation (FAO-56 Eq. 85)**

```text
Dr,i = Dr,i-1 − (P − RO)i − Ii − CRi + ETc,i + DPi
```

Over the growing period this rearranges to:

```text
Σ(P − RO + I + CR − DP) = ΣETc + (S_end − S_start)
```

**Method A — daily root-zone balance (preferred)**

```text
AW_net = Σ (P − RO + I + CR − DP)
```

- `P` gross rainfall
- `RO` runoff
- `I` net applied irrigation
- `CR` capillary rise
- `DP` deep percolation
- `ΔS` is an internal state variable of the daily balance and is **not** added again.

**Method B — seasonal totals (fallback)**

```text
AW_net = (P − RO) + I + CR + (S_start − S_end) − DP
```

- `ΔS` is included exactly once as `S_start − S_end`.
- Use only when a daily balance is unavailable; confidence is lower because timing is lost.

Then:

```text
WSDR = AW_net / CWR_season
```

### Counting guards
1. Use gross rainfall `P` and subtract runoff `RO` explicitly, as in FAO-56 Eq. 85.
2. If an effective-rainfall product is used, it must already equal `P − RO`; do not add `P_eff` and then subtract `RO` again.
3. Count each inflow once: rainfall or effective rainfall, irrigation, and capillary rise.
4. Never add `ΔS` on top of a daily simulation.
5. If irrigation is rainfall-adjusted or already in rainfall, do not add it again.
6. Subtract runoff and deep percolation once.
7. `W2` daily soil water must come from the same balance used for `W1`.
8. Record `P`, `RO`, `I`, `CR`, `DP`, `S_start`, `S_end`, `CWR`, and `method_id` with every result.

### Example
Daily method: `P = 950`, `RO = 50`, `I = 100`, `CR = 0`, `DP = 100`, so `AW_net = 950 − 50 + 100 − 100 = 900 mm`. If measured `ΔS = 50 mm` is then added, the result becomes 950 mm — a double count.

If the data provider supplies `P_eff = 900` (already net of the 50 mm runoff), do **not** subtract `RO` again; use `900 + 100 − 100 = 900 mm`.

Seasonal method with the same inflows and `S_start − S_end = 50` gives `900 + 50 = 950 mm` legitimately, because storage drawdown is counted once and no daily simulation exists.

With `CWR = 1000 mm`, `WSDR` is 0.90 under the daily method and 0.95 under the seasonal method. The difference must be explained by the method, not hidden.

### Critical-stage stress threshold (W2)
Version 1.1 used a flat 0.5 fraction of plant-available water. FAO-56 Table 22 actually gives a crop-specific depletion fraction `p`, and stress begins when the root zone has depleted `RAW = p × TAW`. In terms of available water:

```text
stress when available_water / TAW < (1 − p)
```

The values now stored in `crop_database.csv` are:

| Crop | FAO-56 Table 22 `p` | Stress below available-water fraction |
|---|---:|---:|
| Corn (maize, field grain) | 0.55 | 0.45 |
| Mungbean (green gram) | 0.45 | 0.55 |
| Peanut (groundnut) | 0.50 | 0.50 |
| Sweet potato | 0.65 | 0.35 |
| Cassava (year 1) | 0.35 | 0.65 |
| Cassava (year 2) | 0.40 | 0.60 |

For an actual ETc different from about 5 mm/day, adjust `p = p_table + 0.04(5 − ETc)`, bounded 0.1–0.8. If a crop has no `p`, use 0.5 only as a labeled fallback convention.

---

## 2. Soil fertility

### Problem
Version 1.0 used:

```text
NBR = (N_fixed_credit + N_applied + N_residue_return) / N_removal_total
```

This can count the same nitrogen twice when:

- residue came from a legume whose nitrogen is already in the fixation credit,
- an organic amendment already contains residue,
- in-situ residue is treated as a new input instead of an internal transfer.

Version 1.1 removed the double count but introduced a second problem: it counted **gross** fertilizer nitrogen while subtracting gaseous and leaching losses from fixation (`N_fixed_net`). That mixes the gross soil-surface balance with a full soil balance.

### Decision
Use the Eurostat/OECD **gross soil-surface balance** by default. Count nitrogen at the point it enters the rotation window.

```text
NBR = (N_fertilizer + N_amendment_external + N_fixed_gross + N_deposition)
      / (N_harvest_removal + N_residue_removed)
```

| Pool | Meaning |
|---|---|
| `N_fertilizer` | Mineral or synthetic nitrogen applied in the window, counted once |
| `N_amendment_external` | Organic nitrogen imported from outside the window (manure, compost, imported residue) |
| `N_fixed_gross` | Gross legume fixation, counted once; do **not** net losses from fixation alone |
| `N_deposition` | Atmospheric deposition, if a local estimate exists; otherwise 0 with a note |
| `N_harvest_removal` | Nitrogen removed in harvested grain, roots, or tubers |
| `N_residue_removed` | Nitrogen removed when residue is grazed, burned, or exported |

Report three companion values:

```text
N_surplus = N_inputs_total − N_outputs_total     (kg N/ha)
NUE       = N_outputs_total / N_inputs_total
NBR       = 1 / NUE
```

A ratio alone can hide the absolute size of the surplus or deficit. The Eurostat/OECD method treats NUE near or above 1.0 as a soil-depletion risk and a persistent surplus as a loss proxy.

### Counting guards
1. Use one boundary. Under the gross balance, do not deduct gaseous or leaching losses from fixation unless the same deduction is applied to **all** inputs. Never net only fixation.
2. In-situ residue is an internal transfer, not an input.
3. Do not count legume residue nitrogen and `N_fixed_gross` separately.
4. Imported residue is counted once as `N_amendment_external`, not again as residue return.
5. Retained residue is neither an input nor a removal; exported residue is a removal but not an input.
6. Record the source of `N_fixed_gross`: measured, locally estimated, or default assumption.
7. Record the balance boundary: `gross_soil_surface` or `full_soil`.

### Example
A corn → mungbean → corn window:

- Corn fertilizer N: 120 + 120 = 240 kg N/ha
- Gross mungbean fixation: 55 kg N/ha
- Atmospheric deposition: 5 kg N/ha
- Harvest removal: corn 150 + mungbean 30 + corn 150 = 330 kg N/ha
- Residue removed: 0

```text
NBR      = (240 + 0 + 55 + 5) / (330 + 0) = 300 / 330 = 0.909
N_surplus = 300 − 330 = −30 kg N/ha
NUE       = 330 / 300 = 1.10
```

A local trial may report net fixation of 40 kg N/ha after 15 kg N/ha of losses. Under the gross balance, use the gross 55 and report the 15 separately; do not use 40 as the input while leaving fertilizer nitrogen gross. That would give 285 / 330 = 0.864 and mix boundaries.

---

## 3. Crop diversity

### Decisions

| Case | D1 family diversity | D2 same-family pairs | D3 return interval |
|---|---|---|---|
| n = 0 | null | null | null |
| n = 1 | null (`ln(1) = 0`) | null | null |
| n = 2 | computable (0 or 1) | one pair | null below 3-season minimum |
| n ≥ 3, no species repeat | computable | computable | 100, basis `no_repeat` |
| Multiple repeats | computable | computable | minimum index difference |
| Same species, different variety | same species | same species | same species |
| Fallow season | excluded from denominator | excluded | excluded |
| Cover crop planted as a crop | own family | own family | own species |

### Definitions
- **Return interval** = season index difference. Adjacent seasons = 1; one full season between plantings = 2.
- **Minimum window for D3** = 3 seasons.
- **No repeat** is not missing data. At n ≥ 3 it scores 100 because there is no return-interval penalty.
- **Fallow** still counts in the window for water, cover, and climate criteria; it is excluded only from the diversity denominator.
- **Cover crop** is not fallow when it is planted as a crop.

### D1 normalization
The formula is `D1 = H / ln(n)`, where `n` is the number of **non-fallow seasons**. This is not Pielou's evenness, which divides by `ln(k)` where `k` is the number of families. The choice is deliberate: it measures how close the sequence is to one family per season. Its consequences are:

- `D1 = 1.0` only when every season is a different family.
- If there are fewer families than seasons, the maximum is `ln(k) / ln(n) < 1`.
- It must not be compared with ecological evenness indices computed with `ln(k)`.

### Examples
- Corn → Corn → Corn: `D1 = 0`, `D2 = 2`, `D3 = 1`. Diversity score = `0.5×0 + 0.3×20 + 0.2×0 = 6.0`.
- Corn → Mungbean → Corn: `H = −(2/3·ln 2/3 + 1/3·ln 1/3) = 0.6365`; `ln 3 = 1.0986`; `D1 = 0.6365 / 1.0986 = 0.58` (not 0.63); `D2 = 0`, `D3 = 2`. Diversity score = `0.5×65 + 0.3×100 + 0.2×50 = 72.5`.
- Corn → Peanut → Sweet potato: `D1 = 1.00`, `D2 = 0`, `D3 = 100` with basis `no_repeat`. Diversity score = 100.
- Corn → Mungbean (two seasons): `D1 = 1.00`, `D2 = 0` pairs, `D3` null and marked low confidence.

The D1 score at 0.58 is 65.0 because the breakpoints are 0.5 → 55 and 0.7 → 80: `55 + (0.08 / 0.20) × 25 = 65.0`.

---

## 4. Soil protection and climate

### Ground cover (S1, S2, S3)
- **Definition:** fractional ground cover at the soil surface, 0–1, including living canopy and managed residue.
- **Measurement:** field observation, drone or satellite fractional cover, or a documented crop-calendar proxy. Report the method.
- **Calendar proxy:** assume cover = 1 from canopy closure to senescence and cover = 0 after harvest unless residue is retained. Label as proxy and cap confidence at medium.
- **Threshold:** 30 percent is the common conservation-tillage definition and is associated with roughly halving water erosion in the cited extension guidance (Purdue AY-269-W). It is a configurable screening convention, not a site-specific validated constant.
- **S3** is a qualitative screening class, not a RUSLE soil-loss estimate.

### Waterlogging (C3)
Version 1.0 combined "root-zone water above field capacity" and "heavy rainfall" into one metric. Field capacity is not saturation; the two must not be added.

**Primary metric — saturation excess days:**

```text
saturation_excess_days = days where root-zone water content > (saturation − air-filled porosity),
                         or the water table is within the root zone
```

**Proxy metric — heavy-rain days:**

```text
heavy_rain_days = days with rainfall >= threshold, adjusted for drainage class
default threshold = 50 mm/day
```

**Precedence:** use `saturation_excess_days` when available; otherwise use `heavy_rain_days` and label it as a proxy. Never sum them.

**Prohibited interpretation:** field-capacity exceedance is not waterlogging.

**Threshold basis:** crop sensitivity classes come from `crop_database.csv`. The 24-hour tolerance notes for sweet potato and cassava are documented there. The **3-day limit** and the 2/10/20 multipliers are project conventions, not validated dose-response functions. The 50 mm/day heavy-rain proxy is a configurable default; calibrate it to the local 95th–99th percentile of daily rainfall and to soil drainage.

### Example
A season has 4 saturation days and 6 heavy-rain days. Use 4 days (primary), not 10. If only the rainfall proxy exists, use 6 and cap confidence at medium.

---

## 5. Scoring, coverage, confidence, and insufficient data

### Symbols
| Symbol | Meaning |
|---|---|
| `w_i` | criterion weight; sums to 1 across the five criteria |
| `u_ij` | local indicator weight within criterion `i`; sums to 1 across applicable indicators |
| `g_ij` | global indicator weight = `w_i × u_ij` |
| `cov_i` | criterion coverage |
| `cov_overall` | overall coverage |
| `s_i` | criterion score |
| `S` | overall score |

### Formulas

```text
cov_i = Σ(u_ij for scored indicators) / Σ(u_ij for applicable indicators)

cov_overall = Σ(w_i × cov_i) / Σ(w_i)
              over criteria with at least one applicable indicator

s_i = Σ(u_ij × score_ij for scored indicators) / Σ(u_ij for scored indicators)

S = Σ(w_i × s_i for criteria with at least one scored indicator)
    / Σ(w_i for those criteria)
```

### Indicator status
| Status | Effect on denominator | Meaning |
|---|---|---|
| `scored` | Included | Numeric score produced |
| `missing_input` | **Included** | Required input absent; score null; coverage falls |
| `not_applicable` | **Excluded** | Indicator does not apply; must not be shown as pass or fail |

`not_applicable` examples: D3 when the window is shorter than three seasons; D1 and D2 when there are fewer than two seasons.

### Coverage example
Suppose:

| Criterion | Weight | Coverage |
|---|---:|---:|
| Water | 0.25 | 1.00 |
| Fertility | 0.25 | 0.50 |
| Diversity | 0.20 | 1.00 |
| Protection | 0.15 | 0.50 |
| Climate | 0.15 | 0.00 |

```text
cov_overall = 0.25(1.00) + 0.25(0.50) + 0.20(1.00) + 0.15(0.50) + 0.15(0.00)
            = 0.25 + 0.125 + 0.20 + 0.075 + 0
            = 0.65
```

Four criteria have `cov_i ≥ 0.50`, so an overall score is reported. Climate is excluded and the criterion weights are renormalized for `S`. The result must state that climate was excluded.

### Confidence
| Level | Rule |
|---|---|
| High | `cov_i ≥ 0.80` and every scored indicator's weakest input is `measured` or `local_reference` |
| Medium | `cov_i ≥ 0.50` and no scored indicator relies solely on `general_reference` or `hypothetical` |
| Low | `cov_i < 0.50`, or a proxy input, or a `general_reference` or `hypothetical` input |

- Overall confidence = **minimum** confidence among included criteria (weakest link). Do not average it upward.
- Display per-criterion confidence as well.
- Any proxy input caps the criterion at medium.
- Any hypothetical input caps the criterion at low.

### Insufficient data
Return `status = insufficient_data` when either condition holds:

1. `cov_overall < 0.50`, or
2. fewer than 3 of the five criteria have `cov_i ≥ 0.50`.

Return the available criterion scores, per-criterion coverage, overall coverage, missing inputs, and reasons. Do **not** output an overall numeric score or a suitability judgement.

If exactly 3 criteria qualify, `S` is reported, but confidence cannot exceed the weakest included criterion and the result must state that 2 criteria were excluded.

### Rounding
- Keep full precision internally.
- Criterion and overall scores: 1 decimal place on display.
- Coverage: 2 decimal places or an integer percentage.
- Confidence: label only.

---

## 6. Open items requiring confirmation

| Item | Current decision | Who confirms |
|---|---|---|
| Fallow seasons excluded from diversity denominator | Decided | Rotation Lab developer |
| Cover crops count as their own family and species | Decided | Rotation Lab developer |
| Heavy-rain proxy threshold (default 50 mm/day) | Configurable default; calibrate to local 95th–99th percentile | Agronomist and hydrologist |
| Minimum 3-season window for D3 | Decided | Rotation Lab developer |
| Overall confidence uses weakest link | Decided | Product and developer |
| `N_fixed_gross` estimation method | Requires local fixation data; gross value preferred | Agronomist |
| Atmospheric N deposition | Default 0 with a note until a local estimate exists | Agronomist |
| Local calibration of cover and waterlogging thresholds | Screening defaults | Agronomist |
| Water-balance method available for each field | Depends on data | Developer and field team |
| D1 normalization by `ln(n seasons)` | Decided as a project index, not Pielou evenness | Product and agronomist |
| F2 scoring above NBR 1.2 | Declines to 70 at 1.5 and 30 at 2.0 | Agronomist |

---

## 7. Test cases for implementation

### 7.1 Accounting guards and edge cases (v1.1)

| ID | Test | Expected |
|---|---|---|
| T01 | W1 with daily balance and measured `ΔS` | `ΔS` ignored; `AW_net` equals daily inflow minus outflow |
| T02 | W1 with seasonal totals | `S_start − S_end` included exactly once |
| T03 | W1 with irrigation already in `P_eff` | Irrigation not added twice |
| T04 | F2 with legume residue | Residue not added as a separate input |
| T05 | F2 with exported residue | Residue counted as removal, not input |
| T06 | D1 with n = 1 | null, not 0 or 100 |
| T07 | D3 with n = 2 | null and low confidence |
| T08 | D3 with n = 3 and no repeat | 100 with basis `no_repeat` |
| T09 | D3 with repeat after one full season | interval = 2 |
| T10 | C3 with saturation days available | saturation metric used; heavy-rain days ignored |
| T11 | C3 with only rainfall | proxy used and confidence capped at medium |
| T12 | Coverage with `missing_input` | denominator unchanged; coverage falls |
| T13 | Coverage with `not_applicable` | denominator reduced; coverage unaffected |
| T14 | 2 criteria with coverage ≥ 0.50 | `insufficient_data`; no overall score |
| T15 | 3 criteria with coverage ≥ 0.50 | score reported with exclusion note and weakest-link confidence |

### 7.2 Normal-path and numeric tests (v1.2)

| ID | Test | Expected |
|---|---|---|
| T16 | Full-data Corn → Mungbean → Corn, all inputs present | all 14 indicators scored; `cov_overall = 1.00`; `S` is the weighted mean of the five criterion scores; no `insufficient_data` |
| T17 | D1 numeric check, Corn → Mungbean → Corn | `H = 0.6365`, `ln 3 = 1.0986`, `D1 = 0.58` (tolerance ±0.01); diversity score = 72.5 |
| T18 | D checks for the three example rotations | Corn→Corn→Corn: `D1=0`, `D2=2`, `D3=1`, D=6.0. Corn→Peanut→Sweet potato: `D1=1.0`, `D2=0`, `D3=100`, D=100. |
| T19 | F1 legume fraction | Corn→Mungbean→Corn = 0.333 → 70; Corn→Corn→Corn = 0 → 0 |
| T20 | F2 gross balance with fixation and deposition | inputs 300, outputs 330 → `NBR = 0.909`, `N_surplus = −30 kg N/ha`, `NUE = 1.10`; score 73.6 ± 0.5 |
| T21 | F2 boundary guard | gross fixation 55 with 15 losses must use 55 in the gross balance; using 40 while leaving fertilizer gross fails |
| T22 | W2 crop-specific p | corn p = 0.55 → stress below 0.45 available water; a day at 0.50 is not a deficit, a day at 0.44 is. Sweet potato p = 0.65 → stress below 0.35. |
| T23 | Criterion exclusion and renormalization | with n = 0, diversity has no applicable indicators; exclude it, renormalize the other four weights, and do not score diversity as 0 |
| T24 | Confidence downgrade | C3 from saturation days may reach medium/high; C3 from heavy-rain proxy is capped at medium and labeled `proxy` |
| T25 | End-to-end example ordering | A (corn→corn→corn) has lower diversity and F1 than B and C; C has the highest diversity; if coverage < 0.50, return `insufficient_data` instead of an overall score |
| T26 | pH and rooting-depth constraints | field pH 4.0–4.5 vs corn 5.5–7.0 → constraint; field pH 5.6–6.8 vs corn → no constraint; field depth 0.5 m vs sweet potato min 1.0 m → advisory; vs cassava min 0.5 m → no advisory |

---

## 8. Files affected

- `crop_database.csv` — new `depletion_fraction_p_fao56` column (FAO-56 Table 22)
- `rotation_evaluation_framework.json` — v1.2; revised W1, W2, F2, D1, D2, D3, S1, C3; new `threshold_register`, `scientific_validation`; REF-21 and REF-22
- `rotation_rules.json` — v1.2; revised ROT003, ROT004, ROT005, ROT006, ROT008; new `scientific_validation_traceability`
- `rotation_evaluation_framework.xlsx` — new Threshold Register sheet; version 1.2
- `clarifications_and_open_items.md` — this document
- `scientific_validation_audit.md` — new, full audit
- `README.md` — v1.2 summary and file map
- `sources_and_references.docx` — REF-21, REF-22, and a validation section
