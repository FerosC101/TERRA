/**
 * Two-layer daily soil-water model for SIMULATED field records (lib/demo/syntheticFieldDays.ts).
 * It is not TERRA's validated water balance and is not used by the UI.
 *
 * Follows the structure of FAO-56 (Allen et al. 1998, FAO Irrigation and Drainage Paper 56;
 * Ch. 7 https://www.fao.org/4/x0490e/x0490e0c.htm and Ch. 8 https://www.fao.org/4/x0490e/x0490e0e.htm,
 * accessed 2026-11-14):
 * - Soil evaporation comes only from the surface (evaporating) layer of depth Ze. It runs at the full
 *   rate while depletion De ≤ REW (stage 1, Kr = 1), then falls as Kr = (TEW − De) / (TEW − REW)
 *   (stage 2), and stops at De = TEW (0 ≤ De ≤ TEW, eq. 78). Ch. 7 states Kr = 1 for De ≤ REW and that
 *   Kr depends on De, TEW and REW; eq. 74 itself is an image on the opened page, so the linear form
 *   above is not transcribed from the source (UNVERIFIED transcription).
 * - Exposed soil fraction = 1 − fc (eq. 75 with the whole surface wetted by rain).
 * - Transpiration is limited by Ks = (TAW − Dr) / ((1 − p) TAW) when Dr > RAW = p × TAW, else 1
 *   (Ch. 8 eq. 83–84; eq. 84 is an image on the opened page, so this is the form already used in
 *   lib/demo/series.ts, UNVERIFIED transcription).
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
    surfaceVwc: prm.fc - de / (1000 * prm.surfaceDepthM),
    deepVwc: prm.fc - dd / (1000 * deepThicknessM),
  };
}
