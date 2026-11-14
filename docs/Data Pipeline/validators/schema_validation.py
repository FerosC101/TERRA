"""Pydantic schemas defining TERRA's standardized observation format."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

QualityStatus = Literal["VALID", "VALID_WITH_WARNINGS", "INCOMPLETE", "INVALID"]


class VariableObservation(BaseModel):
    """Single environmental variable observation with full scientific provenance."""

    value: float | None = None
    unit: str
    raw_variable: str
    source_dataset: str
    product_name: str
    product_version: str
    spatial_resolution: str
    temporal_resolution: str
    observation_type: str  # e.g. "satellite", "reanalysis_satellite_assimilation", "field_sensor"
    quality_flag: str | int | None = None
    is_missing: bool = False
    extraction_mode: str | None = None
    notes: str | None = None


class RecordMetadata(BaseModel):
    """Provenance, coordinate, and quality metadata for a standardized record."""

    sources: list[str]
    product_names: list[str] = Field(default_factory=list)
    product_versions: dict[str, str] = Field(default_factory=dict)
    quality_status: QualityStatus = "VALID"
    quality_flags: dict[str, Any] = Field(default_factory=dict)
    observation_types: list[str] = Field(default_factory=list)
    spatial_resolution: dict[str, str] = Field(default_factory=dict)
    temporal_resolution: str
    centroid_lat: float
    centroid_lon: float
    retrieved_at: str
    processed_at: str
    processing_version: str = "1.0"
    raw_file: str | None = None

    @field_validator("centroid_lat")
    @classmethod
    def check_lat(cls, v: float) -> float:
        if not (-90.0 <= v <= 90.0):
            raise ValueError(f"Invalid centroid latitude: {v}")
        return v

    @field_validator("centroid_lon")
    @classmethod
    def check_lon(cls, v: float) -> float:
        if not (-180.0 <= v <= 180.0):
            raise ValueError(f"Invalid centroid longitude: {v}")
        return v


class StandardizedObservationRecord(BaseModel):
    """Unified TERRA observation record preserving native timestamps and units."""

    record_id: str
    location_id: str
    aoi_name: str
    timestamp: str  # UTC ISO-8601 of the actual observation
    temporal_resolution: str
    observations: dict[str, VariableObservation]
    flat_observations: dict[str, float | None] = Field(default_factory=dict)
    metadata: RecordMetadata

    @field_validator("timestamp")
    @classmethod
    def check_iso_timestamp(cls, v: str) -> str:
        if not v.endswith("Z") or "T" not in v:
            raise ValueError(f"Timestamp must be UTC ISO-8601 ending in 'Z', got {v!r}")
        return v


class QualityReport(BaseModel):
    """Dataset-level validation and transformation report."""

    dataset: str
    status: QualityStatus
    total_records: int
    valid_records: int
    missing_value_count: int = 0
    invalid_value_count: int = 0
    duplicate_count: int = 0
    extreme_events_flagged: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    cleaning_log: list[str] = Field(default_factory=list)


def validate_record_schema(record: dict[str, Any] | StandardizedObservationRecord) -> StandardizedObservationRecord:
    """Validate and coerce a dictionary or model into StandardizedObservationRecord."""
    if isinstance(record, StandardizedObservationRecord):
        return record
    return StandardizedObservationRecord.model_validate(record)

