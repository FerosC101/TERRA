import type { RainNormal } from "@/lib/science/discovery/engine";

/**
 * NASA POWER rain normal and calibrated rain-departure limits for the Lipa Cropland AOI (D-013).
 *
 * MODEL data (POWER, MERRA-2 based, PRECTOTCORR), 121.185 E 13.984 N, the same point and API as the pipeline.
 * Normal: mean monthly total 2001–2023. Limits: 5th and 95th percentile of the 14-day ratio (total / expected)
 * for windows ending in each calendar month, 2001–2023, so ~10 % of windows are flagged in those years.
 * Values from docs/Data Pipeline/data/external/power_history/rain_calibration_lipa.json
 * (scripts/fetch-power-history.py → scripts/calibrate-rain-lipa.py); lipaPowerRain.test.ts checks they match.
 * Held-out check (fit 2001–2018, test 2019–2023): 18.1 % of windows flagged (5.2 % dry, 12.9 % wet) vs 33.7 % with
 * the old fixed 0.45 / 1.7 limits. 90-day drought limit: 10th percentile of the 90-day ratio by month (4.3 % of
 * held-out windows flagged); catches season-long droughts the 14-day window misses (Feb–Apr 2024).
 */
export const LIPA_POWER_RAIN_NORMAL: RainNormal = {
  monthlyMm: [157.0, 136.7, 105.4, 95.8, 160.2, 241.2, 292.9, 234.1, 277.1, 341.4, 343.4, 375.8],
  basis: "NASA POWER daily PRECTOTCORR, 2001–2023 mean, Lipa AOI point",
  lowRatioByMonth: [0.23, 0.082, 0.099, 0.074, 0.112, 0.309, 0.352, 0.374, 0.296, 0.362, 0.352, 0.24],
  highRatioByMonth: [2.293, 2.328, 2.946, 3.49, 2.656, 1.929, 1.851, 1.993, 1.953, 2.027, 2.202, 2.112],
  thresholdBasis: "POWER 2001–2023 percentiles by month: 14-day p5/p95, 90-day p10",
  longWindowDays: 90,
  longLowRatioByMonth: [0.606, 0.542, 0.379, 0.358, 0.368, 0.493, 0.651, 0.787, 0.767, 0.764, 0.731, 0.641],
};
