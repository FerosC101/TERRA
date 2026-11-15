import { LIPA_PLOT_A_CROP_SEASONS } from "@/data/cropCalendar";
import { LIPA_IMERG_NORMAL } from "@/data/nasa/lipaImergNormal";
import { LIPA_POWER_RAIN_NORMAL } from "@/data/nasa/lipaPowerRain";
import { LIPA_PLOT_A_SOILGRIDS_SOIL, LIPA_SOILGRIDS_SOIL } from "@/data/soils";
import type { DiscoveryContext } from "@/lib/science/discovery/engine";
import type { CropSeason } from "@/lib/science/season";
import type { SoilParams } from "@/lib/science/water/soilWater";

/**
 * Real-data settings of the Discovery Engine for Lipa (Lipa Cropland AOI and Plot A), in one place for the
 * scripts and the app. Every value is calibrated on real NASA history; see the file each one comes from.
 *
 * Rain departure (D-013): no gauge, so the fallback uses NASA POWER rain against POWER's own 2001–2023 normal,
 * with per-month 14-day limits (p5/p95) and a 90-day drought limit (p10). The IMERG normal stays available for
 * comparison (D-006); IMERG Final ends 2025-09-30 and has no daily history here to calibrate on.
 */
export const LIPA_RAIN_SETTINGS: Pick<DiscoveryContext, "rainFallbackSource" | "rainNormals"> = {
  rainFallbackSource: "power",
  rainNormals: { power: LIPA_POWER_RAIN_NORMAL, imerg: LIPA_IMERG_NORMAL },
};

/**
 * Discovery Engine settings per field that has a real record (data/nasa/realRecords.ts). The app's services spread
 * these into the context when they run the engine on the real record.
 */
export const REAL_FIELD_SETTINGS: Record<string, Partial<DiscoveryContext>> = {
  "lipa-cropland": { ...LIPA_RAIN_SETTINGS },
  // Plot A: the same rain normals (one POWER cell covers both sites), the farmer-reported corn seasons (growth stages
  // and season gating), and NDVI from HLS 30 m over the plot (D-012).
  "lipa-plot-a": { ...LIPA_RAIN_SETTINGS, seasons: LIPA_PLOT_A_CROP_SEASONS, ndviSource: "hls" },
};

/**
 * Living Field Model inputs per field with a real record: its SoilGrids soil (data/soils.ts) and, where the farmer
 * reported them, the real crop seasons. Without seasons the model uses the field's current crop and planting date.
 */
export const REAL_FIELD_MODEL: Record<string, { soil: Omit<SoilParams, "p">; seasons?: CropSeason[] }> = {
  "lipa-cropland": { soil: LIPA_SOILGRIDS_SOIL },
  "lipa-plot-a": { soil: LIPA_PLOT_A_SOILGRIDS_SOIL, seasons: LIPA_PLOT_A_CROP_SEASONS },
};
