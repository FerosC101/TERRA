"""Standardized variable names and physical unit conversions for TERRA."""

from __future__ import annotations

from typing import Any

STANDARD_VARIABLE_MAP: dict[str, dict[str, str]] = {
    # NASA POWER
    "T2M": {"name": "air_temperature_c", "unit": "degC", "category": "temperature"},
    "T2M_MAX": {"name": "air_temperature_max_c", "unit": "degC", "category": "temperature"},
    "T2M_MIN": {"name": "air_temperature_min_c", "unit": "degC", "category": "temperature"},
    "PRECTOTCORR": {"name": "precipitation_mm", "unit": "mm/day", "category": "precipitation"},
    "RH2M": {"name": "relative_humidity_pct", "unit": "%", "category": "meteorology"},
    "ALLSKY_SFC_SW_DWN": {
        "name": "solar_radiation_mj_m2_day",
        "unit": "MJ/m2/day",
        "category": "solar",
    },
    "WS2M": {"name": "wind_speed_m_s", "unit": "m/s", "category": "meteorology"},
    "GWETTOP": {
        "name": "surface_soil_wetness_index",
        "unit": "dimensionless",
        "category": "soil_moisture",
    },
    "GWETROOT": {
        "name": "rootzone_soil_wetness_index",
        "unit": "dimensionless",
        "category": "soil_moisture",
    },
    # GPM IMERG
    "precipitation": {"name": "precipitation_mm", "unit": "mm/day", "category": "precipitation"},
    "precipitationCal": {
        "name": "precipitation_rate_mm_hr",
        "unit": "mm/hr",
        "category": "precipitation",
    },
    "randomError": {
        "name": "precipitation_random_error_mm",
        "unit": "mm/day",
        "category": "precipitation",
    },
    "precipitation_cnt": {
        "name": "precipitation_valid_sample_count",
        "unit": "count",
        "category": "precipitation",
    },
    # SMAP
    "soil_moisture": {
        "name": "soil_moisture_surface_m3_m3",
        "unit": "m3/m3",
        "category": "soil_moisture",
    },
    "sm_surface": {
        "name": "soil_moisture_surface_m3_m3",
        "unit": "m3/m3",
        "category": "soil_moisture",
    },
    "sm_rootzone": {
        "name": "soil_moisture_rootzone_m3_m3",
        "unit": "m3/m3",
        "category": "soil_moisture",
    },
    "retrieval_qual_flag": {
        "name": "smap_retrieval_quality_flag",
        "unit": "bitmask",
        "category": "quality",
    },
}


def standardize_variable_name(raw_name: str) -> str:
    """Map raw NASA parameter name to TERRA canonical variable name."""
    entry = STANDARD_VARIABLE_MAP.get(raw_name)
    return entry["name"] if entry else raw_name.lower()


def convert_value_and_unit(
    raw_name: str,
    value: Any,
    source_unit: str | None = None,
) -> tuple[float | None, str]:
    """Convert raw numeric value into TERRA standard unit.

    Missing values (None / NaN) remain None and are never coerced to zero.
    """
    entry = STANDARD_VARIABLE_MAP.get(raw_name, {})
    target_unit = entry.get("unit", source_unit or "unknown")

    if value is None:
        return None, target_unit

    try:
        num = float(value)
    except (TypeError, ValueError):
        return None, target_unit

    if num != num:  # NaN check
        return None, target_unit

    unit_norm = (source_unit or "").strip().lower()

    # Temperature conversions
    if target_unit == "degC" and unit_norm in {"k", "kelvin", "degk"}:
        num = num - 273.15
    elif target_unit == "degC" and unit_norm in {"f", "degf", "fahrenheit"}:
        num = (num - 32.0) * (5.0 / 9.0)

    # Solar irradiance W/m2 -> MJ/m2/day
    if target_unit == "MJ/m2/day" and unit_norm in {"w/m2", "w/m^2", "w m-2"}:
        num = num * 0.0864

    # Precipitation rate conversions (keep accumulation mm/day distinct from rate mm/hr)
    if target_unit == "mm/day" and unit_norm in {"mm/s", "kg/m2/s", "kg m-2 s-1"}:
        num = num * 86400.0
    elif target_unit == "mm/hr" and unit_norm in {"mm/s", "kg/m2/s", "kg m-2 s-1"}:
        num = num * 3600.0

    # Soil moisture percent -> volumetric fraction m3/m3
    if target_unit == "m3/m3" and unit_norm in {"%", "percent", "pct"}:
        num = num / 100.0

    return round(num, 6), target_unit

