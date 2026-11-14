# TERRA NASA Earth Observation Data Pipeline

Automated, AOI-scoped geospatial data pipeline that retrieves, cleans, validates, harmonizes, and serves NASA Earth observation and agroclimatology datasets for **TERRA** (`Lipa_Cropland_AOI`, Lipa City, Batangas, Philippines).

> **HTML Documentation Portal:** Open [`docs/index.html`](docs/index.html) in any browser for an interactive AOI polygon map, live verified data explorer, date-range disk size estimator, and FastAPI endpoint tester.

---

## 1. Project Overview & Live Verification Summary

The **TERRA NASA Data Pipeline** converts heterogeneous NASA meteorological and satellite products into a single standardized, quality-checked schema consumed by TERRA's downstream modules — without requiring teammates to parse raw NetCDF4, HDF5, EASE-Grid 2.0, or NASA CMR APIs.

**Verified live over `Lipa_Cropland_AOI` (`2024-01-01` .. `2024-01-15`, 15 days across all 3 datasets = 45 source records + 15 merged daily records):**
- **NASA POWER (`NASA_POWER_AG_DAILY`, `v2.10.3`)**: Retrieved live and cached cleanly (`VALID`, 15 daily records for `2024-01-01..15`), plus derived daily **FAO-56 Penman-Monteith reference evapotranspiration (`et0_mm_day`, `2.14..3.56 mm/day`)**.
- **GPM IMERG (`GPM_3IMERGDF` V07B Final)**: Discovered via NASA CMR, retrieved via server-side **OPeNDAP DAP4 spatial subsetting** (`~34.3 KB/day` `.subset.dap.nc4` instead of `~26.7 MB/day` global files), and processed via **2×2 Inverse-Distance-Weighted (IDW)** interpolation (`idw_2x2_coarse_grid`, preserving `nearest_pixel` & `neighborhood_max` metadata and distinct `precipitation_imerg_mm`) — `VALID`, all 15 days (`2024-01-01..15`).
- **SMAP (`SPL3SMP_E` v006 Daily 9 km)**: Discovered via NASA CMR, retrieved via server-side **OPeNDAP DAP4 spatial subsetting** (`~38.9 KB/day` `.subset.dap.nc4` instead of `~637 MB/day` global HDF5 files — ~16,400× smaller), with human-readable bitmask decoding (`retrieval_qual_decoded`) — 15 daily records (`2024-01-01..15`: 7 genuine orbital overpasses `0.4085..0.5041 m3/m3` flagged `VALID_WITH_WARNINGS`, and 8 orbital swath gaps preserved as `null` via `no_overpass_covering_aoi`).
- **TERRA FastAPI Service**: All 12 REST routes (including `GET /observations/daily-merged` and `GET /observations/evapotranspiration`) verified HTTP `200` against the live SQLite store.

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
    data/raw/ -> data/processed/{terra.db, *.json, terra_daily_merged.json, *.parquet} -> data/metadata/
        │
        ▼
[6] TERRA FastAPI Service (api/routes.py)
```

### Repository Structure

```text
Space APP Challenge Data Pipeline/
├── api/
│   ├── __init__.py
│   └── routes.py                 # FastAPI service (12 REST endpoints incl. /observations/daily-merged)
├── collectors/
│   ├── __init__.py
│   ├── earthdata_client.py       # Retry/backoff HTTP, CMR pagination, OPeNDAP DAP4 subset URLs, URS auth
│   ├── nasa_power.py             # Priority 1: NASA POWER Agroclimatology collector + FAO-56 ET0
│   ├── gpm.py                    # Priority 2: GPM IMERG Final/Late/Early (OPeNDAP subset + fallback)
│   └── smap.py                   # Priority 3: SMAP L3/L4 (OPeNDAP subset + bitmask decoder)
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
│   ├── unit_converter.py         # Physical conversions + FAO-56 Penman-Monteith ET0; mm/day != mm/hr
│   └── raster_processor.py       # NetCDF4/HDF5 2x2 IDW + 2D EASE-Grid subsetting + 0.25 deg overpass guard
├── storage/
│   ├── __init__.py
│   ├── cache.py                  # SHA-256 request index & raw file cache
│   └── repository.py             # SQLite + Parquet + JSON + daily merged repository
├── validators/
│   ├── __init__.py
│   ├── schema_validation.py      # Pydantic v2 standardized schemas
│   └── quality_checks.py         # Physical bounds, extreme weather retention, bitmasks, deduplication
├── tests/
│   └── test_pipeline.py          # 10 automated tests (unit + OPeNDAP/ET0 + FastAPI integration)
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
- Coarse pixels (`~55 km` POWER, `~11 km` GPM, `9 km` SMAP) exceed the `1.34 km²` farm boundary without fake sub-field downscaling:
  - **GPM IMERG 1D grids** use **2×2 Inverse-Distance-Weighted interpolation** (`idw_2x2_coarse_grid`) across the 4 enclosing `0.1°` cells centered on `Lipa_Cropland_AOI`, while preserving `nearest_pixel` and `neighborhood_max` in variable notes.
  - **SMAP L3 EASE-Grid 2.0** supports both `Soil_Moisture_Retrieval_Data_AM` and `Soil_Moisture_Retrieval_Data_PM` (`_pm` suffixes) and enforces a **`0.25°` (~27 km) maximum distance check** — if an orbital swath misses Lipa on a given day (including all-fill 6×6 OPeNDAP subsets), it records `no_overpass_covering_aoi` (`null`) rather than returning a distant pixel.

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

# 2. Full 15-day OPeNDAP subset run (downloads ~1.07 MB total GPM + SMAP subsets)
python main.py --start-date 2024-01-01 --end-date 2024-01-15

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

Using **server-side OPeNDAP DAP4 spatial subsetting**, downloading 15 full days (`2024-01-01` .. `2024-01-15`) across NASA POWER, GPM IMERG, and SMAP requires only **`~1.1 MB`** of raw downloads instead of **`~9.95 GB`** of full-globe granules:

| Layer / File | Observed Size (15-Day Live Run) | Daily Growth Rate | Notes |
|---|---|---|---|
| `data/processed/terra.db` (SQLite) | `240.0 KB` (`0.23 MB`) | `~16 KB / day` | Indexed repository queried by FastAPI |
| `data/processed/terra_observations.json` | `213.5 KB` (`0.21 MB`) | `~14 KB / day` | Full standardized per-source records |
| `data/processed/terra_daily_merged.json` | `162.6 KB` (`0.16 MB`) | `~11 KB / day` | Harmonized daily view (`precipitation_mm` + `precipitation_imerg_mm` + `et0_mm_day` + SMAP) |
| `data/processed/terra_observations.parquet` | `16.1 KB` (`0.02 MB`) | `~1 KB / day` | Flattened analytics table |
| `data/metadata/*.json` | `145.0 KB` (`0.14 MB`) | negligible | CMR manifests, cache index, `pipeline_report.json` |
| `data/raw/nasa_power/*.json` | `9.9 KB` | `~0.4 KB / day` | Point JSON (already tiny) |
| `data/raw/gpm_imerg/*.subset.dap.nc4` | `514.9 KB` (15 files) | **`~34.3 KB / day`** | Server-side OPeNDAP 5×5 slice (vs `~26.7 MB/day` global) |
| `data/raw/smap/*.subset.dap.nc4` | `583.9 KB` (15 files) | **`~38.9 KB / day`** | Server-side OPeNDAP 6×6 AM+PM slice (vs `~637 MB/day` global) |

> **Tip:** To use near-real-time rainfall for current dates (since `GPM_3IMERGDF` lags ~3.5 months), set `preferred_product: "GPM_3IMERGDL"` (~14 hr lag) in [`config/farm_config.yaml`](config/farm_config.yaml).

---

## 10. Standardized Data Schema & Live Sample Outputs

Every record preserves native observation timestamps (`YYYY-MM-DDTHH:MM:SSZ`), provenance, and quality status (`VALID`, `VALID_WITH_WARNINGS`, `INCOMPLETE`, `INVALID`).

**Live observed values for `Lipa_Cropland_AOI` (`2024-01-01` .. `2024-01-15`):**
- **NASA POWER + FAO-56 ET₀ (`VALID`, all 15 days)**:
  - `2024-01-01`: `air_temperature_c = 25.96 °C`, `precipitation_mm = 3.42 mm/day`, `et0_mm_day = 3.1400 mm/day`
  - `2024-01-08`: `air_temperature_c = 25.03 °C`, `precipitation_mm = 11.73 mm/day`, `et0_mm_day = 2.1648 mm/day`
  - `2024-01-10`: `air_temperature_c = 26.24 °C`, `precipitation_mm = 0.81 mm/day`, `et0_mm_day = 3.5616 mm/day`
- **GPM IMERG (`GPM_3IMERGDF`, `VALID`, all 15 days via `idw_2x2_coarse_grid`)**:
  - `precipitation_imerg_mm` captures neighborhood rainfall on `2024-01-05` (`2.564271 mm/day`), `2024-01-06` (`0.031205 mm/day`), `2024-01-08` (`5.369804 mm/day`), `2024-01-09` (`0.051177 mm/day`), `2024-01-14` (`0.458843 mm/day`), and `2024-01-15` (`0.014118 mm/day`).
- **SMAP (`SPL3SMP_E`, 15 days — 7 overpasses + 8 orbital swath gaps)**:
  - 7 overpasses (`01-02`, `01-03`, `01-05`, `01-08`, `01-10`, `01-11`, `01-13`): `0.408539` – `0.504141 m3/m3` with decoded `retrieval_qual_flag=9` (`retrieval_not_recommended, surface_vegetation_topography_advisory`)
  - 8 non-overpass days (`01-01`, `01-04`, `01-06`, `01-07`, `01-09`, `01-12`, `01-14`, `01-15`): `soil_moisture_surface_m3_m3 = null` (`no_overpass_covering_aoi`)

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
| `GET /observations/daily-merged` | Harmonized daily view merging POWER, GPM IMERG (`precipitation_imerg_mm`), SMAP, and `et0_mm_day` | `start_date`, `end_date`, `aoi_id` |
| `GET /observations/evapotranspiration` | Daily FAO-56 reference evapotranspiration (`et0_mm_day`) | `start_date`, `end_date`, `dataset`, `aoi_id` |
| `GET /observations/precipitation` | Daily `mm/day` (POWER + IMERG) vs rate `mm/hr` series | `start_date`, `end_date`, `dataset`, `aoi_id` |
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

Run all 10 automated tests (`pytest -v`):
1. `test_aoi_validation_real_lipa_geojson`
2. `test_aoi_validation_rejects_unclosed_and_invalid_coords`
3. `test_unit_conversions_and_rate_vs_accumulation`
4. `test_timestamp_handling_and_date_validation`
5. `test_nasa_power_missing_values_caching_duplicates_and_extremes`
6. `test_gpm_netcdf_subset_and_awaiting_credentials`
7. `test_smap_hdf5_subset_and_quality_flags`
8. `test_opendap_subset_url_builders_and_fao56_et0`
9. `test_fastapi_endpoints_with_populated_repository`
10. `test_fastapi_daily_merged_and_et0`

---

## 14. Troubleshooting

- **`401` / `403` / HTML returned on GPM or SMAP download**: Verify `EARTHDATA_TOKEN` in `.env` and ensure `NASA GESDISC DATA ARCHIVE`, `NSIDC Cumulus Data`, `NSIDC V0 OPeNDAP`, and `NSIDC_DATAPOOL_OPS` are approved at `urs.earthdata.nasa.gov`.
- **SMAP returns `no_overpass_covering_aoi` (`null`)**: Normal behavior on days when SMAP's 2–3 day revisit swath misses Lipa (`7` overpasses and `8` swath gaps across `2024-01-01..15`).
- **OPeNDAP subset fallback triggered**: If an OPeNDAP endpoint transiently fails for a granule, `gpm.py` and `smap.py` automatically fall back to direct HTTPS granule downloads in `data/raw/`.

---

## 15. Known Limitations

- Coarse grid cells (~9 km to ~55 km) represent regional conditions over `Lipa_Cropland_AOI` (`1.3372 km²`), not field-probe precision.
- GPM Final (`GPM_3IMERGDF`) has a ~3.5-month latency; switch to `GPM_3IMERGDL` for recent weeks.
- `MODIS`, `ECOSTRESS`, and `NEX_GDDP_CMIP6` are registered in `datasets.yaml` (`planned_phase_6`) and not yet implemented.

---

## 16. Future Improvements

- **Phase 6 Collectors**: Implement `MODIS` (`MOD13Q1` 250 m NDVI/EVI), `ECOSTRESS` (70 m LST/ET), and `NEX-GDDP-CMIP6` future climate scenarios.
- **Automated Scheduling & PostGIS**: Scheduled incremental sync + optional PostgreSQL/PostGIS storage backend.
