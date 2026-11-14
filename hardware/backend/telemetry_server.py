"""
TERRA 2.0 — Field Explorer Live Telemetry & Space-to-Ground Calibration Server
Person 1: Hardware & Field Explorer Lead
Implements NASA - Team 1.md Sections 5–7, TERRA Hardware Spec, & FerosC101/TERRA Schema:
  1. Standardized Anomaly Detection: Z = (x - mu) / sigma
  2. FAO-56 Crop Water-Balance Model: ET_c = K_c * ET_0
  3. Space-to-Ground Dynamic Bias Calibration (1 Pod -> 500 ha)
  4. Orbital-vs-Ground Divergence Engine (D_SG = Z_ECO_dT + Z_pod_theta)
  5. FerosC101/TERRA DailyObservation Contract Serialization (TS-01)
  6. Offline Ring-Buffer Sync & Live HTTP/JSON Telemetry Ingestion
"""

from __future__ import annotations
import json
import time
from dataclasses import dataclass, asdict
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Dict, List


@dataclass
class SensorTelemetry:
    station_id: str = "TS-01"
    node_id: str = "TERRA-POD-A1"
    field_id: str = "north-terrace"
    cluster: str = "CAGAYAN-ISABELA-NORTH-TERRACE"
    timestamp_s: int = 1794637200
    sequence_id: int = 1001
    moisture_10cm_pct: float = 26.4
    moisture_30cm_pct: float = 28.0
    moisture_40cm_pct: float = 30.2
    moisture_60cm_pct: float = 34.2
    soil_temp_c: float = 27.5
    soil_ec_dsm: float = 1.40
    air_temp_c: float = 30.8
    air_rh_pct: float = 74.0
    rain_mm: float = 0.0
    rain_rate_mm_hr: float = 0.0
    solar_wm2: float = 685.0
    ndvi: float = 0.74
    storage_mm: float = 107.6
    latitude_deg: float = 16.8731
    longitude_deg: float = 121.5846
    battery_v: float = 6.48
    battery_soc_pct: float = 94.0
    cached_offline: bool = False
    # NASA Orbital Coincident Inputs (SMAP L4, NISAR L-Band, ISS ECOSTRESS)
    smap_moisture_pct: float = 25.5
    nisar_backscatter_db: float = -11.4
    ecostress_canopy_temp_c: float = 31.9


def compute_z_score(value: float, mean: float, std_dev: float) -> float:
    """
    NASA - Team 1.md Section 5.A:
    Standardized anomaly score Z = (x - mu) / sigma
    """
    safe_sigma = max(abs(std_dev), 1e-4)
    return round((value - mean) / safe_sigma, 3)


def compensate_ec_temperature(raw_ec_dsm: float, soil_temp_c: float) -> float:
    """
    Standard temperature compensation to 25C reference:
    EC_25 = EC_T / (1 + 0.019 * (T - 25))
    """
    factor = max(0.5, 1.0 + 0.019 * (soil_temp_c - 25.0))
    return round(raw_ec_dsm / factor, 3)


def compute_fao56_et0_and_etc(
    air_temp_c: float,
    air_rh_pct: float,
    solar_wm2: float,
    kc: float = 1.05,
) -> Dict[str, float]:
    """
    NASA - Team 1.md Section 5.B:
    FAO-56 Reference Evapotranspiration (ET_0) & Crop Evapotranspiration:
    ET_c = K_c * ET_0
    """
    rs_mj_m2_day = solar_wm2 * 0.0864 * 0.35
    vpd_factor = 1.0 + max(0.0, (100.0 - air_rh_pct)) * 0.0045
    et0 = 0.0135 * (air_temp_c + 17.78) * (rs_mj_m2_day / 2.45) * vpd_factor
    et0 = max(0.5, min(9.8, et0))
    etc = kc * et0
    return {
        "et0_mm_day": round(et0, 2),
        "kc": round(kc, 2),
        "etc_mm_day": round(etc, 2),
    }


def to_terra_daily_observation(
    telemetry: SensorTelemetry, et_metrics: Dict[str, float], date_str: str = "2026-11-14"
) -> Dict[str, object]:
    """
    Maps a hardware SensorTelemetry frame to the FerosC101/TERRA DailyObservation
    TypeScript interface (types/index.ts).
    """
    return {
        "date": date_str,
        "rainMm": round(telemetry.rain_mm, 2),
        "rainImergMm": round(telemetry.rain_mm, 2),
        "et0Mm": et_metrics["et0_mm_day"],
        "etcMm": et_metrics["etc_mm_day"],
        "tmaxC": round(telemetry.air_temp_c, 2),
        "soilTempC": round(telemetry.soil_temp_c, 2),
        "surfaceVwc": round(telemetry.moisture_10cm_pct, 1),
        "deepVwc": round(telemetry.moisture_40cm_pct, 1),
        "smapVwc": round(telemetry.smap_moisture_pct, 1),
        "ndvi": round(telemetry.ndvi, 2),
        "lstC": round(telemetry.ecostress_canopy_temp_c, 2),
        "ecDsM": round(telemetry.soil_ec_dsm, 2),
        "storageMm": round(telemetry.storage_mm, 1),
    }


def evaluate_space_ground_divergence(
    telemetry: SensorTelemetry,
    hist_moisture_mean: float = 28.0,
    hist_moisture_std: float = 6.0,
    hist_canopy_dt_mean: float = 1.0,
    hist_canopy_dt_std: float = 1.2,
    hist_ec_mean: float = 1.4,
    hist_ec_std: float = 0.65,
) -> Dict[str, object]:
    """
    1. Dynamic Bias Calibration at Anchor Plot c0
    2. Orbital-vs-Ground Divergence Score (D_SG)
    """
    z_pod_theta = compute_z_score(
        telemetry.moisture_30cm_pct, hist_moisture_mean, hist_moisture_std
    )
    canopy_dt = telemetry.ecostress_canopy_temp_c - telemetry.air_temp_c
    z_eco_dt = compute_z_score(canopy_dt, hist_canopy_dt_mean, hist_canopy_dt_std)
    z_pod_ec = compute_z_score(telemetry.soil_ec_dsm, hist_ec_mean, hist_ec_std)

    dielectric_orbital_est = telemetry.smap_moisture_pct + 0.35 * (
        telemetry.nisar_backscatter_db + 12.0
    )
    delta_theta_cal = round(telemetry.moisture_30cm_pct - dielectric_orbital_est, 2)

    if z_pod_theta > 0.0 and z_eco_dt > 1.5:
        d_sg = round(max(0.0, z_eco_dt + 0.5 * z_pod_theta - 1.35), 2)
    else:
        d_sg = round(max(0.0, 0.3 * abs(z_eco_dt - (-0.4 * z_pod_theta))), 2)

    if d_sg >= 2.0 and z_pod_ec > 1.5:
        diagnosis = "OSMOTIC_SALINITY_LOCK"
        discovery_kind = "moisture-divergence"
        recommended_pivot = "Path C: Black Sesame (Salt & Drought Shield)"
    elif d_sg >= 2.0 and z_pod_ec <= 1.5:
        diagnosis = "SUBSURFACE_PLOW_PAN_COMPACTION"
        discovery_kind = "moisture-divergence"
        recommended_pivot = "Deep-Taproot Bio-Drilling Rotation"
    elif z_pod_theta < -1.5:
        diagnosis = "ROOT_ZONE_WATER_DEFICIT"
        discovery_kind = "moisture-divergence"
        recommended_pivot = "Path B: Mungbean DX208 (-68% Water)"
    else:
        diagnosis = "COUPLED_NORMAL"
        discovery_kind = "normal"
        recommended_pivot = "Path B: Mungbean DX208 (+52 kg N/ha)"

    return {
        "z_pod_moisture": z_pod_theta,
        "z_ecostress_dt": z_eco_dt,
        "z_pod_ec": z_pod_ec,
        "delta_theta_cal_pct": delta_theta_cal,
        "d_sg_score": d_sg,
        "anomaly_detected": abs(z_pod_theta) >= 2.0 or abs(z_pod_ec) >= 2.0 or d_sg >= 2.0,
        "discovery_kind": discovery_kind,
        "diagnosis": diagnosis,
        "recommended_pivot": recommended_pivot,
    }


class FieldExplorerStorage:
    """In-memory historical store with offline ring-buffer reconciliation."""

    def __init__(self, max_records: int = 512) -> None:
        self.max_records = max_records
        self.records: List[Dict[str, object]] = []

    def ingest_frame(self, telemetry: SensorTelemetry, kc: float = 1.05) -> Dict[str, object]:
        et_metrics = compute_fao56_et0_and_etc(
            telemetry.air_temp_c, telemetry.air_rh_pct, telemetry.solar_wm2, kc=kc
        )
        divergence = evaluate_space_ground_divergence(telemetry)
        terra_obs = to_terra_daily_observation(telemetry, et_metrics)
        enriched = {
            "telemetry": asdict(telemetry),
            "terra_observation": terra_obs,
            "fao56": et_metrics,
            "intelligence": divergence,
            "ingested_at": time.time(),
        }
        self.records.append(enriched)
        self.records.sort(key=lambda r: r["telemetry"]["sequence_id"])
        if len(self.records) > self.max_records:
            self.records = self.records[-self.max_records :]
        return enriched

    def ingest_offline_batch(self, frames: List[SensorTelemetry]) -> Dict[str, object]:
        synced = [self.ingest_frame(f) for f in frames]
        return {
            "synced_count": len(synced),
            "total_stored": len(self.records),
            "latest": synced[-1] if synced else None,
        }


STORAGE = FieldExplorerStorage()


class TelemetryHTTPHandler(BaseHTTPRequestHandler):
    """Zero-dependency HTTP JSON API handler for live demo & hardware bridge."""

    def _send_json(self, payload: object, status: int = 200) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:
        self._send_json({"status": "ok"})

    def do_GET(self) -> None:
        if self.path.startswith("/api/v1/telemetry") or self.path.startswith("/api/telemetry"):
            latest = STORAGE.records[-1] if STORAGE.records else STORAGE.ingest_frame(SensorTelemetry())
            self._send_json({"status": "online", "count": len(STORAGE.records), "latest": latest})
        else:
            self._send_json({"service": "TERRA 2.0 Field Explorer Telemetry Server", "version": "2.1.0"})

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        frame = SensorTelemetry(**{k: v for k, v in body.items() if k in SensorTelemetry.__dataclass_fields__})
        result = STORAGE.ingest_frame(frame)
        self._send_json(result, status=201)


if __name__ == "__main__":
    STORAGE.ingest_frame(SensorTelemetry())
    server = HTTPServer(("127.0.0.1", 8765), TelemetryHTTPHandler)
    print("TERRA 2.0 Field Explorer Telemetry Server listening on http://127.0.0.1:8765")
    server.serve_forever()
