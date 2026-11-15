/**
 * Discovery cards: one Discovery Engine output (AnomalyRecord, numbers only) → the app's
 * human-readable `Discovery`. Every figure on a card comes from the record or from the FieldDays
 * it was computed on; each evidence row carries the provenance of the values actually used.
 * Possible causes and the next check come from data/observationChecks.ts (ranked by
 * lib/science/nextObservation.ts). Interpretation wording is carried over from the former lib/science/detect.ts (removed 2026-11-15, in git history).
 */
import { CROPS, stageOnDay } from "@/data/crops";
import { DISCOVERY_RULES } from "@/data/discoveryRules";
import { REAL_FIELD_MODEL } from "@/data/lipaModelConfig";
import { CAUSES, OBSERVATION_CHECKS, type Cause } from "@/data/observationChecks";
import { daysBetween, longDate } from "@/lib/dates";
import { fmt, round, signed } from "@/lib/format";
import type { Discovery, Evidence, Field, FollowUp, Provenance } from "@/types";
import type { AnomalyRecord, AnomalySignal, FieldDay, SourceId, Variable } from "@/types/discovery-contract";
import { rankChecks } from "../nextObservation";
import { seasonOn, type CropSeason } from "../season";
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

/**
 * Inputs of a real field's engine run that are not observations (D-020): the planned station's SIMULATED probe
 * readings, and the crop calendar (farmer-reported, or ASSUMED where the field has none). Empty for demo fields.
 */
export interface CardInputs {
  simulatedStation?: boolean;
  seasons?: CropSeason[];
  /** Set when `seasons` is an assumed calendar, not the field's own. */
  assumedSeasonsBasis?: string;
}

const SIMULATED_NOTE = "Built on SIMULATED readings of the planned station: no probe is installed. The readings come from a simple soil-water bucket driven by the real rain and the field model's crop water use, so this alarm shows the rule working on this field's weather, not a measured change. It is not evidence and is kept out of experiments and model reports (D-020).";
const SIMULATED_STATION = "Planned station (simulated, not installed)";
/** An alarm on a simulated or assumed input is never graded above the lowest heuristic the engine uses (D-020). */
const STAND_IN_CONFIDENCE = DISCOVERY_RULES.rainSatelliteFallback.confidence;

function moistureCard(r: AnomalyRecord, days: FieldDay[], field: Field, inputs: CardInputs): CardText {
  const [surf, deep] = r.signals;
  const end = r.window.end;
  const sim = !!inputs.simulatedStation;
  const name = sim ? SIMULATED_STATION : sourceName("station", field);
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
    title: sim ? "Topsoil drying while deeper soil holds (simulated probes)" : "Topsoil drying while deeper soil holds",
    category: "Water",
    summary: `Moisture at ${surf.depthCm} cm fell ${fmt(Math.abs(pts(surf.observed)), 1)} pts in 14 days while ${deep.depthCm} cm moved ${fmt(Math.abs(pts(deep.observed)), 1)} pts.`,
    interpretation: sim
      ? "In the simulation, the topsoil dries faster than rain replaces it while deeper water is not yet drawn down. If a real probe showed this, it could be a developing water-availability problem."
      : "The topsoil is drying faster than rain is replacing it, while water stored deeper has not yet been drawn down. This may be a developing water-availability problem.",
    risk: "If the topsoil keeps drying, a crop in mid-season may come under water stress before the next rain.",
    comparison: { label: "14-day change in surface moisture", current: round(pts(surf.observed), 1), baseline: round(pts(surf.baseline), 1), unit: "pts", zScore: surf.zScore },
    confidenceNote: sim
      ? `${SIMULATED_NOTE} Confidence is a heuristic, not calibrated.`
      : "Both depths come from one station: well observed at that point, unconfirmed for the rest of the field. Confidence is a heuristic, not calibrated.",
    observations,
    anomalyDetail: `Surface fell ${fmt(Math.abs(pts(surf.observed)), 1)} pts (rule: ${surf.rule}); 40 cm moved ${fmt(Math.abs(pts(deep.observed)), 1)} pts (rule: ${deep.rule}).`,
  };
}

function rainCard(r: AnomalyRecord, days: FieldDay[], field: Field): CardText { // rain never uses simulated inputs
  const main = r.signals.find((s) => s.baselineKind === "climatology") as AnomalySignal;
  const check = r.signals.find((s) => s.baselineKind === "other-source");
  const end = r.window.end;
  const dry = main.observed < main.baseline;
  const ratio = main.baseline > 0 ? main.observed / main.baseline : 1;
  const gaugeDays = r.coverage.find((c) => c.source === "station")?.daysWithData ?? 0;
  const filled = main.source === "station" ? r.coverage[0].daysInWindow - gaugeDays : 0;
  const fallback = main.source !== "station";
  const n = daysBetween(r.window.start, end) + 1;

  const observations: Evidence[] = [
    { label: `${fallback ? (main.source === "power" ? "Modelled (NASA POWER)" : "Satellite") : "Gauge"} rain, ${n} days`, value: `${fmt(main.observed, 0)} mm${filled ? ` (${filled} missing gauge day${filled > 1 ? "s" : ""} filled with IMERG)` : ""}`,
      source: sourceName(main.source, field), provenance: provenanceOf(days, r.window, main), date: end },
  ];
  if (check) {
    observations.push({ label: `IMERG grid estimate, ${n} days`, value: `${fmt(check.observed, 0)} mm`, source: SOURCE_NAMES.imerg, provenance: provenanceOf(days, r.window, check), date: end });
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
    summary: `The ${n} days to ${longDate(end)} brought ${fmt(main.observed, 0)} mm of rain (${fmt(ratio * 100, 0)}% of the ${fmt(main.baseline, 0)} mm normal for this time of year).`,
    interpretation: dry
      ? `A dry spell${n > 14 ? " that built up over a season" : ""}. Its effect on the crop depends on how much water was stored in the soil at the time.`
      : "A wet spell. Saturated soil can limit root oxygen and delay field work.",
    risk: dry ? "Continued low rainfall would deepen any soil-water shortfall." : "Prolonged saturation raises the risk of waterlogging and nutrient loss by leaching.",
    comparison: { label: `${n}-day rainfall`, current: round(main.observed, 0), baseline: round(main.baseline, 0), unit: "mm", zScore: null },
    confidenceNote: [
      fallback ? `No usable gauge day in the window: based on the ${main.source === "power" ? "NASA POWER model estimate (~50 km)" : "satellite estimate"} alone (D-006).` : agreement,
      "Confidence is a heuristic, not calibrated.",
    ].filter(Boolean).join(" "),
    observations,
    anomalyDetail: `${n}-day total is ${fmt(ratio * 100, 0)}% of normal (rule: ${main.rule}).`,
  };
}

function ndviCard(r: AnomalyRecord, days: FieldDay[], field: Field, inputs: CardInputs): CardText {
  const sig = r.signals[0];
  // The season on that date from the run's calendar (farmer-reported for Plot A, ASSUMED where a field has none),
  // else the field's crop and planting date.
  const seasons = inputs.seasons ?? REAL_FIELD_MODEL[field.id]?.seasons;
  const season = seasons ? seasonOn(seasons, r.window.end) : null;
  const assumed = inputs.assumedSeasonsBasis;
  const crop = season?.crop ?? CROPS[field.currentCrop];
  const src = sig.source;
  const prev = valueOn(days, r.window.start, "ndvi", src, null);
  const last = valueOn(days, r.window.end, "ndvi", src, null);
  const stage = stageOnDay(crop, daysBetween(season?.plantedOn ?? field.plantedOn, r.window.end));
  const prov = provenanceOf(days, r.window, sig);
  return {
    title: assumed ? "Vegetation index dipped during active growth (assumed crop calendar)" : "Vegetation index dipped during active growth",
    category: "Vegetation",
    summary: `NDVI fell from ${fmt(prev, 2)} to ${fmt(last, 2)} between the last two ${src === "hls" ? "clear passes" : "composites"}, during ${stage} of ${crop.name}, when it normally holds or rises.`,
    interpretation: "The canopy may be greening more slowly than expected for this stage. Early water stress is one possibility.",
    risk: "If the dip is real, crop growth may be slowing during a yield-sensitive stage.",
    comparison: { label: "NDVI change between composites", current: round(sig.observed, 3), baseline: 0, unit: "NDVI", zScore: null },
    confidenceNote: [
      assumed ? `The growth stage comes from an ${assumed}; F-015 found that this field's NDVI alarms depend on the assumed planting date. Not evidence; kept out of experiments and model reports (D-020).` : "",
      src === "hls"
        ? "One pass can still be lowered by thin cloud or haze the cloud mask missed; 30 m pixels lie inside the plot."
        : "One composite can be lowered by cloud or haze, and 250 m pixels mix this field with its neighbours.",
      "Confidence is a heuristic, not calibrated.",
    ].filter(Boolean).join(" "),
    observations: [
      { label: src === "hls" ? "Latest NDVI pass" : "Latest NDVI composite", value: fmt(last, 2), source: SOURCE_NAMES[src], provenance: prov, date: r.window.end },
      { label: src === "hls" ? "Previous pass" : "Previous composite", value: fmt(prev, 2), source: SOURCE_NAMES[src], provenance: prov, date: r.window.start },
      { label: "Crop stage", value: `${crop.name}, ${stage}`,
        source: assumed ? "ASSUMED calendar (Plot A farmer's seasons)" : season ? "Farmer-reported season + crop calendar" : "Planting date + crop calendar",
        provenance: assumed ? "simulated" : "model", date: r.window.end },
    ],
    anomalyDetail: `NDVI changed ${signed(sig.observed, 3)} (rule: ${sig.rule}).`,
  };
}

function offsetCard(r: AnomalyRecord, days: FieldDay[], field: Field, inputs: CardInputs): CardText {
  const sig = r.signals[0];
  const diff = pts(sig.observed - sig.baseline);
  const n = r.coverage[0].daysWithData;
  const sim = !!inputs.simulatedStation;
  return {
    title: sim ? "SMAP and the simulated station differ by a steady margin" : "Satellite and station moisture differ by a steady margin",
    category: "Data quality",
    summary: `SMAP reads ${fmt(Math.abs(diff), 1)} pts ${diff > 0 ? "wetter" : "drier"} than the ${sim ? "simulated" : "station's"} 10 cm probe on average.`,
    interpretation: sim
      ? "The station readings are simulated by a simple bucket model with its own soil limits, so this margin comes from the simulation's equations, not from the field. SMAP L3 at Lipa also reads wetter than SMAP L4 (F-016)."
      : "The two measure different things: SMAP averages the top few centimetres over about 9 km, the station measures one point at 10 cm. A steady gap is what a difference of scale produces.",
    comparison: { label: "Mean moisture, SMAP vs station", current: round(pts(sig.observed), 1), baseline: round(pts(sig.baseline), 1), unit: "%", zScore: null },
    confidenceNote: `Based on ${n} SMAP overpasses in the record.${sim ? ` ${SIMULATED_NOTE}` : ""} Confidence is a heuristic, not calibrated.`,
    observations: [
      { label: "Mean SMAP moisture", value: `${fmt(pts(sig.observed), 1)}%`, source: SOURCE_NAMES.smap, provenance: provenanceOf(days, r.window, sig), date: r.window.end },
      { label: "Mean station moisture, 10 cm, same days", value: `${fmt(pts(sig.baseline), 1)}%`, source: sim ? SIMULATED_STATION : field.station.name,
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

export function toDiscovery(r: AnomalyRecord, days: FieldDay[], field: Field, followUps: FollowUp[] = [], inputs: CardInputs = {}): Discovery {
  const id = discoveryId(r);
  const text = BUILDERS[r.detector](r, days, field, inputs);
  const follow = latestFollowUp(id, followUps);
  const coverage = r.coverage.map((c) => `${c.source === "station" && inputs.simulatedStation ? SIMULATED_STATION : SOURCE_NAMES[c.source]} ${c.daysWithData}/${c.daysInWindow} days`).join("; ");
  const { anomalyDetail, causeWhen, ...card } = text;
  // With a simulated station there is no probe, so causes about the probe itself do not apply.
  const noProbe = inputs.simulatedStation ? ["sensor-contact", "probe-drift"] : [];
  const causes = CAUSES[r.detector].filter((c) => (!c.when || c.when === causeWhen) && !noProbe.includes(c.id));
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
    confidence: (inputs.simulatedStation && (r.detector === "moisture-divergence" || r.detector === "sensor-offset"))
      || (inputs.assumedSeasonsBasis && r.detector === "ndvi-change") ? Math.min(r.confidence, STAND_IN_CONFIDENCE) : r.confidence,
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
