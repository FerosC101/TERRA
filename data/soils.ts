import type { SoilParams } from "@/lib/science/water/soilWater";

/**
 * Soil parameters for the daily water balance (lib/science/water/cropWater.ts), without the
 * crop-specific depletion fraction p (taken from data/crops.ts).
 *
 * INDICATIVE: the same silt-loam set as the synthetic generator (lib/demo/syntheticFieldDays.ts,
 * FAO_SOIL), every value inside FAO-56 Table 19 ranges. Not measured at any TERRA field.
 * The real Lipa soil (field capacity, wilting point, rooting depth) is unknown.
 */
export const INDICATIVE_SOIL: Omit<SoilParams, "p"> = {
  fc: 0.32,
  wp: 0.15,
  surfaceDepthM: 0.1,
  rootDepthM: 1.0,
  rewMm: 9,
  tewMm: 24.5,
};

/**
 * Lipa Cropland soil from ISRIC SoilGrids 2.0 (250 m), MODEL ESTIMATE, not a field measurement.
 * Source: scripts/fetch-soilgrids-lipa.py → docs/Data Pipeline/data/external/soilgrids/ (mean of the
 * 20 cells inside the AOI; DATA-MANIFEST.md section 10). Water retention: Turek et al. 2023,
 * doi:10.1016/j.iswcr.2022.08.001. SoilGrids states 30–70 % of variation explained.
 * - fc = θ at 33 kPa, wp = θ at 1500 kPa, thickness-weighted over 0–100 cm (5 SoilGrids depths).
 *   One fc/wp is used for both model layers (the model has no per-layer values).
 * - tewMm = (θFC − 0.5 θWP) × Ze with the 0–10 cm values (0.3089, 0.2001): (0.3089 − 0.10005) × 100 = 20.9 mm,
 *   the same formula as INDICATIVE_SOIL (lib/demo/syntheticFieldDays.ts).
 * - rewMm, depths: NOT from SoilGrids; kept from INDICATIVE_SOIL (REW unknown for Lipa; rooting depth is crop-set).
 * Texture 0–100 cm: clay 39–45 %, sand 29–32 %, silt 26–30 % (clay loam at the top, clay below),
 * consistent with the PhilRice Lipa series profile (silty clay 9–26 cm, clay 26–52 cm).
 */
export const LIPA_SOILGRIDS_SOIL: Omit<SoilParams, "p"> = {
  fc: 0.321,
  wp: 0.238,
  surfaceDepthM: 0.1,
  rootDepthM: 1.0,
  rewMm: 9,
  tewMm: 20.9,
};

/**
 * Plot A (Mang Edgar's corn, "docs/Data Pipeline/Lipa Plot A.geojson", 2.69 ha): ISRIC SoilGrids 2.0, MODEL ESTIMATE.
 * Same method as LIPA_SOILGRIDS_SOIL (scripts/fetch-soilgrids-lipa.py --aoi "Lipa Plot A.geojson" --name lipa_plot_a),
 * but the plot holds ONE server cell (0.0023°, resampled), so the values are the SoilGrids value at the plot centre.
 * 0–100 cm weighted FC 0.311, WP 0.235; TEW = (0.2965 − 0.5 × 0.202) × 100 = 19.55 mm; REW and depths as INDICATIVE_SOIL.
 * Texture 0–100 cm: clay 36–39 %.
 */
export const LIPA_PLOT_A_SOILGRIDS_SOIL: Omit<SoilParams, "p"> = {
  fc: 0.311,
  wp: 0.235,
  surfaceDepthM: 0.1,
  rootDepthM: 1.0,
  rewMm: 9,
  tewMm: 19.55,
};
