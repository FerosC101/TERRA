"""Comprehensive test suite for TERRA NASA Earth Observation Data Pipeline."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import h5py
import numpy as np
import pytest
import xarray as xr
from fastapi.testclient import TestClient

from api.routes import create_app
from collectors.earthdata_client import (
    build_gpm_opendap_subset_url,
    build_smap_l3_opendap_subset_url,
)
from collectors.gpm import GpmImergCollector
from collectors.nasa_power import NasaPowerCollector
from collectors.smap import SmapCollector, decode_smap_qual_flag
from processors.spatial_processor import load_and_validate_aoi
from processors.temporal_processor import normalize_timestamp, validate_date_range
from processors.unit_converter import compute_fao56_et0, convert_value_and_unit
from storage.cache import FileCache
from storage.repository import TerraRepository
from validators.quality_checks import run_quality_checks
from validators.schema_validation import validate_record_schema

PROJECT_ROOT = Path(__file__).resolve().parent.parent


class DummyClient:
    """Offline mock client recording calls without hitting live NASA servers."""

    def __init__(
        self,
        power_payload: dict[str, Any] | None = None,
        cmr_granules: list[dict[str, Any]] | None = None,
        has_creds: bool = False,
    ) -> None:
        self.power_payload = power_payload or {}
        self.cmr_granules = cmr_granules or []
        self._has_creds = has_creds
        self.get_json_calls = 0

    def has_credentials(self) -> bool:
        return self._has_creds

    def get_json(self, url: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self.get_json_calls += 1
        return self.power_payload

    def search_cmr_granules(
        self, short_name: str, bbox: list[float], temporal: str, **kwargs: Any
    ) -> list[dict[str, Any]]:
        return self.cmr_granules


def _sample_power_payload(include_missing: bool = False, include_extreme: bool = False) -> dict[str, Any]:
    return {
        "header": {"api": {"version": "v2.5.1"}, "fill_value": -999.0},
        "parameters": {
            "T2M": {"units": "C"},
            "PRECTOTCORR": {"units": "mm/day"},
            "RH2M": {"units": "%"},
            "ALLSKY_SFC_SW_DWN": {"units": "MJ/m^2/day"},
            "GWETTOP": {"units": "1"},
        },
        "properties": {
            "parameter": {
                "T2M": {"20240101": 25.4, "20240102": -999.0 if include_missing else 26.1},
                "PRECTOTCORR": {"20240101": 145.0 if include_extreme else 4.2, "20240102": 0.0},
                "RH2M": {"20240101": 81.5, "20240102": 78.2},
                "ALLSKY_SFC_SW_DWN": {"20240101": 16.4, "20240102": 18.9},
                "GWETTOP": {"20240101": 0.62, "20240102": 0.60},
            }
        },
    }


def test_aoi_validation_real_lipa_geojson() -> None:
    aoi = load_and_validate_aoi(PROJECT_ROOT / "config/farm_config.yaml", base_dir=PROJECT_ROOT)
    assert aoi.is_valid is True
    assert aoi.aoi_name == "Lipa_Cropland_AOI"
    assert aoi.crs == "EPSG:4326"
    assert 1.2 <= aoi.area_km2 <= 1.5
    assert 13.97 < aoi.centroid_lat < 13.99
    assert 121.17 < aoi.centroid_lon < 121.20


def test_aoi_validation_rejects_unclosed_and_invalid_coords(tmp_path: Path) -> None:
    bad_geo = tmp_path / "unclosed.geojson"
    bad_geo.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [[[121.1, 13.9], [121.2, 13.9], [121.2, 14.0], [121.1, 14.0]]],
                        },
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="not closed"):
        load_and_validate_aoi({"geojson_path": str(bad_geo)}, base_dir=tmp_path)

    oob_geo = tmp_path / "oob.geojson"
    oob_geo.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [[[200.0, 13.9], [201.0, 13.9], [201.0, 14.0], [200.0, 13.9]]],
                        },
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="Longitude out of"):
        load_and_validate_aoi({"geojson_path": str(oob_geo)}, base_dir=tmp_path)


def test_unit_conversions_and_rate_vs_accumulation() -> None:
    val_c, unit_c = convert_value_and_unit("T2M", 300.15, "K")
    assert val_c == pytest.approx(27.0, abs=1e-4)
    assert unit_c == "degC"

    val_mj, unit_mj = convert_value_and_unit("ALLSKY_SFC_SW_DWN", 200.0, "W/m2")
    assert val_mj == pytest.approx(17.28, abs=1e-4)
    assert unit_mj == "MJ/m2/day"

    # Rate vs accumulation units stay distinct
    acc_val, acc_unit = convert_value_and_unit("precipitation", 0.0001, "kg/m2/s")
    rate_val, rate_unit = convert_value_and_unit("precipitationCal", 0.0001, "kg/m2/s")
    assert acc_unit == "mm/day"
    assert rate_unit == "mm/hr"
    assert acc_val == pytest.approx(8.64, abs=1e-4)
    assert rate_val == pytest.approx(0.36, abs=1e-4)

    # Missing remains None, never coerced to 0
    none_val, _ = convert_value_and_unit("PRECTOTCORR", None, "mm/day")
    assert none_val is None


def test_timestamp_handling_and_date_validation() -> None:
    assert normalize_timestamp("20240105") == "2024-01-05T00:00:00Z"
    assert normalize_timestamp("2024-01-05") == "2024-01-05T00:00:00Z"
    assert normalize_timestamp("2024-01-05T06:30:00Z") == "2024-01-05T06:30:00Z"
    with pytest.raises(ValueError, match="must not be after"):
        validate_date_range("2024-02-01", "2024-01-01")


def test_nasa_power_missing_values_caching_duplicates_and_extremes(tmp_path: Path) -> None:
    aoi = load_and_validate_aoi(PROJECT_ROOT / "config/farm_config.yaml", base_dir=PROJECT_ROOT)
    cache = FileCache(data_dir=tmp_path / "data")
    client = DummyClient(power_payload=_sample_power_payload(include_missing=True, include_extreme=True))
    collector = NasaPowerCollector(client=client, cache=cache)

    res1 = collector.retrieve(aoi, "2024-01-01", "2024-01-02")
    res2 = collector.retrieve(aoi, "2024-01-01", "2024-01-02")
    assert res1["status"] == "RETRIEVED_LIVE"
    assert res2["status"] == "RETRIEVED_FROM_CACHE"
    assert client.get_json_calls == 1

    recs = collector.process(res1, aoi)
    assert len(recs) == 2

    # Inject a duplicate record and verify deduplication + missingness + extreme retention
    recs_with_dup = recs + [recs[0].model_copy(deep=True)]
    cleaned, report = run_quality_checks(recs_with_dup, "NASA_POWER")
    assert len(cleaned) == 2
    assert report.duplicate_count == 1
    assert report.missing_value_count == 1
    assert report.status == "INCOMPLETE"
    # Missing value must stay None (not 0)
    assert cleaned[1].observations["air_temperature_c"].value is None
    assert cleaned[1].observations["air_temperature_c"].is_missing is True
    # Extreme 145 mm/day precipitation must be retained and flagged
    assert cleaned[0].observations["precipitation_mm"].value == pytest.approx(145.0)
    assert len(report.extreme_events_flagged) == 1
    # Schema validation passes
    validate_record_schema(cleaned[0].model_dump())


def test_gpm_netcdf_subset_and_awaiting_credentials(tmp_path: Path) -> None:
    aoi = load_and_validate_aoi(PROJECT_ROOT / "config/farm_config.yaml", base_dir=PROJECT_ROOT)
    cache = FileCache(data_dir=tmp_path / "data")
    client = DummyClient(
        cmr_granules=[{"id": "G1", "title": "3B-DAY.MS.MRG.3IMERG.20240101-S000000-E235959.V07B.nc4"}],
        has_creds=False,
    )
    gpm = GpmImergCollector(client=client, cache=cache)

    # Without local files or credentials, cleanly reports AWAITING_CREDENTIALS
    pending = gpm.retrieve(aoi, "2024-01-01", "2024-01-01")
    assert pending["status"] == "AWAITING_CREDENTIALS"
    assert pending["discovery"]["granule_count"] == 1

    # Write a synthetic NetCDF4 granule with coarse 0.1 deg grid covering Lipa
    raw_nc = cache.raw_path("GPM_IMERG", "3B-DAY.MS.MRG.3IMERG.20240101-S000000-E235959.V07B.nc4")
    ds = xr.Dataset(
        data_vars={
            "precipitation": (("lat", "lon"), np.array([[11.2, 14.8], [18.4, 9.5]]), {"units": "mm/day"}),
            "randomError": (("lat", "lon"), np.array([[1.1, 1.3], [1.5, 1.0]]), {"units": "mm/day"}),
            "precipitation_cnt": (("lat", "lon"), np.array([[48, 48], [48, 48]]), {"units": "count"}),
        },
        coords={"lat": [13.95, 14.05], "lon": [121.15, 121.25]},
    )
    ds.to_netcdf(raw_nc)

    loaded = gpm.retrieve(aoi, "2024-01-01", "2024-01-01")
    assert loaded["status"] == "LOADED_FROM_LOCAL_RAW"
    recs = gpm.process(loaded, aoi)
    assert len(recs) == 1

    # Verify 2x2 IDW around Lipa centroid + preserved nearest_pixel and neighborhood_max
    grid_points = [
        (13.95, 121.15, 11.2),
        (13.95, 121.25, 14.8),
        (14.05, 121.15, 18.4),
        (14.05, 121.25, 9.5),
    ]
    weights = [
        1.0 / (math.hypot(glat - aoi.centroid_lat, glon - aoi.centroid_lon) ** 2)
        for glat, glon, _ in grid_points
    ]
    expected_idw = sum(w * v for (_, _, v), w in zip(grid_points, weights)) / sum(weights)

    precip_obs = recs[0].observations["precipitation_mm"]
    assert precip_obs.value == pytest.approx(expected_idw, abs=1e-4)
    assert recs[0].observations["precipitation_imerg_mm"].value == pytest.approx(expected_idw, abs=1e-4)
    assert precip_obs.extraction_mode == "idw_2x2_coarse_grid"
    assert "nearest_pixel=11.2" in (precip_obs.notes or "")
    assert "neighborhood_max=18.4" in (precip_obs.notes or "")
    assert precip_obs.observation_type == "satellite"


def test_smap_hdf5_subset_and_quality_flags(tmp_path: Path) -> None:
    aoi = load_and_validate_aoi(PROJECT_ROOT / "config/farm_config.yaml", base_dir=PROJECT_ROOT)
    cache = FileCache(data_dir=tmp_path / "data")
    client = DummyClient(has_creds=False)
    smap = SmapCollector(client=client, cache=cache)

    h5_path = cache.raw_path("SMAP", "SMAP_L3_SM_P_E_20240101_R19240_001.h5")
    with h5py.File(h5_path, "w") as hf:
        grp = hf.create_group("Soil_Moisture_Retrieval_Data_AM")
        grp.create_dataset("latitude", data=np.array([[13.96, 13.96], [14.04, 14.04]]))
        grp.create_dataset("longitude", data=np.array([[121.16, 121.24], [121.16, 121.24]]))
        sm = grp.create_dataset("soil_moisture", data=np.array([[0.34, 0.29], [0.31, 0.28]]))
        sm.attrs["units"] = b"m3/m3"
        sm.attrs["_FillValue"] = np.float32(-9999.0)
        grp.create_dataset("retrieval_qual_flag", data=np.array([[1, 0], [0, 0]]))

    loaded = smap.retrieve(aoi, "2024-01-01", "2024-01-01", product="SPL3SMP_E")
    assert loaded["status"] == "LOADED_FROM_LOCAL_RAW"
    recs = smap.process(loaded, aoi)
    assert len(recs) == 1
    cleaned, report = run_quality_checks(recs, "SMAP")
    assert cleaned[0].observations["soil_moisture_surface_m3_m3"].value == pytest.approx(0.34)
    assert cleaned[0].observations["soil_moisture_surface_m3_m3"].observation_type == "satellite"
    assert report.status == "VALID_WITH_WARNINGS"  # bit 0 of retrieval_qual_flag=1 triggers warning

    decoded_1 = cleaned[0].metadata.quality_flags["retrieval_qual_decoded"]
    assert decoded_1["bit_0_not_recommended"] is True
    assert "retrieval_not_recommended" in decoded_1["active_bits"]

    decoded_9 = decode_smap_qual_flag(9)
    assert decoded_9 is not None
    assert decoded_9["bit_0_not_recommended"] is True
    assert decoded_9["bit_3_surface_advisory"] is True
    assert decoded_9["bit_1_not_attempted"] is False


def test_opendap_subset_url_builders_and_fao56_et0() -> None:
    aoi = load_and_validate_aoi(PROJECT_ROOT / "config/farm_config.yaml", base_dir=PROJECT_ROOT)

    gpm_url = build_gpm_opendap_subset_url(
        "https://opendap.earthdata.nasa.gov/collections/C1/granules/gpm_test.nc4.dmr.html",
        aoi.bbox,
    )
    assert ".dap.nc4?dap4.ce=" in gpm_url
    assert "/lat[1037:1041];/lon[3009:3013]" in gpm_url
    assert "/precipitation[0:0][3009:3013][1037:1041]" in gpm_url

    smap_url = build_smap_l3_opendap_subset_url(
        "https://opendap.earthdata.nasa.gov/collections/C2/granules/SMAP_L3_SM_P_E_test.h5",
        aoi.bbox,
    )
    assert ".dap.nc4?dap4.ce=" in smap_url
    assert "/Soil_Moisture_Retrieval_Data_AM/soil_moisture[612:617][3223:3228]" in smap_url
    assert "/Soil_Moisture_Retrieval_Data_PM/soil_moisture_pm[612:617][3223:3228]" in smap_url

    et0 = compute_fao56_et0(
        t_mean_c=25.4,
        t_max_c=29.0,
        t_min_c=21.8,
        rh_mean_pct=80.0,
        solar_mj_m2_day=16.5,
        wind_speed_2m_m_s=2.4,
        latitude_deg=aoi.centroid_lat,
        day_of_year=2,
        elevation_m=315.0,
    )
    assert et0 is not None
    assert 2.0 <= et0 <= 6.0
    assert compute_fao56_et0(25.4, 80.0, 16.5, None, aoi.centroid_lat, 2) is None


def test_fastapi_endpoints_with_populated_repository(tmp_path: Path) -> None:
    aoi = load_and_validate_aoi(PROJECT_ROOT / "config/farm_config.yaml", base_dir=PROJECT_ROOT)
    data_dir = tmp_path / "data"
    cache = FileCache(data_dir=data_dir)
    repo = TerraRepository(data_dir=data_dir)

    client = DummyClient(power_payload=_sample_power_payload())
    power = NasaPowerCollector(client=client, cache=cache)
    raw = power.retrieve(aoi, "2024-01-01", "2024-01-02")
    recs = power.process(raw, aoi)
    cleaned, q_rep = run_quality_checks(recs, "NASA_POWER")
    repo.save_quality_report(q_rep)
    repo.upsert_observations(cleaned)
    repo.save_pipeline_report({"aoi": aoi.to_dict(), "total_records_upserted": len(cleaned)})

    app = create_app(
        farm_config_path=PROJECT_ROOT / "config/farm_config.yaml",
        datasets_config_path=PROJECT_ROOT / "config/datasets.yaml",
        data_dir=data_dir,
        base_dir=PROJECT_ROOT,
    )
    api_client = TestClient(app)

    assert api_client.get("/health").status_code == 200
    assert api_client.get("/aoi").json()["aoi_name"] == "Lipa_Cropland_AOI"
    assert "NASA_POWER" in api_client.get("/datasets").json()["datasets"]

    obs_resp = api_client.get("/observations", params={"start_date": "2024-01-01", "end_date": "2024-01-01"})
    assert obs_resp.status_code == 200
    assert obs_resp.json()["count"] == 1

    assert api_client.get("/observations/precipitation").json()["count"] == 2
    assert api_client.get("/observations/soil-moisture").json()["count"] == 2
    assert api_client.get("/observations/temperature").json()["count"] == 2
    assert api_client.get("/observations/vegetation").json()["status"] == "PLANNED_PHASE_6_MODIS"
    assert "NASA_POWER" in api_client.get("/metadata").json()["quality_reports"]
    assert api_client.get("/pipeline/status").json()["total_records_upserted"] == 2


def test_fastapi_daily_merged_and_et0(tmp_path: Path) -> None:
    aoi = load_and_validate_aoi(PROJECT_ROOT / "config/farm_config.yaml", base_dir=PROJECT_ROOT)
    data_dir = tmp_path / "data"
    cache = FileCache(data_dir=data_dir)
    repo = TerraRepository(data_dir=data_dir)

    power_payload = {
        "header": {"api": {"version": "v2.5.1"}, "fill_value": -999.0},
        "parameters": {
            "T2M": {"units": "C"},
            "T2M_MAX": {"units": "C"},
            "T2M_MIN": {"units": "C"},
            "PRECTOTCORR": {"units": "mm/day"},
            "RH2M": {"units": "%"},
            "ALLSKY_SFC_SW_DWN": {"units": "MJ/m^2/day"},
            "WS2M": {"units": "m/s"},
        },
        "properties": {
            "parameter": {
                "T2M": {"20240101": 25.4},
                "T2M_MAX": {"20240101": 29.1},
                "T2M_MIN": {"20240101": 21.8},
                "PRECTOTCORR": {"20240101": 3.42},
                "RH2M": {"20240101": 81.5},
                "ALLSKY_SFC_SW_DWN": {"20240101": 16.4},
                "WS2M": {"20240101": 2.4},
            }
        },
    }
    power = NasaPowerCollector(client=DummyClient(power_payload=power_payload), cache=cache)
    p_recs = power.process(power.retrieve(aoi, "2024-01-01", "2024-01-01"), aoi)
    p_clean, _ = run_quality_checks(p_recs, "NASA_POWER")

    raw_nc = cache.raw_path("GPM_IMERG", "3B-DAY.MS.MRG.3IMERG.20240101-S000000-E235959.V07B.nc4")
    xr.Dataset(
        data_vars={
            "precipitation": (("lat", "lon"), np.array([[0.0, 0.0], [0.12, 0.33]]), {"units": "mm/day"}),
        },
        coords={"lat": [13.95, 14.05], "lon": [121.15, 121.25]},
    ).to_netcdf(raw_nc)
    gpm = GpmImergCollector(client=DummyClient(has_creds=False), cache=cache)
    g_recs = gpm.process(gpm.retrieve(aoi, "2024-01-01", "2024-01-01"), aoi)
    g_clean, _ = run_quality_checks(g_recs, "GPM_IMERG")

    repo.upsert_observations(p_clean + g_clean)
    assert repo.merged_json_path.exists()

    app = create_app(
        farm_config_path=PROJECT_ROOT / "config/farm_config.yaml",
        datasets_config_path=PROJECT_ROOT / "config/datasets.yaml",
        data_dir=data_dir,
        base_dir=PROJECT_ROOT,
    )
    api_client = TestClient(app)

    merged_resp = api_client.get("/observations/daily-merged", params={"start_date": "2024-01-01", "end_date": "2024-01-01"})
    assert merged_resp.status_code == 200
    body = merged_resp.json()
    assert body["count"] == 1
    row = body["daily_observations"][0]
    assert set(row["sources"]) == {"NASA_POWER", "GPM_IMERG"}
    assert row["flat_observations"]["precipitation_mm"] == pytest.approx(3.42)
    assert row["flat_observations"]["precipitation_imerg_mm"] > 0.0
    assert row["flat_observations"]["et0_mm_day"] > 2.0

    et0_resp = api_client.get("/observations/evapotranspiration")
    assert et0_resp.status_code == 200
    assert et0_resp.json()["count"] == 1


