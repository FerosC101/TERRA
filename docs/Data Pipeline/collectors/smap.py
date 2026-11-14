"""Priority 3 Collector: NASA SMAP Satellite Soil Moisture (L3 & L4)."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from collectors.earthdata_client import EarthdataClient
from processors.raster_processor import extract_aoi_from_smap_hdf5
from processors.spatial_processor import AOIInfo
from processors.temporal_processor import normalize_timestamp, to_cmr_temporal, validate_date_range
from processors.unit_converter import convert_value_and_unit, standardize_variable_name
from storage.cache import FileCache
from validators.schema_validation import (
    RecordMetadata,
    StandardizedObservationRecord,
    VariableObservation,
)

SMAP_PRODUCT_CONFIG: dict[str, dict[str, Any]] = {
    "SPL3SMP_E": {
        "product_level": "L3 Enhanced Radiometer",
        "version": "006",
        "temporal_resolution": "daily",
        "filename_token": "SMAP_L3_SM_P_E",
        "variables": ["soil_moisture", "retrieval_qual_flag"],
    },
    "SPL4SMGP": {
        "product_level": "L4 Geophysical Model Assimilation",
        "version": "008",
        "temporal_resolution": "3-hourly",
        "filename_token": "SMAP_L4_SM_gph",
        "variables": ["sm_surface", "sm_rootzone"],
    },
}


def _infer_timestamp_from_smap_filename(filename: str, fallback: str | None = None) -> str:
    match_dt = re.search(r"(\d{8}T\d{6})", filename)
    if match_dt:
        raw = match_dt.group(1)
        return normalize_timestamp(
            f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}T{raw[9:11]}:{raw[11:13]}:{raw[13:15]}Z"
        )
    match_d = re.search(r"_(\d{8})_", filename)
    if match_d:
        ymd = match_d.group(1)
        return normalize_timestamp(f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:8]}T00:00:00Z")
    if fallback:
        return normalize_timestamp(fallback)
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class SmapCollector:
    """Discovers, retrieves, and processes SMAP L3/L4 soil moisture granules."""

    dataset_key = "SMAP"

    def __init__(
        self,
        client: EarthdataClient | None = None,
        cache: FileCache | None = None,
        dataset_meta: dict[str, Any] | None = None,
    ) -> None:
        self.client = client or EarthdataClient()
        self.cache = cache or FileCache()
        self.dataset_meta = dataset_meta or {}

    def discover(
        self,
        aoi: AOIInfo,
        start_date: str,
        end_date: str,
        product: str = "SPL3SMP_E",
    ) -> dict[str, Any]:
        """Search NASA CMR for SMAP granules covering the AOI and date range."""
        validate_date_range(start_date, end_date)
        temporal = to_cmr_temporal(start_date, end_date)
        granules = self.client.search_cmr_granules(
            short_name=product,
            bbox=aoi.bbox,
            temporal=temporal,
        )
        manifest_path = (
            self.cache.metadata_dir
            / f"smap_cmr_{product}_{aoi.location_id}_{start_date}_{end_date}.json"
        )
        manifest = {
            "dataset": self.dataset_key,
            "product": product,
            "product_info": SMAP_PRODUCT_CONFIG.get(product, {}),
            "aoi_id": aoi.location_id,
            "bbox": aoi.bbox,
            "temporal": temporal,
            "discovered_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "granule_count": len(granules),
            "granules": granules,
        }
        with manifest_path.open("w", encoding="utf-8") as fh:
            json.dump(manifest, fh, indent=2)
        manifest["manifest_file"] = str(manifest_path)
        return manifest

    def retrieve(
        self,
        aoi: AOIInfo,
        start_date: str,
        end_date: str,
        product: str = "SPL3SMP_E",
        max_granules: int = 20,
        force_refresh: bool = False,
    ) -> dict[str, Any]:
        """Discover SMAP granules in CMR and retrieve authenticated or local HDF5 files."""
        discovery = self.discover(aoi, start_date, end_date, product=product)
        granules = discovery["granules"][:max_granules]

        raw_files: list[dict[str, Any]] = []
        raw_dir = self.cache.raw_dir / self.dataset_key.lower()
        raw_dir.mkdir(parents=True, exist_ok=True)

        token = SMAP_PRODUCT_CONFIG.get(product, {}).get("filename_token", product).lower()
        existing_local = sorted(
            p for p in raw_dir.glob("*")
            if p.is_file()
            and p.suffix.lower() in {".h5", ".hdf5", ".nc", ".nc4"}
            and (token in p.name.lower() or product.lower() in p.name.lower())
        )

        if not self.client.has_credentials():
            if existing_local:
                for p in existing_local:
                    raw_files.append(
                        {
                            "file_path": str(p),
                            "time_start": _infer_timestamp_from_smap_filename(p.name),
                            "title": p.name,
                        }
                    )
                return {
                    "status": "LOADED_FROM_LOCAL_RAW",
                    "product": product,
                    "discovery": discovery,
                    "files": raw_files,
                }
            return {
                "status": "AWAITING_CREDENTIALS",
                "product": product,
                "message": (
                    f"Discovered {discovery['granule_count']} real {product} granules in NASA CMR, "
                    "but EARTHDATA_TOKEN (or EARTHDATA_USERNAME/EARTHDATA_PASSWORD) is not set. "
                    "Add credentials to .env to download SMAP HDF5 granules."
                ),
                "discovery": discovery,
                "files": [],
            }

        for gran in granules:
            data_url = gran.get("data_url")
            if not data_url:
                continue
            fname = data_url.rstrip("/").split("/")[-1]
            dest = self.cache.raw_path(self.dataset_key, fname)
            cache_key = self.cache.build_cache_key(
                f"{self.dataset_key}_{product}", aoi.location_id, {"title": gran["title"]}
            )
            if not force_refresh and self.cache.has_valid_file(dest):
                raw_files.append(
                    {
                        "file_path": str(dest),
                        "time_start": gran.get("time_start"),
                        "title": gran.get("title"),
                        "retrieved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    }
                )
                continue

            self.client.download_authenticated(data_url, dest)
            entry = self.cache.record_retrieval(
                cache_key=cache_key,
                file_path=dest,
                dataset=self.dataset_key,
                aoi_id=aoi.location_id,
                source_url=data_url,
                extra_metadata={"product": product, "granule_id": gran.get("id")},
            )
            raw_files.append(
                {
                    "file_path": str(dest),
                    "time_start": gran.get("time_start"),
                    "title": gran.get("title"),
                    "retrieved_at": entry["retrieved_at"],
                }
            )

        return {
            "status": "RETRIEVED_LIVE" if raw_files else "NO_FILES_RETRIEVED",
            "product": product,
            "discovery": discovery,
            "files": raw_files,
        }

    def process(
        self,
        raw_result: dict[str, Any],
        aoi: AOIInfo,
    ) -> list[StandardizedObservationRecord]:
        """Extract AOI soil moisture & quality flags from SMAP HDF5 granules."""
        files = raw_result.get("files", [])
        if not files:
            return []

        product = raw_result.get("product", "SPL3SMP_E")
        prod_cfg = SMAP_PRODUCT_CONFIG.get(product, SMAP_PRODUCT_CONFIG["SPL3SMP_E"])
        var_names: list[str] = prod_cfg["variables"]
        temporal_res = prod_cfg["temporal_resolution"]
        version = prod_cfg["version"]
        spatial_res = self.dataset_meta.get("spatial_resolution", "9 km EASE-Grid 2.0")
        processed_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        records: list[StandardizedObservationRecord] = []
        for fmeta in files:
            fpath = Path(fmeta["file_path"])
            extracted = extract_aoi_from_smap_hdf5(
                file_path=fpath,
                aoi_bbox=aoi.bbox,
                centroid_lon=aoi.centroid_lon,
                centroid_lat=aoi.centroid_lat,
                variable_names=var_names,
            )
            if not extracted:
                continue

            ts_iso = _infer_timestamp_from_smap_filename(fpath.name, fmeta.get("time_start"))
            retrieved_at = fmeta.get("retrieved_at", processed_at)
            obs_dict: dict[str, VariableObservation] = {}
            flat_dict: dict[str, float | None] = {}

            qual_flag_val = extracted.get("retrieval_qual_flag", {}).get("value")
            for raw_var, stats in extracted.items():
                std_name = standardize_variable_name(raw_var)
                std_val, std_unit = convert_value_and_unit(
                    raw_var, stats.get("value"), stats.get("unit")
                )
                is_missing = std_val is None
                obs_dict[std_name] = VariableObservation(
                    value=std_val,
                    unit=std_unit,
                    raw_variable=raw_var,
                    source_dataset=self.dataset_key,
                    product_name=f"{product} ({prod_cfg['product_level']})",
                    product_version=version,
                    spatial_resolution=spatial_res,
                    temporal_resolution=temporal_res,
                    observation_type="satellite",
                    quality_flag=(
                        int(qual_flag_val) if qual_flag_val is not None else "NO_BITMASK"
                    ),
                    is_missing=is_missing,
                    extraction_mode=stats.get("extraction_mode"),
                    notes=(
                        "Satellite soil moisture (9 km footprint); distinct from in-situ field probes. "
                        f"grid_center={stats.get('grid_cell_center')}"
                    ),
                )
                flat_dict[std_name] = std_val

            safe_ts = ts_iso.replace(":", "").replace("-", "")
            records.append(
                StandardizedObservationRecord(
                    record_id=f"{aoi.location_id}_SMAP_{product}_{safe_ts}",
                    location_id=aoi.location_id,
                    aoi_name=aoi.aoi_name,
                    timestamp=ts_iso,
                    temporal_resolution=temporal_res,
                    observations=obs_dict,
                    flat_observations=flat_dict,
                    metadata=RecordMetadata(
                        sources=[self.dataset_key],
                        product_names=[product],
                        product_versions={product: version},
                        quality_status="VALID",
                        quality_flags={
                            "retrieval_qual_flag": (
                                int(qual_flag_val) if qual_flag_val is not None else None
                            )
                        },
                        observation_types=["satellite"],
                        spatial_resolution={self.dataset_key: spatial_res},
                        temporal_resolution=temporal_res,
                        centroid_lat=round(aoi.centroid_lat, 6),
                        centroid_lon=round(aoi.centroid_lon, 6),
                        retrieved_at=retrieved_at,
                        processed_at=processed_at,
                        raw_file=str(fpath),
                    ),
                )
            )
        return records
