import type { RainNormal } from "@/lib/science/discovery/engine";

/**
 * IMERG monthly rain normal for the Lipa Cropland AOI (lipa_cropland_001), the same-source
 * baseline the rain-departure satellite fallback needs (D-006: IMERG total vs IMERG normal).
 *
 * Satellite estimate, not a gauge measurement. Mean of 23 years (2001–2023) of GPM IMERG Final
 * monthly (GPM_3IMERGM V07, NASA GES DISC), mm/month = monthly mean rate (mm/hr) × 24 × days.
 * Extracted with the pipeline's own 2×2 IDW around the AOI centroid: the same four 0.1° cells
 * (centre 13.95 N, 121.15 E) as the pipeline's daily IMERG, so daily totals and this normal match.
 * Values rounded to 0.1 mm from
 * docs/Data Pipeline/data/external/imerg_monthly/imerg_monthly_normal_lipa_2001_2023.csv
 * (produced by scripts/fetch-imerg-monthly-normal.py; provenance in request.json and
 * docs/Data Pipeline/data/DATA-MANIFEST.md). lipaImergNormal.test.ts checks they still match.
 */
export const LIPA_IMERG_NORMAL: RainNormal = {
  monthlyMm: [110.1, 77.9, 65.8, 68.7, 173.2, 257.3, 353.9, 329.8, 313.4, 306.4, 251.3, 241.2],
  basis: "GPM IMERG Final monthly V07 (GPM_3IMERGM), 2001–2023 mean, 2x2 IDW at the Lipa AOI",
};
