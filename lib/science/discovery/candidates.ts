/**
 * Candidate detectors: alternatives to the baseline rules in engine.ts for the same alarm kinds,
 * evaluated in docs/ai-ml/EXPERIMENTS.md E-003. None is used by default. Thresholds come from the caller;
 * the tuning grids live in data/discoveryRules.ts (CANDIDATE_RULES).
 *
 * Outcome of E-003 (docs/ai-ml/EXPERIMENTS.md): none adopted (D-004); see F-005, F-006, F-007.
 *
 * Each uses only the field's own record up to today. None uses the synthetic generator's
 * parameters (its soil values, noise levels or NDVI growth formula).
 */
import { stageOnDay } from "@/data/crops";
import { DISCOVERY_RULES } from "@/data/discoveryRules";
import { daysBetween } from "@/lib/dates";
import { clamp } from "@/lib/format";
import { mean, zScore } from "@/lib/science/stats";
import { DEEP_CM, EPS, record, seriesOf, SURFACE_CM, type Detector } from "./engine";

/**
 * Moisture divergence judged against this field's own history: the 14-day surface change must be
 * unusual (z ≤ zThreshold against all earlier 14-day changes) instead of exceeding a fixed 0.05 m³/m³,
 * while deep moisture moves at most 0.03 m³/m³ (as the baseline). Silent until `minHistory` earlier
 * changes exist.
 */
export function fieldZMoisture(opts: { zThreshold: number; minHistory: number }): Detector {
  return (days, ctx) => {
    const { windowDays: w, maxDeepChange } = DISCOVERY_RULES.moistureDivergence;
    const i = days.length - 1;
    if (i < w) return "unknown";
    const s = seriesOf(days, "soil_moisture", "station", SURFACE_CM);
    const d = seriesOf(days, "soil_moisture", "station", DEEP_CM);
    const [s0, s1, d0, d1] = [s[i - w], s[i], d[i - w], d[i]];
    if (s0 === null || s1 === null || d0 === null || d1 === null) return "unknown";

    const history: number[] = [];
    for (let j = w; j <= i - w; j++) {
      const a = s[j - w];
      const b = s[j];
      if (a !== null && b !== null) history.push(b - a);
    }
    if (history.length < opts.minHistory) return "unknown";
    const surfChange = s1 - s0;
    const deepChange = d1 - d0;
    const z = zScore(surfChange, history);
    if (z === null) return "unknown";
    if (!(surfChange < 0 && z <= opts.zThreshold + EPS && Math.abs(deepChange) <= maxDeepChange + EPS)) return "no";

    const windowValues = s.slice(i - w, i + 1);
    return record(ctx, "moisture-divergence", { start: days[i - w].date, end: days[i].date }, {
      signals: [
        { variable: "soil_moisture", source: "station", depthCm: SURFACE_CM, statistic: "change", observed: surfChange,
          baseline: mean(history), baselineKind: "own-history", unit: "m3/m3", zScore: z,
          rule: `z <= ${opts.zThreshold} against ${history.length} earlier 14-day changes` },
        { variable: "soil_moisture", source: "station", depthCm: DEEP_CM, statistic: "change", observed: deepChange,
          baseline: 0, baselineKind: "rule", unit: "m3/m3", zScore: null, rule: `abs(change) <= ${maxDeepChange}` },
      ],
      coverage: [{ variable: "soil_moisture", source: "station", daysWithData: windowValues.filter((v) => v !== null).length, daysInWindow: windowValues.length }],
      spatialSupport: "point",
      confidence: clamp(0.45 + Math.min(Math.abs(z), 3) * 0.1, 0, 0.9),
    }, "field-z");
  };
}

/** Adopted after E-004 (D-005): now part of engine.ts, re-exported here for existing callers. */
export { rainWithImergFill } from "./engine";

/**
 * NDVI trend break: during development or mid-season, the change between the last two composites is
 * at least `minSlowdown` below the change between the two before ("growth suddenly slowed"). Compares
 * the field with its own recent trend, so a dip during green-up is visible even while NDVI still rises.
 */
export function ndviTrendBreak(opts: { minSlowdown: number }): Detector {
  return (days, ctx) => {
    const ndvi = seriesOf(days, "ndvi", "modis", null);
    const i = days.length - 1;
    if (ndvi[i] === null) return "unknown";
    const idx = ndvi.map((v, k) => (v !== null ? k : -1)).filter((k) => k >= 0);
    if (idx.length < 3) return "unknown";
    const [k1, k2] = idx.slice(-3);
    const [c1, c2, c3] = [ndvi[k1] as number, ndvi[k2] as number, ndvi[i] as number];
    const change = c3 - c2;
    const previous = c2 - c1;
    const stage = stageOnDay(ctx.crop, daysBetween(ctx.plantedOn, days[i].date));
    if (!(change - previous <= -opts.minSlowdown + EPS && (stage === "development" || stage === "mid-season"))) return "no";

    return record(ctx, "ndvi-change", { start: days[k2].date, end: days[i].date }, {
      signals: [{ variable: "ndvi", source: "modis", depthCm: null, statistic: "change", observed: change, baseline: previous,
        baselineKind: "own-history", unit: "dimensionless", zScore: null,
        rule: `change − previous change <= −${opts.minSlowdown} during development or mid-season` }],
      coverage: [{ variable: "ndvi", source: "modis", daysWithData: 3, daysInWindow: i - k1 + 1 }],
      spatialSupport: "grid-cell",
      confidence: 0.4,
    }, "trend-break");
  };
}
