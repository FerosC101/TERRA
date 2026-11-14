# Experiments

ML and model experiments. Results are copied from actual run output only. A planned or
abandoned experiment stays here with its status.

```
## E-xxx — Title
Date: YYYY-MM-DD · Status: Planned | Running | Done | Abandoned
Question: what we want to learn
Data: source, version/date range, split method, demo or real
Setup: commit, model/rule, parameters, seed, command to reproduce
Baseline: what we compare against
Metrics: chosen before running, and why
Result: numbers from the run output (or "not run")
Conclusion: what it shows, limits → link F-xxx / D-xxx
```

---

## E-001 — Discovery Engine rules on synthetic records with injected events
Date: 2026-11-14 · Status: Done
Question: Do the four ported rules (`lib/science/discovery/engine.ts`, v0.1.0) detect injected
events, how often do they alarm on records with no injected event, and at what event size does
each rule start detecting?
Data: **Synthetic only** (`lib/demo/syntheticFieldDays.ts`). 240 days from 2026-05-01, demo
Cagayan Valley climatology (`FIELDS[0].climate`, illustrative, not NASA POWER), corn planted
2026-06-01. Tests code paths and sensitivity, **not** performance on real fields.
Setup: rules v0.1.0; seeds 1–50 for data, seed + 1000 for event placement; `runAt` fixed.
Scenarios: A clean (no events); B one of each per run (18-day dry spell starting on day 60–180,
14-day wet spell, SMAP bias 0.03 m³/m³, NDVI dip 0.08 in development/mid-season); C sweeps
(dry-spell length 7–28 days, SMAP bias 0–0.03, NDVI dip 0.01–0.08), one event per run.
Command: `npm run experiment:discovery` → `experiments/E-001/results.json`.
Baseline: the rules are themselves the baseline for later statistical/ML detectors. No model is compared here.
Metrics (fixed before running): recall = detected events / injected events (Wilson 95% interval),
because missed events are the main failure for a discovery tool; precision = matched detections /
all detections in B; alarms per 100 days in A, because a noisy detector loses farmers' trust;
detection delay (days from event start), median and range. Match: detection window ends between
event start and event end + 14 days.
Added after the first run (not in the original plan): **chance recall**, the same event windows
scored on the seed's clean record, because background alarms can match an event by coincidence;
and two diagnostics (gaps between alarms on clean records; NDVI recall by crop stage).
Run: commit `76019cb` plus uncommitted working tree (`workingTreeDirty: true` in the output). Two runs
gave byte-identical `results.json`. This first run (engine v0.1.0) is kept as
`experiments/E-001/results-v0.1.0.json`.
Result, v0.1.0 (recall with Wilson 95% interval, n = 50 events unless noted):
- A clean (50 × 240 days): moisture-divergence 794 alarms (6.62 / 100 days); rain-departure 449
  (3.74 / 100 days); ndvi-change 0; sensor-offset 0.
- B all events: rain-departure recall 0.94 [0.875, 0.972] (n = 100) vs chance 0.71 [0.615, 0.79],
  precision 0.269, median delay 7 days (0–26). Moisture-divergence recall 0.96 [0.865, 0.989] vs chance
  0.82 [0.692, 0.902], precision 0.137, median delay 2 days (0–23). Ndvi-change recall 0.24
  [0.143, 0.374] vs chance 0, precision 1. Sensor-offset recall 1 [0.929, 1] vs chance 0, precision 1,
  delay 61 days in every run.
- C dry-spell length 7 / 14 / 28 days: rain-departure recall 0.84 / 0.96 / 0.94 vs chance
  0.46 / 0.60 / 0.88; moisture-divergence 0.90 / 0.94 / 0.98 vs chance 0.76 / 0.82 / 0.86.
- C SMAP bias 0 / 0.005 / 0.01 / 0.015 / 0.02 / 0.03 m³/m³: runs with a sensor-offset alarm
  0 / 1 / 10 / 37 / 50 / 50 of 50.
- C NDVI dip 0.01 / 0.02 / 0.03 / 0.05 / 0.08: recall 0 / 0 / 0 / 0.06 / 0.20. By stage at 0.08:
  development 0 of 27, mid-season 10 of 23.
- Clean-record alarm gaps: moisture-divergence median 8 days, 19.2% of gaps ≤ 3 days;
  rain-departure median 18 days, 7.5% ≤ 3 days.
Note (2026-11-14): the generator's default soil model is now `fao56`; E-001's script pins
`soilModel: "demo-v1"`, and a rerun after that change matched `results.json` apart from source hashes.
Rerun after code review, engine v0.2.0 (2026-11-14). Changes: faithful port restored (moisture
confidence +0.1 when 14-day rain < 50% of climatology; NDVI rule needs ≥ 3 composites); missing data
gives "unknown" instead of ending a pattern; input checks (consecutive dates, one field, no duplicate
values, soil moisture 0..1); `baselineKind: "rule"` for fixed baselines. Added metric: **attributable
recall** = events matched by an alarm whose id does not occur in the same seed's clean record (paired).
Run: commit `76019cb` plus uncommitted working tree; `sourceSha256` in `results.json` identifies the
code. Two runs byte-identical.
Result, v0.2.0 (copied from `experiments/E-001/results.json`): all 196 compared values (event and
detection counts, recall, chance recall, alarm rates, delays) and the diagnostics are **identical to
v0.1.0**. Expected: the synthetic records have no missing values, ≥ 3 composites exist before the
development stage, and the confidence bonus does not change counts. So the missing-data paths are
covered only by unit tests, not by this experiment. Attributable recall (B, n = 50 unless noted):
rain-departure 0.89 [0.814, 0.937] (n = 100); moisture-divergence 0.78 [0.648, 0.872]; ndvi-change
0.24 [0.143, 0.374]; sensor-offset 1 [0.929, 1]. C dry-spell length 7 / 14 / 28 days: rain-departure
0.76 / 0.88 / 0.86; moisture-divergence 0.66 / 0.74 / 0.84. Precision is now null for scenarios with
no events of that kind (was 0 in A).
Conclusion (revised after review): The engine runs end to end on the proposed contract and is
reproducible. On this synthetic data: rain-departure detects injected spells clearly above chance;
moisture-divergence alarms on clean records about every 15 days (6.62 / 100 days), so naive recall
(0.96) is barely above chance (0.82), yet 78% of injected dry spells change its alarms. Some of that
is the event moving a background alarm earlier, which also counts as attributable, so attributable
recall is an upper bound on "caused by the event" (→ F-002). The NDVI rule cannot see dips while the
canopy is greening (→ F-001). Sensor-offset behaves as designed but also fires below its threshold
(10/50 at 0.01) because it re-tests the cumulative mean daily from 21 pairs. Recall must be reported
with chance and attributable recall (→ D-003). The synthetic soil model is not FAO-56-consistent
(`lib/demo/syntheticFieldDays.ts` ASSUMPTIONS 3), so alarm rates say nothing about real fields.
Next: a generator with FAO-56-style partitioning (transpiration from the root zone) and some missing
data, then real station data; compare against an expected-trajectory NDVI rule and a stricter moisture rule.

## E-002 — Fair baseline: the same rules on FAO-56-style synthetic soil with station gaps
Date: 2026-11-14 · Status: Done
Question: With a soil model that follows FAO-56's split between evaporation and transpiration, and with
missing station days, how do the four rules (engine v0.2.0) score? Does the moisture-divergence result
depend on the UNVERIFIED share of transpiration taken from the top 0.10 m?
Data: **Synthetic only** (`lib/demo/syntheticFieldDays.ts`, `soilModel: "fao56"`, `lib/demo/soilModel.ts`).
Same field, climate, crop, dates and event placements as E-001 (seeds 1–50, events seed + 1000).
Station gaps in every run: 3% random missing days plus one 5-day outage starting on day 20–215
(seed + 2000). Surface uptake share 0.10 (thickness share), 0.20 and 0.30 (top-weighted).
Setup: per share, scenario A clean, B all events (as E-001), C dry-spell length 7 / 14 / 28 days.
Command: `npm run experiment:e002` → `experiments/E-002/results.json`.
Baseline: the rules themselves (the baseline for E-003+). Compared descriptively with E-001
(`demo-v1` soil, no gaps); E-001 and E-002 differ in two things at once (soil and gaps).
Metrics (fixed before running, per D-003): recall, chance recall and attributable recall with Wilson 95%
intervals; precision in B; alarms per 100 days in A; detection delay. Robustness rule (fixed before
running): a statement about a detector is reported as robust only if it holds at all three shares.
Run: commit `76019cb` plus uncommitted working tree; `sourceSha256` in `results.json`. Two runs
byte-identical. Before the run, the shared harness (`scripts/discoveryHarness.ts`) replaced E-001's
inline code; E-001 rerun afterwards matched its `results.json` apart from source hashes.
Result (copied from `experiments/E-002/results.json`; shares 0.10 / 0.20 / 0.30; n = 50 events unless noted):
- A clean: moisture-divergence 151 / 172 / 217 alarms (1.26 / 1.43 / 1.81 per 100 days; E-001 6.62);
  rain-departure 305 at every share (2.54 per 100 days; E-001 3.74); ndvi-change 0; sensor-offset 0.
- B moisture-divergence: recall 0.56 [0.423, 0.688] / 0.88 [0.762, 0.944] / 0.92 [0.812, 0.968];
  chance 0.08 [0.032, 0.188] / 0.16 [0.083, 0.285] / 0.34 [0.224, 0.478]; attributable 0.56 / 0.86 / 0.88;
  precision 0.193 / 0.276 / 0.26; median delay 5 / 4.5 / 4 days.
- B rain-departure (n = 100, identical at every share): recall 0.78 [0.689, 0.85], chance 0.49
  [0.394, 0.587], attributable 0.69 [0.594, 0.772], precision 0.27, median delay 9.5 days (1–28).
  E-001: 0.94, 0.71, 0.89, 7 days.
- B ndvi-change: recall 0.24 [0.143, 0.374], chance 0 (as E-001). Sensor-offset: recall 1 [0.929, 1],
  chance 0, median delay 64 days (61–73; E-001 61).
- C dry-spell 7 / 14 / 28 days, moisture-divergence recall vs chance: share 0.10 0.42 vs 0.06,
  0.54 vs 0.08, 0.64 vs 0.08; share 0.20 0.80 vs 0.12, 0.86 vs 0.16, 0.90 vs 0.16; share 0.30
  0.88 vs 0.24, 0.92 vs 0.34, 0.92 vs 0.38. Rain-departure (every share): 0.56 vs 0.28, 0.82 vs 0.42, 0.90 vs 0.72.
- Clean-record alarm gaps, moisture-divergence: median 19 / 18 / 19 days (E-001 8).
Conclusion: Robust at all three shares: on FAO-56-style synthetic soil, moisture-divergence alarms 3.7–5×
less often on clean records than in E-001 and detects injected dry spells clearly above chance
(non-overlapping intervals). Not robust: how much it detects (recall 0.56 at share 0.10 vs 0.88–0.92 at
0.20–0.30), which depends on the UNVERIFIED uptake share (→ F-003; F-002 outdated). The rain rule's input
(gauge rain) is identical to E-001 apart from the station gaps, because the gap draws use their own random
stream and rain does not depend on the soil model. So its drop from 0.94 to 0.78 recall is caused by the
gaps: one missing gauge day blocks the 14-day rule for 14 days (→ F-004). NDVI and sensor-offset are
unchanged apart from a longer sensor-offset delay (fewer paired days). Limits: synthetic only; one soil,
climate and crop; uptake share and other soil values UNVERIFIED. Next (E-003): a "normal for this field
and season" detector and an expected-trajectory NDVI rule, scored against these baselines; a rain rule
that tolerates a missing day is a candidate rule change.

## E-003 — Candidate detectors vs the E-002 baselines
Date: 2026-11-14 · Status: Done
Question: Do three candidate detectors (`lib/science/discovery/candidates.ts`) beat the baseline rules
on the E-002 synthetic setup? (1) `field-z`: moisture divergence when the 14-day surface change is unusual
for this field (z-score against its own earlier changes) instead of a fixed 0.05 m³/m³; (2) `imerg-fill`:
rain departure that fills up to 2 missing gauge days with IMERG (targets F-004); (3) `trend-break`: NDVI
alarm when growth between composites slows sharply, even while NDVI still rises (targets F-001).
Data: **Synthetic only**, E-002 setup (`fao56` soil, 3% missing station days + one 5-day outage, same
field, climate, crop, dates and event placements). Tuning: seeds 101–150 at surface uptake share 0.20.
Test: seeds 1–50 (the E-002 seeds) at shares 0.10, 0.20, 0.30. Tuning and test seeds never overlap.
Setup: grids fixed before tuning in `data/discoveryRules.ts` (`CANDIDATE_RULES`): z threshold −1.5 / −2 /
−2.5 (min. 20 earlier changes); NDVI slowdown 0.03 / 0.05 / 0.08; IMERG fill max 2 days (not tuned).
Tuning rule (fixed before running): per candidate, keep grid values whose clean-record alarm rate (A) is
at most the baseline's + 0.25 per 100 days on the tuning seeds; among those, take the highest
attributable recall in scenario B; ties → the stricter value; if none qualifies, take the strictest value
and say so. Test scenarios per share: A clean, B all events, C dry-spell 7 / 14 / 28 days (moisture, rain).
Command: `npm run experiment:e003` → `experiments/E-003/results.json`.
Baseline: the four rules (engine v0.2.0) on the same test seeds, which reproduce E-002.
Metrics (per D-003): recall, chance recall, attributable recall (Wilson 95%), precision, alarms per 100
days on clean records, detection delay. Adoption rule (fixed before running): a candidate replaces its
baseline only if, at all three shares, its attributable recall in B is ≥ the baseline's and its clean
alarm rate is ≤ the baseline's + 0.25 per 100 days, and at one share or more its attributable recall is
≥ the baseline's + 0.05.
Run: commit `76019cb` plus uncommitted working tree; `sourceSha256` in `results.json`. Two runs
byte-identical. Check: the test baseline equals E-002 exactly (all shares, scenarios A, B, C).
Result (copied from `experiments/E-003/results.json`):
- Tuning (seeds 101–150, share 0.20). field-z: clean-alarm limit 1.44 per 100 days (baseline 1.19 + 0.25);
  z −1.5 / −2 / −2.5 → clean 0.99 / 0.54 / 0.33, attributable recall 0.80 / 0.78 / 0.64; all qualify → −1.5
  selected. trend-break: limit 0.25 (baseline 0); slowdown 0.03 / 0.05 / 0.08 → clean 0.42 at every value,
  attributable recall 0 / 0 / 0.02; **none qualified** → strictest value 0.08 used, as the rule says.
- Test (seeds 1–50; shares 0.10 / 0.20 / 0.30; B attributable recall, Wilson 95%; A clean alarms per 100 days):
  moisture-divergence baseline 0.56 / 0.86 / 0.88, clean 1.26 / 1.43 / 1.81, precision 0.193 / 0.276 / 0.26;
  field-z 0.58 [0.442, 0.706] / 0.84 [0.715, 0.917] / 0.90 [0.786, 0.957], clean 1.03 / 1.08 / 1.23,
  precision 0.336 / 0.419 / 0.429. rain-departure (same at every share) baseline 0.69 [0.594, 0.772],
  clean 2.54, recall 0.78, chance 0.49, delay 9.5 days; imerg-fill 0.87 [0.79, 0.922], clean 3.58, recall
  0.92, chance 0.66, delay 7 days. ndvi-change baseline 0.24 [0.143, 0.374], clean 0; trend-break 0
  [0, 0.071], clean 0.42, recall 0.34 = chance 0.34.
- C dry spells 7 / 14 / 28 days, rain attributable recall: baseline 0.46 / 0.70 / 0.78, imerg-fill
  0.74 / 0.86 / 0.84. Moisture attributable recall differs from the baseline by −0.14 to +0.02.
- Adoption rule: **no candidate adopted** (field-z: attributable 0.84 < 0.86 at share 0.20 and no +0.05
  gain; imerg-fill: clean 3.58 > 2.54 + 0.25; trend-break: attributable 0 < 0.24 and clean 0.42 > 0.25).
Conclusion: Under the rule fixed before running, the baselines stay (→ D-004). Two candidates are
real trade-offs the rule did not value: field-z keeps the same detection with 18–32% fewer clean-record
alarms and higher precision (→ F-005); imerg-fill raises rain attributable recall from 0.69 to 0.87
(non-overlapping intervals), and its higher clean-record rate (3.58) is close to the same rule without
gaps (3.74 in E-001, identical rain), so the rule penalised restored coverage rather than new errors
(→ F-006). Trend-break fails: the natural slowdown when the canopy closes fires once per season, and
dips during accelerating green-up do not register as a slowdown (→ F-007; F-001 stays open). The rule
must not be changed after seeing these results to adopt a candidate; a revised rule needs a new
experiment on fresh test seeds. Limits: synthetic only; one soil, climate and crop.

## E-004 — Confirmatory test of two E-003 candidates with a revised adoption rule
Date: 2026-11-14 · Status: Done
Question: On fresh seeds, should `field-z` (moisture) and `imerg-fill` (rain) replace their baselines under
a rule that also credits fewer false alarms and judges gap-filling against gap-free behaviour?
Why a new experiment: E-003's rule ignored false-alarm reductions and penalised restored coverage
(F-005, F-006). This rule was written after seeing E-003, so it is applied only to seeds E-003 never used.
Data: **Synthetic only**, E-002/E-003 setup (`fao56` soil, 3% missing station days + one 5-day outage,
same field, climate, crop and dates). Test seeds **51–100** (not used before); shares 0.10, 0.20, 0.30.
Setup: candidates frozen at E-003's selections, read from `experiments/E-003/results.json` (z ≤ −1.5 with
≥ 20 earlier changes; IMERG fill ≤ 2 days). No tuning. Trend-break dropped (F-007). Scenarios per share: A
clean, B all events, C dry-spell 7 / 14 / 28 days, for baseline and candidates; plus the baseline on the
same records without station gaps (rain reference).
Command: `npm run experiment:e004` → `experiments/E-004/results.json`.
Adoption rule (fixed before running; margins are judgment calls): a candidate replaces its baseline only
if at every share: (1) attributable recall in B ≥ baseline − 0.05, and in each C length ≥ baseline − 0.10;
(2) clean-record alarms (A) ≤ reference + 0.25 per 100 days, where the reference is the baseline on the
same records (field-z) or the baseline on the same records without station gaps (imerg-fill); and
(3) a benefit: attributable recall in B ≥ baseline + 0.05, or clean-record alarms ≤ 0.85 × baseline's.
Metrics (per D-003): recall, chance recall, attributable recall (Wilson 95%), precision, clean alarms per
100 days, delay.
Run: commit `76019cb` plus uncommitted working tree; `sourceSha256` in `results.json`. Two runs
byte-identical. Frozen settings read from E-003: z ≤ −1.5, minHistory 20, IMERG fill ≤ 2 days.
Result (copied from `experiments/E-004/results.json`; seeds 51–100; shares 0.10 / 0.20 / 0.30):
- rain-departure (same at every share): baseline attributable recall 0.70 [0.604, 0.781], clean 2.33 per
  100 days, delay 8 days; imerg-fill 0.84 [0.756, 0.899], clean 3.38, delay 7; reference (baseline, same
  records without gaps) clean 3.58. C 7 / 14 / 28 days attributable: 0.60 / 0.70 / 0.76 → 0.74 / 0.86 / 0.86.
  Every criterion met at every share → **adopted**.
- moisture-divergence: baseline attributable 0.46 / 0.80 / 0.86, clean 1.23 / 1.38 / 1.78; field-z 0.52 /
  0.76 / 0.82, clean 1.15 / 1.25 / 1.34 (6.5% / 9.4% / 24.7% fewer), precision 0.278 / 0.376 / 0.36 vs
  0.174 / 0.248 / 0.25. C 7-day attributable 0.34 / 0.60 / 0.74 → 0.40 / 0.50 / 0.62. Share 0.20 fails the
  benefit test (−0.04 recall, 9.4% fewer alarms < 15%); share 0.30 fails detection (7-day −0.12 < −0.10)
  → **not adopted**.
Conclusion: imerg-fill replicates on fresh seeds (+0.14 attributable recall here, +0.18 in E-003) with
clean-record alarms below the gap-free reference, so it becomes the engine default for rain departure
(→ D-005; F-006). On these 100 events its interval overlaps the baseline's at the edge (0.756 vs 0.781).
field-z again lowers false alarms, by less than in E-003 (6.5–24.7% vs 18–32%), and again misses more
short dry spells at higher uptake shares (7-day −0.12 at 0.30; −0.14 at 0.20 in E-003): a trade-off,
not an improvement (→ F-005 revised). Limits: synthetic only; one soil, climate and crop; synthetic IMERG
is the gauge rain plus noise, likely kinder than real IMERG.
