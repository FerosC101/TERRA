"""Standardized variable names and physical unit conversions for TERRA."""

from __future__ import annotations

import math
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
    # Derived agro-meteorological variables
    "ET0": {
        "name": "et0_mm_day",
        "unit": "mm/day",
        "category": "evapotranspiration",
    },
    "et0_mm_day": {
        "name": "et0_mm_day",
        "unit": "mm/day",
        "category": "evapotranspiration",
    },
    "precipitation_imerg_mm": {
        "name": "precipitation_imerg_mm",
        "unit": "mm/day",
        "category": "precipitation",
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


def compute_fao56_et0(
    t_mean_c: float | None,
    rh_mean_pct: float | None,
    solar_mj_m2_day: float | None,
    wind_speed_2m_m_s: float | None,
    latitude_deg: float,
    day_of_year: int,
    elevation_m: float = 315.0,
    t_max_c: float | None = None,
    t_min_c: float | None = None,
) -> float | None:
    """Compute daily FAO-56 Penman-Monteith reference evapotranspiration (mm/day)."""
    if (
        t_mean_c is None
        or rh_mean_pct is None
        or solar_mj_m2_day is None
        or wind_speed_2m_m_s is None
    ):
        return None

    t_mean = float(t_mean_c)
    t_hi = float(t_max_c) if t_max_c is not None else t_mean
    t_lo = float(t_min_c) if t_min_c is not None else t_mean
    rh = max(1.0, min(100.0, float(rh_mean_pct)))
    rs = max(0.0, float(solar_mj_m2_day))
    u2 = max(0.0, float(wind_speed_2m_m_s))

    def _es_kpa(temp_c: float) -> float:
        return 0.6108 * math.exp((17.27 * temp_c) / (temp_c + 237.3))

    # Atmospheric pressure & psychrometric constant
    p_kpa = 101.3 * (((293.0 - 0.0065 * elevation_m) / 293.0) ** 5.26)
    gamma = 0.000665 * p_kpa

    # Vapor pressure & slope
    if t_max_c is not None and t_min_c is not None:
        es = (_es_kpa(t_hi) + _es_kpa(t_lo)) / 2.0
    else:
        es = _es_kpa(t_mean)
    ea = es * (rh / 100.0)
    delta = (4098.0 * _es_kpa(t_mean)) / ((t_mean + 237.3) ** 2)

    # Extraterrestrial & clear-sky radiation (Allen et al., 1998 Eq. 21-39)
    lat_rad = math.radians(latitude_deg)
    dr = 1.0 + 0.033 * math.cos((2.0 * math.pi * day_of_year) / 365.0)
    sol_dec = 0.409 * math.sin((2.0 * math.pi * day_of_year) / 365.0 - 1.39)
    cos_ws = max(-1.0, min(1.0, -math.tan(lat_rad) * math.tan(sol_dec)))
    ws = math.acos(cos_ws)
    ra = ((24.0 * 60.0) / math.pi) * 0.0820 * dr * (
        ws * math.sin(lat_rad) * math.sin(sol_dec)
        + math.cos(lat_rad) * math.cos(sol_dec) * math.sin(ws)
    )
    rso = max((0.75 + 2e-5 * elevation_m) * ra, 0.1)

    rns = 0.77 * rs
    rs_rso = max(0.3, min(1.0, rs / rso))
    tmax_k4 = (t_hi + 273.16) ** 4
    tmin_k4 = (t_lo + 273.16) ** 4
    rnl = (
        4.903e-9
        * ((tmax_k4 + tmin_k4) / 2.0)
        * (0.34 - 0.14 * math.sqrt(max(ea, 0.0)))
        * (1.35 * rs_rso - 0.35)
    )
    rn = rns - rnl

    numerator = 0.408 * delta * rn + gamma * (900.0 / (t_mean + 273.0)) * u2 * max(es - ea, 0.0)
    denominator = delta + gamma * (1.0 + 0.34 * u2)
    et0 = max(0.0, numerator / denominator)
    return round(et0, 4)


