/**
 * Discovery Engine: runs TERRA's anomaly detectors over FieldDay records
 * (types/discovery-contract.ts, proposed in docs/ai-ml/DECISIONS.md D-002) and returns
 * numeric AnomalyRecords.
 *
 * The four rules are ported from lib/science/detect.ts; thresholds live in
 * data/discoveryRules.ts. They are fixed-threshold heuristics: the baseline any
 * statistical or ML detector must beat (mle-workflow). Thresholds are NOT
 * calibrated against real field data, and confidence values are heuristic.
 * Measured behaviour on synthetic data: docs/ai-ml/EXPERIMENTS.md E-001.
 *
 * Deliberate differences from detect.ts:
 * - Expected rain spreads each month's climatology over that month's real
 *   length (detect.ts divides by 30, which overstates February and understates
 *   31-day months).
 * - A missing gauge day makes the rain rules "unknown" instead of counting as 0 mm.
 * - Engine default (DEFAULT_DETECTORS, D-005): rain departure fills up to 2 missing gauge days with
 *   IMERG. BASELINE_DETECTORS keeps the strict detect.ts behaviour for experiments.
 * - Each pattern is reported once at onset; days that cannot be evaluated
 *   (missing data) neither start nor end a pattern.
 */
import { stageOnDay } from "@/data/crops";
import { DISCOVERY_RULES } from "@/data/discoveryRules";
import { addDays, daysBetween } from "@/lib/dates";
import { clamp } from "@/lib/format";
import { mean, sum, zScore } from "@/lib/science/stats";
import type { Crop, DiscoveryKind, LatLng } from "@/types";
import type { AnomalyRecord, AnomalySignal, FieldDay, SourceId, Variable } from "@/types/discovery-contract";

export const DETECTOR_VERSION = "0.2.0";

/** Absorbs floating-point error so a change of exactly the threshold counts as meeting it. */
export const EPS = 1e-9;

/** TERRA station sensor depths, cm. */
export const SURFACE_CM = 10;
export const DEEP_CM = 40;

const RULES = DISCOVERY_RULES;

export interface DiscoveryContext {
  fieldId: string;
  /** Where point detections are placed (the station position). */
  location: LatLng;
  /** Mean monthly rainfall, mm, Jan..Dec: the rain-departure baseline. */
  monthlyRainMm: number[];
  /** Crop in the ground, for growth-stage gating of the NDVI rule. */
  crop: Crop;
  plantedOn: string;
  /** When the engine runs, UTC ISO-8601; copied to each record's detectedAt. */
  runAt: string;
}

/** A detector's verdict for one day: an alarm, "rule not met", or "cannot tell" (data missing). */
export type Outcome = AnomalyRecord | "no" | "unknown";
/** A detector sees the record up to and including today (days.at(-1)) and returns its verdict. */
export type Detector = (days: FieldDay[], ctx: DiscoveryContext) => Outcome;

/**
 * Throws unless `days` is one field's record with exactly one FieldDay per
 * consecutive local date, at most one value per variable/source/depth per day,
 * and soil moisture in m³/m³ (0..1).
 */
export function validateDays(days: FieldDay[], fieldId: string): void {
  days.forEach((d, k) => {
    if (d.fieldId !== fieldId) throw new Error(`FieldDay ${d.date} belongs to field "${d.fieldId}", not "${fieldId}"`);
    if (k > 0 && d.date !== addDays(days[k - 1].date, 1)) {
      throw new Error(`FieldDays must be consecutive local dates in order: ${days[k - 1].date} is followed by ${d.date}`);
    }
    const seen = new Set<string>();
    for (const v of d.values) {
      const key = `${v.variable}/${v.source}/${v.depthCm}`;
      if (seen.has(key)) throw new Error(`Duplicate value ${key} on ${d.date}: adapters must send one value per variable/source/depth per day`);
      seen.add(key);
      if (v.variable === "soil_moisture" && v.value !== null && (v.value < 0 || v.value > 1)) {
        throw new Error(`Soil moisture ${v.value} (${key}, ${d.date}) is outside 0..1 m3/m3; was it sent in %?`);
      }
    }
  });
}

/** Usable values of one variable/source/depth, aligned with `days` (null when absent, missing or invalid). */
export function seriesOf(days: FieldDay[], variable: Variable, source: SourceId, depthCm: number | null): (number | null)[] {
  return days.map((d) => {
    const v = d.values.find((x) => x.variable === variable && x.source === source && x.depthCm === depthCm);
    return v && v.value !== null && (v.quality === "ok" || v.quality === "warning") ? v.value : null;
  });
}

export function daysInMonth(isoDate: string): number {
  const [y, m] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Gauge rain over the last `windowDays` against the climatology; null when the window is short or a gauge day is missing. */
function rainWindow(days: FieldDay[], ctx: DiscoveryContext) {
  const w = RULES.rainDeparture.windowDays;
  if (days.length < w) return null;
  const window = days.slice(-w);
  const gauge = seriesOf(window, "precipitation", "station", null);
  if (gauge.some((v) => v === null)) return null; // a missing day is not zero rain
  const gaugeTotal = sum(gauge as number[]);
  const expected = sum(window.map((d) => ctx.monthlyRainMm[Number(d.date.slice(5, 7)) - 1] / daysInMonth(d.date)));
  return { window, gaugeTotal, expected, ratio: expected > 0 ? gaugeTotal / expected : 1 };
}

/** Builds an AnomalyRecord. `variant` names a candidate detector (detectorVersion "0.2.0+variant"). */
export function record(
  ctx: DiscoveryContext,
  detector: DiscoveryKind,
  window: { start: string; end: string },
  fields: Pick<AnomalyRecord, "signals" | "coverage" | "spatialSupport" | "confidence">,
  variant?: string,
): AnomalyRecord {
  return {
    id: `${ctx.fieldId}:${detector}:${window.end}`,
    fieldId: ctx.fieldId,
    detector,
    detectorVersion: variant ? `${DETECTOR_VERSION}+${variant}` : DETECTOR_VERSION,
    detectedAt: ctx.runAt,
    window,
    location: ctx.location,
    signals: fields.signals,
    coverage: fields.coverage,
    spatialSupport: fields.spatialSupport,
    confidence: fields.confidence,
    confidenceBasis: "heuristic",
  };
}

// Each detector receives the record up to and including today (days.at(-1)), never later days.

/** Surface moisture falls fast while deeper moisture holds: the topsoil is drying faster than rain replaces it. */
function moistureDivergence(days: FieldDay[], ctx: DiscoveryContext): Outcome {
  const { windowDays: w, minSurfaceDrop, maxDeepChange } = RULES.moistureDivergence;
  const i = days.length - 1;
  if (i < w) return "unknown";
  const s = seriesOf(days, "soil_moisture", "station", SURFACE_CM);
  const d = seriesOf(days, "soil_moisture", "station", DEEP_CM);
  const [s0, s1, d0, d1] = [s[i - w], s[i], d[i - w], d[i]];
  if (s0 === null || s1 === null || d0 === null || d1 === null) return "unknown";

  const surfChange = s1 - s0;
  const deepChange = d1 - d0;
  if (!(surfChange <= -minSurfaceDrop + EPS && Math.abs(deepChange) <= maxDeepChange + EPS)) return "no";

  // Earlier 14-day changes that end on or before this window's start.
  const history: number[] = [];
  for (let j = w; j <= i - w; j++) {
    const a = s[j - w];
    const b = s[j];
    if (a !== null && b !== null) history.push(b - a);
  }
  const z = zScore(surfChange, history);
  const rain = rainWindow(days, ctx);
  const windowValues = s.slice(i - w, i + 1);

  return record(ctx, "moisture-divergence", { start: days[i - w].date, end: days[i].date }, {
    signals: [
      { variable: "soil_moisture", source: "station", depthCm: SURFACE_CM, statistic: "change", observed: surfChange,
        baseline: mean(history), baselineKind: "own-history", unit: "m3/m3", zScore: z, rule: `change <= -${minSurfaceDrop}` },
      { variable: "soil_moisture", source: "station", depthCm: DEEP_CM, statistic: "change", observed: deepChange,
        baseline: 0, baselineKind: "rule", unit: "m3/m3", zScore: null, rule: `abs(change) <= ${maxDeepChange}` },
    ],
    coverage: [{ variable: "soil_moisture", source: "station", daysWithData: windowValues.filter((v) => v !== null).length, daysInWindow: windowValues.length }],
    spatialSupport: "point",
    // As detect.ts: base 0.45, + up to 0.3 for an unusual change, + 0.1 when 14-day rain is under half the climatology.
    confidence: clamp(0.45 + (z !== null ? Math.min(Math.abs(z), 3) * 0.1 : 0) + (rain && rain.ratio < 0.5 ? 0.1 : 0), 0, 0.9),
  });
}

/** 14-day gauge rainfall far from the monthly climatology. */
function rainDeparture(days: FieldDay[], ctx: DiscoveryContext): Outcome {
  const { windowDays: w, lowRatio, highRatio } = RULES.rainDeparture;
  const rain = rainWindow(days, ctx);
  if (!rain) return "unknown";
  if (!(rain.ratio < lowRatio || rain.ratio > highRatio)) return "no";

  const imerg = seriesOf(rain.window, "precipitation", "imerg", null);
  const imergTotal = imerg.every((v) => v !== null) ? sum(imerg as number[]) : null;
  const signals: AnomalySignal[] = [
    { variable: "precipitation", source: "station", depthCm: null, statistic: "total", observed: rain.gaugeTotal,
      baseline: rain.expected, baselineKind: "climatology", unit: "mm", zScore: null, rule: `ratio < ${lowRatio} or ratio > ${highRatio}` },
  ];
  if (imergTotal !== null) {
    signals.push({ variable: "precipitation", source: "imerg", depthCm: null, statistic: "total", observed: imergTotal,
      baseline: rain.gaugeTotal, baselineKind: "other-source", baselineSource: "station", unit: "mm", zScore: null, rule: "agreement check" });
  }
  const agrees = imergTotal !== null && Math.abs(imergTotal - rain.gaugeTotal) < Math.max(15, rain.gaugeTotal * 0.5);

  return record(ctx, "rain-departure", { start: rain.window[0].date, end: days[days.length - 1].date }, {
    signals,
    coverage: [
      { variable: "precipitation", source: "station", daysWithData: w, daysInWindow: w },
      { variable: "precipitation", source: "imerg", daysWithData: imerg.filter((v) => v !== null).length, daysInWindow: w },
    ],
    spatialSupport: "point",
    confidence: agrees ? 0.8 : 0.6,
  });
}

/**
 * Rain departure where up to `maxFilledDays` missing gauge days are filled with that day's IMERG
 * estimate (satellite), instead of making the 14-day window unknown. With no gap it is identical
 * to the baseline rule.
 */
export function rainWithImergFill(opts: { maxFilledDays: number }): Detector {
  return (days, ctx) => {
    const { windowDays: w, lowRatio, highRatio } = RULES.rainDeparture;
    if (days.length < w) return "unknown";
    const window = days.slice(-w);
    const gauge = seriesOf(window, "precipitation", "station", null);
    const imerg = seriesOf(window, "precipitation", "imerg", null);
    let filled = 0;
    const merged: number[] = [];
    for (let k = 0; k < w; k++) {
      const g = gauge[k];
      if (g !== null) merged.push(g);
      else if (imerg[k] !== null) { merged.push(imerg[k] as number); filled++; }
      else return "unknown";
    }
    if (filled > opts.maxFilledDays) return "unknown";
    const total = sum(merged);
    const expected = sum(window.map((d) => ctx.monthlyRainMm[Number(d.date.slice(5, 7)) - 1] / daysInMonth(d.date)));
    const ratio = expected > 0 ? total / expected : 1;
    if (!(ratio < lowRatio || ratio > highRatio)) return "no";

    const imergTotal = imerg.every((v) => v !== null) ? sum(imerg as number[]) : null;
    const signals: AnomalySignal[] = [
      { variable: "precipitation", source: "station", depthCm: null, statistic: "total", observed: total,
        baseline: expected, baselineKind: "climatology", unit: "mm", zScore: null,
        rule: filled ? `ratio < ${lowRatio} or ratio > ${highRatio}; ${filled} gauge day(s) filled with IMERG` : `ratio < ${lowRatio} or ratio > ${highRatio}` },
    ];
    if (imergTotal !== null) {
      signals.push({ variable: "precipitation", source: "imerg", depthCm: null, statistic: "total", observed: imergTotal,
        baseline: total, baselineKind: "other-source", baselineSource: "station", unit: "mm", zScore: null, rule: "agreement check" });
    }
    const agrees = imergTotal !== null && Math.abs(imergTotal - total) < Math.max(15, total * 0.5);
    return record(ctx, "rain-departure", { start: window[0].date, end: days[days.length - 1].date }, {
      signals,
      coverage: [
        { variable: "precipitation", source: "station", daysWithData: w - filled, daysInWindow: w },
        { variable: "precipitation", source: "imerg", daysWithData: imerg.filter((v) => v !== null).length, daysInWindow: w },
      ],
      spatialSupport: "point",
      confidence: agrees ? 0.8 : 0.6,
    }, "imerg-fill");
  };
}

/** NDVI drops between consecutive composites while the crop should be greening or holding. */
function ndviChange(days: FieldDay[], ctx: DiscoveryContext): Outcome {
  const ndvi = seriesOf(days, "ndvi", "modis", null);
  const i = days.length - 1;
  const last = ndvi[i];
  // Only a new composite can change the verdict; as in detect.ts, at least three composites are needed.
  if (last === null || ndvi.filter((v) => v !== null).length < 3) return "unknown";
  let p = i - 1;
  while (ndvi[p] === null) p--;
  const change = last - (ndvi[p] as number);
  const stage = stageOnDay(ctx.crop, daysBetween(ctx.plantedOn, days[i].date));
  if (!(change <= -RULES.ndviChange.minDrop + EPS && (stage === "development" || stage === "mid-season"))) return "no";

  return record(ctx, "ndvi-change", { start: days[p].date, end: days[i].date }, {
    signals: [{ variable: "ndvi", source: "modis", depthCm: null, statistic: "change", observed: change, baseline: 0,
      baselineKind: "rule", unit: "dimensionless", zScore: null, rule: `change <= -${RULES.ndviChange.minDrop} during development or mid-season` }],
    coverage: [{ variable: "ndvi", source: "modis", daysWithData: 2, daysInWindow: i - p + 1 }],
    spatialSupport: "grid-cell",
    confidence: 0.4,
  });
}

/** SMAP and the 10 cm station probe differ by a steady margin: a scale/representativeness offset, not a fault. */
function sensorOffset(days: FieldDay[], ctx: DiscoveryContext): Outcome {
  const smap = seriesOf(days, "soil_moisture", "smap", null);
  const station = seriesOf(days, "soil_moisture", "station", SURFACE_CM);
  const pairs: [number, number][] = [];
  smap.forEach((v, k) => {
    const st = station[k];
    if (v !== null && st !== null) pairs.push([v, st]);
  });
  if (pairs.length < RULES.sensorOffset.minPairs) return "unknown";
  const smapMean = mean(pairs.map((p) => p[0]));
  const stationMean = mean(pairs.map((p) => p[1]));
  if (Math.abs(smapMean - stationMean) < RULES.sensorOffset.minMeanDiff - EPS) return "no";

  return record(ctx, "sensor-offset", { start: days[0].date, end: days[days.length - 1].date }, {
    signals: [{ variable: "soil_moisture", source: "smap", depthCm: null, statistic: "mean", observed: smapMean,
      baseline: stationMean, baselineKind: "other-source", baselineSource: "station", unit: "m3/m3", zScore: null,
      rule: `abs(mean difference) >= ${RULES.sensorOffset.minMeanDiff} over >= ${RULES.sensorOffset.minPairs} pairs` }],
    coverage: [{ variable: "soil_moisture", source: "smap", daysWithData: smap.filter((v) => v !== null).length, daysInWindow: days.length }],
    spatialSupport: "grid-cell",
    confidence: 0.85,
  });
}

/** One detector per alarm kind. Candidates (candidates.ts) are alternative detectors for the same kinds. */
export type DetectorSet = Record<DiscoveryKind, Detector>;

/** The four rules ported from detect.ts: the baseline every candidate is scored against. */
export const BASELINE_DETECTORS: DetectorSet = {
  "moisture-divergence": moistureDivergence,
  "rain-departure": rainDeparture,
  "ndvi-change": ndviChange,
  "sensor-offset": sensorOffset,
};

function outcomesOnDay(days: FieldDay[], i: number, ctx: DiscoveryContext, detectors: DetectorSet): [DiscoveryKind, Outcome][] {
  const upToToday = days.slice(0, i + 1);
  return (Object.entries(detectors) as [DiscoveryKind, Detector][]).map(([kind, detect]) => [kind, detect(upToToday, ctx)]);
}

/**
 * Engine default: the baseline rules, except rain departure, which fills up to
 * DISCOVERY_RULES.rainGapFill.maxFilledDays missing gauge days with IMERG (adopted after E-004, D-005).
 */
export const DEFAULT_DETECTORS: DetectorSet = {
  ...BASELINE_DETECTORS,
  "rain-departure": rainWithImergFill({ maxFilledDays: RULES.rainGapFill.maxFilledDays }),
};

/** Every rule that holds on day i, using only days 0..i. */
export function detectOnDay(days: FieldDay[], i: number, ctx: DiscoveryContext, detectors: DetectorSet = DEFAULT_DETECTORS): AnomalyRecord[] {
  validateDays(days, ctx.fieldId);
  return outcomesOnDay(days, i, ctx, detectors)
    .map(([, o]) => o)
    .filter((o): o is AnomalyRecord => typeof o !== "string");
}

/**
 * Replays the record day by day and reports each pattern once, on the first day
 * its rule holds. A day the rule cannot evaluate keeps the previous state.
 */
export function runDiscovery(days: FieldDay[], ctx: DiscoveryContext, detectors: DetectorSet = DEFAULT_DETECTORS): AnomalyRecord[] {
  validateDays(days, ctx.fieldId);
  const out: AnomalyRecord[] = [];
  const active = new Map<DiscoveryKind, boolean>();
  for (let i = 0; i < days.length; i++) {
    for (const [kind, o] of outcomesOnDay(days, i, ctx, detectors)) {
      if (o === "unknown") continue;
      if (o === "no") active.set(kind, false);
      else {
        if (!active.get(kind)) out.push(o);
        active.set(kind, true);
      }
    }
  }
  return out;
}
