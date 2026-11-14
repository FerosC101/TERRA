"""Data cleaning and scientific quality control checks for TERRA."""

from __future__ import annotations

from typing import Any

from validators.schema_validation import (
    QualityReport,
    QualityStatus,
    StandardizedObservationRecord,
)

# Physical bounds (hard invalidation outside) vs regional extreme thresholds (flag warning, retain value)
PHYSICAL_RULES: dict[str, dict[str, float]] = {
    "air_temperature_c": {"min": -90.0, "max": 65.0, "warn_low": 5.0, "warn_high": 40.0},
    "air_temperature_max_c": {"min": -90.0, "max": 65.0, "warn_low": 8.0, "warn_high": 42.0},
    "air_temperature_min_c": {"min": -90.0, "max": 65.0, "warn_low": 5.0, "warn_high": 35.0},
    "precipitation_mm": {"min": 0.0, "max": 2000.0, "warn_high": 100.0},
    "precipitation_imerg_mm": {"min": 0.0, "max": 2000.0, "warn_high": 100.0},
    "precipitation_rate_mm_hr": {"min": 0.0, "max": 500.0, "warn_high": 50.0},
    "et0_mm_day": {"min": 0.0, "max": 25.0, "warn_high": 12.0},
    "relative_humidity_pct": {"min": 0.0, "max": 100.0},
    "solar_radiation_mj_m2_day": {"min": 0.0, "max": 45.0, "warn_high": 35.0},
    "wind_speed_m_s": {"min": 0.0, "max": 120.0, "warn_high": 20.0},
    "surface_soil_wetness_index": {"min": 0.0, "max": 1.0},
    "rootzone_soil_wetness_index": {"min": 0.0, "max": 1.0},
    "soil_moisture_surface_m3_m3": {"min": 0.0, "max": 0.85, "warn_high": 0.65},
    "soil_moisture_rootzone_m3_m3": {"min": 0.0, "max": 0.85, "warn_high": 0.65},
}


def run_quality_checks(
    records: list[StandardizedObservationRecord],
    dataset_name: str,
) -> tuple[list[StandardizedObservationRecord], QualityReport]:
    """Validate records, deduplicate, preserve missingness and extreme weather."""
    cleaning_log: list[str] = []
    warnings: list[str] = []
    extreme_events: list[dict[str, Any]] = []

    seen_keys: set[tuple[str, str, str, str]] = set()
    cleaned_records: list[StandardizedObservationRecord] = []

    duplicate_count = 0
    missing_count = 0
    invalid_val_count = 0
    flagged_record_count = 0

    for rec in records:
        primary_source = rec.metadata.sources[0] if rec.metadata.sources else dataset_name
        primary_product = rec.metadata.product_names[0] if rec.metadata.product_names else primary_source
        dedup_key = (rec.location_id, primary_source, primary_product, rec.timestamp)
        if dedup_key in seen_keys:
            duplicate_count += 1
            cleaning_log.append(
                f"Removed duplicate observation for {primary_source}/{primary_product} at {rec.timestamp}"
            )
            continue
        seen_keys.add(dedup_key)

        rec_has_missing = False
        rec_has_warning = False
        rec_has_invalid = False

        for var_name, obs in rec.observations.items():
            # Sync missing flag if value is None
            if obs.value is None or obs.is_missing:
                obs.value = None
                obs.is_missing = True
                rec.flat_observations[var_name] = None
                missing_count += 1
                rec_has_missing = True
                continue

            rules = PHYSICAL_RULES.get(var_name)
            if rules:
                if obs.value < rules["min"] or obs.value > rules["max"]:
                    invalid_val_count += 1
                    rec_has_invalid = True
                    msg = (
                        f"Physically impossible {var_name}={obs.value} {obs.unit} "
                        f"at {rec.timestamp}; nullified (not replaced with 0)."
                    )
                    warnings.append(msg)
                    cleaning_log.append(msg)
                    obs.notes = (obs.notes + "; " if obs.notes else "") + "Invalid physical range -> nullified"
                    obs.value = None
                    obs.is_missing = True
                    rec.flat_observations[var_name] = None
                    continue

                # Check genuine extreme environmental events (RETAIN value, warn downstream)
                warn_high = rules.get("warn_high")
                warn_low = rules.get("warn_low")
                if (warn_high is not None and obs.value >= warn_high) or (
                    warn_low is not None and obs.value <= warn_low
                ):
                    rec_has_warning = True
                    extreme_events.append(
                        {
                            "timestamp": rec.timestamp,
                            "variable": var_name,
                            "value": obs.value,
                            "unit": obs.unit,
                            "source": obs.source_dataset,
                            "action": "RETAINED_AS_EXTREME_EVENT",
                        }
                    )
                    cleaning_log.append(
                        f"Flagged extreme environmental observation {var_name}={obs.value} {obs.unit} "
                        f"at {rec.timestamp} (retained)."
                    )

            # Check SMAP retrieval quality flag if present
            if var_name == "smap_retrieval_quality_flag" and obs.value is not None:
                flag_int = int(obs.value)
                if (flag_int & 1) != 0:
                    rec_has_warning = True
                    flagged_record_count += 1
                    warnings.append(
                        f"SMAP retrieval quality bit 0 set (flag={flag_int}) at {rec.timestamp}; retained with warning."
                    )

            rec.flat_observations[var_name] = obs.value

        # Determine per-record quality status
        if rec_has_invalid and all(o.value is None for o in rec.observations.values()):
            rec.metadata.quality_status = "INVALID"
        elif rec_has_missing:
            rec.metadata.quality_status = "INCOMPLETE"
        elif rec_has_warning:
            rec.metadata.quality_status = "VALID_WITH_WARNINGS"
        else:
            rec.metadata.quality_status = "VALID"

        cleaned_records.append(rec)

    if duplicate_count > 0:
        warnings.append(f"Deduplicated {duplicate_count} duplicate record(s).")

    # Compute overall dataset quality status
    total = len(cleaned_records)
    valid_non_empty = sum(1 for r in cleaned_records if r.metadata.quality_status != "INVALID")

    if total == 0 or valid_non_empty == 0:
        overall_status: QualityStatus = "INVALID"
        if total == 0:
            warnings.append(f"No records available for {dataset_name}.")
    elif missing_count > 0 or invalid_val_count > 0:
        overall_status = "INCOMPLETE"
    elif extreme_events or flagged_record_count > 0 or duplicate_count > 0:
        overall_status = "VALID_WITH_WARNINGS"
    else:
        overall_status = "VALID"

    report = QualityReport(
        dataset=dataset_name,
        status=overall_status,
        total_records=total,
        valid_records=valid_non_empty,
        missing_value_count=missing_count,
        invalid_value_count=invalid_val_count,
        duplicate_count=duplicate_count,
        extreme_events_flagged=extreme_events,
        warnings=warnings,
        cleaning_log=cleaning_log,
    )
    return cleaned_records, report

