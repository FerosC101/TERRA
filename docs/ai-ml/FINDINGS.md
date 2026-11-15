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

## F-008 — On real Lipa data, the IMERG rain-departure fallback is outside its band on about half of the days it can decide
Status: Supported
Recorded: 2026-11-15 · Last reviewed: 2026-11-15
Evidence: `npm run discovery:lipa` (2026-11-15) on 731 real days (2024-01-01..2025-12-31) with the IMERG
monthly normal (`data/nasa/lipaImergNormal.ts`): rain departure decided 626 days, 301 outside
0.45–1.7 × normal over 14 days, 325 inside, 105 unknown (first 13 days; no IMERG Final after 2025-09-30);
22 alarm onsets. Hand check 2024-01-14: IMERG 8.475 mm vs expected 49.72 mm, ratio 0.17.
Sources: data in `docs/Data Pipeline/data/DATA-MANIFEST.md` sections 2 and 5.
Scope/limits: One 11 km satellite cell, one site, 21 months. With no gauge there is no ground truth, so it is
unknown whether these are real departures or the gauge thresholds (D-006: UNVERIFIED for IMERG) being too
narrow for daily-variable tropical rain. Do not tune on this record without a held-out period.
History:
- 2026-11-15 — created (first real-data run with the IMERG normal)
- 2026-11-15 — status unchanged; answered by F-019: the fixed limits are too narrow for Lipa's rain (30 % of windows in 23
  years); the rule now uses calibrated per-month limits on POWER (D-013), flagging 18 % of 2024–2025 days

## F-009 — SMAP L3 values over Lipa are all flagged "retrieval not recommended" and come from three different 9 km cells
Status: Supported
Recorded: 2026-11-15 · Last reviewed: 2026-11-15
Evidence: 353 overpass days 2024-01-01..2025-12-31 (`SPL3SMP_E` V006 via the pipeline): bit 0 set on all 353
(flag 9: 285 days, flag 13: 68). Cell used: 14.0106 N 121.2293 E on 322 days (5.66 km from the AOI centroid),
14.0106 N 121.1359 E on 28 (6.04 km), 14.0833 N 121.1359 E on 3 (12.25 km). The pipeline takes the nearest
cell with valid geolocation for the pass, up to 0.25° away (`processors/raster_processor.py`,
`extract_aoi_from_smap_hdf5`). Pass: AM 348, PM 5.
Sources: `docs/Data Pipeline/data/DATA-MANIFEST.md` section 3.
Scope/limits: Lipa only. Why NASA flags the cell (vegetation, topography, water fraction) is not checked.
Matters most for the sensor-offset rule, which compares SMAP with a probe: mixed cells and low-quality
retrievals add error that is not the sensor's.
History:
- 2026-11-15 — created (full two-year SMAP L3 collection)

## F-010 — POWER and IMERG rain at Lipa disagree strongly day to day but much less over a year
Status: Supported
Recorded: 2026-11-15 · Last reviewed: 2026-11-15
Evidence: Pipeline record (`terra_daily_merged.json`): 2024-01-01..15 POWER 48.96 mm vs IMERG 8.49 mm;
full 2024 POWER 2,919.3 mm vs IMERG 2,610.9 mm (−11 %); 2025-01..09 POWER 2,265.4 vs IMERG 2,190.9 mm (−3 %).
Sources: `docs/Data Pipeline/data/DATA-MANIFEST.md` section 2.
Scope/limits: Neither source is ground truth (no gauge). Supports D-006's rule that each source is compared
only with its own normal; does not say which source is closer to the field.
History:
- 2026-11-15 — created (two-year collection)

## F-011 — At Lipa, the SMAP L3 AM overpass happens on the Manila day after the file date
Status: Supported
Recorded: 2026-11-15 · Last reviewed: 2026-11-15
Evidence: `tb_time_seconds` of the cell the pipeline used, all 353 overpass days 2024–2025
(`scripts/fetch-smap-overpass-time.py` → `docs/Data Pipeline/data/external/smap_l3_overpass_time/`):
AM (348 days) acquired 21:44–22:22 UTC on the file date = 05:44–06:22 Asia/Manila the next day;
PM (5 days) 09:35–09:58 UTC = 17:35–17:58 the same day. The pipeline stamps every value at the file date
T00:00:00Z, so without correction 348 values sit one Manila day early.
Sources: variable definition from the SPL3SMP_E file attributes (OPeNDAP DMR, read 2026-11-15).
Scope/limits: Lipa (121.18 E), SPL3SMP_E V006. The shift follows from the ~06:00 local-solar AM orbit at
UTC+8 and should hold for any Philippine site, but it is only measured here. Fixed in the adapter when the
times are supplied (`smapAcquisitionUtc`); the pipeline itself still stores the file date.
History:
- 2026-11-15 — created (overpass times fetched for the full two-year record)

## F-012 — Most real SMAP values at Lipa are above field capacity, so the Living Field Model clips them; Lipa's estimated soil does not remove the gap
Status: Supported
Recorded: 2026-11-15 · Last reviewed: 2026-11-15
Evidence:
- The 353 SMAP L3 values 2024–2025 (`terra_daily_merged.json`): min 0.198, median 0.419, p90 0.539,
  max 0.541 m³/m³; 293 of 353 (83 %) are above `INDICATIVE_SOIL.fc` = 0.32 (`data/soils.ts`). A run of
  `runFieldModel` (`lib/science/fieldModel/state.ts`) on the real record (corn planted 2024-06-01, ASSUMED)
  took 353 SMAP corrections and gave a surface VWC of 0.200–0.320 only: the model holds no water above FC,
  so every reading above 0.32 is clamped to 0.32.
- Lipa's soil from ISRIC SoilGrids 2.0 (model estimate, 20 cells in the AOI; DATA-MANIFEST.md section 10):
  θ at 33 kPa 0.31 (0–5 cm, cells 0.298–0.322), at 10 kPa 0.41, at 1500 kPa 0.20; clay 39–45 %. So FC is
  about the placeholder's; the gap is not a wrong FC. With `LIPA_SOILGRIDS_SOIL` the surface layer still sits
  at FC on 474 of 731 days (same count as with the placeholder).
- SMAP follows the seasons: monthly medians 0.285 (April) to 0.539 (December); 299 of 353 values are above
  the SoilGrids 0–5 cm FC (0.311), 188 above θ at 10 kPa (0.411), 144 above the SoilGrids 95th percentile
  of FC (0.445), and 94 are ≥ 0.50. 70 values lie in 0.53–0.541, close below the maximum, as if bounded.
Sources: ISRIC SoilGrids 2.0 WCS (downloaded 2026-11-15); units from the ISRIC SoilGrids FAQ
(https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html, read 2026-11-15); water retention
reference Turek et al. 2023, doi:10.1016/j.iswcr.2022.08.001 (citation only, paper not opened).
Scope/limits: SMAP > FC can be real for a short time after rain (the FAO-56 bucket drains to FC in one day by
design), and Lipa's wet season is long, but values near 0.54 for weeks in December look more like a wet
retrieval (all flagged "not recommended", F-009; a 9 km cell is not the field) than the topsoil. Which part is
which is unknown without a ground probe. SoilGrids explains 30–70 % of variation (ISRIC) and its 90 %
interval for FC at 0–5 cm is 0.11–0.44. Until resolved, SMAP corrections in the field model carry little
information in the wet season.
History:
- 2026-11-15 — created (smoke run of the Living Field Model on the real Lipa record)
- 2026-11-15 — revised, status unchanged: SoilGrids FC ≈ placeholder FC, so the cause is not the FC value; monthly SMAP pattern added (DATA-MANIFEST.md section 10)

## F-013 — With Lipa's estimated soil, the root zone holds about half the water of the placeholder soil, and dry-season corn shows water stress
Status: Unverified
Recorded: 2026-11-15 · Last reviewed: 2026-11-15
Evidence: `LIPA_SOILGRIDS_SOIL` (SoilGrids 0–100 cm weighted FC 0.321, WP 0.238) gives TAW 83 mm vs 170 mm for
`INDICATIVE_SOIL` (FC 0.32, WP 0.15). Daily FAO-56 balance (`runDailyWaterBalance`) on the real Lipa weather
(IMERG rain, POWER on 92 days; POWER ET0), corn (`data/crops.ts`), 115-day season:
planted 2024-06-01: 0 stress days (placeholder) vs 6 (SoilGrids); planted 2024-12-01: 0 vs 34.
Sources: SoilGrids values as in F-012. One-off comparison run (script not kept), 2026-11-15.
Scope/limits: model output only. The SoilGrids WP is a model estimate with a wide interval (0–5 cm: 0.05–0.34);
crop, planting dates and rooting depth are assumed; REW kept from the placeholder. Not checked against any
observed stress or yield. It shows the irrigation advice for Lipa is sensitive to the soil's WP.
History:
- 2026-11-15 — created

## F-014 — MODIS NDVI over Lipa is mostly cloud-blocked in the wet season and follows a dry/wet seasonal cycle
Status: Supported
Recorded: 2026-11-15 · Last reviewed: 2026-11-15
Evidence: 98 MOD13Q1/MYD13Q1 v061 composites over the AOI (42 pixels each; DATA-MANIFEST.md section 6,
`scripts/process-modis-ndvi-lipa.py` → `modis_ndvi_lipa.csv`). With good pixels only, 18 composites have ≥ 50 %
usable pixels; adding cloud-free marginal pixels, 32. Composites starting June–October: 1 usable in 2024, 3 in 2025;
in many of them all 42 pixels are rated cloudy. Usable values range 0.40–0.84: ~0.75–0.84 in November–January,
falling to ~0.40–0.45 by late April–May, rising again in the wet season, in both 2024 and 2025. The field mean of
all non-fill pixels matches AppEEARS's own statistics on all 98 composites (max difference 0.00005).
Sources: AppEEARS layer metadata (`/api/product`) and bundle lookup tables, read 2026-11-15.
Scope/limits: 250 m pixels (5.4 ha) likely mix crops with other cover; NDVI never reaches bare-soil values, so
planting and harvest cannot be read from it with confidence. The 50 % share and the marginal-pixel rule are
heuristics. Consequence: MODIS cannot follow a wet-season crop at Lipa; a finer, cloud-tolerant source
(e.g. Sentinel-2 at 10 m, or radar) would be needed, not yet evaluated.
History:
- 2026-11-15 — created

## F-015 — The NDVI-change alarm on real Lipa data depends entirely on the assumed planting date and compares composites across long cloud gaps
Status: Supported
Recorded: 2026-11-15 · Last reviewed: 2026-11-15
Evidence: `runDiscovery` with only the NDVI detector on the real record + 28 MODIS composites, corn, planting
date tried on the 1st of every month 2024-01..2025-12 (one-off script, not kept): 0 to 4 alarms per date;
0 for every May–August planting (clouds hide that season) and for all from 2025-05 on. Several alarms compare
composites far apart, e.g. 2024-08-19 → 2024-11-23 (96 days), because the detector takes the previous
available composite however old it is.
Sources: none beyond the code and files named.
Scope/limits: the alarms that do fire fall in the dry-season decline (February–April) or across cloud gaps,
which looks like the seasonal cycle of F-014, not crop stress, but nothing on the ground confirms either.
Fix applied (D-009): composites more than 32 days apart are no longer compared ("unknown"). After it,
the same 24 trial dates give 16 alarms instead of 20; the remaining ones still depend on the assumed date.
History:
- 2026-11-15 — created
- 2026-11-15 — status unchanged; gap limit applied (D-009), counts after the fix added
- 2026-11-15 — with the farmer-reported calendar (`data/cropCalendar.ts`) instead of trial dates: 1 alarm, 2024-12-09 (0.836 → 0.798), matched by no reported event
- 2026-11-15 — that run is WITHDRAWN: Plot A lies 3.3 km outside the AOI whose NDVI was used, so the calendar did not apply. The AOI run is back to no real calendar; Plot A gets its own HLS NDVI (DATA-MANIFEST.md section 11)

## F-016 — SMAP L4 at Lipa stays within the soil's estimated range, unlike SMAP L3, which reads ~0.13 m³/m³ wetter
Status: Supported
Recorded: 2026-11-15 · Last reviewed: 2026-11-15
Evidence: SPL4SMGP v008 daily means (DATA-MANIFEST.md section 7; `scripts/process-smap-l4-lipa.py`), 730 Manila days:
surface 0.072–0.433 (median 0.315), root zone 0.157–0.421 (median 0.309). SoilGrids FC at 0–5 cm is 0.311 (F-012).
On the 353 days with an SMAP L3 value (placed by acquisition time, F-011), L3 − L4 surface = +0.129 on average
(median +0.134). Monthly means show the dry season: root zone 0.289 (Jan 2024) → 0.166 (Apr 2024); surface in
March 0.107 (2024) vs 0.240 (2025).
Sources: NSIDC SPL4SMGP v8 landing page ("3-hourly time average", brightness temperatures "assimilated into a land
surface model"); AppEEARS layer metadata (0–5 cm, 0–100 cm). Read 2026-11-15.
Scope/limits: L4 is a model (data assimilation) for one 9 km cell, not a measurement of the field; which of L3 or
L4 is closer to the real topsoil is unknown without a ground sensor. The window-centre timing is inferred.
Suggests L4, not L3, as the satellite soil-moisture input for the Living Field Model (not done; needs a decision).
History:
- 2026-11-15 — created

## F-017 — The farmer-reported drought of February–March 2024 appears in three model signals
Status: Supported
Recorded: 2026-11-15 · Last reviewed: 2026-11-15
Evidence: Mang Edgar (Plot A, DATA-MANIFEST.md section 9) reported heat and drought in February–March 2024, with
weakened corn and low yield. On the real Lipa record:
1. Daily water balance (`npm run water:lipa`, farmer calendar, Plot A SoilGrids soil): 2024 dry season 48 stress
   days (Ks < 1), 2024-01-27..2024-03-14, max depletion 72 of TAW 76 mm. Other seasons: 7, 12 and 3 stress days.
   (With the AOI soil: 47 days, 2024-01-28..2024-03-14.)
2. Rain departure (IMERG vs IMERG normal): "too dry" on every decided day from 2024-01-14 through March, and on
   23 of 30 April days.
3. SMAP L4 (F-016): March surface mean 0.107 in 2024 vs 0.240 in 2025; root zone down to 0.166 in April 2024.
Sources: the farmer interview (as confirmed by the ML engineer) and the files and commands named.
Scope/limits: Plot A lies 3.3 km west of the AOI whose weather record is used; the rain, SMAP and POWER cells are
much larger than that, so the signals apply to both. One reported event, one plot, and a season that is dry every year, so agreement is partly expected;
the three signals share inputs (rain) and are not independent measurements. The farmer did not report on the
2025 dry season, where the rain rule says "too dry" on 20 days of January–March 2025; whether that was a false
alarm is unknown. This is the first comparison with any ground report; it is not a validation.
History:
- 2026-11-15 — created
- 2026-11-15 — Plot A located (outside the AOI); water balance rerun with Plot A's soil: 48 stress days

## F-018 — HLS 30 m sees Plot A on only 13 of 227 overpass days, and its few values follow the farmer's calendar loosely
Status: Supported
Recorded: 2026-11-15 · Last reviewed: 2026-11-15
Evidence: HLS v2.0 over Plot A (36 pixels of 30 m inside the drawn outline), 2023-12-01..2025-12-31
(`scripts/process-hls-ndvi-plot-a.py` → `hls_ndvi_plot_a.csv`; DATA-MANIFEST.md section 11): 227 overpass days
(142 Sentinel-2, 85 Landsat), 36 with an NDVI file, 13 with ≥ 50 % of plot pixels clear and valid. On every day
without an NDVI file the Fmask shows no clear plot pixel (AppEEARS drops all-fill outputs, bundle README). Plot means
match AppEEARS's own VI statistics exactly on all 36 files. Values: 0.54 (2023-12-28, crop day 13), 0.37 (2024-01-27,
day 43), 0.42 (2024-03-06), 0.33 (2024-04-23, after harvest), 0.53 (2025-01-04, day 50), 0.30–0.48 (April 2025,
fallow), 0.51 (2025-08-04, day 60). On 2025-04-26 Landsat gave 0.388 and Sentinel-2 0.299 (25–31 pixels each).
Sources: AppEEARS layer metadata and bundle lookup/README, read 2026-11-15.
Scope/limits: the outline is drawn, not GPS; 13 values in two years, none in the 2024 wet season. Higher values during
reported crops and lower in fallow fit the calendar, but mid-season values (~0.5) are not checked against any field
observation. The 0.18 drop from 2023-12-28 to 2024-01-27 coincides with the start of modelled water stress (F-017) but
the NDVI rule cannot judge it: the record starts 2024-01-01 and the rule needs 3 values. `npm run discovery:plot-a`:
NDVI rule 0 alarms (5 "no", 726 "unknown"). Same-day sensor differences (0.09) exceed the rule's 0.03 threshold.
History:
- 2026-11-15 — created

## F-019 — The guessed rain limits flag 30 % of 14-day windows in 23 years of Lipa rain; per-month limits from the record flag 10 %
Status: Supported
Recorded: 2026-11-15 · Last reviewed: 2026-11-15
Evidence: NASA POWER daily rain 2001–2023 at the AOI point (8,400 days, no gaps; `scripts/fetch-power-history.py`,
`scripts/calibrate-rain-lipa.py` → `rain_calibration_lipa.json`). 14-day ratio to the monthly normal: the fixed 0.45 / 1.7
limits flag 30.4 % of windows (dry 19.2 %, wet 11.3 %), most in the dry months (up to 47.8 % in April). Per-month 5th/95th
percentile limits flag 10.1 %. Held out (fit 2001–2018, test 2019–2023): 18.1 % (dry 5.2 %, wet 12.9 %) vs 33.7 % for the
fixed limits. On 2024–2025 (E-005): 18.1 % of days vs 48.1 % for the old IMERG rule; both dated storms matched.
Sources: the files named; events in `data/lipaEvents.ts` (sources opened 2026-11-15).
Scope/limits: POWER is a ~50 km model product, not a gauge; the later years were wetter, so the wet limit is exceeded more
often than designed. Three events are too few for accuracy rates.
History:
- 2026-11-15 — created

## F-020 — The 2024 El Niño drought is invisible to a 14-day rain window but clear over a season; a 90-day check catches it in mid-April
Status: Supported
Recorded: 2026-11-15 · Last reviewed: 2026-11-15
Evidence: POWER rain February–April 2024: 104.7 mm, the 2nd driest of 24 years 2001–2024 (2001–2023 median 265.3 mm; driest 2019,
68.9 mm); January–March 2024 ranks 4th driest. Every 14-day window of Feb–Mar 2024 stays above its calibrated dry limit
(dry months are naturally variable). A 90-day ratio below its 10th percentile (by month, 2001–2023) flags the drought on
2024-04-15 (window 2024-01-17..04-15), about two weeks after the farmer-reported window (Feb–Mar). IMERG shows Feb–Mar 2024
far drier than POWER (8.0 and 4.8 mm vs 35.7 and 51.2 mm).
Sources: the POWER files and calibration output; farmer report; Philstar 2024-03-19 (El Niño damage incl. Calabarzon).
Scope/limits: one drought; POWER may smooth local dry spells (IMERG would likely flag earlier but has no daily history here).
History:
- 2026-11-15 — created

## F-021 — An average-climate rotation model can never show a dry season; real years show Lipa's dry-season corn running short in 10 of 24 years
Status: Supported
Recorded: 2026-11-15 · Last reviewed: 2026-11-15
Evidence: `evaluateRotation` on Lipa's POWER monthly climatology gives zero deficit for all three default rotations with
either soil (150 or 83 mm/m). `rotationRisk` on POWER ten-day rain 2001–2025 (start years 2001–2024): the Dec–May corn season
of Rotation A ran short in 10 of 24 years (driest 20 %: ≥ 66 mm); worst 2018–19 (108 mm), 2013–14 (89), 2009–10 (87); the
farmer's drought season Dec 2023–May 2024 ranks 6th (61 mm) and Dec 2024–May 2025 has none. Mungbean in that season never ran
short; peanut ran short in 11 of 24. The three worst years are three of the four driest Feb–Apr periods in F-020's ranking.
Sources: the files named; `lib/science/waterBalance.test.ts`.
Scope/limits: monthly ET0 and temperature; 10-day bucket; no yield model. Agreement with the farmer is one season.
History:
- 2026-11-15 — created
