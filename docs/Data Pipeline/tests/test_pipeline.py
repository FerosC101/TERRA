"""Comprehensive test suite for TERRA NASA Earth Observation Data Pipeline."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import h5py
import numpy as np
import pytest
import xarray as xr
from fastapi.testclient import TestClient

from api.routes import create_app
from collectors.gpm import GpmImergCollector
from collectors.nasa_power import NasaPowerCollector
from collectors.smap import SmapCollector
from processors.spatial_processor import load_and_validate_aoi
from processors.temporal_processor import normalize_timestamp, validate_date_range
from processors.unit_converter import convert_value_and_unit
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
    assert recs[0].observations["precipitation_mm"].value == pytest.approx(11.2)
    assert recs[0].observations["precipitation_mm"].observation_type == "satellite"


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

