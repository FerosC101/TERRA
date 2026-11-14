# Findings

Evidence-backed things we have learned. Maintained with the `findings-maintainer` skill.
Never delete an entry: revise it and add a line to its history.

```
## F-xxx — One-sentence finding
Status: Unverified | Supported | Validated | Disputed | Outdated
Recorded: YYYY-MM-DD · Last reviewed: YYYY-MM-DD
Evidence: what shows it (experiment E-xxx, code path, measurement)
Sources: full reference or URL actually consulted, with access date
Scope/limits: where it does and does not apply
History:
- YYYY-MM-DD — created (reason)
```

---

## F-001 — The NDVI-change rule cannot detect a dip while the canopy is greening
Status: Unverified
Recorded: 2026-11-14 · Last reviewed: 2026-11-14
Evidence: E-001 scenario C: an injected 0.08 NDVI dip was detected in 0 of 27 runs when it fell in
the development stage and 10 of 23 in mid-season; 0.03 dips (the rule's own threshold) 0 of 50.
The rule (`data/discoveryRules.ts` → `ndviChange`) compares the change between composites with zero,
so a dip during green-up only slows the rise and the change stays positive.
Sources: none external; internal synthetic experiment only.
Scope/limits: Synthetic records (`lib/demo/syntheticFieldDays.ts`) with corn; the masking follows from
the rule's design for any greening canopy, but how often real dips are missed is not measured.
Suggests comparing against an expected stage trajectory instead of zero (not yet tested).
History:
- 2026-11-14 — created (E-001)
- 2026-11-14 — re-checked with engine v0.2.0 (≥ 3 composites restored): numbers identical; status unchanged
- 2026-11-14 — E-003: a trend-break alternative also failed (F-007); still open, status unchanged

## F-002 — On synthetic records, the moisture-divergence rule alarms about every 15 days with no injected event, so its plain recall is barely above chance
Status: Outdated — superseded by F-003 (applies only to the `demo-v1` soil model)
Recorded: 2026-11-14 · Last reviewed: 2026-11-14
Evidence: E-001 (v0.1.0 and v0.2.0, identical): 6.62 alarms per 100 days on records with no injected
event (median 8 days between alarms). For 18-day dry spells, recall 0.96 [0.865, 0.989] vs chance
0.82 [0.692, 0.902]; attributable recall (alarms absent from the clean record) 0.78 [0.648, 0.872],
an upper bound because it also counts background alarms the event moved earlier.
Sources: none external for the finding itself. For its likely cause: Allen et al. (1998), FAO Irrigation
and Drainage Paper 56, Ch. 7, https://www.fao.org/4/x0490e/x0490e0c.htm (accessed 2026-11-14), which
separates soil evaporation from the 0.10–0.15 m surface layer from transpiration drawn from the root zone.
Scope/limits: Synthetic records only. The generator takes 80% of crop water use from a 150 mm surface
layer (ASSUMPTIONS 3 in `lib/demo/syntheticFieldDays.ts`), which conflicts with FAO-56 and makes the
10 cm reading fall ≈ 0.015–0.02 m³/m³ per dry day in mid-season (hand check). The high alarm rate is
therefore probably a property of the generator, not evidence about the rule on real soils.
History:
- 2026-11-14 — created (E-001)
- 2026-11-14 — revised after code review: title narrowed from "cannot separate from chance" to the
  alarm rate; added attributable recall (E-001 v0.2.0) and the FAO-56 cause; status unchanged
- 2026-11-14 — status Unverified → Outdated: with the FAO-56-style soil model the clean-record alarm
  rate falls to 1.26–1.81 per 100 days at every tested uptake share (E-002), supporting that the rate
  here came from the generator. Replaced by F-003.

## F-003 — On FAO-56-style synthetic soil, the moisture-divergence rule detects dry spells clearly above chance, but how much it detects depends on an unverified uptake assumption
Status: Unverified
Recorded: 2026-11-14 · Last reviewed: 2026-11-14
Evidence: E-002, at surface uptake shares 0.10 / 0.20 / 0.30: 1.26 / 1.43 / 1.81 alarms per 100 days
on clean records; for 18-day dry spells recall 0.56 / 0.88 / 0.92 vs chance 0.08 / 0.16 / 0.34, with
non-overlapping 95% intervals at every share; median delay 4–5 days.
Sources: none external for the finding. The soil model's structure follows Allen et al. (1998), FAO
Irrigation and Drainage Paper 56, Ch. 7–8 (https://www.fao.org/4/x0490e/x0490e0c.htm,
https://www.fao.org/4/x0490e/x0490e0e.htm, accessed 2026-11-14); the uptake share is not from FAO-56.
Scope/limits: Synthetic records only; one soil (silt loam values inside FAO-56 Table 19), climate and crop.
"Above chance" holds at all three shares; the recall level does not (0.56 vs 0.88–0.92), so it must not
be quoted as the rule's performance. Real station data are needed to measure it.
History:
- 2026-11-14 — created (E-002)

## F-004 — A single missing rain-gauge day blocks the rain-departure rule for 14 days, which lowers its recall
Status: Unverified
Recorded: 2026-11-14 · Last reviewed: 2026-11-14
Evidence: E-002 vs E-001. The rule needs all 14 gauge days (engine v0.2.0: a missing day is "unknown",
never 0 mm). Gauge rain in E-002 equals E-001's except on missing days, because gap draws use a separate
random stream and rain does not depend on the soil model. With 3% random missing days plus one 5-day
outage per record, recall fell from 0.94 [0.875, 0.972] to 0.78 [0.689, 0.85] (n = 100) and median
delay rose from 7 to 9.5 days. Example (strict rule, seed 1, FAO-56 soil with gaps): a gap on 2026-10-01
delayed the wet-spell alarm from 9 to 15 Oct. The sample CSV now uses the gap-fill default (D-005) and shows 9 Oct.
Sources: none external; internal synthetic experiment only.
Scope/limits: The size of the drop depends on how often gauges miss days; real gap rates are unknown.
Not missing data in general: the moisture rules need only the two end days of their window.
History:
- 2026-11-14 — created (E-002)
- 2026-11-14 — E-003: filling up to 2 missing gauge days with IMERG raised attributable recall from
  0.69 to 0.87 (F-006); status unchanged
- 2026-11-14 — mitigated in the engine default by IMERG gap-filling (D-005); the strict baseline rule
  still behaves as described; status unchanged

## F-005 — Judging topsoil drying against the field's own history lowers false alarms but misses more short dry spells
Status: Unverified
Recorded: 2026-11-14 · Last reviewed: 2026-11-14
Evidence: E-003 test (seeds 1–50, shares 0.10 / 0.20 / 0.30): the field-z candidate (z ≤ −1.5 against the
field's earlier 14-day changes, tuned on seeds 101–150) had attributable recall 0.58 / 0.84 / 0.90 vs the
fixed rule's 0.56 / 0.86 / 0.88, clean-record alarms 1.03 / 1.08 / 1.23 vs 1.26 / 1.43 / 1.81 per 100 days
(18–32% fewer), and precision 0.336 / 0.419 / 0.429 vs 0.193 / 0.276 / 0.26. Not adopted: E-003's rule
required a +0.05 recall gain.
Sources: none external; internal synthetic experiment only.
Scope/limits: Synthetic records; needs 20 earlier 14-day changes (about 7 weeks of data) before it can
alarm. The reduction in false alarms was not a pre-registered success criterion.
History:
- 2026-11-14 — created (E-003)
- 2026-11-14 — revised after E-004 (fresh seeds 51–100): false alarms 6.5% / 9.4% / 24.7% lower (less
  than E-003's 18–32%); 7-day dry-spell attributable recall 0.12 lower at share 0.30 (E-003: 0.14 lower at
  0.20). Title changed from "same detection" to the trade-off; not adopted; status unchanged

## F-006 — Filling up to two missing gauge days with IMERG restores most of the rain rule's lost detection
Status: Unverified
Recorded: 2026-11-14 · Last reviewed: 2026-11-14
Evidence: E-003 test: rain-departure attributable recall 0.69 [0.594, 0.772] (gauge only) vs 0.87
[0.79, 0.922] (imerg-fill), recall 0.78 vs 0.92, median delay 9.5 vs 7 days (n = 100 events). Clean-record
alarms rose from 2.54 to 3.58 per 100 days; the same rule on the same rain without gaps gives 3.74
(E-001), so the rise reflects restored coverage. Not adopted: E-003's rule capped the clean-alarm increase at 0.25.
Sources: none external; internal synthetic experiment only.
Scope/limits: Synthetic IMERG is the gauge rain with noise (×0.75–1.25, ± 1.5 mm), which is likely kinder
than real IMERG at field scale (~10 km cell; see data/sources.ts caveat). Filled days mix measurement and
satellite provenance; the record says how many days were filled.
History:
- 2026-11-14 — created (E-003)
- 2026-11-14 — replicated in E-004 on fresh seeds 51–100: 0.70 → 0.84 attributable recall, clean alarms
  3.38 vs gap-free reference 3.58; adopted as the engine default (D-005); status unchanged (no external source)

## F-007 — A "growth suddenly slowed" NDVI rule does not find dips: canopy closure triggers it every season
Status: Unverified
Recorded: 2026-11-14 · Last reviewed: 2026-11-14
Evidence: E-003: the trend-break candidate fired on clean records 0.42 times per 100 days at every tested
threshold (0.03 / 0.05 / 0.08), about once per 240-day season; on test seeds its recall equalled chance
(0.34 vs 0.34) and attributable recall was 0. Composite changes in the synthetic records first speed up
during green-up and then fall sharply at canopy closure; that natural slowdown meets the rule, while a
dip during the speed-up does not.
Sources: none external; internal synthetic experiment only.
Scope/limits: The synthetic NDVI curve is the generator's own formula. A detector that uses the expected
crop curve would partly copy that formula, so it must be tested on real NDVI. F-001 remains open.
History:
- 2026-11-14 — created (E-003)
