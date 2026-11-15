# Person 3 (AI/ML) — task checklist

Deliverable: **a working discovery and field-analysis engine.**
Last updated: 2026-11-15 (third pass). Tick items as they are done and keep the date current.

Legend: ✅ done · 🟡 partly done · ⬜ to do · 🔒 blocked on data being collected
(see [prompts/real-data-collection.md](prompts/real-data-collection.md))

---

## 1. Discovery Engine and anomaly detection
*Built and running in the app on demo data; real Lipa data runs rain departure and NDVI change.*

- [x] ✅ Data contract D-002 + mock JSON (`types/discovery-contract.ts`, `docs/contracts/`)
- [x] ✅ Four detectors in `lib/science/discovery/engine.ts`, tested
- [x] ✅ Synthetic generator with labelled events and FAO-56 soil model (`lib/demo/`)
- [x] ✅ Experiments E-001 to E-004 and the scoring method (D-003)
- [x] ✅ Rain gauge gap-filling with IMERG (D-005)
- [x] ✅ Rain departure without a station, IMERG vs its own normal (D-006)
- [ ] ⬜ Team sign-off on D-002 and D-003 (PR #4 review)
- [ ] ⬜ Moisture divergence without a station: SMAP L4 fallback, re-test its thresholds (D-006). Unblocked: SMAP L4 is downloaded
- [ ] ⬜ NDVI blind spot for slow stress (F-001)
- [x] ✅ Discovery cards: `lib/science/discovery/cards.ts` builds `Discovery` from `AnomalyRecord`s; evidence keeps the data's provenance; `detectedOn` is the real detection date
- [x] ✅ Connect to the app: `services/discoveryService.discoveriesFor` runs the engine on the demo record (`lib/adapters/demoSeries.ts`); `lib/science/detect.ts` removed. Shows the latest alarm per detector (demo records raise 22–25 onsets in 240 days, F-002). Detail charts mark the detection date; no markers on the Overview trend chart yet
- [x] 🟡 Investigation flow: `lib/science/discovery/investigation.ts` (status + five stages). new → resolved on a logged reading or check answer; no "investigating" state yet (it needs multi-step checks, section 4)
- [ ] ⬜ Run on two years of real Lipa data; record as E-005 (alarm rate, plausibility). Rain departure can run now (F-008: 22 onsets in 731 days). NDVI change now runs on MODIS (20 days decided, 0 alarms; depends on the assumed planting date, F-015, D-009). Moisture divergence waits for SMAP L4 daily means and the fallback (data downloaded), sensor offset for a ground sensor
- [ ] ⬜ *Later (ML):* calibrate confidence from farmer-confirmed outcomes (needs real labels)

## 2. Living Field Model
*First version built (D-007) and shown on the page, on demo data.*

- [x] ✅ Daily state defined (D-007): soil water per layer, crop stage, Kc, ETc, Ks, refill need, rain + source, latest NDVI, each layer's source and age
- [x] ✅ Built in `lib/science/fieldModel/state.ts` as a daily update on `FieldDay` input (demo, synthetic or real)
- [x] ✅ Readings (station 10/40 cm, follow-ups, SMAP when no 10 cm reading) nudge the state by an uncertainty-weighted average; settings in `data/fieldModelRules.ts` (heuristics)
- [x] ✅ Uncertainty (1 sd) per soil layer, growing without readings
- [x] 🟡 Served by `services/fieldModelService.ts`; the page's water figures, crop stage and Kc now come from the model. Soil, vegetation and climate panels still read the demo series directly
- [ ] ⬜ Run on real Lipa data and compare with SMAP L4 root zone (unblocked: SMAP L4 downloaded)

## 3. Soil-water balance and crop water requirement
*Daily FAO-56 model built and checked; runs on real Lipa weather with an assumed crop.*

- [x] 🟡 Rotation bucket model (`lib/science/waterBalance.ts`): 10-day steps on monthly climatology, not validated, not daily
- [x] ✅ Eq. 74 (Kr) and 84 (Ks) checked against the FAO-56 equation images (2026-11-15); one case hand-checked (`cropWater.test.ts`)
- [x] ✅ Daily model moved to `lib/science/water/soilWater.ts` (`lib/demo/soilModel.ts` re-exports it)
- [x] ✅ Crop water requirement: `lib/science/water/cropWater.ts`, daily ETc = Kc × ET0 (Kc indicative)
- [x] ✅ Outputs: root-zone depletion, Ks, stressed, refill need past RAW
- [ ] 🟡 Lipa soil properties: SoilGrids estimate in `data/soils.ts` `LIPA_SOILGRIDS_SOIL` (FC 0.321, WP 0.238, model estimate; used by `water:lipa` and `export:graphs` since 2026-11-15, not by the app; F-012, F-013). Measured FC/WP and rooting depth still unknown
- [x] 🟡 `npm run water:lipa` runs it on the real 2024–2025 weather (IMERG rain, POWER on the 92 days IMERG is missing; POWER ET0). Crop calendar ASSUMED; no check against SMAP L4 yet

## 4. Next Best Observation
*Simple rule built and shown on every card.*

- [x] ✅ Catalogue in `data/observationChecks.ts`: possible causes per discovery kind and 10 field checks, each with cost, waiting time, the causes it tells apart and the answers a person can give (costs are rough estimates)
- [x] ✅ Simple rule (`lib/science/nextObservation.ts`): rank checks by open causes told apart per minute of effort (waiting counted at 30 min/day)
- [ ] ⬜ Then: use the Living Field Model's uncertainty to rank checks
- [x] ✅ The top check fills each card's "What to investigate next"; the card's possible causes come from the same catalogue
- [x] ✅ Answers feed back: moisture readings correct the Living Field Model on their date; check answers resolve the discovery and appear under confirmed findings
- [x] ✅ Smoke tests (ranking, feedback via cards)
- [ ] ⬜ Rule out answered causes and suggest the next check, instead of resolving on the first answer

## 5. Connect field readings with satellite-derived observations
*NASA data connected (two years); sensor adapter ready, no sensor data.*

- [x] ✅ Pipeline studied; traps found (31/20-granule caps, SMAP overpass time not stored)
- [x] ✅ Adapter: pipeline → FieldDay (`lib/adapters/nasaPipeline.ts`), tested
- [x] ✅ `npm run discovery:lipa` runs the engine on the real record
- [x] ✅ Data collection prompt (`docs/ai-ml/prompts/real-data-collection.md`)
- [ ] 🟡 Collect 2024–2025 data (data session, see `docs/Data Pipeline/data/DATA-MANIFEST.md`):
  - [x] IMERG + POWER + SMAP L3: 731 days (IMERG Final ends 2025-09-30; SMAP all flagged, F-009)
  - [x] IMERG monthly normal, 2001–2023 (`data/nasa/lipaImergNormal.ts`)
  - [x] SMAP L3 overpass time: 353 / 353 days (`scripts/fetch-smap-overpass-time.py`, F-011)
  - [x] MODIS NDVI: 98 composites, 32 with a field value (`scripts/process-modis-ndvi-lipa.py`, F-014)
  - [x] SMAP L4 surface + root zone (`SPL4SMGP` v008, AppEEARS point at the AOI centroid): 731 / 731 days, 8 values a day (3-hourly), no fill values. Daily means: 730 Manila days (`scripts/process-smap-l4-lipa.py`, F-016)
  - [x] ISMN check: no network in the Philippines
  - [x] Planting dates and crops: farmer-reported, Plot A, 4 corn seasons (`data/cropCalendar.ts`, D-010, F-017)
  - [x] Plot A outline (drawn, 2.69 ha, outside the AOI) and soil; [ ] Plot A HLS NDVI and SMAP L4 (requested 2026-11-15)
- [ ] 🟡 Extend the adapter: MODIS NDVI done (`lib/adapters/modisNdvi.ts`, in `discovery:lipa`); SMAP L4 daily means done, adapter waits for a contract source id (F-016) (Lipa's IMERG normal is in use by `npm run discovery:lipa`)
- [x] ✅ Field-sensor adapter `lib/adapters/telemetry.ts`: pod frames → FieldDay (daily means, rain total, provenance measurement). Open questions for the hardware owner: pod clock (firmware uses a fixed start + uptime), probe depths (firmware 10/30/40 cm vs spec 10/30/60 cm; the moisture rule needs 40 cm), and the server's own mapping (copies gauge rain into the IMERG field; non-FAO-56 ET0)
- [ ] 🔒 Sensor vs satellite comparison (sensor-offset alarm, SMAP vs probe): needs a real ground sensor
- [x] ✅ SMAP timing: measured acquisition times for all 353 days; the AM pass lands on the Manila day after the file date (F-011). The adapter places SMAP at its real time when given `smapAcquisitionUtc`; `npm run discovery:lipa` does
- [ ] 🟡 POWER timing: the daily value is a local-solar-time day (API default, response header), but the adapter still writes its `period` as the UTC day (documented in the adapter's ASSUMPTIONS)
- [x] ✅ `npm run export:graphs` places SMAP on its measured day too (shared loader `scripts/smapTimes.ts`, used by both scripts)
- [ ] ⬜ *Later (first ML task):* correct 9 km satellite values to field level, using sensor/satellite pairs

---

## Deliverable check

It's done when this chain works **in the app, on real Lipa data**:

> real data → Living Field Model (soil water, crop water use) → alarms → discovery cards
> → next best check → the farmer's answer updates everything

- [x] 🟡 The full chain runs in the app on **demo** data (cards, Living Field Model, next check, answers feeding back); real Lipa data still to be switched in
- [x] ✅ Graph notebook: `notebooks/terra-graphs.ipynb` reads CSVs from `npm run export:graphs` (real Lipa rain, SMAP, model water balance) and the synthetic sample
- [ ] ⬜ PR merged and reviewed by the team
- [x] ✅ Build report (2026-11-15): Claude Doc "TERRA AI/ML — Build Report" and `docs/reports/TERRA-AI-ML-Build-Report.docx`, with the chain diagram and the four notebook graphs. Written before MODIS NDVI and the SoilGrids soil landed, so it does not cover them
- [ ] ⬜ Old file names in the 14 Nov Word report (`docs/reports/TERRA-Discovery-Engine-Progress-Report.docx`)
- [x] 🟡 NASA pitch deck: 7-slide content drafted in chat (technical and story versions, one real alarm followed through: 14 Jan 2024, rain at 17 % of normal). Not saved to a file; slides not built
- [x] ✅ Experiment "dirty" flag ignores the experiments' own output files (`scripts/discoveryHarness.ts`)

## Suggested order

1. Switch a page to real Lipa data: run the engine and the Living Field Model on the pipeline record (rain + SMAP L3 + ET0), labelled real
2. E-005: rain departure on two years of real data (alarm rate, plausibility)
3. SMAP L4 is downloaded: daily means + adapter, the SMAP L4 moisture fallback, then E-005 for all detectors (MODIS NDVI is in)
4. Next Best Observation: rule out answered causes; use the field model's uncertainty
5. Team review (PR); update the build report for MODIS NDVI and the SoilGrids soil; build the pitch slides
