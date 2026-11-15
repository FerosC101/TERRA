/**
 * Discovery cards: one Discovery Engine output (AnomalyRecord, numbers only) → the app's
 * human-readable `Discovery`. Every figure on a card comes from the record or from the FieldDays
 * it was computed on; each evidence row carries the provenance of the values actually used.
 * Possible causes and the next check come from data/observationChecks.ts (ranked by
 * lib/science/nextObservation.ts). Interpretation wording is carried over from the former lib/science/detect.ts (removed 2026-11-15, in git history).
 */
import { CROPS, stageOnDay } from "@/data/crops";
import { CAUSES, OBSERVATION_CHECKS, type Cause } from "@/data/observationChecks";
import { daysBetween, longDate } from "@/lib/dates";
import { fmt, round, signed } from "@/lib/format";
import type { Discovery, Evidence, Field, FollowUp, Provenance } from "@/types";
import type { AnomalyRecord, AnomalySignal, FieldDay, SourceId, Variable } from "@/types/discovery-contract";
import { rankChecks } from "../nextObservation";
import { latestFollowUp, stagesFor, statusOf } from "./investigation";

const SOURCE_NAMES: Record<SourceId, string> = {
  station: "Field station",
  manual: "Manual reading",
  smap: "SMAP L3, ~9 km",
  smap_l4: "SMAP L4 (model), ~9 km",
  imerg: "GPM IMERG, ~10 km",
  modis: "MODIS MOD13Q1, 250 m",
  hls: "HLS (Landsat + Sentinel-2), 30 m",
  ecostress: "ECOSTRESS, 70 m",
  power: "NASA POWER",
};

const pts = (m3: number) => m3 * 100;

/** Provenance of the latest value of this variable/source/depth inside the window. */
function provenanceOf(days: FieldDay[], window: AnomalyRecord["window"], s: { variable: Variable; source: SourceId; depthCm: number | null }): Provenance {
  for (let k = days.length - 1; k >= 0; k--) {
    const d = days[k];
    if (d.date > window.end || d.date < window.start) continue;
    const v = d.values.find((x) => x.variable === s.variable && x.source === s.source && x.depthCm === s.depthCm && x.value !== null);
    if (v) return v.provenance;
  }
  return "model";
}

function valueOn(days: FieldDay[], date: string, variable: Variable, source: SourceId, depthCm: number | null): number | null {
  const v = days.find((d) => d.date === date)?.values.find((x) => x.variable === variable && x.source === source && x.depthCm === depthCm);
  return v?.value ?? null;
}

function sourceName(source: SourceId, field: Field): string {
  return source === "station" ? field.station.name : SOURCE_NAMES[source];
}

type CardText = Pick<Discovery, "title" | "category" | "summary" | "interpretation" | "comparison" | "confidenceNote"> & {
  risk?: string;
  /** Which rain causes apply (data/observationChecks.ts). */
  causeWhen?: Cause["when"];
  observations: Evidence[];
  anomalyDetail: string;
};

function moistureCard(r: AnomalyRecord, days: FieldDay[], field: Field): CardText {
  const [surf, deep] = r.signals;
  const end = r.window.end;
  const name = sourceName("station", field);
  const prov = provenanceOf(days, r.window, surf);
  const s0 = valueOn(days, r.window.start, "soil_moisture", "station", surf.depthCm);
  const s1 = valueOn(days, end, "soil_moisture", "station", surf.depthCm);
  const d0 = valueOn(days, r.window.start, "soil_moisture", "station", deep.depthCm);
  const d1 = valueOn(days, end, "soil_moisture", "station", deep.depthCm);
  const range = (a: number | null, b: number | null) => `${fmt(a === null ? null : pts(a), 1)}% → ${fmt(b === null ? null : pts(b), 1)}%`;
  const observations: Evidence[] = [
    { label: `Surface moisture, ${surf.depthCm} cm`, value: `${range(s0, s1)} (${signed(pts(surf.observed))} pts in 14 days)`, source: name, provenance: prov, date: end },
    { label: `Deeper moisture, ${deep.depthCm} cm`, value: `${range(d0, d1)} (${signed(pts(deep.observed))} pts in 14 days)`, source: name, provenance: prov, date: end },
  ];
  if (surf.zScore !== null) {
    observations.push({ label: "Earlier 14-day changes in this record", value: `mean ${signed(pts(surf.baseline))} pts; this change is z = ${fmt(surf.zScore, 1)}`, source: "Field record", provenance: "model", date: end });
  }
  return {
    title: "Topsoil drying while deeper soil holds",
    category: "Water",
    summary: `Moisture at ${surf.depthCm} cm fell ${fmt(Math.abs(pts(surf.observed)), 1)} pts in 14 days while ${deep.depthCm} cm moved ${fmt(Math.abs(pts(deep.observed)), 1)} pts.`,
    interpretation: "The topsoil is drying faster than rain is replacing it, while water stored deeper has not yet been drawn down. This may be a developing water-availability problem.",
    risk: "If the topsoil keeps drying, a crop in mid-season may come under water stress before the next rain.",
    comparison: { label: "14-day change in surface moisture", current: round(pts(surf.observed), 1), baseline: round(pts(surf.baseline), 1), unit: "pts", zScore: surf.zScore },
    confidenceNote: "Both depths come from one station: well observed at that point, unconfirmed for the rest of the field. Confidence is a heuristic, not calibrated.",
    observations,
    anomalyDetail: `Surface fell ${fmt(Math.abs(pts(surf.observed)), 1)} pts (rule: ${surf.rule}); 40 cm moved ${fmt(Math.abs(pts(deep.observed)), 1)} pts (rule: ${deep.rule}).`,
  };
}

function rainCard(r: AnomalyRecord, days: FieldDay[], field: Field): CardText {
  const main = r.signals.find((s) => s.baselineKind === "climatology") as AnomalySignal;
  const check = r.signals.find((s) => s.baselineKind === "other-source");
  const end = r.window.end;
  const dry = main.observed < main.baseline;
  const ratio = main.baseline > 0 ? main.observed / main.baseline : 1;
  const gaugeDays = r.coverage.find((c) => c.source === "station")?.daysWithData ?? 0;
  const filled = main.source === "station" ? r.coverage[0].daysInWindow - gaugeDays : 0;
  const fallback = main.source !== "station";

  const observations: Evidence[] = [
    { label: `${fallback ? "Satellite" : "Gauge"} rain, 14 days`, value: `${fmt(main.observed, 0)} mm${filled ? ` (${filled} missing gauge day${filled > 1 ? "s" : ""} filled with IMERG)` : ""}`,
      source: sourceName(main.source, field), provenance: provenanceOf(days, r.window, main), date: end },
  ];
  if (check) {
    observations.push({ label: "IMERG grid estimate, 14 days", value: `${fmt(check.observed, 0)} mm`, source: SOURCE_NAMES.imerg, provenance: provenanceOf(days, r.window, check), date: end });
  }
  observations.push({
    label: "Normal for the period", value: `${fmt(main.baseline, 0)} mm`,
    source: fallback ? `${SOURCE_NAMES[main.source]} monthly normal` : field.climate.source,
    provenance: !fallback && field.climate.basis === "illustrative" ? "simulated" : "model", date: end,
  });

  const agreement = check
    ? Math.abs(check.observed - main.observed) < Math.max(15, main.observed * 0.5)
      ? "Gauge and IMERG agree." : "Gauge and IMERG disagree, which lowers confidence."
    : "";
  return {
    title: dry ? "Rainfall well below normal" : "Rainfall well above normal",
    causeWhen: fallback ? "satellite" : dry ? "dry-gauge" : "wet-gauge",
    category: "Climate",
    summary: `The last 14 days brought ${fmt(main.observed, 0)} mm of rain (${fmt(ratio * 100, 0)}% of the ${fmt(main.baseline, 0)} mm normal for this time of year).`,
    interpretation: dry
      ? "A dry spell is under way. Its effect on the crop depends on how much water is still stored in the soil."
      : "A wet spell is under way. Saturated soil can limit root oxygen and delay field work.",
    risk: dry ? "Continued low rainfall would deepen any soil-water shortfall." : "Prolonged saturation raises the risk of waterlogging and nutrient loss by leaching.",
    comparison: { label: "14-day rainfall", current: round(main.observed, 0), baseline: round(main.baseline, 0), unit: "mm", zScore: null },
    confidenceNote: [
      fallback ? "No usable gauge day in the window: based on the satellite estimate alone (D-006)." : agreement,
      "Confidence is a heuristic, not calibrated.",
    ].filter(Boolean).join(" "),
    observations,
    anomalyDetail: `14-day total is ${fmt(ratio * 100, 0)}% of normal (rule: ${main.rule}).`,
  };
}

function ndviCard(r: AnomalyRecord, days: FieldDay[], field: Field): CardText {
  const sig = r.signals[0];
  const crop = CROPS[field.currentCrop];
  const prev = valueOn(days, r.window.start, "ndvi", "modis", null);
  const last = valueOn(days, r.window.end, "ndvi", "modis", null);
  const stage = stageOnDay(crop, daysBetween(field.plantedOn, r.window.end));
  const prov = provenanceOf(days, r.window, sig);
  return {
    title: "Vegetation index dipped during active growth",
    category: "Vegetation",
    summary: `NDVI fell from ${fmt(prev, 2)} to ${fmt(last, 2)} between the last two composites, during ${stage} of ${crop.name}, when it normally holds or rises.`,
    interpretation: "The canopy may be greening more slowly than expected for this stage. Early water stress is one possibility.",
    risk: "If the dip is real, crop growth may be slowing during a yield-sensitive stage.",
    comparison: { label: "NDVI change between composites", current: round(sig.observed, 3), baseline: 0, unit: "NDVI", zScore: null },
    confidenceNote: "One composite can be lowered by cloud or haze, and 250 m pixels mix this field with its neighbours. Confidence is a heuristic, not calibrated.",
    observations: [
      { label: "Latest NDVI composite", value: fmt(last, 2), source: SOURCE_NAMES.modis, provenance: prov, date: r.window.end },
      { label: "Previous composite", value: fmt(prev, 2), source: SOURCE_NAMES.modis, provenance: prov, date: r.window.start },
      { label: "Crop stage", value: `${crop.name}, ${stage}`, source: "Planting date + crop calendar", provenance: "model", date: r.window.end },
    ],
    anomalyDetail: `NDVI changed ${signed(sig.observed, 3)} (rule: ${sig.rule}).`,
  };
}

function offsetCard(r: AnomalyRecord, days: FieldDay[], field: Field): CardText {
  const sig = r.signals[0];
  const diff = pts(sig.observed - sig.baseline);
  const n = r.coverage[0].daysWithData;
  return {
    title: "Satellite and station moisture differ by a steady margin",
    category: "Data quality",
    summary: `SMAP reads ${fmt(Math.abs(diff), 1)} pts ${diff > 0 ? "wetter" : "drier"} than the station's 10 cm probe on average.`,
    interpretation: "The two measure different things: SMAP averages the top few centimetres over about 9 km, the station measures one point at 10 cm. A steady gap is what a difference of scale produces.",
    comparison: { label: "Mean moisture, SMAP vs station", current: round(pts(sig.observed), 1), baseline: round(pts(sig.baseline), 1), unit: "%", zScore: null },
    confidenceNote: `Based on ${n} SMAP overpasses in the record. Confidence is a heuristic, not calibrated.`,
    observations: [
      { label: "Mean SMAP moisture", value: `${fmt(pts(sig.observed), 1)}%`, source: SOURCE_NAMES.smap, provenance: provenanceOf(days, r.window, sig), date: r.window.end },
      { label: "Mean station moisture, 10 cm, same days", value: `${fmt(pts(sig.baseline), 1)}%`, source: field.station.name,
        provenance: provenanceOf(days, r.window, { variable: "soil_moisture", source: "station", depthCm: 10 }), date: r.window.end },
    ],
    anomalyDetail: `Mean difference ${signed(diff, 1)} pts (rule: ${sig.rule}).`,
  };
}

const BUILDERS = {
  "moisture-divergence": moistureCard,
  "rain-departure": rainCard,
  "ndvi-change": ndviCard,
  "sensor-offset": offsetCard,
} as const;

/** URL-safe discovery id, unique per field, detector and detection date. */
export function discoveryId(r: AnomalyRecord): string {
  return `${r.fieldId}-${r.detector}-${r.window.end}`;
}

export function toDiscovery(r: AnomalyRecord, days: FieldDay[], field: Field, followUps: FollowUp[] = []): Discovery {
  const id = discoveryId(r);
  const text = BUILDERS[r.detector](r, days, field);
  const follow = latestFollowUp(id, followUps);
  const coverage = r.coverage.map((c) => `${SOURCE_NAMES[c.source]} ${c.daysWithData}/${c.daysInWindow} days`).join("; ");
  const { anomalyDetail, causeWhen, ...card } = text;
  const causes = CAUSES[r.detector].filter((c) => !c.when || c.when === causeWhen);
  const top = rankChecks(r.detector, causes.map((c) => c.id))[0]?.check;
  const nextObservation: Discovery["nextObservation"] = top
    ? { action: top.action, rationale: top.rationale, checkId: top.id, answers: top.answers }
    : { action: "No check in the catalogue tells the possible causes apart.", rationale: "Keep watching the record." };

  let followDetail: string | undefined;
  if (follow?.answer !== undefined) {
    const check = OBSERVATION_CHECKS.find((c) => c.id === follow.checkId);
    followDetail = `${check ? `${check.action} ` : ""}Answer: ${follow.answer}.`;
  } else if (follow?.surfaceVwc !== undefined && follow.deepVwc !== undefined) {
    const s1 = valueOn(days, r.window.end, "soil_moisture", "station", 10);
    const d1 = valueOn(days, r.window.end, "soil_moisture", "station", 40);
    const gap = follow.deepVwc - follow.surfaceVwc;
    const detected = r.detector === "moisture-divergence" && s1 !== null && d1 !== null ? pts(d1 - s1) : null;
    followDetail = `Logged ${fmt(follow.surfaceVwc, 1)}% at the surface and ${fmt(follow.deepVwc, 1)}% at depth: a gap of ${fmt(gap, 1)} pts`
      + (detected === null ? "." : ` against ${fmt(detected, 1)} pts when detected, so the pattern ${gap >= detected * 0.8 ? "persists" : "has eased"}.`);
  }
  return {
    id,
    fieldId: r.fieldId,
    kind: r.detector,
    detectedOn: r.window.end,
    status: statusOf(follow),
    confidence: r.confidence,
    confirmed: follow ? [`Follow-up on ${longDate(follow.date)}: ${followDetail ?? "logged."}`] : [],
    stages: stagesFor({
      windowStart: r.window.start,
      windowEnd: r.window.end,
      observedDetail: `Data in the window ${r.window.start} to ${r.window.end}: ${coverage}.`,
      anomalyDetail,
      nextAction: nextObservation.action,
      followUp: follow,
      followUpDetail: followDetail,
    }),
    location: field.points.find((p) => p.kind === "anomaly" && p.discoveryKind === r.detector)?.position ?? r.location,
    ...card,
    alternatives: causes.filter((c) => c.text).map((c) => c.text),
    nextObservation,
  };
}
