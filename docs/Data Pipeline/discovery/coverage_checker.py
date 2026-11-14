"""Live spatial/temporal coverage verification against NASA CMR and registry bounds."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from collectors.earthdata_client import EarthdataClient
from discovery.dataset_registry import DatasetRegistry
from processors.spatial_processor import AOIInfo
from processors.temporal_processor import parse_to_utc, to_cmr_temporal, validate_date_range


def _bbox_intersects(a: list[float], b: list[float]) -> bool:
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])


def check_dataset_coverage(
    aoi: AOIInfo,
    start_date: str,
    end_date: str,
    registry: DatasetRegistry,
    earthdata_client: EarthdataClient | None = None,
    query_cmr: bool = True,
) -> dict[str, Any]:
    """Check whether active datasets cover the AOI and date range, querying CMR for satellite granules."""
    start_dt, end_dt = validate_date_range(start_date, end_date)
    temporal_filter = to_cmr_temporal(start_date, end_date)
    client = earthdata_client or EarthdataClient()

    results: dict[str, Any] = {}
    for key, meta in registry.list_datasets(include_planned=True).items():
        bounds = meta.get("spatial_bounds", [-180.0, -90.0, 180.0, 90.0])
        spatial_ok = _bbox_intersects(aoi.bbox, bounds)

        cov_start = parse_to_utc(meta["temporal_coverage_start"])
        temporal_ok = end_dt >= cov_start and start_dt <= datetime.now(cov_start.tzinfo)

        entry: dict[str, Any] = {
            "name": meta.get("name"),
            "priority": meta.get("priority"),
            "status": meta.get("status"),
            "auth_required": meta.get("auth_required", False),
            "spatial_resolution": meta.get("spatial_resolution"),
            "spatial_coverage": spatial_ok,
            "temporal_coverage": temporal_ok,
            "covered": bool(spatial_ok and temporal_ok),
        }

        if query_cmr and meta.get("status") == "active" and "collections" in meta:
            collections_info: dict[str, Any] = {}
            for short_name in meta["collections"]:
                try:
                    granules = client.search_cmr_granules(
                        short_name=short_name,
                        bbox=aoi.bbox,
                        temporal=temporal_filter,
                        page_size=20,
                    )
                    collections_info[short_name] = {
                        "granules_found": len(granules),
                        "sample_titles": [g["title"] for g in granules[:3]],
                        "status": "AVAILABLE" if granules else "NO_GRANULES_FOUND",
                    }
                except Exception as exc:
                    collections_info[short_name] = {
                        "granules_found": 0,
                        "status": "CMR_QUERY_ERROR",
                        "error": str(exc),
                    }
            entry["cmr_collections"] = collections_info

        results[key] = entry

    return results

