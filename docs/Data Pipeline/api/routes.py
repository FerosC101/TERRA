"""TERRA FastAPI routes allowing downstream modules to consume standardized NASA data."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query

from discovery.dataset_registry import load_dataset_registry
from processors.spatial_processor import load_and_validate_aoi
from storage.repository import TerraRepository

CATEGORY_VARIABLES: dict[str, set[str]] = {
    "precipitation": {
        "precipitation_mm",
        "precipitation_imerg_mm",
        "precipitation_rate_mm_hr",
        "precipitation_random_error_mm",
        "precipitation_valid_sample_count",
    },
    "soil-moisture": {
        "soil_moisture_surface_m3_m3",
        "soil_moisture_rootzone_m3_m3",
        "surface_soil_wetness_index",
        "rootzone_soil_wetness_index",
        "smap_retrieval_quality_flag",
    },
    "temperature": {
        "air_temperature_c",
        "air_temperature_max_c",
        "air_temperature_min_c",
    },
    "evapotranspiration": {
        "et0_mm_day",
    },
    "vegetation": {
        "ndvi",
        "evi",
        "vegetation_index",
    },
}


def _filter_records_by_category(
    records: list[dict[str, Any]],
    category: str,
) -> list[dict[str, Any]]:
    allowed_vars = CATEGORY_VARIABLES[category]
    filtered: list[dict[str, Any]] = []
    for rec in records:
        obs_subset = {
            k: v for k, v in rec.get("observations", {}).items() if k in allowed_vars
        }
        if not obs_subset:
            continue
        flat_subset = {
            k: v for k, v in rec.get("flat_observations", {}).items() if k in allowed_vars
        }
        item = dict(rec)
        item["observations"] = obs_subset
        item["flat_observations"] = flat_subset
        filtered.append(item)
    return filtered


def create_app(
    farm_config_path: str | Path | None = None,
    datasets_config_path: str | Path | None = None,
    data_dir: str | Path | None = None,
    base_dir: str | Path | None = None,
) -> FastAPI:
    """Application factory for TERRA Data Pipeline API."""
    root = Path(base_dir).resolve() if base_dir else Path.cwd().resolve()
    farm_cfg = Path(farm_config_path or os.environ.get("TERRA_CONFIG_PATH", "config/farm_config.yaml"))
    if not farm_cfg.is_absolute():
        farm_cfg = (root / farm_cfg).resolve()

    ds_cfg = Path(datasets_config_path or os.environ.get("TERRA_DATASETS_PATH", "config/datasets.yaml"))
    if not ds_cfg.is_absolute():
        ds_cfg = (root / ds_cfg).resolve()

    data_path = Path(data_dir or os.environ.get("TERRA_DATA_DIR", "data"))
    if not data_path.is_absolute():
        data_path = (root / data_path).resolve()

    api = FastAPI(
        title="TERRA NASA Earth Observation Data API",
        description=(
            "Standardized, AOI-scoped NASA POWER, GPM IMERG, and SMAP environmental "
            "observations for TERRA's Living Field Model, Discovery Engine, and Rotation Lab."
        ),
        version="1.0.0",
    )

    def _get_repo() -> TerraRepository:
        return TerraRepository(data_dir=data_path)

    @api.get("/health")
    def health() -> dict[str, Any]:
        repo = _get_repo()
        report = repo.get_pipeline_report()
        return {
            "status": "ok",
            "service": "terra-nasa-data-pipeline",
            "has_pipeline_report": report is not None,
            "sqlite_db_exists": repo.db_path.exists(),
        }

    @api.get("/aoi")
    def get_aoi() -> dict[str, Any]:
        try:
            aoi = load_and_validate_aoi(farm_cfg, base_dir=root)
            return aoi.to_dict()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @api.get("/datasets")
    def get_datasets(include_planned: bool = Query(default=True)) -> dict[str, Any]:
        registry = load_dataset_registry(ds_cfg)
        return {"datasets": registry.list_datasets(include_planned=include_planned)}

    @api.get("/observations")
    def get_observations(
        start_date: str | None = Query(default=None, description="YYYY-MM-DD"),
        end_date: str | None = Query(default=None, description="YYYY-MM-DD"),
        dataset: str | None = Query(default=None, description="e.g. NASA_POWER, GPM_IMERG, SMAP"),
        variable: str | None = Query(default=None, description="Standardized variable name"),
        aoi_id: str | None = Query(default=None, description="Location ID filter"),
        quality_status: str | None = Query(default=None, description="VALID, VALID_WITH_WARNINGS, INCOMPLETE, INVALID"),
    ) -> dict[str, Any]:
        repo = _get_repo()
        records = repo.query_observations(
            start_date=start_date,
            end_date=end_date,
            dataset=dataset,
            variable=variable,
            aoi_id=aoi_id,
            quality_status=quality_status,
        )
        return {
            "count": len(records),
            "filters": {
                "start_date": start_date,
                "end_date": end_date,
                "dataset": dataset,
                "variable": variable,
                "aoi_id": aoi_id,
                "quality_status": quality_status,
            },
            "observations": records,
        }

    @api.get("/observations/daily-merged")
    def get_daily_merged(
        start_date: str | None = Query(default=None, description="YYYY-MM-DD"),
        end_date: str | None = Query(default=None, description="YYYY-MM-DD"),
        aoi_id: str | None = Query(default=None, description="Location ID filter"),
    ) -> dict[str, Any]:
        repo = _get_repo()
        merged = repo.query_daily_merged(
            start_date=start_date,
            end_date=end_date,
            aoi_id=aoi_id,
        )
        return {
            "count": len(merged),
            "filters": {
                "start_date": start_date,
                "end_date": end_date,
                "aoi_id": aoi_id,
            },
            "note": (
                "Harmonized daily records merging NASA POWER (precipitation_mm, temperature, radiation, et0_mm_day), "
                "GPM IMERG (precipitation_imerg_mm via 2x2 IDW), and SMAP (soil_moisture_surface_m3_m3)."
            ),
            "daily_observations": merged,
        }

    @api.get("/observations/evapotranspiration")
    def get_evapotranspiration(
        start_date: str | None = Query(default=None),
        end_date: str | None = Query(default=None),
        dataset: str | None = Query(default=None),
        aoi_id: str | None = Query(default=None),
    ) -> dict[str, Any]:
        repo = _get_repo()
        records = repo.query_observations(
            start_date=start_date, end_date=end_date, dataset=dataset, aoi_id=aoi_id
        )
        filtered = _filter_records_by_category(records, "evapotranspiration")
        return {
            "category": "evapotranspiration",
            "count": len(filtered),
            "note": "Daily FAO-56 Penman-Monteith reference evapotranspiration (et0_mm_day) derived from NASA POWER.",
            "observations": filtered,
        }

    @api.get("/observations/precipitation")
    def get_precipitation(
        start_date: str | None = Query(default=None),
        end_date: str | None = Query(default=None),
        dataset: str | None = Query(default=None),
        aoi_id: str | None = Query(default=None),
    ) -> dict[str, Any]:
        repo = _get_repo()
        records = repo.query_observations(
            start_date=start_date, end_date=end_date, dataset=dataset, aoi_id=aoi_id
        )
        filtered = _filter_records_by_category(records, "precipitation")
        return {
            "category": "precipitation",
            "count": len(filtered),
            "note": "Daily accumulation (mm/day) and half-hourly rainfall rate (mm/hr) are strictly separated.",
            "observations": filtered,
        }

    @api.get("/observations/soil-moisture")
    def get_soil_moisture(
        start_date: str | None = Query(default=None),
        end_date: str | None = Query(default=None),
        dataset: str | None = Query(default=None),
        aoi_id: str | None = Query(default=None),
    ) -> dict[str, Any]:
        repo = _get_repo()
        records = repo.query_observations(
            start_date=start_date, end_date=end_date, dataset=dataset, aoi_id=aoi_id
        )
        filtered = _filter_records_by_category(records, "soil-moisture")
        return {
            "category": "soil_moisture",
            "count": len(filtered),
            "note": (
                "Distinguishes NASA POWER modeled wetness indices (0-1) from "
                "SMAP satellite volumetric soil moisture (m3/m3) and in-situ probes."
            ),
            "observations": filtered,
        }

    @api.get("/observations/temperature")
    def get_temperature(
        start_date: str | None = Query(default=None),
        end_date: str | None = Query(default=None),
        dataset: str | None = Query(default=None),
        aoi_id: str | None = Query(default=None),
    ) -> dict[str, Any]:
        repo = _get_repo()
        records = repo.query_observations(
            start_date=start_date, end_date=end_date, dataset=dataset, aoi_id=aoi_id
        )
        filtered = _filter_records_by_category(records, "temperature")
        return {
            "category": "temperature",
            "count": len(filtered),
            "observations": filtered,
        }

    @api.get("/observations/vegetation")
    def get_vegetation(
        start_date: str | None = Query(default=None),
        end_date: str | None = Query(default=None),
        aoi_id: str | None = Query(default=None),
    ) -> dict[str, Any]:
        repo = _get_repo()
        records = repo.query_observations(
            start_date=start_date, end_date=end_date, aoi_id=aoi_id
        )
        filtered = _filter_records_by_category(records, "vegetation")
        return {
            "category": "vegetation",
            "count": len(filtered),
            "status": "AVAILABLE" if filtered else "PLANNED_PHASE_6_MODIS",
            "note": (
                "MODIS vegetation indices (MOD13Q1 NDVI/EVI) are scheduled for Phase 6. "
                "Vegetation indices are spectral proxies and not direct crop health measurements."
            ),
            "observations": filtered,
        }

    @api.get("/metadata")
    def get_metadata() -> dict[str, Any]:
        repo = _get_repo()
        return {
            "quality_reports": repo.get_quality_reports(),
            "pipeline_report": repo.get_pipeline_report(),
        }

    @api.get("/pipeline/status")
    def get_pipeline_status() -> dict[str, Any]:
        repo = _get_repo()
        report = repo.get_pipeline_report()
        if not report:
            return {
                "status": "NOT_RUN_YET",
                "message": "Run 'python main.py' to populate standardized observations.",
            }
        return report

    return api


app = create_app()

