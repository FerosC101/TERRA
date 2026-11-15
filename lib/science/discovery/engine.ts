/**
 * Discovery Engine: runs TERRA's anomaly detectors over FieldDay records
 * (types/discovery-contract.ts, proposed in docs/ai-ml/DECISIONS.md D-002) and returns
 * numeric AnomalyRecords.
 *
 * The four rules are ported from the former lib/science/detect.ts (removed 2026-11-15, in git history); thresholds live in
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
 * - Engine default (DEFAULT_DETECTORS, D-005, D-006): rain departure fills up to 2 missing gauge days with
 *   IMERG, and with no gauge at all uses IMERG against its own normal. BASELINE_DETECTORS keeps the
 *   strict detect.ts behaviour for experiments.
 * - Each pattern is reported once at onset; days that cannot be evaluated
 *   (missing data) neither start nor end a pattern.
 */
import { stageOnDay } from "@/data/crops";
import { DISCOVERY_RULES } from "@/data/discoveryRules";
import { addDays, daysBetween } from "@/lib/dates";
import { clamp } from "@/lib/format";
import { seasonOn, type CropSeason } from "@/lib/science/season";
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

/** Mean monthly rainfall from one source, mm, Jan..Dec, and where it came from (product, years). */
export interface RainNormal {
  monthlyMm: number[];
  basis: string;
  /**
   * Optional per-month limits for the 14-day ratio (index = month of the window's last day), calibrated on the
   * source's own history (D-013). Without them the fallback uses the fixed DISCOVERY_RULES.rainDeparture limits.
   */
  lowRatioByMonth?: number[];
  highRatioByMonth?: number[];
  thresholdBasis?: string;
  /**
   * Optional season-scale drought check (D-013): the `longWindowDays` total vs the normal, flagged when the ratio
   * is below `longLowRatioByMonth[month of the last day]`. Catches droughts that build up over months in seasons
   * that are dry anyway, where every 14-day window can stay within its limits.
   */
  longWindowDays?: number;
  longLowRatioByMonth?: number[];
}

/**
 * Moisture-divergence settings for a field without probes (D-015): a layered product (SMAP L4) with the topsoil
 * and root-zone depths it is stored under, and per-month limits from the field's own history (index = month of
 * the window's last day): the topsoil must fall by at least minSurfaceDropByMonth in 14 days while the root zone
 * moves by at most maxDeepChangeByMonth.
 */
export interface MoistureFallback {
  source: SourceId;
  surfaceDepthCm: number;
  deepDepthCm: number;
  minSurfaceDropByMonth: number[];
  maxDeepChangeByMonth: number[];
  basis: string;
}

export interface DiscoveryContext {
  fieldId: string;
  /** Where point detections are placed (the station position). */
  location: LatLng;
  /** Mean monthly rainfall, mm, Jan..Dec: the rain-departure baseline for the station gauge. */
  monthlyRainMm: number[];
  /**
   * Normals for satellite rain sources (D-006). A satellite total is compared only with the normal
   * of the same source; without one the satellite fallback stays "unknown".
   */
  rainNormals?: Partial<Record<SourceId, RainNormal>>;
  /** Source the no-gauge rain fallback uses for this field (default DISCOVERY_RULES.rainSatelliteFallback.source; D-013). */
  rainFallbackSource?: SourceId;
  /** Crop in the ground, for growth-stage gating of the NDVI rule. */
  crop: Crop;
  plantedOn: string;
  /**
   * Several cropping seasons (e.g. a real crop calendar). When given, the NDVI rule uses the season the
   * day belongs to (latest planting on or before it) instead of `crop`/`plantedOn`.
   */
  seasons?: CropSeason[];
  /** NDVI source the NDVI rule reads (default "modis"); "hls" for a plot smaller than a MODIS pixel (D-012). */
  ndviSource?: SourceId;
  /** Soil-moisture source and calibrated limits used when the field has no station probes (D-015). */
  moistureFallback?: MoistureFallback;
  /**
   * NDVI normal for a field without a crop calendar (D-016): the low limit (e.g. 10th percentile of past years) per
   * day of year of the composite's placement day. When given, the NDVI rule flags a composite below its date's limit
   * instead of a drop during the crop's growth stages.
   */
  ndviNormal?: { lowByDayOfYear: Record<number, number>; basis: string };
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
  const ndviSource = ctx.ndviSource ?? "modis";
  const ndvi = seriesOf(days, "ndvi", ndviSource, null);
  const i = days.length - 1;
  const last = ndvi[i];
  if (ctx.ndviNormal) return ndviBelowNormal(days, ctx, ndviSource, last);
  // Only a new composite can change the verdict; as in detect.ts, at least three composites are needed.
  if (last === null || ndvi.filter((v) => v !== null).length < 3) return "unknown";
  let p = i - 1;
  while (ndvi[p] === null) p--;
  // Composites far apart (cloud gaps) say nothing about a sudden change (F-015).
  if (daysBetween(days[p].date, days[i].date) > RULES.ndviChange.maxGapDays) return "unknown";
  const change = last - (ndvi[p] as number);
  const season = ctx.seasons ? seasonOn(ctx.seasons, days[i].date) : { crop: ctx.crop, plantedOn: ctx.plantedOn };
  const stage = season ? stageOnDay(season.crop, daysBetween(season.plantedOn, days[i].date)) : "pre";
  if (!(change <= -RULES.ndviChange.minDrop + EPS && (stage === "development" || stage === "mid-season"))) return "no";

  return record(ctx, "ndvi-change", { start: days[p].date, end: days[i].date }, {
    signals: [{ variable: "ndvi", source: ndviSource, depthCm: null, statistic: "change", observed: change, baseline: 0,
      baselineKind: "rule", unit: "dimensionless", zScore: null, rule: `change <= -${RULES.ndviChange.minDrop} during development or mid-season` }],
    coverage: [{ variable: "ndvi", source: ndviSource, daysWithData: 2, daysInWindow: i - p + 1 }],
    spatialSupport: "grid-cell",
    confidence: 0.4,
  });
}

/** D-016: a new composite below the field's own low limit for that day of year (no crop calendar needed). */
function ndviBelowNormal(days: FieldDay[], ctx: DiscoveryContext, source: SourceId, last: number | null): Outcome {
  if (last === null) return "unknown";
  const date = days[days.length - 1].date;
  const doy = daysBetween(`${date.slice(0, 4)}-01-01`, date) + 1;
  const low = ctx.ndviNormal!.lowByDayOfYear[doy];
  if (low === undefined) return "unknown";
  if (!(last < low)) return "no";
  return record(ctx, "ndvi-change", { start: date, end: date }, {
    signals: [{ variable: "ndvi", source, depthCm: null, statistic: "mean", observed: last, baseline: low,
      baselineKind: "climatology", unit: "dimensionless", zScore: null, rule: `NDVI < ${low} (${ctx.ndviNormal!.basis})` }],
    coverage: [{ variable: "ndvi", source, daysWithData: 1, daysInWindow: 1 }],
    spatialSupport: "grid-cell",
    confidence: 0.4,
  }, "below-normal");
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

/**
 * D-006: rain departure without a field station. The gauge rule decides whenever its window has at
 * least one usable gauge day. Only when it has none (no station, or a full outage) is the satellite
 * `source` total compared with that source's own monthly normal (ctx.rainNormals). Same window and
 * ratio thresholds as the gauge rule: UNVERIFIED for a ~11 km satellite total. Records are labelled
 * `+satellite-fallback`, grid-cell support, 0 station days, lower confidence.
 */
export function rainWithSatelliteFallback(gaugeRule: Detector, defaultSource: SourceId): Detector {
  return (days, ctx) => {
    const verdict = gaugeRule(days, ctx);
    const source = ctx.rainFallbackSource ?? defaultSource;
    const { windowDays: w } = RULES.rainDeparture;
    if (verdict !== "unknown" || days.length < w) return verdict;
    const window = days.slice(-w);
    if (seriesOf(window, "precipitation", "station", null).some((v) => v !== null)) return verdict;

    const normal = ctx.rainNormals?.[source];
    const sat = seriesOf(window, "precipitation", source, null);
    if (!normal || sat.some((v) => v === null)) return "unknown"; // a missing day is not zero rain
    const total = sum(sat as number[]);
    const expected = sum(window.map((d) => normal.monthlyMm[Number(d.date.slice(5, 7)) - 1] / daysInMonth(d.date)));
    const ratio = expected > 0 ? total / expected : 1;
    const month = Number(days[days.length - 1].date.slice(5, 7)) - 1;
    const lowRatio = normal.lowRatioByMonth?.[month] ?? RULES.rainDeparture.lowRatio;
    const highRatio = normal.highRatioByMonth?.[month] ?? RULES.rainDeparture.highRatio;
    if (!(ratio < lowRatio || ratio > highRatio)) {
      return longWindowDrought(days, ctx, source, normal, month) ?? "no";
    }

    return record(ctx, "rain-departure", { start: window[0].date, end: days[days.length - 1].date }, {
      signals: [{ variable: "precipitation", source, depthCm: null, statistic: "total", observed: total,
        baseline: expected, baselineKind: "climatology", unit: "mm", zScore: null,
        rule: `ratio < ${lowRatio} or ratio > ${highRatio}${normal.thresholdBasis ? ` (${normal.thresholdBasis})` : ""}; no gauge, ${source} vs its own normal (${normal.basis})` }],
      coverage: [
        { variable: "precipitation", source: "station", daysWithData: 0, daysInWindow: w },
        { variable: "precipitation", source, daysWithData: w, daysInWindow: w },
      ],
      spatialSupport: "grid-cell",
      confidence: RULES.rainSatelliteFallback.confidence,
    }, "satellite-fallback");
  };
}

/**
 * Season-scale drought (D-013): the last `normal.longWindowDays` of the fallback source below the month's
 * calibrated limit. Returns null when the normal has no long-window limits, the record is too short, or a day in
 * the long window is missing (then the 14-day verdict stands).
 */
function longWindowDrought(days: FieldDay[], ctx: DiscoveryContext, source: SourceId, normal: RainNormal, month: number): AnomalyRecord | null {
  const lw = normal.longWindowDays;
  const limit = normal.longLowRatioByMonth?.[month];
  if (!lw || limit === undefined || days.length < lw) return null;
  const window = days.slice(-lw);
  const vals = seriesOf(window, "precipitation", source, null);
  if (vals.some((v) => v === null)) return null;
  const total = sum(vals as number[]);
  const expected = sum(window.map((d) => normal.monthlyMm[Number(d.date.slice(5, 7)) - 1] / daysInMonth(d.date)));
  if (!(expected > 0 && total / expected < limit)) return null;
  return record(ctx, "rain-departure", { start: window[0].date, end: days[days.length - 1].date }, {
    signals: [{ variable: "precipitation", source, depthCm: null, statistic: "total", observed: total,
      baseline: expected, baselineKind: "climatology", unit: "mm", zScore: null,
      rule: `${lw}-day ratio < ${limit}${normal.thresholdBasis ? ` (${normal.thresholdBasis})` : ""}; no gauge, ${source} vs its own normal (${normal.basis})` }],
    coverage: [
      { variable: "precipitation", source: "station", daysWithData: 0, daysInWindow: lw },
      { variable: "precipitation", source, daysWithData: lw, daysInWindow: lw },
    ],
    spatialSupport: "grid-cell",
    confidence: RULES.rainSatelliteFallback.confidence,
  }, "satellite-fallback");
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
 * DISCOVERY_RULES.rainGapFill.maxFilledDays missing gauge days with IMERG (adopted after E-004, D-005)
 * and, with no gauge at all in the window, falls back to IMERG against IMERG's own normal (D-006).
 */
/**
 * D-015: when no station probe has a value in the 14-day window, the moisture rule uses the field's layered
 * soil-moisture product (SMAP L4) with limits calibrated on its own history. Station probes always come first.
 */
export function moistureWithL4Fallback(stationRule: Detector): Detector {
  return (days, ctx) => {
    const verdict = stationRule(days, ctx);
    const fb = ctx.moistureFallback;
    const w = RULES.moistureDivergence.windowDays;
    const i = days.length - 1;
    if (verdict !== "unknown" || !fb || i < w) return verdict;
    const window = days.slice(i - w);
    const anyProbe = [SURFACE_CM, DEEP_CM].some((z) => seriesOf(window, "soil_moisture", "station", z).some((v) => v !== null));
    if (anyProbe) return verdict;
    const s = seriesOf(days, "soil_moisture", fb.source, fb.surfaceDepthCm);
    const d = seriesOf(days, "soil_moisture", fb.source, fb.deepDepthCm);
    const [s0, s1, d0, d1] = [s[i - w], s[i], d[i - w], d[i]];
    if (s0 === null || s1 === null || d0 === null || d1 === null) return "unknown";
    const month = Number(days[i].date.slice(5, 7)) - 1;
    const minDrop = fb.minSurfaceDropByMonth[month];
    const maxDeep = fb.maxDeepChangeByMonth[month];
    const surfChange = s1 - s0;
    const deepChange = d1 - d0;
    if (!(surfChange <= -minDrop + EPS && Math.abs(deepChange) <= maxDeep + EPS)) return "no";
    const values = s.slice(i - w, i + 1);
    return record(ctx, "moisture-divergence", { start: days[i - w].date, end: days[i].date }, {
      signals: [
        { variable: "soil_moisture", source: fb.source, depthCm: fb.surfaceDepthCm, statistic: "change", observed: surfChange,
          baseline: -minDrop, baselineKind: "own-history", unit: "m3/m3", zScore: null,
          rule: `change <= -${minDrop} (${fb.basis}); no probes` },
        { variable: "soil_moisture", source: fb.source, depthCm: fb.deepDepthCm, statistic: "change", observed: deepChange,
          baseline: 0, baselineKind: "rule", unit: "m3/m3", zScore: null, rule: `abs(change) <= ${maxDeep} (${fb.basis})` },
      ],
      coverage: [
        { variable: "soil_moisture", source: "station", daysWithData: 0, daysInWindow: values.length },
        { variable: "soil_moisture", source: fb.source, daysWithData: values.filter((v) => v !== null).length, daysInWindow: values.length },
      ],
      spatialSupport: "grid-cell",
      confidence: RULES.rainSatelliteFallback.confidence,
    }, "smap-l4-fallback");
  };
}

export const DEFAULT_DETECTORS: DetectorSet = {
  ...BASELINE_DETECTORS,
  "moisture-divergence": moistureWithL4Fallback(moistureDivergence),
  "rain-departure": rainWithSatelliteFallback(
    rainWithImergFill({ maxFilledDays: RULES.rainGapFill.maxFilledDays }),
    RULES.rainSatelliteFallback.source,
  ),
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
