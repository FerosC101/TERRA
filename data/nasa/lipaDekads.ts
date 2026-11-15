import dekads from "./lipa-power-dekads.json";

/**
 * Ten-day (dekad) rain totals at the Lipa AOI point, NASA POWER (MODEL), 2001–2025: the rotation planner's
 * historical-years mode (D-014). Built by scripts/build-power-dekads.py from the 2001–2023 POWER history and the
 * pipeline's 2024–2025 POWER record; lipaDekads.test.ts checks the yearly totals against both.
 */
export const LIPA_POWER_DEKADS: Record<string, number[]> = dekads.years;

/** Real dekad rain per field id; fields without one use the monthly climatology only. */
export const DEKADS_BY_FIELD: Record<string, Record<string, number[]>> = {
  "lipa-cropland": LIPA_POWER_DEKADS,
  // Plot A lies 3.3 km west, inside the same POWER cell (0.5° × 0.625°): the same series applies.
  "lipa-plot-a": LIPA_POWER_DEKADS,
};
