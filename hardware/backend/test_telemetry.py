"""
Automated Unit & Integration Tests for TERRA 2.0 Field Explorer Telemetry Backend
Verifies:
  1. Standardized Z-Score Anomaly Detection (Z = (x - mu) / sigma)
  2. Temperature-compensated Soil EC (Salinity) calibration
  3. FAO-56 Reference & Crop Evapotranspiration (ET_c = K_c * ET_0)
  4. Space-vs-Ground Divergence (D_SG) detection for Osmotic Salinity Lock
  5. Offline Ring-Buffer Batch Synchronization and timestamp ordering
  6. FerosC101/TERRA DailyObservation schema contract alignment (TS-01)
"""

import unittest
from telemetry_server import (
    SensorTelemetry,
    FieldExplorerStorage,
    compute_z_score,
    compensate_ec_temperature,
    compute_fao56_et0_and_etc,
    evaluate_space_ground_divergence,
    to_terra_daily_observation,
)


class TestFieldExplorerTelemetry(unittest.TestCase):
    def test_z_score_anomaly_formula(self) -> None:
        self.assertAlmostEqual(compute_z_score(28.0, 28.0, 4.0), 0.0, places=3)
        self.assertAlmostEqual(compute_z_score(38.0, 28.0, 4.0), 2.5, places=3)

    def test_ec_temperature_compensation(self) -> None:
        self.assertAlmostEqual(compensate_ec_temperature(3.8, 25.0), 3.8, places=3)
        comp_30c = compensate_ec_temperature(3.8, 30.0)
        self.assertLess(comp_30c, 3.8)
        self.assertGreater(comp_30c, 3.3)

    def test_fao56_crop_water_balance(self) -> None:
        res = compute_fao56_et0_and_etc(air_temp_c=31.0, air_rh_pct=70.0, solar_wm2=700.0, kc=1.15)
        self.assertIn("et0_mm_day", res)
        self.assertIn("etc_mm_day", res)
        self.assertAlmostEqual(res["etc_mm_day"], round(res["et0_mm_day"] * 1.15, 2), places=2)

    def test_space_ground_divergence_salinity_lock(self) -> None:
        saline_frame = SensorTelemetry(
            moisture_30cm_pct=44.0,
            soil_ec_dsm=3.8,
            air_temp_c=30.8,
            ecostress_canopy_temp_c=35.0,
        )
        result = evaluate_space_ground_divergence(saline_frame)
        self.assertEqual(result["diagnosis"], "OSMOTIC_SALINITY_LOCK")
        self.assertEqual(result["discovery_kind"], "moisture-divergence")
        self.assertGreaterEqual(result["d_sg_score"], 2.0)
        self.assertTrue(result["anomaly_detected"])
        self.assertIn("Black Sesame", result["recommended_pivot"])

    def test_offline_ring_buffer_reconciliation(self) -> None:
        store = FieldExplorerStorage(max_records=10)
        batch = [
            SensorTelemetry(sequence_id=105, moisture_30cm_pct=31.0, cached_offline=True),
            SensorTelemetry(sequence_id=102, moisture_30cm_pct=29.0, cached_offline=True),
            SensorTelemetry(sequence_id=108, moisture_30cm_pct=33.0, cached_offline=False),
        ]
        summary = store.ingest_offline_batch(batch)
        self.assertEqual(summary["synced_count"], 3)
        seq_ids = [r["telemetry"]["sequence_id"] for r in store.records]
        self.assertEqual(seq_ids, [102, 105, 108])

    def test_terra_daily_observation_contract_alignment(self) -> None:
        frame = SensorTelemetry(
            station_id="TS-01",
            moisture_10cm_pct=26.4,
            moisture_40cm_pct=30.2,
            soil_temp_c=27.5,
            soil_ec_dsm=1.40,
            rain_mm=4.2,
            air_temp_c=31.0,
            ndvi=0.74,
            storage_mm=107.6,
        )
        et = compute_fao56_et0_and_etc(frame.air_temp_c, frame.air_rh_pct, frame.solar_wm2)
        obs = to_terra_daily_observation(frame, et, date_str="2026-11-14")
        required_keys = {
            "date",
            "rainMm",
            "rainImergMm",
            "et0Mm",
            "etcMm",
            "tmaxC",
            "soilTempC",
            "surfaceVwc",
            "deepVwc",
            "smapVwc",
            "ndvi",
            "lstC",
            "ecDsM",
            "storageMm",
        }
        self.assertEqual(set(obs.keys()), required_keys)
        self.assertEqual(obs["surfaceVwc"], 26.4)
        self.assertEqual(obs["deepVwc"], 30.2)
        self.assertEqual(obs["ndvi"], 0.74)


if __name__ == "__main__":
    unittest.main()
