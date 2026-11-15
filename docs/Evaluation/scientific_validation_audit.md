# Scientific Validation Audit

**Package:** TERRA Agricultural Knowledge Database
**Framework version audited:** 1.1 (corrections applied in 1.2)
**Audit date:** 14 November 2026
**Auditor:** TERRA agricultural research
**Status:** completed; corrections applied in v1.2

## Why this audit exists

A framework can be internally consistent, fully documented, and still rest on weak agricultural assumptions. This audit separates three things that were previously mixed together:

1. **Methodologically supported** — the equation or accounting boundary comes from a cited standard.
2. **Project convention** — a deliberate prototype choice that is not a validated universal constant.
3. **Unsupported or inconsistent** — the package claimed support that the source did not provide, or two parts of the method contradicted each other.

The audit checked the five questions raised in review:

- Are the water-balance equations scientifically supported?
- Are the nitrogen accounting rules consistent with established nutrient-accounting methods?
- Are the diversity thresholds scientifically justified or explicitly identified as project conventions?
- Are configurable thresholds documented with their sources or rationale?
- Do T01–T15 include both normal scenarios and edge cases?

## Verdict summary

| # | Question | Verdict for v1.1 | v1.2 disposition |
|---|---|---|---|
| 1 | Water balance supported? | **Partly.** The structure was close to FAO-56, but `P_eff + ... − R` could double-count runoff, and W2 used a flat 0.5 instead of published crop-specific `p` values. | Rewritten to FAO-56 Eq. 85 with gross `P` and explicit `RO`; W2 now uses Table 22 `p` and the threshold `1 − p`. |
| 2 | Nitrogen accounting consistent? | **No, as written.** v1.1 counted gross fertilizer N but net fixation, mixing the gross soil-surface balance with a full soil balance. | Rewritten to the Eurostat/OECD gross soil-surface balance; N surplus and NUE are now reported with NBR. |
| 3 | Diversity thresholds justified or labeled? | **Mixed.** The Shannon form is standard, but `H/ln(n seasons)` is not Pielou evenness; the worked example was arithmetically wrong (0.63 vs 0.58). | Normalization and breakpoints are now explicitly project conventions; the example is corrected. |
| 4 | Configurable thresholds documented? | **Partly.** Most were labeled "proposed," but the 30 percent cover value had no direct citation, and the "3-day limit" was attributed to `crop_database.csv` although it is not there. | Added a 20-entry threshold register with type, basis, source, and calibration owner; corrected the citation and the dangling 3-day reference. |
| 5 | T01–T15 cover normal and edge cases? | **No.** They were almost entirely edge cases and accounting guards, with no normal-path numeric tests. | Added T16–T26: normal-path scores, D1 arithmetic, F1/F2 values, p-based W2, renormalization, confidence, end-to-end ordering, and pH/depth constraints. |

**Bottom line:** v1.2 is methodologically supported where it claims to be, and explicitly conventional where it is not. It is still a screening framework, not a validated predictive model.

---

## 1. Water balance

### What v1.1 said

```text
Daily:    AW_net = Σ (P_eff + I + CR − R − DP)
Seasonal: AW_net = P_eff + I + CR + (S_start − S_end) − R − DP
WSDR = AW_net / CWR_season
CWR_season = Σ (Kc × ETo)
```

### What the standard says

FAO-56 Chapter 8 defines the root-zone balance as Eq. 85:

```text
Dr,i = Dr,i-1 − (P − RO)i − Ii − CRi + ETc,i + DPi
```

The standard uses **gross rainfall `P`** and an **explicit runoff `RO`** term. It does not use an "effective rainfall" term plus a separate runoff subtraction. Over a growing period the balance rearranges to:

```text
Σ(P − RO + I + CR − DP) = ΣETc + (S_end − S_start)
```

So the net inflow is the water consumed by the crop plus the change in storage. That makes the supply-to-demand ratio a legitimate screening construct: supply is net inflow, demand is `Σ(Kc × ETo)`.

### Findings

| Finding | Severity | Evidence |
|---|---|---|
| `P_eff + ... − R` can double-count runoff, because "effective rainfall" is commonly defined as rainfall after runoff (and sometimes after interception). | **Material** | FAO-56 Eq. 85 uses `P − RO`, not `P_eff − RO`. The package's own guard said "count each inflow once" but did not define `P_eff`, so the ambiguity survived. |
| The daily balance correctly treats `ΔS` as internal. | Supported | FAO-56 Eq. 85 updates depletion daily; adding measured `ΔS` again would double-count storage. |
| The seasonal fallback correctly includes storage once. | Supported | The rearrangement above shows `S_start − S_end` appears once when no daily simulation exists. |
| W2's flat 0.5 stress threshold ignored the published crop-specific `p` values. | **Material** | FAO-56 Table 22 gives p = 0.55 (maize), 0.45 (green gram), 0.50 (groundnut), 0.65 (sweet potato), 0.35/0.40 (cassava year 1/2). Stress begins at `RAW = p × TAW`, i.e. available water below `1 − p`. |
| `WSDR` is a supply-demand ratio, not a yield prediction. | Clarified | The framework already said scores are advisory; v1.2 adds this to the limitations. |

### What changed in v1.2

- `AW_net` daily form is now `Σ(P − RO + I + CR − DP)`.
- Seasonal form is `(P − RO) + I + CR + (S_start − S_end) − DP`.
- A guard states that an effective-rainfall product may replace `P − RO` only when it is defined identically.
- `crop_database.csv` gained `depletion_fraction_p_fao56` with the FAO-56 Table 22 values.
- W2 now uses `1 − p`, with the optional ETc adjustment `p = p_table + 0.04(5 − ETc)`, bounded 0.1–0.8.
- `WSDR` is described as a screening ratio, not a yield response.

### Remaining caveat

The balance is an accounting identity. It does not calibrate `Kc` to local varieties, does not model preferential flow or a shallow water table, and does not validate the 0.8/0.6 WSDR bands. Those bands remain screening conventions.

---

## 2. Nitrogen accounting

### What v1.1 said

```text
NBR = (N_fertilizer + N_amendment_external + N_fixed_net)
      / (N_harvest_removal + N_residue_removed)
N_fixed_net = gross fixation − estimated gaseous and leaching losses
```

### What the standard says

The Eurostat/OECD gross nitrogen balance:

- **Inputs:** mineral fertilizers, manure, other organic fertilizers, atmospheric deposition, biological nitrogen fixation, seeds and planting material.
- **Outputs:** nitrogen removed with the harvest of crops and fodder, grazing, and crop residues removed from the field.
- **Surplus:** total inputs − total outputs.
- **NUE:** total outputs / total inputs.
- Eurostat explicitly notes that NUE near or above 1.0 indicates a risk of soil depletion, and that a persistent surplus is a proxy for losses to air and water.
- The gross balance does **not** deduct gaseous or leaching losses from individual inputs; those losses are interpreted from the surplus. A "full soil balance" that subtracts losses must do so consistently.

### Findings

| Finding | Severity | Evidence |
|---|---|---|
| v1.1 mixed boundaries: fertilizer N was gross, fixation was net of losses. | **Material** | The Eurostat/OECD gross balance counts gross fixation. Netting losses from fixation alone is not a recognized variant and biases the ratio downward relative to fertilizer-heavy systems. |
| v1.1 omitted atmospheric deposition. | Minor to material | Deposition is a standard input category. It is small in many systems but can be several kg N/ha/yr; omitting it without a note overstates a deficit. |
| v1.1 called `NBR` a "balance" but defined a ratio. | Clarified | The standard's primary indicator is a mass surplus (kg N/ha). The ratio is the inverse of NUE, which is also standard, but it is not a mass balance. |
| The 1.5 excess threshold and the 1.2–1.5 "perfect" score were too lenient. | **Material** | A 50 percent surplus is a large loss proxy. v1.1 gave it a score of 100. |
| The double-counting guards for residue were correct. | Supported | In-situ residue is an internal transfer; retained residue is neither input nor removal. |

### What changed in v1.2

- Formula is now the gross soil-surface balance with `N_fixed_gross` and `N_deposition`.
- `N_surplus` (kg N/ha) and `NUE` are reported with `NBR`.
- The scoring declines above 1.2: 1.2 → 100, 1.5 → 70, 2.0 → 30.
- The guard forbids netting losses from fixation alone. A full-balance user must subtract losses from all inputs consistently.
- The 0.8 deficit and 1.5 excess triggers are labeled screening conventions.

### Remaining caveat

The balance does not model mineralization, immobilization, volatilization, nitrification, or leaching dynamics. It is a bookkeeping boundary, not a soil nitrogen model. `N_fixed_gross` still needs a local trial or a documented estimate.

---

## 3. Crop diversity

### What v1.1 said

```text
D1 = H / ln(n), H = −Σ(p_f × ln p_f)
```

and the worked example claimed:

```text
Corn → Mungbean → Corn: D1 = 0.63
```

### Findings

| Finding | Severity | Evidence |
|---|---|---|
| The worked example was arithmetically wrong. | **Material** | `p = 2/3, 1/3`; `H = 0.6365`; `ln 3 = 1.0986`; `D1 = 0.579`, not 0.63. The correct value is 0.58. |
| `H/ln(n seasons)` is not Pielou's evenness. | Clarified | Pielou's `J = H/ln(k)` where `k` is the number of categories (families). Using `ln(n seasons)` measures approach to one-family-per-season and caps below 1.0 when families < seasons. |
| The choice of `ln(n)` is defensible for rotation screening but was not stated. | **Material** | Without the note, a reader would compare it to ecological evenness and misinterpret the score. |
| D2 and D3 breakpoints are conventions, not measured pest responses. | Supported as conventions | The framework already said pest-specific intervals override the default; v1.2 adds explicit `threshold_basis` fields. |
| The fallow and cover-crop rules are clear. | Supported | Fallow is excluded from the diversity denominator; a planted cover crop counts as its own family/species. |

### What changed in v1.2

- Added `normalization_note` to D1 explaining `ln(n seasons)` vs `ln(k families)`.
- Added `threshold_basis` to D1, D2, and D3.
- Corrected the worked example from 0.63 to 0.58, with the full arithmetic.
- Added the deterministic diversity scores for the three example rotations: 6.0, 72.5, and 100.

### Remaining caveat

The diversity indicators are proxies for pest, disease, and weed pressure. They do not replace a pest-specific history. The 2/3/4-season return interval is a default; a known soilborne pathogen may require a longer break.

---

## 4. Configurable thresholds

### Findings

| Threshold | v1.1 status | Finding | v1.2 disposition |
|---|---|---|---|
| 30 percent ground cover | "Common erosion-protection convention" | No direct citation. | Tied to the conservation-tillage definition and the roughly 50 percent water-erosion reduction reported in Purdue AY-269-W. Still a convention, not a site-specific constant. |
| 50 mm/day heavy-rain proxy | "Configurable default" | No rationale beyond being a rainfall threshold. | Labeled a proxy default with a calibration path: local 95th–99th percentile of daily rainfall and soil drainage. |
| 3-day waterlogging limit | Attributed to `crop_database.csv` | The CSV documents 24-hour tolerance notes for sweet potato and cassava, but no 3-day limit. | Corrected: 24-hour notes are documented; the 3-day limit is a project convention. |
| 2/10/20 waterlogging multipliers | "Screening weights" | Correctly labeled, but scattered. | Registered in the threshold register. |
| W2 0.5 stress threshold | "Default 0.5 unless a source provides a crop-specific value" | FAO-56 does provide crop-specific values. | Replaced by `1 − p` from Table 22. |
| WSDR 0.8/0.6, F2 0.8/1.5, D1/D2/D3, S2, C1/C2/C3 breakpoints | "Proposed" in different places | Inconsistent labeling. Some had `proposed: true`, some only a global disclaimer. | All 20 entries now appear in `threshold_register` with a type, basis, source, and calibration owner. |

### What changed in v1.2

The framework now has a top-level `threshold_register` with 20 entries. Each entry states:

- the parameter and value,
- whether it is `evidence_based`, `screening_convention`, or `proxy_default`,
- the basis,
- the source,
- who calibrates it.

This does not make the thresholds validated. It makes their status inspectable, which is the correct standard for a prototype.

---

## 5. Test coverage

### What T01–T15 covered

T01–T15 were mostly edge cases and accounting guards:

- double-counting water storage and irrigation,
- legume residue and exported residue,
- n = 1 and n = 2 diversity,
- no-repeat and one-season return,
- saturation vs heavy-rain proxy,
- coverage denominators,
- insufficient-data boundaries.

That is useful, but it is not a normal-path acceptance suite. A developer could pass all fifteen and still compute D1 wrong or give a 50 percent N surplus a perfect score.

### What T16–T26 add

| ID | Normal-path coverage |
|---|---|
| T16 | Full-data three-season rotation: all indicators scored, coverage 1.00, overall score computed |
| T17 | D1 numeric check: Corn → Mungbean → Corn = 0.58, diversity score 72.5 |
| T18 | Diversity checks for all three example rotations: 6.0, 72.5, 100 |
| T19 | F1 legume fraction: 0.333 → 70; 0 → 0 |
| T20 | F2 gross balance: NBR 0.909, surplus −30, NUE 1.10, score 73.6 |
| T21 | F2 boundary guard: gross 55 with 15 losses must not become 40 while fertilizer stays gross |
| T22 | W2 crop-specific p: corn 0.55 → 0.45 threshold; sweet potato 0.65 → 0.35 |
| T23 | Criterion exclusion and weight renormalization when diversity has no applicable indicators |
| T24 | Confidence downgrade from measured saturation to heavy-rain proxy |
| T25 | End-to-end ordering of examples A/B/C and the insufficient-data guard |
| T26 | pH non-overlap constraint and rooting-depth advisory |

---

## What is still not validated

The audit does not certify the framework as agronomically validated for Isabela or Bukidnon. These remain open:

1. **Criterion weights** (25/25/20/15/15) are project starting values, not elicited expert weights.
2. **Most scoring breakpoints** are screening conventions. They have not been fitted to local yield or loss data.
3. **Crop parameter values** are cited, but some come from secondary compilations (Wikifarmer, Juan Magsasaka) where primary national data were unavailable. Those rows are flagged in the CSV.
4. **No field calibration.** The three demo fields have no soil tests, crop history, irrigation records, or slope measurements. Several indicators are `missing_input` by design.
5. **Climate scenarios are historical analogs**, not projections. They show what the fields experienced in selected years, not what they will experience in 2050.
6. **Nitrogen fixation and deposition** are not locally measured. The gross balance is only as good as those inputs.
7. **The water balance is not a calibrated simulation.** It is an accounting identity using scenario rainfall and crop coefficients.
8. **Pest and disease dynamics** are not modeled. Diversity and return intervals are proxies.

## References used in this audit

- **FAO-56**, Allen et al. (1998), Chapter 8 Eq. 85 and Table 22: <https://www.fao.org/3/x0490e/x0490e0e.htm>
- **Eurostat/OECD gross nitrogen balance**, Statistics Explained: <https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Agri-environmental_indicator_-_gross_nitrogen_balance>
- **Purdue AY-269-W**, Eck and Brown, *Estimating Corn and Soybean Residue Cover*: <https://www.extension.purdue.edu/extmedia/AY/AY-269-W.pdf>
- **USDA NRCS Conservation Practice Standard 328**, Crop Rotation: <https://www.nrcs.usda.gov/sites/default/files/2022-09/Crop_Rotation_328_CPS.pdf>
- **Pielou, E.C. (1966)**, *The measurement of diversity in different types of biological collections*, Journal of Theoretical Biology 13:131–144 — the `H/ln(k)` evenness definition used for contrast. Not stored as a package reference because the package does not use Pielou's index.

## Audit conclusion

The v1.1 framework was technically complete but overstated its scientific basis in three places: it used an ambiguous effective-rainfall term, it mixed gross and net nitrogen boundaries, and it presented a non-Pielou diversity index without saying so. Those are now corrected or labeled. The remaining conventions are visible in one register, and the test suite includes normal-path numeric cases. That is the right status for a prototype that still needs field calibration.
