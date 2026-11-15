/**
 * Two-layer daily soil-water model. Used by the synthetic generator (lib/demo/syntheticFieldDays.ts)
 * and the daily crop water balance (./cropWater.ts). Not validated against any real field.
 *
 * Follows the structure of FAO-56 (Allen et al. 1998, FAO Irrigation and Drainage Paper 56;
 * Ch. 7 https://www.fao.org/4/x0490e/x0490e0c.htm and Ch. 8 https://www.fao.org/4/x0490e/x0490e0e.htm,
 * accessed 2026-11-14; equation images x0490e2r.gif and x0490e2w.gif read 2026-11-15):
 * - Soil evaporation comes only from the surface (evaporating) layer of depth Ze. It runs at the full
 *   rate while depletion De ≤ REW (stage 1, Kr = 1), then Kr = (TEW − De,i−1) / (TEW − REW) for
 *   De,i−1 > REW (eq. 74, checked against the source image), and stops at De = TEW (0 ≤ De ≤ TEW, eq. 78).
 * - Exposed soil fraction = 1 − fc (eq. 75 with the whole surface wetted by rain).
 * - Transpiration is limited by Ks = (TAW − Dr) / (TAW − RAW) = (TAW − Dr) / ((1 − p) TAW) when
 *   Dr > RAW = p × TAW, else 1 (eq. 83–84, checked against the source image).
 * - Water above field capacity is lost by deep percolation on the same day (Ch. 8).
 *
 * Simplifications (UNVERIFIED, no source):
 * - Transpiration is drawn from the two layers in proportion to their thickness within the root zone
 *   (10% from a 0.10 m surface layer in a 1.0 m root zone). FAO-56 Ch. 7 says transpiration from the
 *   evaporating layer is small and can be ignored for most crops; real uptake is probably top-weighted.
 * - Single crop coefficient: ETc = Kc × ET0 is split into evaporation demand (1 − fc) × ETc and
 *   transpiration demand fc × ETc, instead of the dual Kcb + Ke method.
 * - No runoff and no capillary rise.
 */
export interface SoilParams {
  /** Field capacity and wilting point, m³/m³. */
  fc: number;
  wp: number;
  /** Evaporating (surface) layer depth Ze, m. */
  surfaceDepthM: number;
  /** Root-zone depth Zr, m (includes the surface layer). */
  rootDepthM: number;
  /** Readily and total evaporable water, mm. */
  rewMm: number;
  tewMm: number;
  /** Depletion fraction before transpiration stress. */
  p: number;
  /** Share of transpiration taken from the surface layer; default = its thickness share of the root zone (UNVERIFIED either way). */
  surfaceUptakeShare?: number;
}

export interface SoilState {
  /** Depletion below field capacity, mm. */
  surfaceDepletionMm: number;
  deepDepletionMm: number;
}

export interface SoilStepResult {
  state: SoilState;
  evaporationMm: number;
  transpirationMm: number;
  deepPercolationMm: number;
  /** Water stress coefficient used for the day (eq. 84), 0..1. */
  ks: number;
  /** Volumetric water content of each layer at the end of the day, m³/m³. */
  surfaceVwc: number;
  deepVwc: number;
}

export function soilStep(
  state: SoilState,
  day: { rainMm: number; etcMm: number; canopyCover: number },
  prm: SoilParams,
): SoilStepResult {
  const deepThicknessM = prm.rootDepthM - prm.surfaceDepthM;
  const surfaceAvailMm = (prm.fc - prm.wp) * 1000 * prm.surfaceDepthM;
  const deepAvailMm = (prm.fc - prm.wp) * 1000 * deepThicknessM;
  const taw = surfaceAvailMm + deepAvailMm;
  const raw = prm.p * taw;
  const { surfaceDepletionMm: de0, deepDepletionMm: dd0 } = state;

  // Evaporation from the exposed, wetted fraction of the surface layer (uses yesterday's depletion).
  const kr = de0 <= prm.rewMm ? 1 : Math.max(0, (prm.tewMm - de0) / (prm.tewMm - prm.rewMm));
  const evaporation = Math.min(kr * (1 - day.canopyCover) * day.etcMm, Math.max(0, prm.tewMm - de0));

  // Transpiration from the root zone, limited by water stress.
  const dr = Math.min(de0, surfaceAvailMm) + dd0;
  const ks = dr <= raw ? 1 : Math.min(1, Math.max(0, (taw - dr) / ((1 - prm.p) * taw)));
  const demand = ks * day.canopyCover * day.etcMm;
  const share = prm.surfaceUptakeShare ?? prm.surfaceDepthM / prm.rootDepthM;
  const fromSurface = Math.min(demand * share, Math.max(0, surfaceAvailMm - de0));
  const fromDeep = Math.min(demand - fromSurface, Math.max(0, deepAvailMm - dd0));

  // Daily balance: rain enters the surface layer; water above field capacity moves down the same day.
  let de = de0 - day.rainMm + evaporation + fromSurface;
  const excess = de < 0 ? -de : 0;
  de = Math.min(Math.max(de, 0), prm.tewMm);
  let dd = dd0 - excess + fromDeep;
  const deepPercolation = dd < 0 ? -dd : 0;
  dd = Math.max(dd, 0);

  return {
    state: { surfaceDepletionMm: de, deepDepletionMm: dd },
    evaporationMm: evaporation,
    transpirationMm: fromSurface + fromDeep,
    deepPercolationMm: deepPercolation,
    ks,
    surfaceVwc: prm.fc - de / (1000 * prm.surfaceDepthM),
    deepVwc: prm.fc - dd / (1000 * deepThicknessM),
  };
}

/**
 * Canopy cover: 0 before and during the initial stage, rising linearly through development,
 * 1 through mid-season and late season, 0 after. Simplification of FAO-56 eq. 76 (UNVERIFIED).
 */
export function canopyCover(crop: { stages: number[] }, dap: number): number {
  const [ini, dev, mid, late] = crop.stages;
  if (dap < ini) return 0;
  if (dap < ini + dev) return (dap - ini) / dev;
  return dap < ini + dev + mid + late ? 1 : 0;
}
