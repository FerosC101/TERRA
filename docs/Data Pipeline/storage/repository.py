"""Standardized local storage repository (SQLite, Parquet, and JSON) for TERRA."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

import pandas as pd

from validators.schema_validation import QualityReport, StandardizedObservationRecord


class TerraRepository:
    """Persists processed and analysis-ready observations for pipeline & API access."""

    def __init__(self, data_dir: str | Path = "data") -> None:
        self.data_dir = Path(data_dir)
        self.processed_dir = self.data_dir / "processed"
        self.metadata_dir = self.data_dir / "metadata"
        self.processed_dir.mkdir(parents=True, exist_ok=True)
        self.metadata_dir.mkdir(parents=True, exist_ok=True)

        self.db_path = self.processed_dir / "terra.db"
        self.json_path = self.processed_dir / "terra_observations.json"
        self.merged_json_path = self.processed_dir / "terra_daily_merged.json"
        self.parquet_path = self.processed_dir / "terra_observations.parquet"
        self.report_path = self.metadata_dir / "pipeline_report.json"
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS observations (
                    record_id TEXT PRIMARY KEY,
                    location_id TEXT NOT NULL,
                    aoi_name TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    temporal_resolution TEXT NOT NULL,
                    primary_source TEXT NOT NULL,
                    quality_status TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_obs_time ON observations(location_id, timestamp)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_obs_source ON observations(primary_source)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS quality_reports (
                    dataset TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    report_json TEXT NOT NULL
                )
                """
            )

    def save_dataset_processed(
        self,
        dataset_key: str,
        aoi_id: str,
        start_date: str,
        end_date: str,
        records: list[StandardizedObservationRecord],
    ) -> Path:
        """Write dataset-specific processed layer JSON file."""
        safe_start = start_date.replace("-", "")
        safe_end = end_date.replace("-", "")
        out_path = self.processed_dir / f"{dataset_key.lower()}_{aoi_id}_{safe_start}_{safe_end}.json"
        payload = [r.model_dump() for r in records]
        with out_path.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2)
        return out_path

    def upsert_observations(self, records: list[StandardizedObservationRecord]) -> int:
        """Upsert standardized records into SQLite and refresh JSON/Parquet exports."""
        if not records:
            return 0

        with sqlite3.connect(self.db_path) as conn:
            for rec in records:
                primary_source = rec.metadata.sources[0] if rec.metadata.sources else "UNKNOWN"
                conn.execute(
                    """
                    INSERT OR REPLACE INTO observations (
                        record_id, location_id, aoi_name, timestamp,
                        temporal_resolution, primary_source, quality_status, payload_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        rec.record_id,
                        rec.location_id,
                        rec.aoi_name,
                        rec.timestamp,
                        rec.temporal_resolution,
                        primary_source,
                        rec.metadata.quality_status,
                        json.dumps(rec.model_dump()),
                    ),
                )
        self._refresh_analysis_ready_files()
        return len(records)

    @staticmethod
    def _build_daily_merged(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Merge multi-source observations per (location_id, YYYY-MM-DD) without clobbering POWER vs IMERG rain."""
        severity = {"VALID": 1, "VALID_WITH_WARNINGS": 2, "INCOMPLETE": 3, "INVALID": 4}
        grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
        for rec in records:
            key = (str(rec["location_id"]), str(rec["timestamp"])[:10])
            grouped.setdefault(key, []).append(rec)

        merged_rows: list[dict[str, Any]] = []
        for (location_id, date_str), day_recs in sorted(grouped.items(), key=lambda item: (item[0][1], item[0][0])):
            sources: list[str] = []
            product_names: list[str] = []
            source_statuses: dict[str, str] = {}
            quality_flags: dict[str, Any] = {}
            merged_obs: dict[str, Any] = {}
            merged_flat: dict[str, Any] = {}
            worst_status = "VALID"
            aoi_name = day_recs[0].get("aoi_name", "")

            for rec in day_recs:
                meta = rec.get("metadata", {})
                rec_sources = meta.get("sources", [])
                primary_source = rec_sources[0] if rec_sources else "UNKNOWN"
                for src in rec_sources:
                    if src not in sources:
                        sources.append(src)
                for prod in meta.get("product_names", []):
                    if prod not in product_names:
                        product_names.append(prod)

                rec_status = str(meta.get("quality_status", "VALID"))
                source_statuses[primary_source] = rec_status
                if severity.get(rec_status, 0) > severity.get(worst_status, 0):
                    worst_status = rec_status
                if meta.get("quality_flags"):
                    quality_flags[primary_source] = meta["quality_flags"]

                is_gpm = primary_source == "GPM_IMERG" or "GPM_IMERG" in rec_sources
                for var_name, obs in rec.get("observations", {}).items():
                    target_key = (
                        "precipitation_imerg_mm"
                        if is_gpm and var_name == "precipitation_mm"
                        else var_name
                    )
                    merged_obs[target_key] = obs
                for var_name, val in rec.get("flat_observations", {}).items():
                    target_key = (
                        "precipitation_imerg_mm"
                        if is_gpm and var_name == "precipitation_mm"
                        else var_name
                    )
                    merged_flat[target_key] = val

            merged_rows.append(
                {
                    "date": date_str,
                    "timestamp": f"{date_str}T00:00:00Z",
                    "location_id": location_id,
                    "aoi_name": aoi_name,
                    "sources": sources,
                    "product_names": product_names,
                    "quality_status": worst_status,
                    "source_quality_statuses": source_statuses,
                    "quality_flags": quality_flags,
                    "flat_observations": merged_flat,
                    "observations": merged_obs,
                }
            )
        return merged_rows

    def _refresh_analysis_ready_files(self) -> None:
        all_records = self.query_observations()
        with self.json_path.open("w", encoding="utf-8") as fh:
            json.dump(all_records, fh, indent=2)

        merged_records = self._build_daily_merged(all_records)
        with self.merged_json_path.open("w", encoding="utf-8") as fh:
            json.dump(merged_records, fh, indent=2)

        if all_records:
            rows = []
            for rec in all_records:
                row = {
                    "record_id": rec["record_id"],
                    "location_id": rec["location_id"],
                    "aoi_name": rec["aoi_name"],
                    "timestamp": rec["timestamp"],
                    "temporal_resolution": rec["temporal_resolution"],
                    "sources": ",".join(rec["metadata"]["sources"]),
                    "quality_status": rec["metadata"]["quality_status"],
                }
                for k, v in rec.get("flat_observations", {}).items():
                    row[k] = v
                rows.append(row)
            df = pd.DataFrame(rows)
            df.to_parquet(self.parquet_path, index=False)

    def save_quality_report(self, report: QualityReport) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO quality_reports (dataset, status, report_json)
                VALUES (?, ?, ?)
                """,
                (report.dataset, report.status, json.dumps(report.model_dump())),
            )

    def get_quality_reports(self) -> dict[str, dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute("SELECT dataset, report_json FROM quality_reports").fetchall()
        return {ds: json.loads(raw) for ds, raw in rows}

    def save_pipeline_report(self, report: dict[str, Any]) -> Path:
        with self.report_path.open("w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)
        return self.report_path

    def get_pipeline_report(self) -> dict[str, Any] | None:
        if not self.report_path.exists():
            return None
        with self.report_path.open("r", encoding="utf-8") as fh:
            return json.load(fh)

    def query_observations(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        dataset: str | None = None,
        variable: str | None = None,
        aoi_id: str | None = None,
        quality_status: str | None = None,
    ) -> list[dict[str, Any]]:
        """Query stored standardized observations with optional filters."""
        clauses: list[str] = []
        params: list[Any] = []

        if aoi_id:
            clauses.append("location_id = ?")
            params.append(aoi_id)
        if dataset:
            clauses.append("UPPER(primary_source) = UPPER(?)")
            params.append(dataset)
        if quality_status:
            clauses.append("UPPER(quality_status) = UPPER(?)")
            params.append(quality_status)
        if start_date:
            s_iso = f"{start_date}T00:00:00Z" if "T" not in start_date else start_date
            clauses.append("timestamp >= ?")
            params.append(s_iso)
        if end_date:
            e_iso = f"{end_date}T23:59:59Z" if "T" not in end_date else end_date
            clauses.append("timestamp <= ?")
            params.append(e_iso)

        sql = "SELECT payload_json FROM observations"
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY timestamp ASC, primary_source ASC"

        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(sql, params).fetchall()

        results = [json.loads(r[0]) for r in rows]
        if variable:
            results = [
                rec
                for rec in results
                if variable in rec.get("observations", {})
                or variable in rec.get("flat_observations", {})
            ]
        return results

    def query_daily_merged(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        aoi_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Query harmonized daily records merging NASA POWER, GPM IMERG, and SMAP."""
        records = self.query_observations(start_date=start_date, end_date=end_date, aoi_id=aoi_id)
        return self._build_daily_merged(records)


