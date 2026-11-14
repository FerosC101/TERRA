"""Priority 1 Collector: NASA POWER Agroclimatology API."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from collectors.earthdata_client import EarthdataClient
from processors.spatial_processor import AOIInfo
from processors.temporal_processor import normalize_timestamp, to_power_date, validate_date_range
from processors.unit_converter import convert_value_and_unit, standardize_variable_name
from storage.cache import FileCache
from validators.schema_validation import (
    RecordMetadata,
    StandardizedObservationRecord,
    VariableObservation,
)

NASA_POWER_DAILY_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
DEFAULT_POWER_PARAMS = [
    "T2M",
    "T2M_MAX",
    "T2M_MIN",
    "PRECTOTCORR",
    "RH2M",
    "ALLSKY_SFC_SW_DWN",
    "WS2M",
    "GWETTOP",
    "GWETROOT",
]


class NasaPowerCollector:
    """Retrieves, caches, and standardizes NASA POWER Agroclimatology data."""

    dataset_key = "NASA_POWER"

    def __init__(
        self,
        client: EarthdataClient | None = None,
        cache: FileCache | None = None,
        dataset_meta: dict[str, Any] | None = None,
    ) -> None:
        self.client = client or EarthdataClient()
        self.cache = cache or FileCache()
        self.dataset_meta = dataset_meta or {}

    def retrieve(
        self,
        aoi: AOIInfo,
        start_date: str,
        end_date: str,
        parameters: list[str] | None = None,
        community: str = "AG",
        force_refresh: bool = False,
    ) -> dict[str, Any]:
        """Fetch raw NASA POWER JSON for AOI centroid and date range (using cache when valid)."""
        validate_date_range(start_date, end_date)
        params_list = parameters or DEFAULT_POWER_PARAMS
        start_ymd = to_power_date(start_date)
        end_ymd = to_power_date(end_date)

        query_params = {
            "parameters": ",".join(params_list),
            "community": community,
            "longitude": round(aoi.centroid_lon, 6),
            "latitude": round(aoi.centroid_lat, 6),
            "start": start_ymd,
            "end": end_ymd,
            "format": "JSON",
        }
        cache_key = self.cache.build_cache_key(self.dataset_key, aoi.location_id, query_params)
        raw_filename = f"nasa_power_{aoi.location_id}_{start_ymd}_{end_ymd}.json"
        raw_path = self.cache.raw_path(self.dataset_key, raw_filename)

        cached = None if force_refresh else self.cache.get_cached_entry(cache_key)
        if cached and Path(cached["file_path"]).exists():
            with Path(cached["file_path"]).open("r", encoding="utf-8") as fh:
                payload = json.load(fh)
            return {
                "status": "RETRIEVED_FROM_CACHE",
                "raw_file": cached["file_path"],
                "retrieved_at": cached["retrieved_at"],
                "payload": payload,
            }

        payload = self.client.get_json(NASA_POWER_DAILY_URL, params=query_params)
        with raw_path.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2)

        entry = self.cache.record_retrieval(
            cache_key=cache_key,
            file_path=raw_path,
            dataset=self.dataset_key,
            aoi_id=aoi.location_id,
            source_url=NASA_POWER_DAILY_URL,
            extra_metadata={"start": start_ymd, "end": end_ymd, "parameters": params_list},
        )
        return {
            "status": "RETRIEVED_LIVE",
            "raw_file": str(raw_path),
            "retrieved_at": entry["retrieved_at"],
            "payload": payload,
        }

    def process(
        self,
        raw_result: dict[str, Any],
        aoi: AOIInfo,
    ) -> list[StandardizedObservationRecord]:
        """Transform raw NASA POWER JSON into TERRA standardized observation records."""
        payload = raw_result["payload"]
        raw_file = raw_result.get("raw_file")
        retrieved_at = raw_result.get(
            "retrieved_at", datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        )
        processed_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        header = payload.get("header", {})
        api_version = str(header.get("api", {}).get("version", "v2"))
        fill_value = float(header.get("fill_value", -999.0))
        param_meta = payload.get("parameters", {})
        param_series: dict[str, dict[str, Any]] = payload.get("properties", {}).get("parameter", {})

        if not param_series:
            raise ValueError("NASA POWER response missing 'properties.parameter' data.")

        all_dates = sorted({d for series in param_series.values() for d in series.keys()})
        spatial_res = self.dataset_meta.get("spatial_resolution", "0.5 deg x 0.625 deg (~55 km)")
        obs_type = self.dataset_meta.get(
            "observation_type", "reanalysis_satellite_assimilation"
        )

        records: list[StandardizedObservationRecord] = []
        for ymd in all_dates:
            ts_iso = normalize_timestamp(ymd)
            obs_dict: dict[str, VariableObservation] = {}
            flat_dict: dict[str, float | None] = {}

            for raw_var, series in param_series.items():
                raw_val = series.get(ymd)
                is_fill = raw_val is None or (
                    isinstance(raw_val, (int, float)) and abs(float(raw_val) - fill_value) < 1e-6
                )
                source_unit = param_meta.get(raw_var, {}).get("units")
                std_name = standardize_variable_name(raw_var)
                if is_fill:
                    std_val, std_unit = convert_value_and_unit(raw_var, None, source_unit)
                    is_missing = True
                else:
                    std_val, std_unit = convert_value_and_unit(raw_var, raw_val, source_unit)
                    is_missing = std_val is None

                note = None
                if raw_var in {"GWETTOP", "GWETROOT"}:
                    note = "Modeled soil wetness index (0-1), not direct volumetric sensor reading."

                obs_dict[std_name] = VariableObservation(
                    value=std_val,
                    unit=std_unit,
                    raw_variable=raw_var,
                    source_dataset=self.dataset_key,
                    product_name="NASA_POWER_AG_DAILY",
                    product_version=api_version,
                    spatial_resolution=spatial_res,
                    temporal_resolution="daily",
                    observation_type=obs_type,
                    quality_flag=f"fill_value={fill_value}" if is_missing else "OK",
                    is_missing=is_missing,
                    extraction_mode="point_centroid_enclosing_grid",
                    notes=note,
                )
                flat_dict[std_name] = std_val

            record_id = f"{aoi.location_id}_NASA_POWER_{ymd}"
            records.append(
                StandardizedObservationRecord(
                    record_id=record_id,
                    location_id=aoi.location_id,
                    aoi_name=aoi.aoi_name,
                    timestamp=ts_iso,
                    temporal_resolution="daily",
                    observations=obs_dict,
                    flat_observations=flat_dict,
                    metadata=RecordMetadata(
                        sources=[self.dataset_key],
                        product_names=["NASA_POWER_AG_DAILY"],
                        product_versions={self.dataset_key: api_version},
                        quality_status="VALID",
                        quality_flags={},
                        observation_types=[obs_type],
                        spatial_resolution={self.dataset_key: spatial_res},
                        temporal_resolution="daily",
                        centroid_lat=round(aoi.centroid_lat, 6),
                        centroid_lon=round(aoi.centroid_lon, 6),
                        retrieved_at=retrieved_at,
                        processed_at=processed_at,
                        raw_file=raw_file,
                    ),
                )
            )
        return records

