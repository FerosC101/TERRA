# TERRA data manifest — Lipa Cropland

What real data exists for the Lipa AOI, where it came from, and what is wrong with it.
Every number below was produced by code that was run on the files listed, or read from a page
that was opened (linked). Anything else says **unknown** or **pending**.

| | |
|---|---|
| AOI | Lipa Cropland, Lipa City, Batangas, Philippines. `Lipa Cropland.geojson`, 133.72 ha (1.3372 km²) |
| IDs | pipeline `location_id = lipa_cropland_001`; app field id `lipa-cropland`; time zone Asia/Manila (UTC+8) |
| AOI centroid | 13.983842 N, 121.184648 E (pipeline `load_and_validate_aoi`) |
| AOI bbox | 121.176299, 13.976575, 121.193002, 13.990451 (min lon, min lat, max lon, max lat) |
| Target period | 2024-01-01 .. 2025-12-31 (731 days) |
| Collected by | the ML/AI engineer, with Claude Code, 2026-11-15. Machine clock UTC+8 |
| Code state | commit `e5fa04a` with uncommitted changes (scripts below are new, not yet committed) |

## Summary

| # | Dataset | Status | Days / rows in target period |
|---|---|---|---|
| 1 | NASA POWER daily (rain, Tmax, ET0, …) | collected | 731 / 731 |
| 2 | GPM IMERG Final daily `GPM_3IMERGDF` V07 | collected, **ends 2025-09-30** | 639 / 731 |
| 3 | SMAP L3 `SPL3SMP_E` V006 | collected | 730 files; 353 days with a value |
| 4 | SMAP L3 overpass time | collected | 353 / 353 overpass days |
| 5 | IMERG monthly normal `GPM_3IMERGM` V07, 2001–2023 | collected | 276 / 276 months |
| 6 | MODIS NDVI `MOD13Q1`/`MYD13Q1` v061 | collected | 98 composites; 32 with a field value (clouds) |
| 7 | SMAP L4 `SPL4SMGP` v008 | collected (**model**) | 730 / 731 daily means |
| 8 | Ground soil-moisture sensor | **not available**: no ISMN network in the Philippines | – |
| 9 | Crop and planting dates 2024–2025 | collected (**farmer-reported**, Plot A) | 4 corn seasons |
| 10 | Soil water retention + texture, ISRIC SoilGrids 2.0 | collected (**model estimate**) | 20 cells × 65 layers (static) |
| 11 | Plot A outline + its own NDVI (HLS), SMAP L4 and soil | collected | 2.69 ha, outside the AOI; 13 usable HLS days; 730 SMAP L4 days |

Pipeline code was **not changed**. Only `docs/Data Pipeline/.gitignore` gained three lines (2026-11-15, for the
pipeline owner to review): `data/external/*/raw/`, `data/external/*/files/` (raw server downloads stay local;
the derived CSVs and request/task records are committed) and `data/run_logs/`. New, separate scripts (they import pipeline functions, never edit them):
`scripts/fetch-imerg-monthly-normal.py`, `scripts/fetch-smap-overpass-time.py`, `scripts/appeears-lipa.py`,
`scripts/fetch-soilgrids-lipa.py`.

App-side code that reads this data (for review; all in the TERRA app, outside the pipeline):
- `data/nasa/lipaImergNormal.ts` — the IMERG normal (section 5) for the engine; a test checks it against the CSV.
- `lib/adapters/nasaPipeline.ts` — new option `smapAcquisitionUtc` places SMAP values at the measured time (section 4).
- `scripts/run-discovery-lipa.ts` — passes the IMERG normal and the SMAP times to the engine.
- `lib/adapters/nasaSnapshot.ts` + `scripts/export-nasa-snapshot.ts` — write the app's "Retrieved NASA record"
  for any period (tested to reproduce the bundled 2024-01-01..15 file). Not switched on in the app.
- `data/soils.ts` `LIPA_SOILGRIDS_SOIL` — Lipa soil from section 10; a test checks it against the CSV. Used by the Lipa scripts, not by the app.

## How the pipeline was run (datasets 1–3)

```powershell
cd "docs/Data Pipeline"; .\.venv\Scripts\Activate.ps1; $env:PYTHONIOENCODING = "utf-8"
# 48 runs: for each month 2024-01..2025-12, days 1–15 and 16–end
python main.py --start-date <YYYY-MM-01> --end-date <YYYY-MM-15>
python main.py --start-date <YYYY-MM-16> --end-date <YYYY-MM-last>
```

- **Why half-months:** `collectors/smap.py:151` keeps the first 20 granules per run and
  `collectors/gpm.py:117` the first 31. SMAP L3 has one granule per day, so a 31-day run would drop
  SMAP days 21–31. Half-months (≤ 16 days) stay under both caps. No code change.
- Python 3.13.14 (venv), packages from `requirements.txt`. Earthdata token in `.env` (git-ignored).
- One test run first: 2024-02-01 (3 records upserted, credentials accepted).
- Logs: `data/run_logs/run_<start>.log` (48 files, local only, git-ignored), written 2026-11-15 02:00:32 .. 03:02:56 (UTC+8).
  All 48 exited with code 0.
- Outputs: `data/processed/` (per-run JSON per source, `terra.db`, `terra_observations.json/.parquet`,
  `terra_daily_merged.json`). Raw subsets: `data/raw/` (git-ignored).
- **Reproducibility check:** the 15 days the pipeline owner collected earlier (2024-01-01..15,
  commit `f1c2dfa`) were downloaded again. All 225 values (15 days × 15 variables), product names and
  quality statuses are identical.

---

## 1. NASA POWER daily

| | |
|---|---|
| Product | NASA POWER Daily API `v2.10.3`, community `AG`, "Source Native Resolution Daily Data" |
| Underlying sources (response header) | MERRA2, SYN1DEG, POWER |
| Provider / tool | NASA Langley Research Center, `https://power.larc.nasa.gov/api/temporal/daily/point` via the pipeline (`collectors/nasa_power.py`) |
| Point requested | 121.185 E, 13.984 N (response geometry; elevation 162.3 m given by POWER) |
| Date range | 2024-01-01 .. 2025-12-31 |
| Files | `data/raw/nasa_power/*.json` (49 files incl. the earlier 1-day test), processed `data/processed/nasa_power_*.json` |
| Rows | 731 daily records, 731 with a value for rain, Tmax and ET0 |
| Parameters & units (response) | T2M, T2M_MAX, T2M_MIN `C`; PRECTOTCORR `mm/day`; RH2M `%`; ALLSKY_SFC_SW_DWN `MJ/m^2/day`; WS2M `m/s`; GWETTOP, GWETROOT `1` (0–1 wetness index, not m³/m³) |
| Derived | `et0_mm_day`: FAO-56 Penman-Monteith computed by the pipeline from POWER → **model output** |
| Fill value | −999.0 (response header). None found in the target period for rain, Tmax, ET0 |
| Time standard | **LST (local solar time)**: response header `"time_standard": "LST"`; POWER docs: "Daily API defaults to providing LST" ([link](https://power.larc.nasa.gov/docs/services/api/temporal/daily/)). The pipeline does not set `time-standard`. |
| Quality | pipeline status `VALID` 728 days, `VALID_WITH_WARNINGS` 3 days (rain ≥ 100 mm kept, flagged extreme: 2024-05-26 108.05, 2024-10-24 158.35, 2025-11-09 101.05 mm) |
| Ranges seen | rain 0.0–158.35 mm/day; Tmax 25.04–37.5 °C; ET0 0.5642–6.4709 mm/day |
| Grid cell | 0.5° × 0.625° per `config/datasets.yaml` (not re-checked against POWER docs). ≈ 3,758 km² at 14° N: the AOI is 0.036 % of it |
| Provenance label | **model** (reanalysis with satellite assimilation) |
| Downloaded | 2026-11-15 |

## 2. GPM IMERG Final daily

| | |
|---|---|
| Product | `GPM_3IMERGDF` V07 (files V07B), Final run. DOI not re-checked for the daily product |
| Provider / tool | NASA GES DISC. CMR search + OPeNDAP DAP4 subset (5×5 cells) via the pipeline (`collectors/gpm.py`) |
| Date range | 2024-01-01 .. **2025-09-30** |
| Files | `data/raw/gpm_imerg/*.subset.dap.nc4` (639), processed `data/processed/gpm_imerg_*.json` |
| Rows | 639 days with a value. **2025-10-01 .. 2025-12-31 (92 days): no data** |
| Variables | `precipitation` → `precipitation_imerg_mm` (mm/day); `precipitation_cnt` (count); `randomError` (mm/day) |
| Extraction | `idw_2x2_coarse_grid`: inverse-distance mean of the 4 cells around the centroid. Nearest cell centre 13.95 N, 121.15 E (5.30 km from the centroid) |
| Fill value | −9999.9 (file attribute, seen in the monthly file DMR; the daily uses the same convention per `datasets.yaml`) |
| Quality | `precipitation_cnt` = 48 (all half-hours valid) on all 639 days. Status `VALID` 636, `VALID_WITH_WARNINGS` 3 (≥ 100 mm: 2024-05-25 112.2, 2024-09-01 110.1, 2024-10-24 119.5 mm) |
| Grid cell | 0.1° × 0.1° ≈ 120 km² at 14° N: the AOI is 1.1 % of one cell |
| Day boundary | file names `S000000-E235959` (UTC day). GES DISC page describes "the data day" without explicit boundaries |
| Provenance label | **satellite estimate** |
| Downloaded | 2026-11-15 |

Problems found:
- **Collection ends 2025-09-30.** CMR collection `C2723754864-GES_DISC` has `time_end` 2025-09-30, and
  so does the monthly `GPM_3IMERGM`. Google Earth Engine's catalogue: "No 'permanent' products are
  available beyond 2025/09/30 due to the provider's planned transition to version 8"
  ([link](https://developers.google.com/earth-engine/datasets/catalog/NASA_GPM_L3_IMERG_V07)).
  Decision (ML owner, 2026-11-15, `docs/ai-ml/DECISIONS.md` D-008): keep **Final only**; Oct–Dec 2025 stays empty rather than mixing in
  IMERG Late (`GPM_3IMERGDL`, not gauge-calibrated), which does continue. Revisit when V08 Final appears.
- **`randomError` is an uncertainty, not rain, and its size is unexplained.** GES DISC defines the daily
  value as `{ SUM(Perr_i² ) / Ncnt_err × 24 }^0.5` from the half-hourly errors (mm/hr)
  ([link](https://data.nasa.gov/dataset/gpm-imerg-final-precipitation-l3-1-day-0-1-degree-x-0-1-degree-v07-gpm-3imergdf-at-ges-dis-13ed8)).
  The pipeline's note calls it "accumulated_precipitation", which is wrong. Values here run from 2.76
  to **20,823.5 mm/day**, which is not physical. Not used by the engine. Pipeline owner to review.
- **POWER and IMERG disagree day to day** (2024-01-01..15: POWER 48.96 mm, IMERG 8.49 mm), but much less
  over long periods: 2024 total POWER 2,919.3 mm vs IMERG 2,610.9 mm; 2025-01..09 POWER 2,265.4 vs IMERG
  2,190.9 mm. Not "fixed"; both kept.

## 3. SMAP L3 enhanced (topsoil)

| | |
|---|---|
| Product | `SPL3SMP_E` V006 (files `R19240_001` / `_002`), L3 radiometer, 9 km EASE-Grid 2.0 |
| Provider / tool | NASA NSIDC DAAC. CMR + OPeNDAP DAP4 subset via the pipeline (`collectors/smap.py`) |
| Date range | 2024-01-01 .. 2025-12-31 |
| Files | `data/raw/smap/*.subset.dap.nc4` (730), processed `data/processed/smap_*.json` |
| Rows | 730 daily files. **2025-03-18 has no granule at NSIDC** (CMR lists 03-17 and 03-19). 353 days with a value; 377 days no overpass (`null`, status `INCOMPLETE`) |
| Variable | `soil_moisture` (AM) or `soil_moisture_pm` → `soil_moisture_surface_m3_m3` (m³/m³, ~0–5 cm) |
| Pass used | AM 348 days, PM 5 days (the pipeline reads AM first, PM when AM misses the AOI) |
| Fill value | −9999 (pipeline treats as missing) |
| Quality layer | `retrieval_qual_flag` (bitmask) |
| Ranges seen | 0.197678–0.540641 m³/m³ |
| Grid cell | 9 km EASE-2 ≈ 81 km²: the AOI is 1.6 % of one cell |
| Provenance label | **satellite estimate** |
| Downloaded | 2026-11-15 |

Problems found:
- **Every value is flagged "retrieval not recommended" by NASA.** On all 353 days, bit 0 is set:
  flag 9 (not recommended + surface/vegetation/topography advisory) 285 days, flag 13 (adds bit 2,
  retrieval unsuccessful, although a value is stored) 68 days. Kept, but low quality.
- **Three different cells are mixed.** The pipeline takes the nearest cell with valid geolocation for
  that pass, up to 0.25° away:

  | Cell centre | Days | Distance from AOI centroid |
  |---|---|---|
  | 14.010609 N, 121.229256 E (contains the centroid) | 322 | 5.66 km |
  | 14.010609 N, 121.135895 E (west neighbour; also overlaps the AOI) | 28 | 6.04 km |
  | 14.083339 N, 121.135895 E (does not cover the AOI) | 3 | 12.25 km |

  For a station-vs-SMAP comparison, use only the first cell, or label the others.
- Record timestamp is the file date at 00:00Z, not the overpass time. The AM value really belongs to the
  next Manila day: see section 4.

## 4. SMAP L3 overpass time

| | |
|---|---|
| Product / variable | `SPL3SMP_E` V006, `tb_time_seconds` (AM) / `tb_time_seconds_pm` (PM): "arithmetic average of the acquisition time of all of the brightness temperature footprints with a center that falls within the EASE grid cell in seconds since noon on January 1, 2000 UTC" (file attribute, read from the DMR) |
| Provider / tool | NASA NSIDC DAAC, OPeNDAP DAP4 subset, `scripts/fetch-smap-overpass-time.py` |
| Request | same OPeNDAP rows/cols window as the pipeline; fields `latitude`, `longitude`, `tb_time_seconds` of the pass group the pipeline used; value taken at the cell nearest the pipeline's recorded `grid_center` (matched exactly on all 353 days). Record: `data/external/smap_l3_overpass_time/request.json` |
| Files | `data/external/smap_l3_overpass_time/raw/*.subset.dap.nc4` (353), `smap_l3_overpass_time_lipa.csv` (353 rows); 7.2 MB in total |
| Downloaded | 2026-11-15 |

Result (all 353 overpass days have a time):

| Pass | Days | Acquired (UTC) | Acquired (Asia/Manila) | Manila date vs file date |
|---|---|---|---|---|
| AM | 348 | 21:44–22:22 on the file date | 05:44–06:22 | **next day** |
| PM | 5 | 09:35–09:58 | 17:35–17:58 | same day |

- **The pipeline's timestamp (file date T00:00:00Z) puts 348 of 353 SMAP values one Manila day too early.**
  The adapter (`lib/adapters/nasaPipeline.ts`, option `smapAcquisitionUtc`) now places each value at its
  measured time; `scripts/run-discovery-lipa.ts` passes the CSV. After the shift, no Manila day has two SMAP
  values, and the last one still falls on 2025-12-31.
- Pipeline owner: storing `tb_time_seconds` in the record would remove the need for this side file.

## 5. IMERG monthly normal (2001–2023)

| | |
|---|---|
| Product | `GPM_3IMERGM` V07 (files V07B), Final monthly, DOI `10.5067/GPM/IMERG/3B-MONTH/07` (file metadata) |
| Provider / tool | NASA GES DISC. CMR + OPeNDAP DAP4 subset, `scripts/fetch-imerg-monthly-normal.py` |
| Request | CMR `short_name=GPM_3IMERGM`, AOI bbox, temporal 2001-01-01..2023-12-31; OPeNDAP `/Grid/precipitation`, `/Grid/gaugeRelativeWeighting`, same lat/lon window as the daily pipeline. Full record: `data/external/imerg_monthly/request.json` |
| Files | `data/external/imerg_monthly/raw/*.subset.dap.nc4` (276 files, 9.9 MB), `imerg_monthly_lipa_2001_2023.csv` (276 rows), `imerg_monthly_normal_lipa_2001_2023.csv` (12 rows) |
| Units | file: `precipitation` **mm/hr** (monthly mean rate). Converted: mm/month = rate × 24 × days in month |
| Fill value | −9999.9 |
| Quality | all 4 cells valid in all 276 months. `gaugeRelativeWeighting` kept in the CSV |
| Extraction | pipeline's own `extract_aoi_from_netcdf` (2×2 IDW), grid centre 13.95 N, 121.15 E — **same cells as the daily IMERG** |
| Hand check | 2001-01: 0.07800044 mm/hr × 24 × 31 = 58.03 mm; CSV 58.032 |
| Downloaded | 2026-11-15 |

Normal (mean of 23 years, mm/month), also in `data/nasa/lipaImergNormal.ts` (rounded to 0.1 mm; a test checks it against the CSV):

| Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 110.1 | 77.9 | 65.8 | 68.7 | 173.2 | 257.3 | 353.9 | 329.8 | 313.4 | 306.4 | 251.3 | 241.2 |

The app also has a POWER normal (`data/fields.ts`, `LIPA_POWER`, 2001–2025). Per D-006 each source is
compared only with its own normal.

## 6. MODIS NDVI (MOD13Q1 / MYD13Q1 v061)

| | |
|---|---|
| Product | `MOD13Q1.061` (Terra) and `MYD13Q1.061` (Aqua), 16-day composites, 250 m (231.66 m sinusoidal) |
| Provider / tool | NASA LP DAAC via AppEEARS **area** request (`scripts/appeears-lipa.py`), task `65331f49-5697-40c1-8bc2-6a1c7ec0d21c`, submitted 2026-11-15 01:22 UTC, done 01:38 UTC, downloaded 02:09 UTC |
| Request | polygon `Lipa Cropland.geojson`, 2023-12-01 .. 2025-12-31, GeoTIFF, native projection; layers NDVI, VI_Quality, pixel_reliability, composite_day_of_the_year (`request.json`, `task.json`) |
| Files | `data/external/modis_ndvi/files/` (407 files, 2.0 MB, each checked against the bundle's sha256; git-ignored), derived `modis_ndvi_lipa.csv` + `processing.json` (`scripts/process-modis-ndvi-lipa.py`) |
| Layer facts | AppEEARS `/api/product` (read 2026-11-15): NDVI scale 0.0001, fill −3000, valid −0.2..1.0; pixel_reliability 0..3; meanings from the bundle lookups: 0 "Good data, use with confidence", 1 "Marginal data, Useful, but look at other QA information", 3 "Cloudy data" |
| AOI pixels | 42 per composite (41 in the first), as returned by AppEEARS; pixel counts and all-pixel means match the bundle's `*-Statistics.csv` on all 98 composites (max difference 0.00005) |
| Rows | 98 composites (49 per sensor), 2023-11-17 .. 2025-12-27 starts; 92 end inside 2024–2025 |
| Usable pixel (heuristic, UNVERIFIED) | reliability 0, or reliability 1 with VI_Quality "Adjacent cloud", "Mixed Clouds" and "Possible shadow" all No |
| Field value | mean of usable pixels when ≥ 50 % of the AOI pixels are usable (heuristic); else blank with counts. **32 of 98** composites have a value (18 with good pixels only) |
| Gaps | clouds: almost no usable composite starting June–October (2024: one; 2025: three) |
| Period | nominal 16-day window from the start day, as Manila days; placed on the last day (D-002) |
| Provenance label | **satellite estimate** |

What it shows (F-014): NDVI 0.40–0.84; high (~0.75–0.84) November–January, falling to ~0.40–0.45 by late
April–May, rising again in the wet season, in both years. It never reaches bare-soil values, so the 5.4 ha pixels
likely mix crops with other cover. No planting or harvest can be read from it with confidence.

## 7. SMAP L4 (SPL4SMGP v008) surface and root-zone soil moisture

| | |
|---|---|
| Product | `SPL4SMGP.008`, 3-hourly **time-averaged** fields, 9 km EASE-Grid 2.0. SMAP brightness temperatures assimilated into a land surface model ([NSIDC landing page](https://nsidc.org/data/spl4smgp/versions/8), read 2026-11-15). Citation in the bundle metadata: Reichle et al. (2025), doi:10.5067/T5RUATAQREF8 |
| Provider / tool | NASA NSIDC DAAC via AppEEARS **point** request at the AOI centroid (13.983842, 121.184648), task `27dbb65f-b091-4590-b4d1-1fe884c86130`, done 2026-11-15 03:16 UTC, downloaded 03:17 UTC (sha256-checked) |
| Layers | `sm_surface` "Top layer soil moisture (0-5 cm)", `sm_rootzone` "Root zone soil moisture (0-100 cm)", m³/m³, fill −9999, valid 0–0.9 (AppEEARS `/api/product`) |
| Files | `data/external/smap_l4/files/` (5 files: results CSV, README, metadata, granule list, request; git-ignored), derived `smap_l4_daily_lipa.csv` + `processing.json` (`scripts/process-smap-l4-lipa.py`) |
| Rows | 5,848 = 731 days × 8, stamped 01:30 … 22:30 **UTC** (the CSV writes "UTC"), one EASE-Grid cell (line 615, sample 3226), no fill values. 3-hourly ranges: surface 0.068–0.458, root zone 0.157–0.423 |
| Daily mean | Manila day of each HH:30 UTC stamp (taken as the window centre, inferred from the :30 stamps, UNVERIFIED); mean only with all 8 values. **730 days** 2024-01-02..2025-12-31; 2024-01-01 has 5 values (blank). Hand check 2024-06-15 surface: 0.2431 = CSV |
| Daily ranges | surface 0.072–0.433 (median 0.315), root zone 0.157–0.421 (median 0.309) |
| Provenance label | **model** (data assimilation), not a measurement |

Compared with SMAP L3 on the same 353 Manila days: L3 is wetter by 0.129 m³/m³ on average (median 0.134).
L4 stays within the SoilGrids range (FC 0–5 cm 0.311), unlike L3 (F-012). Root zone fell from 0.289 (Jan 2024
mean) to 0.166 (Apr 2024); March surface mean 0.107 in 2024 vs 0.240 in 2025 (F-016).
In the engine as source `smap_l4` (D-011; `lib/adapters/smapL4.ts`, depthCm 5 = surface, 100 = root zone):
`npm run discovery:lipa` merges 1,460 values (730 days × 2). No detector reads them yet; the
moisture-divergence fallback must be tested first (D-006).
Note: AppEEARS labels `sm_profile` with unit "W/m^2", which looks like a catalogue error (not used).

## 8. Ground soil-moisture sensor — not available

- **ISMN:** the network list ([link](https://ismn.earth/en/networks/), opened 2026-11-15) has **no network in
  the Philippines**. Nearest in the region: MySMNet (Malaysia, 7 stations), VDS (Myanmar, 4 stations).
- TERRA station: not deployed. Manual probe readings: none.
- Result: the sensor-offset alarm cannot run. Needs ≥ 21 days of ~10 cm readings paired with SMAP overpasses.

## 9. Crop and planting dates (farmer-reported, Plot A)

Source: interview with Mang Edgar, corn farmer of **Plot A** ("NEXonaut interview.pdf", Part A), confirmed as real
answers by the ML engineer on 2026-11-15. The PDF's own provenance table says "Simulated respondent / Actual
interview conducted: No"; the ML engineer states that label is wrong. Interview date and interviewer: not stated.

| Season | Crop | Planted (reported) | Harvested (reported) | Used as |
|---|---|---|---|---|
| 2024 dry | corn | Mid-December 2023 | Mid-March 2024 | 2023-12-15 .. 2024-03-15 |
| 2024 wet | corn | Early June 2024 | Mid-September 2024 | 2024-06-05 .. 2024-09-15 |
| 2025 dry | corn | Mid-November 2024 | Late February 2025 | 2024-11-15 .. 2025-02-25 |
| 2025 wet | corn | Early June 2025 | Mid-September 2025 | 2025-06-05 .. 2025-09-15 |

Convention: early/mid/late = 5th/15th/25th. Also reported: rainfed, no regular irrigation; planting sometimes
staggered by days to a week; drought/heat February–March 2024 (corn weakened, low yield). Not used: yields
(labelled "illustrative" in the PDF), Part B (a farmer's LGU perspective, not an office record).
Limits: Plot A only. Plot A lies **outside** the Lipa Cropland AOI (section 11), so this calendar applies to Plot A,
not to the AOI. In code: `data/cropCalendar.ts`, `data/lipaPlotA.ts`.

---

## 10. Soil water retention and texture (ISRIC SoilGrids 2.0)

| | |
|---|---|
| Product | ISRIC SoilGrids 2.0, 250 m. Layers `wv0010`, `wv0033`, `wv1500` (volumetric water at 10, 33, 1500 kPa), `clay`, `sand`, `silt`, `bdod`; depths 0–5, 5–15, 15–30, 30–60, 60–100 cm; `mean` (+ `Q0.05`, `Q0.95` for water) |
| Reference | Turek M.E., Poggio L., Batjes N.H., et al. 2023, *Global mapping of volumetric water retention at 100, 330 and 15000 cm suction using the WoSIS database*, Int. Soil Water Conserv. Res. 11(2) 225–239, [doi:10.1016/j.iswcr.2022.08.001](https://doi.org/10.1016/j.iswcr.2022.08.001) (citation read from the [Earth Engine catalog page](https://developers.google.com/earth-engine/datasets/catalog/ISRIC_SoilGrids250m_v2_0), 2026-11-15; paper not opened) |
| Units | mapped `wv*` 10⁻³ cm³/cm³, texture g/kg, `bdod` cg/cm³ ([ISRIC SoilGrids FAQ](https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html), read 2026-11-15). Converted: m³/m³, %, g/cm³ |
| Provider / tool | ISRIC WCS `https://maps.isric.org` (the REST point API timed out on 2026-11-15), `scripts/fetch-soilgrids-lipa.py`. Server reprojection to EPSG:4326 (cell 0.002308°), MapServer default resampling |
| Files | `data/external/soilgrids/raw/*.tif` (65, unchanged), `soilgrids_lipa_cells.csv`, `soilgrids_lipa_summary.csv`, `request.json` (URLs, commit) |
| Aggregation | mean of the 20 cells whose centre is inside the AOI (20 × 6.25 ha ≈ the AOI's 133.7 ha) |
| Licence | CC-BY-4.0 |
| Provenance label | **model estimate** (quantile random forest). ISRIC: "variation explained by the models is between 30% and 70%" |

AOI means (mean of 20 cells; spread across cells in brackets for 0–5 cm):

| Depth | θ 10 kPa | θ 33 kPa (FC) | θ 1500 kPa (WP) | clay % | sand % | silt % | bulk density g/cm³ |
|---|---|---|---|---|---|---|---|
| 0–5 cm | 0.411 (0.399–0.423) | 0.311 (0.298–0.322) | 0.199 (0.193–0.204) | 38.7 | 31.8 | 29.5 | 1.32 |
| 5–15 cm | 0.411 | 0.306 | 0.202 | 40.4 | 31.3 | 28.3 | 1.35 |
| 15–30 cm | 0.409 | 0.313 | 0.213 | 42.2 | 29.7 | 28.0 | 1.38 |
| 30–60 cm | 0.404 | 0.318 | 0.254 | 44.1 | 29.2 | 26.7 | 1.40 |
| 60–100 cm | 0.392 | 0.330 | 0.249 | 44.7 | 29.0 | 26.3 | 1.41 |

90 % prediction interval (Q0.05–Q0.95) at 0–5 cm: FC 0.108–0.445, WP 0.050–0.341 — wide.

Cross-check: the [PhilRice Lipa series profile](https://dbmp.philrice.gov.ph/soils/soilseries/lipa) (opened 2026-11-15)
describes silty clay at 9–26 cm and clay at 26–52 cm, no measured water properties and no profile location.
SoilGrids texture (clay rising 39 → 45 % with depth) is consistent with it. No measured FC/WP for Lipa was found.

Used as `LIPA_SOILGRIDS_SOIL` in `data/soils.ts` (0–100 cm weighted FC 0.321, WP 0.238; TEW 20.9 mm). Used by
`npm run water:lipa` and `npm run export:graphs` (2026-11-15), not by the app. Effect and comparison with SMAP: F-012, F-013.

---

## 11. Plot A (Mang Edgar's corn plot)

| | |
|---|---|
| Outline | `Lipa Plot A.geojson`: corners SW 13.9831/121.1531, SE 13.9831/121.1547, NE 13.9845/121.1547, NW 13.9845/121.1531, **drawn on a map, not GPS** (ML engineer, 2026-11-15). Barangay Pusil, Lipa City |
| Size | 173 m E–W × 156 m N–S ≈ **2.69 ha** (spherical Earth, computed) |
| Position | centre 13.9838 N, 121.1539 E: **outside the Lipa Cropland AOI**, 3.32 km west of its centroid, 2.33 km beyond its west edge |
| Why its own NDVI | Plot A is smaller than one MODIS pixel (0.75 × 0.67 of 231.66 m), and the downloaded MODIS tiles do not cover it. NDVI requested from HLS v2.0 (30 m, about 6 × 5 pixels): `HLSS30_VI.020` and `HLSL30_VI.020` NDVI, with `Fmask` from `HLSS30.020` / `HLSL30.020` because the VI products list no QA layer (AppEEARS `/api/product`, read 2026-11-15). Task `cf90fc16-4423-4abf-9d68-2ff855aa78fd`, 2023-12-01..2025-12-31, submitted 2026-11-15 (`data/external/hls_plot_a/request.json`) |
| SMAP L4 | point at the plot centre, task `047b2cd2-11df-4aa2-b66c-49ce639b5566`, done 2026-11-15T05:53 UTC, downloaded 2026-11-15T05:54:20Z (sha256-checked); `smap_l4_daily_lipa_plot_a.csv`: 730 complete Manila days. EASE-Grid cell line 615, sample 3225 (the AOI centroid is in sample 3226, the next cell east). Plot A − AOI on the same days: surface +0.0096 m³/m³ on average (largest 0.0435), root zone +0.0096 (largest 0.028) |
| Soil | SoilGrids, one resampled cell at the plot centre (`data/external/soilgrids/lipa_plot_a/`): FC 0.311, WP 0.235 (0–100 cm), clay 36–39 %; `LIPA_PLOT_A_SOILGRIDS_SOIL` |
| Weather | no pipeline record for Plot A; scripts borrow the `lipa_cropland_001` record. POWER (0.5° × 0.625°) and SMAP L3 (9 km) cells are far larger than the 3.3 km offset; IMERG's 2×2 IDW uses the same four 0.1° cells with different weights. Close, not identical (UNVERIFIED) |
| In code | `data/lipaPlotA.ts` (not in `data/fields.ts`: the app does not show Plot A; adding it is a UI decision). `npm run water:lipa` runs Plot A |

---

## Readiness for the Discovery Engine (checked 2026-11-15)

`npm run discovery:lipa` on the 731 days: the adapter (`lib/adapters/nasaPipeline.ts`) accepted every
record (no unit, dataset or status errors). Values per source match the counts above.

| Alarm | Status | Why |
|---|---|---|
| Rain departure | **partly ready** | Runs on IMERG vs the IMERG normal (D-006 fallback): 626 days decided, 105 unknown (first 13 days + Oct–Dec 2025). 22 alarm onsets, confidence 0.4. Thresholds (0.45 / 1.7 of normal over 14 days) were set for a gauge and are UNVERIFIED for IMERG: 301 of 626 decided days are outside them. No real gauge to check against. |
| Moisture divergence | **not ready** | SMAP L4 is in the engine as `smap_l4` (section 7, D-011). Needs the L4 fallback built and tested (D-006: not switched on until tested). |
| NDVI change | **not meaningful yet** | 28 MODIS composites reach the engine for the Lipa Cropland AOI, but its crop calendar is unknown (the farmer's calendar is for Plot A, 3.3 km outside it; section 11). For Plot A, HLS 30 m NDVI is requested (section 11). Composites > 32 days apart are not compared (D-009). |
| Sensor offset | **not possible yet** | No ground sensor (section 8); SMAP L3 values are all flagged "not recommended". |
