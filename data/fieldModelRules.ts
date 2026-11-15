/**
 * Living Field Model correction settings (lib/science/fieldModel/state.ts, D-007).
 * All values are HEURISTICS chosen before any real comparison; not calibrated.
 * Soil moisture values are m³/m³.
 */
export const FIELD_MODEL_RULES = {
  /** Uncertainty (1 sd) of a reading. SMAP is larger: a ~9 km, top-~5 cm average compared with one field. */
  /** smap_l4 (D-017): a model estimate for a 9 km cell after rescaling; set between SMAP L3 and a manual reading (UNVERIFIED). */
  readingSd: { station: 0.02, manual: 0.03, smap: 0.05, smap_l4: 0.04 },
  /** Uncertainty of the model at the start of a record. */
  startSd: 0.05,
  /** Growth of the model's uncertainty per day without a reading. */
  sdGrowthPerDay: 0.004,
} as const;
