import { DISCOVERY_RULES } from "@/data/discoveryRules";
import { longDate } from "@/lib/dates";
import { fmt } from "@/lib/format";
import { runDiscoveryWithCoverage, seriesOf, type DiscoveryContext } from "@/lib/science/discovery/engine";
import type { DiscoveryKind, Field } from "@/types";
import type { FieldDay, SourceId } from "@/types/discovery-contract";
import { request } from "./apiClient";
import { discoveryInput } from "./discoveryService";
import { mockField } from "./fieldSensorService";
import { fieldObservations } from "./observationSource";

/** What one Discovery Engine rule checks on this field, and whether the field's record lets it run. */
export interface DetectorStatus {
  kind: DiscoveryKind;
  name: string;
  /** The rule as it is applied to this field (its limits and source). */
  rule: string;
  /** Days the rule could decide (alarm or "rule not met"), of the record's days. */
  decidedDays: number;
  totalDays: number;
  /** Pattern onsets found in the whole record. */
  onsets: number;
  /** Why the rule cannot raise an alarm on this field; absent when it can. */
  blocked?: string;
  /** Set when the rule runs on a SIMULATED or ASSUMED input (D-020): which one. */
  simulatedInput?: string;
}

export interface DetectorReport {
  real: boolean;
  recordStart: string;
  recordEnd: string;
  detectors: DetectorStatus[];
}

const NAMES: Record<DiscoveryKind, string> = {
  "moisture-divergence": "Moisture divergence",
  "rain-departure": "Rainfall departure",
  "ndvi-change": "Vegetation dip",
  "sensor-offset": "Source offset",
};

const RAIN_SOURCE: Partial<Record<SourceId, string>> = {
  power: "NASA POWER rain (model, ~50 km)",
  imerg: "GPM IMERG rain (satellite, ~10 km)",
};
const NDVI_SOURCE: Partial<Record<SourceId, string>> = { modis: "MODIS 250 m composites", hls: "HLS 30 m clear passes" };

const span = (xs: number[]) => `${fmt(Math.min(...xs), 2)}–${fmt(Math.max(...xs), 2)}`;
const hasValues = (days: FieldDay[], source: SourceId, variable: "soil_moisture" | "ndvi", depth: number | null) =>
  seriesOf(days, variable, source, depth).some((v) => v !== null);

function rainRule(ctx: DiscoveryContext, real: boolean): string {
  const r = DISCOVERY_RULES.rainDeparture;
  const fixed = `${r.windowDays}-day rain below ${fmt(r.lowRatio * 100, 0)}% or above ${fmt(r.highRatio * 100, 0)}% of the monthly normal.`;
  if (!real) return `${fixed} Fixed demonstration limits, not calibrated.`;
  const src = ctx.rainFallbackSource ?? DISCOVERY_RULES.rainSatelliteFallback.source;
  const normal = ctx.rainNormals?.[src];
  if (!normal?.lowRatioByMonth || !normal.highRatioByMonth) return `${fixed} Source: ${RAIN_SOURCE[src] ?? src}, against its own normal.`;
  const long = normal.longWindowDays && normal.longLowRatioByMonth
    ? ` Also a ${normal.longWindowDays}-day total below its month's limit (${span(normal.longLowRatioByMonth)} × normal), for droughts that build over a season.`
    : "";
  return `${r.windowDays}-day ${RAIN_SOURCE[src] ?? src} below its month's low limit (${span(normal.lowRatioByMonth)} × normal) or above its high limit (${span(normal.highRatioByMonth)} × normal).${long} Calibrated on ${normal.thresholdBasis ?? normal.basis}. No rain gauge on this field.`;
}

function rules(ctx: DiscoveryContext, real: boolean): Record<DiscoveryKind, string> {
  const m = DISCOVERY_RULES.moistureDivergence;
  const n = DISCOVERY_RULES.ndviChange;
  const o = DISCOVERY_RULES.sensorOffset;
  const ndviSrc = ctx.ndviSource ?? "modis";
  return {
    "moisture-divergence": `Surface moisture (10 cm) falls ${fmt(m.minSurfaceDrop * 100, 0)} points or more in ${m.windowDays} days while the 40 cm reading moves ${fmt(m.maxDeepChange * 100, 0)} points or less. Needs station probes${ctx.moistureFallback ? `; without them, ${ctx.moistureFallback.basis}` : ""}. Fixed limits, not calibrated.`,
    "rain-departure": rainRule(ctx, real),
    "ndvi-change": ctx.ndviNormal
      ? `A new NDVI value (${NDVI_SOURCE[ndviSrc] ?? ndviSrc}) below the field's low limit for that time of year (${ctx.ndviNormal.basis}).`
      : `NDVI (${NDVI_SOURCE[ndviSrc] ?? ndviSrc}) falls ${fmt(n.minDrop, 2)} or more between two values at most ${n.maxGapDays} days apart, while the crop is in development or mid-season. Fixed limits, not calibrated.`,
    "sensor-offset": `Satellite (SMAP) and station 10 cm moisture differ by ${fmt(o.minMeanDiff * 100, 1)} points or more on average over ${o.minPairs} or more paired days. Fixed limits, not calibrated.`,
  };
}

/** Why a rule cannot raise an alarm on this record, read from the record and the field's settings. */
function blockedReason(kind: DiscoveryKind, days: FieldDay[], ctx: DiscoveryContext, decided: number): string | undefined {
  const end = days[days.length - 1].date;
  if (kind === "moisture-divergence" && decided === 0) {
    return hasValues(days, "station", "soil_moisture", 10)
      ? "The station probes never cover a full 14-day window."
      : "No soil-moisture probe on this field, and the SMAP L4 fallback (D-015) is not calibrated yet.";
  }
  if (kind === "sensor-offset" && decided === 0) {
    return hasValues(days, "station", "soil_moisture", 10)
      ? "Too few days with both a SMAP overpass and a station reading."
      : "Needs a ground sensor at 10 cm to compare with SMAP; none is installed.";
  }
  if (kind === "ndvi-change") {
    if (!hasValues(days, ctx.ndviSource ?? "modis", "ndvi", null)) return "No NDVI values in the record.";
    if (!ctx.ndviNormal && !ctx.seasons?.length && ctx.plantedOn > end) {
      return `The planting date on file (${longDate(ctx.plantedOn)}) is after the record ends (${longDate(end)}): no crop calendar covers the record, so the rule, which applies only during growth, cannot fire.`;
    }
  }
  if (decided === 0) return "The record never has the data this rule needs.";
  return undefined;
}

/** Runs the engine on the field's record and reports each rule, its limits, and whether it can run there. */
export function detectorReport(field: Field): DetectorReport {
  const { days, ctx, real, inputs } = discoveryInput(field, fieldObservations(field));
  const end = days[days.length - 1].date;
  const run = runDiscoveryWithCoverage(days, ctx);
  const text = rules(ctx, real);
  const station = "the planned station's SIMULATED 10 cm and 40 cm readings (no probe is installed)";
  const simulatedInput: Partial<Record<DiscoveryKind, string>> = {
    ...(inputs.simulatedStation ? { "moisture-divergence": station, "sensor-offset": `${station}, compared with real SMAP L3: any margin reflects the simulation's equations, not the field` } : {}),
    ...(inputs.assumedSeasonsBasis ? { "ndvi-change": `real MODIS NDVI, with growth stages from an ${inputs.assumedSeasonsBasis}` } : {}),
  };
  const detectors = (Object.keys(NAMES) as DiscoveryKind[]).map((kind) => ({
    kind,
    name: NAMES[kind],
    rule: text[kind],
    decidedDays: run.decidedDays[kind] ?? 0,
    totalDays: run.totalDays,
    onsets: run.records.filter((r) => r.detector === kind).length,
    blocked: blockedReason(kind, days, ctx, run.decidedDays[kind] ?? 0),
    simulatedInput: simulatedInput[kind],
  }));
  return { real, recordStart: days[0].date, recordEnd: end, detectors };
}

/** GET /api/fields/{id}/detectors */
export function getDetectorReport(fieldId: string): Promise<DetectorReport> {
  return request(`/api/fields/${fieldId}/detectors`, () => detectorReport(mockField(fieldId)));
}
