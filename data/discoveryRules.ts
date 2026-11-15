/**
 * Discovery Engine rule thresholds (lib/science/discovery/engine.ts).
 *
 * Ported from the former lib/science/detect.ts (removed 2026-11-15), with soil-moisture thresholds converted
 * from % points to m³/m³ (÷100). They are heuristics chosen for the demo:
 * NOT calibrated against real field data. Behaviour on synthetic data is
 * measured in docs/ai-ml/EXPERIMENTS.md E-001.
 */
export const DISCOVERY_RULES = {
  /** Surface (10 cm) falls by at least minSurfaceDrop m³/m³ over windowDays while deep (40 cm) moves at most maxDeepChange. */
  moistureDivergence: { windowDays: 14, minSurfaceDrop: 0.05, maxDeepChange: 0.03 },
  /** windowDays of gauge rain below lowRatio or above highRatio × the monthly climatology. */
  rainDeparture: { windowDays: 14, lowRatio: 0.45, highRatio: 1.7 },
  /**
   * NDVI falls by at least minDrop between consecutive composites during development or mid-season.
   * The two composites must be at most maxGapDays apart (two 16-day composites); across a longer gap
   * (clouds) the verdict is "unknown". Added 2026-11-15 after F-015 (heuristic, not calibrated).
   */
  ndviChange: { minDrop: 0.03, maxGapDays: 32 },
  /** Mean SMAP − station (10 cm) difference of at least minMeanDiff m³/m³ over at least minPairs paired days. */
  sensorOffset: { minMeanDiff: 0.015, minPairs: 21 },
  /** Missing gauge days per 14-day window that may be filled with IMERG (adopted after E-004, D-005). */
  rainGapFill: { maxFilledDays: 2 },
  /**
   * D-006: with no usable gauge day in the window, rain departure uses this satellite source against
   * its own monthly normal. Confidence is a heuristic set below every gauge alarm (0.6–0.8).
   */
  rainSatelliteFallback: { source: "imerg", confidence: 0.4 },
} as const;

/**
 * Candidate detectors (lib/science/discovery/candidates.ts) and their tuning grids for E-003.
 * Grid values were chosen before any tuning run; the selected value is recorded in
 * experiments/E-003/results.json. Not calibrated against real field data.
 */
export const CANDIDATE_RULES = {
  /** z-score of the 14-day surface change against the field's own earlier changes. */
  fieldZMoisture: { zThresholdGrid: [-1.5, -2, -2.5], minHistory: 20 },
  /** Gauge days that may be filled with IMERG within a 14-day window (fixed, not tuned). */
  rainWithImergFill: { maxFilledDays: DISCOVERY_RULES.rainGapFill.maxFilledDays },
  /** Minimum slowdown between consecutive NDVI composite changes. */
  ndviTrendBreak: { minSlowdownGrid: [0.03, 0.05, 0.08] },
} as const;
