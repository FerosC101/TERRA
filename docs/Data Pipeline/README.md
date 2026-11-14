# TERRA NASA Earth Observation Data Pipeline

Automated, AOI-scoped geospatial data pipeline that retrieves, cleans, validates, harmonizes, and serves NASA Earth observation and agroclimatology datasets for **TERRA** (`Lipa_Cropland_AOI`, Lipa City, Batangas, Philippines).

> **HTML Documentation Portal:** Open [`docs/index.html`](docs/index.html) in any browser for an interactive AOI polygon map, live verified data explorer, date-range disk size estimator, and FastAPI endpoint tester.

---

## 1. Project Overview & Live Verification Summary

The **TERRA NASA Data Pipeline** converts heterogeneous NASA meteorological and satellite products into a single standardized, quality-checked schema consumed by TERRA's downstream modules — without requiring teammates to parse raw NetCDF4, HDF5, EASE-Grid 2.0, or NASA CMR APIs.

**Verified live over `Lipa_Cropland_AOI` (`2024-01-01` .. `2024-01-03` + `2024-01-01` .. `2024-01-15`):**
- **NASA POWER (`NASA_POWER_AG_DAILY`, `v2.10.3`)**: Retrieved live and cached cleanly (`VALID`, 15 daily records for `2024-01-01..15`).
- **GPM IMERG (`GPM_3IMERGDF` V07B Final)**: Discovered via NASA CMR, downloaded as NetCDF4 granules, and subsetted over Lipa (`VALID`, 3 daily records for `2024-01-01..03`).
- **SMAP (`SPL3SMP_E` v006 Daily 9 km)**: Discovered via NASA CMR, downloaded as HDF5 granules, and subsetted over Lipa (`2024-01-01`: `INCOMPLETE` due to genuine orbital swath gap `no_overpass_covering_aoi`; `2024-01-02`: `0.408539 m3/m3`; `2024-01-03`: `0.47474 m3/m3`, both `VALID_WITH_WARNINGS` preserving `retrieval_qual_flag=9`).
- **TERRA FastAPI Service**: All 10 REST routes verified HTTP `200` against the live SQLite store.

---

## 2. TERRA Integration Context

Downstream TERRA modules consume standardized observations via FastAPI (`http://localhost:8000`) or directly from `data/processed/`:
- **Living Field Model**: Consumes daily temperature (`degC`), humidity (`%`), solar radiation (`MJ/m2/day`), bias-corrected precipitation (`mm/day`), and soil moisture (`m3/m3` / wetness index `0-1`) via `/observations`, `/observations/precipitation`, `/observations/soil-moisture`, and `/observations/temperature`.
- **Discovery Engine**: Inspects `/aoi`, `/datasets`, and `/metadata` to enforce spatial scale awareness (`1.3372 km2` AOI vs. 9–55 km pixels) and quality flags.
- **Rotation Lab**: Queries multi-day / seasonal historical baselines via `/observations?start_date=...&end_date=...` (and will integrate Phase 6 NEX-GDDP-CMIP6 climate projections).

---

## 3. System Architecture

```text
Lipa Cropland.geojson + config/farm_config.yaml + config/datasets.yaml
        │
        ▼
[1] AOI Validation & Coverage Discovery
    (processors/spatial_processor.py, discovery/coverage_checker.py, NASA CMR)
        │
        ▼
[2] AOI-Scoped Collectors
    ├── collectors/nasa_power.py   (REST JSON -> raw JSON cache)
    ├── collectors/gpm.py          (CMR + Earthdata NetCDF4/HDF5)
    └── collectors/smap.py         (CMR + Earthdata HDF5 9 km EASE-Grid 2.0)
        │
        ▼
[3] Preprocessing & Unit Standardization
    (processors/raster_processor.py, temporal_processor.py, unit_converter.py)
        │
        ▼
[4] Quality Control & Schema Validation
    (validators/quality_checks.py, validators/schema_validation.py)
        │
        ▼
[5] 3-Tier Storage Repository
    data/raw/ -> data/processed/{terra.db, *.json, *.parquet} -> data/metadata/
        │
        ▼
[6] TERRA FastAPI Service (api/routes.py)
```

### Repository Structure

```text
Space APP Challenge Data Pipeline/
├── api/
│   ├── __init__.py
│   └── routes.py                 # FastAPI service (10 REST endpoints)
├── collectors/
│   ├── __init__.py
│   ├── earthdata_client.py       # Retry/backoff HTTP, CMR pagination, URS auth redirects
│   ├── nasa_power.py             # Priority 1: NASA POWER Agroclimatology collector
│   ├── gpm.py                    # Priority 2: GPM IMERG Final/Late/Early collector
│   └── smap.py                   # Priority 3: SMAP L3 (SPL3SMP_E) & L4 (SPL4SMGP) collector
├── config/
│   ├── farm_config.yaml          # Authoritative Lipa Cropland AOI & pipeline settings
│   └── datasets.yaml             # Dataset metadata, units, bounds, & Phase 6 catalog
├── discovery/
│   ├── __init__.py
│   ├── dataset_registry.py       # YAML catalog loader
│   └── coverage_checker.py       # Spatial/temporal bounds + live NASA CMR granule checker
├── docs/
│   └── index.html                # Interactive HTML documentation & API portal
├── pipelines/
│   ├── __init__.py
│   └── nasa_pipeline.py          # End-to-end orchestrator (discover -> download -> process -> QC -> store)
├── processors/
│   ├── __init__.py
│   ├── spatial_processor.py      # GeoJSON Polygon validation, centroid, bbox, metric area
│   ├── temporal_processor.py     # UTC ISO-8601 normalization & date-range validation
│   ├── unit_converter.py         # Physical conversions; keeps mm/day != mm/hr
│   └── raster_processor.py       # NetCDF4/HDF5 1D & 2D EASE-Grid subsetting + 0.25 deg overpass guard
├── storage/
│   ├── __init__.py
│   ├── cache.py                  # SHA-256 request index & raw file cache
│   └── repository.py             # SQLite + Parquet + JSON unified repository
├── validators/
│   ├── __init__.py
│   ├── schema_validation.py      # Pydantic v2 standardized schemas
│   └── quality_checks.py         # Physical bounds, extreme weather retention, bitmasks, deduplication
├── tests/
│   └── test_pipeline.py          # 8 automated tests (unit + FastAPI integration)
├── data/                         # Runtime data layers (gitignored)
├── Lipa Cropland.geojson         # Authoritative 16-vertex cropland polygon
├── main.py                       # CLI entrypoint (`run`, `discover`, `download`, `process`, `validate`, `serve`)
├── pytest.ini
├── requirements.txt
├── .env.example
└── README.md
```

---

## 4. Supported NASA Datasets

| Priority | Dataset Key | Collections / Products | Variables Extracted | Native Spatial Res. | Native Temporal Res. | Auth Required | Status |
|---|---|---|---|---|---|---|---|
| 1 | `NASA_POWER` | `NASA_POWER_AG_DAILY` (`v2.10.3`) | `T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `RH2M`, `ALLSKY_SFC_SW_DWN`, `WS2M`, `GWETTOP`, `GWETROOT` | `0.5° x 0.625°` (~55 km) | Daily | No | **Live verified** |
| 2 | `GPM_IMERG` | `GPM_3IMERGDF` (Final, ~3.5 mo lag), `GPM_3IMERGDL` (Late, ~14 hr lag), `GPM_3IMERGHHE` (Early, ~4 hr lag) V07B | `precipitation` (`mm/day`), `precipitationCal` (`mm/hr`), `randomError`, `precipitation_cnt` | `0.1° x 0.1°` (~11 km) | Daily / Half-Hourly | Download yes; CMR no | **Live verified (`GPM_3IMERGDF`)** |
| 3 | `SMAP` | `SPL3SMP_E` v006 (Daily L3 Enhanced), `SPL4SMGP` v008 (3-Hourly L4) | `soil_moisture` (`m3/m3`), `retrieval_qual_flag`, `sm_surface`, `sm_rootzone` | `9 km` EASE-Grid 2.0 | Daily / 3-Hourly | Download yes; CMR no | **Live verified (`SPL3SMP_E`)** |
| 4 | `MODIS` | `MOD13Q1` (NDVI / EVI) | Vegetation spectral indices | `250 m` | 16-day composite | Yes | Planned (Phase 6) |
| 5 | `ECOSTRESS` | `ECO2LSTE` | Land surface temp / ET | `70 m` | Irregular (~3–5 days) | Yes | Planned (Phase 6) |
| 6 | `NEX_GDDP_CMIP6` | CMIP6 projections | Future temp & precip | `0.25°` (~25 km) | Daily | No | Planned (Phase 6) |

---

## 5. AOI Configuration & Scale Assessment

Configured in [`config/farm_config.yaml`](config/farm_config.yaml) referencing [`Lipa Cropland.geojson`](Lipa%20Cropland.geojson):
- **Location ID**: `lipa_cropland_001`
- **AOI Name**: `Lipa_Cropland_AOI`
- **CRS**: `EPSG:4326` (`Polygon`, 16 vertices, closed ring)
- **Centroid**: `lat = 13.983842`, `lon = 121.184648`
- **Bounding Box**: `[121.176299, 13.976575, 121.193002, 13.990451]`
- **Area**: `1.3372 km²` (`133.72 ha`)

**Spatial Scale Safeguards (`processors/raster_processor.py`):**
- Coarse pixels (`~55 km` POWER, `~11 km` GPM, `9 km` SMAP) exceed the `1.34 km²` farm boundary, so the pipeline uses `nearest_grid_cell_containing_aoi` without fake sub-field downscaling.
- SMAP L3 HDF5 extraction supports both `Soil_Moisture_Retrieval_Data_AM` and `Soil_Moisture_Retrieval_Data_PM` (`_pm` suffixes) and enforces a **`0.25°` (~27 km) maximum distance check** — if an orbital swath misses Lipa on a given day, it records `no_overpass_covering_aoi` (`null`) rather than returning a distant pixel.

To reuse the pipeline for another farm, replace `geojson_path`, `location_id`, `aoi_name`, `start_date`, and `end_date` in `config/farm_config.yaml`.

---

## 6. Installation & Environment Setup

Requires **Python 3.11+**.

```bash
pip install -r requirements.txt
cp .env.example .env
```

Environment variables in `.env`:
- `EARTHDATA_TOKEN` — NASA Earthdata Bearer Token (for GPM IMERG & SMAP downloads)
- `EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD` — Optional fallback credentials
- `TERRA_CONFIG_PATH` — Default `config/farm_config.yaml`
- `TERRA_DATASETS_PATH` — Default `config/datasets.yaml`
- `TERRA_DATA_DIR` — Default `data`
- `TERRA_API_HOST` / `TERRA_API_PORT` — Default `0.0.0.0` / `8000`

---

## 7. NASA Earthdata Authentication

1. Sign in at <https://urs.earthdata.nasa.gov/>.
2. Open **Profile -> Applications -> Authorized Apps -> Approve More Applications** and authorize:
   - **`NASA GESDISC DATA ARCHIVE`** (GPM IMERG)
   - **`NSIDC Cumulus Data`**, **`NSIDC_DATAPOOL_OPS`**, **`NSIDC V0 OPeNDAP`** (SMAP)
   - **`AppEEARS`** (for Phase 6 MODIS / ECOSTRESS)
3. Go to **Generate Token**, copy the token string, and paste it into `.env` as `EARTHDATA_TOKEN=...`. Never put credentials in `.env.example` or source code.

---

## 8. How to Run the Pipeline & CLI Reference

```bash
# 1. Run full pipeline using config/farm_config.yaml dates
python main.py

# 2. Recommended quick test (downloads ~664 MB/day raw GPM + SMAP for 2 days)
python main.py --start-date 2024-01-01 --end-date 2024-01-03

# 3. Discover coverage & CMR granules without downloading files
python main.py --action discover

# 4. Download raw files only
python main.py --action download --start-date 2024-01-01 --end-date 2024-01-03

# 5. Reprocess cached/local raw files without hitting remote APIs
python main.py --action process --start-date 2024-01-01 --end-date 2024-01-03

# 6. Run NASA POWER only (fast, tiny ~5 KB download, no Earthdata token needed)
python main.py --datasets NASA_POWER

# 7. Bypass cache and force re-download
python main.py --force-refresh

# 8. Start the TERRA FastAPI server (Swagger UI at http://localhost:8000/docs)
python main.py --action serve --port 8000
```

---

## 9. Data Size & Storage Layer Breakdown

Once processed for the `1.3372 km²` Lipa AOI, the outputs consumed by TERRA are under **0.5 MB**. Raw satellite granules are global files prior to local clipping:

| Layer / File | Observed Size (Current Disk) | Daily Growth Rate | Notes |
|---|---|---|---|
| `data/processed/terra.db` (SQLite) | `136.0 KB` (`0.13 MB`) | `~8 KB / day` | Indexed repository queried by FastAPI |
| `data/processed/terra_observations.json` | `116.6 KB` (`0.11 MB`) | `~7 KB / day` | Full standardized JSON records |
| `data/processed/terra_observations.parquet` | `14.3 KB` (`0.01 MB`) | `~1 KB / day` | Flattened analytics table |
| `data/metadata/*.json` | `~111 KB` (`0.11 MB`) | negligible | CMR manifests, cache index, `pipeline_report.json` |
| `data/raw/nasa_power/*.json` | `9.9 KB` (15d + 3d + 1d) | `~0.4 KB / day` | Point JSON (already tiny) |
| `data/raw/gpm_imerg/*.nc4` | `80.1 MB` (3 files) | `~26.7 MB / day` | Global `GPM_3IMERGDF` NetCDF4 granules |
| `data/raw/smap/*.h5` | `1,911.4 MB` (3 files) | `~637 MB / day` | Global `SPL3SMP_E` v006 HDF5 granules |

> **Tip:** To use near-real-time rainfall for current dates (since `GPM_3IMERGDF` lags ~3.5 months), set `preferred_product: "GPM_3IMERGDL"` (~14 hr lag) in [`config/farm_config.yaml`](config/farm_config.yaml).

---

## 10. Standardized Data Schema & Live Sample Outputs

Every record preserves native observation timestamps (`YYYY-MM-DDTHH:MM:SSZ`), provenance, and quality status (`VALID`, `VALID_WITH_WARNINGS`, `INCOMPLETE`, `INVALID`).

**Live observed values for `Lipa_Cropland_AOI` (`2024-01-01` .. `2024-01-03`):**
- **NASA POWER (`VALID`)**:
  - `2024-01-01`: `air_temperature_c = 25.96 °C` (`24.27..28.65`), `precipitation_mm = 3.42 mm/day`, `relative_humidity_pct = 92.39%`, `solar_radiation_mj_m2_day = 16.68`, `wind_speed_m_s = 1.21`, `surface_soil_wetness_index = 0.92`, `rootzone_soil_wetness_index = 0.95`
  - `2024-01-02`: `25.87 °C`, `2.34 mm/day`, `90.39%`, `14.89 MJ/m2/day`
  - `2024-01-03`: `25.94 °C`, `1.32 mm/day`, `89.15%`, `14.28 MJ/m2/day`
- **GPM IMERG (`GPM_3IMERGDF`, `VALID`)**:
  - `2024-01-01 .. 03`: `precipitation_mm = 0.0 mm/day`, `precipitation_random_error_mm = 2.764801 mm/day`, `precipitation_valid_sample_count = 48.0` (`grid_center = {lat: 13.95, lon: 121.150002}`)
- **SMAP (`SPL3SMP_E`, `INCOMPLETE` / `VALID_WITH_WARNINGS`)**:
  - `2024-01-01`: `soil_moisture_surface_m3_m3 = null` (`no_overpass_covering_aoi`)
  - `2024-01-02`: `0.408539 m3/m3`, `smap_retrieval_quality_flag = 9`
  - `2024-01-03`: `0.47474 m3/m3`, `smap_retrieval_quality_flag = 9`

---

## 11. Quality Control Rules (`validators/quality_checks.py`)

- **Missing & Fill Values**: `-999.0` / `-9999.0` / `NaN` become `null` (`is_missing: true`) — never coerced to `0`.
- **Extreme Weather Preservation**: Typhoons (`precipitation_mm >= 100`) and heat spikes (`>= 40 °C`) are **retained** and flagged as `VALID_WITH_WARNINGS` under `extreme_events_flagged`.
- **Physical Bounds**: Impossible values (e.g., `RH > 100%`, `precipitation < 0`) are nullified and logged in `cleaning_log`.
- **Quality Bitmasks**: Non-zero bit 0 on SMAP `retrieval_qual_flag` flags `VALID_WITH_WARNINGS` while retaining the measurement.
- **Deduplication**: Deduplicates identical `(location_id, source_dataset, product_name, timestamp)` keys.

---

## 12. FastAPI Documentation & Examples

Start the server (`python main.py --action serve --port 8000`) and open <http://localhost:8000/docs>.

| Endpoint | Purpose | Query Parameters |
|---|---|---|
| `GET /health` | Health & SQLite status | — |
| `GET /aoi` | Validated Lipa GeoJSON metadata & scale notes | — |
| `GET /datasets` | Active & Phase 6 planned NASA datasets | `include_planned` |
| `GET /observations` | Unified observations across all sources | `start_date`, `end_date`, `dataset`, `variable`, `aoi_id`, `quality_status` |
| `GET /observations/precipitation` | Daily `mm/day` vs rate `mm/hr` series | `start_date`, `end_date`, `dataset`, `aoi_id` |
| `GET /observations/soil-moisture` | SMAP `m3/m3` & POWER wetness indices | `start_date`, `end_date`, `dataset`, `aoi_id` |
| `GET /observations/temperature` | Mean / min / max air temperature (`degC`) | `start_date`, `end_date`, `dataset`, `aoi_id` |
| `GET /observations/vegetation` | Phase 6 MODIS vegetation endpoint | `start_date`, `end_date`, `aoi_id` |
| `GET /metadata` | Quality reports & latest pipeline run report | — |
| `GET /pipeline/status` | Latest run status & record counts | — |

```bash
curl "http://localhost:8000/observations/soil-moisture?start_date=2024-01-01&end_date=2024-01-03"
```

---

## 13. Testing (`tests/test_pipeline.py`)

Run all 8 automated tests (`pytest -v`):
1. `test_aoi_validation_real_lipa_geojson`
2. `test_aoi_validation_rejects_unclosed_and_invalid_coords`
3. `test_unit_conversions_and_rate_vs_accumulation`
4. `test_timestamp_handling_and_date_validation`
5. `test_nasa_power_missing_values_caching_duplicates_and_extremes`
6. `test_gpm_netcdf_subset_and_awaiting_credentials`
7. `test_smap_hdf5_subset_and_quality_flags`
8. `test_fastapi_endpoints_with_populated_repository`

---

## 14. Troubleshooting

- **`401` / `403` / HTML returned on GPM or SMAP download**: Verify `EARTHDATA_TOKEN` in `.env` and ensure `NASA GESDISC DATA ARCHIVE`, `NSIDC Cumulus Data`, and `NSIDC_DATAPOOL_OPS` are approved at `urs.earthdata.nasa.gov`.
- **SMAP returns `no_overpass_covering_aoi` (`null`)**: Normal behavior on days when SMAP's 2–3 day revisit swath misses Lipa (`2024-01-01` did not overpass Lipa; `2024-01-02` and `2024-01-03` did).
- **Large disk usage in `data/raw/`**: Global SMAP `.h5` files are ~637 MB/day. Run shorter date ranges during testing or enable OPeNDAP subsetting in future updates.

---

## 15. Known Limitations

- Coarse grid cells (~9 km to ~55 km) represent regional conditions over `Lipa_Cropland_AOI` (`1.3372 km²`), not field-probe precision.
- GPM Final (`GPM_3IMERGDF`) has a ~3.5-month latency; switch to `GPM_3IMERGDL` for recent weeks.
- `MODIS`, `ECOSTRESS`, and `NEX_GDDP_CMIP6` are registered in `datasets.yaml` (`planned_phase_6`) and not yet implemented.

---

## 16. Future Improvements

- **Server-side OPeNDAP Subsetting**: Slice GPM & SMAP spatially before download to cut ~664 MB/day down to `< 100 KB/day`.
- **Phase 6 Collectors**: Implement `MODIS` (`MOD13Q1` 250 m NDVI/EVI), `ECOSTRESS` (70 m LST/ET), and `NEX-GDDP-CMIP6` future climate scenarios.
- **Automated Scheduling & PostGIS**: Scheduled incremental sync + optional PostgreSQL/PostGIS storage backend.
