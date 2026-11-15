# Prompt: collect real Lipa data for the Discovery Engine

Copy everything below the line into a **new** Claude Code session opened in the TERRA repo.
It is written so that session needs nothing from the session that wrote it.

---

## Who I am and what I need

I am the ML/AI engineer on TERRA (Next.js + TypeScript agricultural discovery app). The teammate who
built the NASA data pipeline (`docs/Data Pipeline/`, Python) is unavailable, so **I** will collect the
data myself. I am new to NASA data. **Teach me step by step in simple words**: explain what each
step does and why before I run it, let me run the commands myself, and check the result with me
after each step. Do not do everything silently.

Read first: `CLAUDE.md`, `docs/ai-ml/CONTEXT.md`, `docs/ai-ml/DECISIONS.md` (D-002 data contract),
`docs/Data Pipeline/README.md`, `docs/Data Pipeline/config/farm_config.yaml`,
`docs/Data Pipeline/config/datasets.yaml`, `types/discovery-contract.ts`.

## Rules (from CLAUDE.md; follow them strictly)

- **Never fabricate.** Every number must come from a file we actually downloaded or a page we
  actually opened. If something is unknown, write "unknown".
- **Record provenance** for every dataset: product short name + version, provider, URL or tool used,
  date range, spatial unit (pixel/cell size and where it sits relative to the AOI), units, fill values,
  quality flags, and the date we downloaded it.
- **Never commit secrets.** The Earthdata token goes only in `docs/Data Pipeline/.env` (git-ignored).
- **Don't commit or push**; I commit.
- Don't rewrite the pipeline. If a small code change is unavoidable, explain it to me first, keep it
  minimal, and list it in the manifest so the pipeline owner can review it.

## The area (AOI)

Lipa Cropland, Lipa City, Batangas, Philippines. Polygon: `docs/Data Pipeline/Lipa Cropland.geojson`
(133.7 ha; pipeline `location_id` = `lipa_cropland_001`; app field id = `lipa-cropland`;
time zone `Asia/Manila`, UTC+8).

## Target period

**2024-01-01 to 2025-12-31** (two full years: two wet and two dry seasons). If something makes this
impossible for one dataset, tell me why and propose the closest workable range.

## What the Discovery Engine needs (the 4 alarms)

| Alarm | What it needs | Real source to get |
|---|---|---|
| **Rain departure** | Daily rain, plus the *normal* rain for each month | (a) GPM IMERG Final daily, `GPM_3IMERGDF` V07, for the target period, via the existing pipeline. (b) NASA POWER daily `PRECTOTCORR` for the same period, via the pipeline. (c) A **monthly normal** from the **same source** as the daily rain (like with like): IMERG monthly (`GPM_3IMERGM` V07) for at least 2001–2023 over the AOI's cell, e.g. via NASA Giovanni as an area-averaged CSV. Note: `data/fields.ts` already has a POWER monthly normal (`LIPA_POWER`, 2001–2025); keep it, but we also need the IMERG one. |
| **Moisture divergence** | Topsoil moisture **and** deeper soil moisture, daily | No field sensors exist yet. Closest real substitute: **SMAP L4 `SPL4SMGP`** (v008 or current), variables `sm_surface` (0–5 cm) and `sm_rootzone` (0–100 cm), 3-hourly → we need **daily means**. This is a **model-assimilation** product, not a measurement; label it so. The pipeline only discovers L4 and would download full global files, so check whether **NASA AppEEARS** (point sample at the AOI centroid 13.983842 N, 121.184648 E) offers SPL4SMGP. If it does, use it (small CSV). If not, explain the options to me before downloading anything big. |
| **NDVI change** | Crop greenness every 16 days, plus **real planting dates** | **MODIS `MOD13Q1` v061** (Terra, 250 m, 16-day NDVI) and, if easy, **`MYD13Q1` v061** (Aqua, offset 8 days). Use AppEEARS **area** request with the AOI GeoJSON. Keep the NDVI layer, the pixel reliability / VI Quality layer, and the composite day-of-year layer. Note the scale factor (NDVI stored × 10000). Also needed and **not** from NASA: the crop and planting date of each season on this field in 2024–2025. Ask me; if nobody knows, record "unknown". |
| **Sensor offset** | A field soil-moisture sensor (about 10 cm deep) **and** SMAP, on at least 21 matching days | **Cannot be done with satellite data alone.** It needs ground readings: the TERRA station (not deployed yet), or manual probe readings, or a public in-situ station near Lipa. Check the International Soil Moisture Network (ISMN) for any Philippine station near Lipa and tell me honestly what exists. If nothing exists, record "not available yet". |

Also extend **SMAP L3 `SPL3SMP_E`** (topsoil, daily overpasses) to the full target period. It is
the satellite side of the sensor-offset alarm and a check on SMAP L4.

## Known traps in the pipeline (verified by reading the code)

1. **Silent truncation on long runs.** `collectors/gpm.py` keeps at most **31** granules
   (`max_granules=31`), `collectors/smap.py` at most **20** (`max_granules=20`), and
   `pipelines/nasa_pipeline.py` doesn't override either. A one-year run would quietly
   process only 31 or 20 days. The workaround, with no code change: **run month by month**
   (`python main.py --start-date 2024-01-01 --end-date 2024-01-31`, and so on).
   `storage/repository.py` rebuilds `terra_daily_merged.json` from all records in `terra.db`,
   so the months add up. After all the runs, count the days per source and confirm none are missing.
2. **IMERG Final lags ~3.5 months.** That's fine for 2024–2025.
3. **SMAP overpass time is not stored.** The record timestamp is the file date at `T00:00:00Z`,
   but the value comes from the AM pass (~06:00 local solar time). If it's easy, note the
   actual overpass time (SMAP L3 has a `tb_time_utc` field). Otherwise, just record that it is unknown.
4. **IMERG `randomError` looks suspicious:** 632 mm/day on a day with 5.4 mm of rain (2024-01-08).
   Check NASA's documentation for what that variable means and record what you find.
   The engine doesn't use it.
5. **POWER and IMERG rain disagree.** Over 2024-01-01..15, POWER summed to about 49 mm and IMERG to
   about 8.5 mm. Don't "fix" this, just make sure both are collected for the whole period.
6. **POWER daily time standard** (UTC day or local solar day): check the POWER documentation and
   record the answer. Either way, the value lands on the same local date in Manila.

## Steps (teach me each one)

1. Explain the plan in simple words. Then check the setup with me: Python 3.11+, `pip install -r
   requirements.txt` in a virtual environment, the Earthdata account, the token in `.env`, and the
   NASA apps approved (README section 7), including AppEEARS.
2. Run POWER + IMERG + SMAP L3 month by month for 2024-01 .. 2025-12. Count the records per source.
3. Get the IMERG monthly normal (2001–2023) for the AOI cell.
4. Get MODIS NDVI (and SMAP L4, if AppEEARS has it) through AppEEARS.
   Explain each form field to me as I fill it in.
5. Check ISMN for ground stations near Lipa.
6. Ask me for the planting dates and crops for 2024–2025.

## Where to save results

- The pipeline outputs stay where the pipeline writes them (`docs/Data Pipeline/data/processed/`).
- Downloads that don't come from the pipeline (AppEEARS CSVs, Giovanni CSV) go in
  `docs/Data Pipeline/data/external/<dataset>/`, unchanged, plus the request parameters
  (AppEEARS saves a request JSON, so keep it).
- Write **`docs/Data Pipeline/data/DATA-MANIFEST.md`** with one section per dataset: product + version,
  provider, tool/URL, request parameters, date range, files, row count, units, fill values, quality
  layers, pixel size vs the 133.7 ha AOI, download date, and problems found.
- At the end, show me a table: for each of the 4 alarms, **ready / partly ready / not possible yet**,
  and why.

## Done when

- For 2024-01-01..2025-12-31, there is daily IMERG + POWER (rain, Tmax, ET0) and SMAP L3 data,
  with each source's day count checked.
- There is an IMERG monthly normal.
- MODIS NDVI composites are there, with their quality layer.
- SMAP L4 daily surface + root-zone data is there, or there is a written reason why not plus the options.
- The ISMN result is recorded.
- The planting dates are recorded (or "unknown").
- `DATA-MANIFEST.md` is filled in. Every number in it comes from a real file.
