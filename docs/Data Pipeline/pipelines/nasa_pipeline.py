"""Main TERRA NASA Data Pipeline orchestrating discovery, retrieval, QC, and storage."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from collectors.earthdata_client import EarthdataClient
from collectors.gpm import GpmImergCollector
from collectors.nasa_power import NasaPowerCollector
from collectors.smap import SmapCollector
from discovery.coverage_checker import check_dataset_coverage
from discovery.dataset_registry import load_dataset_registry
from processors.spatial_processor import AOIInfo, load_and_validate_aoi, load_farm_config
from storage.cache import FileCache
from storage.repository import TerraRepository
from validators.quality_checks import run_quality_checks
from validators.schema_validation import StandardizedObservationRecord

logger = logging.getLogger("terra.pipeline")


class TerraNasaPipeline:
    """Executes AOI-scoped NASA data collection, cleaning, harmonization, and storage."""

    def __init__(
        self,
        farm_config_path: str | Path = "config/farm_config.yaml",
        datasets_config_path: str | Path = "config/datasets.yaml",
        data_dir: str | Path = "data",
        base_dir: str | Path | None = None,
        client: EarthdataClient | None = None,
    ) -> None:
        self.base_dir = Path(base_dir).resolve() if base_dir else Path.cwd().resolve()
        load_dotenv(self.base_dir / ".env", override=False)

        self.farm_config_path = self._resolve_path(farm_config_path)
        self.datasets_config_path = self._resolve_path(datasets_config_path)
        self.data_dir = self._resolve_path(data_dir)

        self.farm_config = load_farm_config(self.farm_config_path)
        self.aoi: AOIInfo = load_and_validate_aoi(self.farm_config_path, base_dir=self.base_dir)
        self.registry = load_dataset_registry(self.datasets_config_path)

        self.client = client or EarthdataClient()
        self.cache = FileCache(data_dir=self.data_dir)
        self.repo = TerraRepository(data_dir=self.data_dir)

        self.power_collector = NasaPowerCollector(
            client=self.client,
            cache=self.cache,
            dataset_meta=self.registry.get("NASA_POWER"),
        )
        self.gpm_collector = GpmImergCollector(
            client=self.client,
            cache=self.cache,
            dataset_meta=self.registry.get("GPM_IMERG"),
        )
        self.smap_collector = SmapCollector(
            client=self.client,
            cache=self.cache,
            dataset_meta=self.registry.get("SMAP"),
        )

    def _resolve_path(self, p: str | Path) -> Path:
        path = Path(p)
        return path if path.is_absolute() else (self.base_dir / path).resolve()

    def discover(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        query_cmr: bool = True,
    ) -> dict[str, Any]:
        """Step 1-3: Validate AOI and verify dataset & CMR granule coverage."""
        s_date = start_date or str(self.farm_config["start_date"])
        e_date = end_date or str(self.farm_config["end_date"])
        coverage = check_dataset_coverage(
            aoi=self.aoi,
            start_date=s_date,
            end_date=e_date,
            registry=self.registry,
            earthdata_client=self.client,
            query_cmr=query_cmr,
        )
        out = {
            "aoi": self.aoi.to_dict(),
            "date_range": {"start_date": s_date, "end_date": e_date},
            "earthdata_credentials_configured": self.client.has_credentials(),
            "datasets": coverage,
        }
        discovery_path = self.cache.metadata_dir / "latest_discovery.json"
        with discovery_path.open("w", encoding="utf-8") as fh:
            json.dump(out, fh, indent=2)
        return out

    def download(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        datasets: list[str] | None = None,
        force_refresh: bool = False,
    ) -> dict[str, Any]:
        """Step 4: Retrieve raw files/granules without processing."""
        s_date = start_date or str(self.farm_config["start_date"])
        e_date = end_date or str(self.farm_config["end_date"])
        selected = {d.upper() for d in datasets} if datasets else {"NASA_POWER", "GPM_IMERG", "SMAP"}
        raw_outputs: dict[str, Any] = {}

        if "NASA_POWER" in selected:
            power_cfg = self.farm_config.get("pipeline", {}).get("nasa_power", {})
            raw_outputs["NASA_POWER"] = self.power_collector.retrieve(
                aoi=self.aoi,
                start_date=s_date,
                end_date=e_date,
                parameters=power_cfg.get("parameters"),
                community=power_cfg.get("community", "AG"),
                force_refresh=force_refresh,
            )

        if "GPM_IMERG" in selected:
            gpm_cfg = self.farm_config.get("pipeline", {}).get("gpm_imerg", {})
            product = gpm_cfg.get("preferred_product", "GPM_3IMERGDF")
            raw_outputs["GPM_IMERG"] = self.gpm_collector.retrieve(
                aoi=self.aoi,
                start_date=s_date,
                end_date=e_date,
                product=product,
                force_refresh=force_refresh,
            )

        if "SMAP" in selected:
            smap_cfg = self.farm_config.get("pipeline", {}).get("smap", {})
            products = smap_cfg.get("products", ["SPL3SMP_E"])
            smap_runs = {}
            for prod in products:
                smap_runs[prod] = self.smap_collector.retrieve(
                    aoi=self.aoi,
                    start_date=s_date,
                    end_date=e_date,
                    product=prod,
                    force_refresh=force_refresh,
                )
            raw_outputs["SMAP"] = smap_runs

        return raw_outputs

    def process_and_validate(
        self,
        raw_outputs: dict[str, Any],
        start_date: str,
        end_date: str,
    ) -> dict[str, Any]:
        """Steps 5-7: Preprocess raw files, run quality control, and store standardized records."""
        dataset_summaries: dict[str, Any] = {}
        all_valid_records: list[StandardizedObservationRecord] = []

        # 1. NASA POWER
        if "NASA_POWER" in raw_outputs:
            raw_power = raw_outputs["NASA_POWER"]
            recs = self.power_collector.process(raw_power, self.aoi)
            cleaned, q_report = run_quality_checks(recs, "NASA_POWER")
            self.repo.save_dataset_processed("NASA_POWER", self.aoi.location_id, start_date, end_date, cleaned)
            self.repo.save_quality_report(q_report)
            all_valid_records.extend(cleaned)
            dataset_summaries["NASA_POWER"] = {
                "retrieval_status": raw_power.get("status"),
                "records_processed": len(cleaned),
                "quality_status": q_report.status,
                "missing_value_count": q_report.missing_value_count,
                "warnings": q_report.warnings,
            }

        # 2. GPM IMERG
        if "GPM_IMERG" in raw_outputs:
            raw_gpm = raw_outputs["GPM_IMERG"]
            gpm_recs = self.gpm_collector.process(raw_gpm, self.aoi)
            if gpm_recs:
                cleaned_gpm, q_gpm = run_quality_checks(gpm_recs, "GPM_IMERG")
                self.repo.save_dataset_processed("GPM_IMERG", self.aoi.location_id, start_date, end_date, cleaned_gpm)
                self.repo.save_quality_report(q_gpm)
                all_valid_records.extend(cleaned_gpm)
                dataset_summaries["GPM_IMERG"] = {
                    "retrieval_status": raw_gpm.get("status"),
                    "product": raw_gpm.get("product"),
                    "cmr_granules_discovered": raw_gpm.get("discovery", {}).get("granule_count", 0),
                    "records_processed": len(cleaned_gpm),
                    "quality_status": q_gpm.status,
                    "warnings": q_gpm.warnings,
                }
            else:
                dataset_summaries["GPM_IMERG"] = {
                    "retrieval_status": raw_gpm.get("status"),
                    "product": raw_gpm.get("product"),
                    "cmr_granules_discovered": raw_gpm.get("discovery", {}).get("granule_count", 0),
                    "records_processed": 0,
                    "quality_status": "PENDING_DATA",
                    "message": raw_gpm.get("message", "No granule files available for processing."),
                }

        # 3. SMAP
        if "SMAP" in raw_outputs:
            smap_runs = raw_outputs["SMAP"]
            smap_all_recs: list[StandardizedObservationRecord] = []
            smap_prod_status: dict[str, Any] = {}
            for prod, raw_smap in smap_runs.items():
                recs = self.smap_collector.process(raw_smap, self.aoi)
                smap_all_recs.extend(recs)
                smap_prod_status[prod] = {
                    "retrieval_status": raw_smap.get("status"),
                    "cmr_granules_discovered": raw_smap.get("discovery", {}).get("granule_count", 0),
                    "records_processed": len(recs),
                    "message": raw_smap.get("message"),
                }

            if smap_all_recs:
                cleaned_smap, q_smap = run_quality_checks(smap_all_recs, "SMAP")
                self.repo.save_dataset_processed("SMAP", self.aoi.location_id, start_date, end_date, cleaned_smap)
                self.repo.save_quality_report(q_smap)
                all_valid_records.extend(cleaned_smap)
                dataset_summaries["SMAP"] = {
                    "retrieval_status": "PROCESSED",
                    "products": smap_prod_status,
                    "records_processed": len(cleaned_smap),
                    "quality_status": q_smap.status,
                    "warnings": q_smap.warnings,
                }
            else:
                dataset_summaries["SMAP"] = {
                    "retrieval_status": (
                        "AWAITING_CREDENTIALS"
                        if not self.client.has_credentials()
                        else "NO_FILES_RETRIEVED"
                    ),
                    "products": smap_prod_status,
                    "records_processed": 0,
                    "quality_status": "PENDING_DATA",
                }

        stored_count = self.repo.upsert_observations(all_valid_records)

        pipeline_report = {
            "run_timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "aoi": {
                "location_id": self.aoi.location_id,
                "aoi_name": self.aoi.aoi_name,
                "area_km2": round(self.aoi.area_km2, 4),
                "area_ha": round(self.aoi.area_ha, 2),
                "centroid": {
                    "lat": round(self.aoi.centroid_lat, 6),
                    "lon": round(self.aoi.centroid_lon, 6),
                },
                "bbox": [round(v, 6) for v in self.aoi.bbox],
            },
            "date_range": {"start_date": start_date, "end_date": end_date},
            "earthdata_credentials_configured": self.client.has_credentials(),
            "total_records_upserted": stored_count,
            "datasets": dataset_summaries,
            "storage_outputs": {
                "sqlite_db": str(self.repo.db_path),
                "json_repository": str(self.repo.json_path),
                "daily_merged_json": str(self.repo.merged_json_path),
                "parquet_repository": str(self.repo.parquet_path),
            },
        }
        self.repo.save_pipeline_report(pipeline_report)
        return pipeline_report

    def run(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        datasets: list[str] | None = None,
        force_refresh: bool = False,
        query_cmr_discovery: bool = True,
    ) -> dict[str, Any]:
        """Execute full end-to-end TERRA pipeline."""
        s_date = start_date or str(self.farm_config["start_date"])
        e_date = end_date or str(self.farm_config["end_date"])

        if query_cmr_discovery:
            self.discover(start_date=s_date, end_date=e_date, query_cmr=True)

        raw_outputs = self.download(
            start_date=s_date,
            end_date=e_date,
            datasets=datasets,
            force_refresh=force_refresh,
        )
        return self.process_and_validate(raw_outputs, s_date, e_date)

