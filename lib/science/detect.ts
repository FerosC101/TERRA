import { CROPS, stageOnDay } from "@/data/crops";
import { addDays, daysBetween, longDate, monthOf, shortDate } from "@/lib/dates";
import { clamp, fmt, round, signed } from "@/lib/format";
import { mean, stdev, sum, zScore } from "@/lib/science/stats";
import type { DailyObservation, Discovery, Field, FollowUp, InvestigationStage, StageKey } from "@/types";

const WINDOW = 14;

const STAGE_LABELS: Record<StageKey, string> = {
  observed: "Observed",
  anomaly: "Anomaly detected",
  investigation: "Investigation selected",
  "new-data": "New data collected",
  "model-updated": "Field model updated",
};
const ORDER: StageKey[] = ["observed", "anomaly", "investigation", "new-data", "model-updated"];

function stages(reached: number, dates: (string | undefined)[], details: string[]): InvestigationStage[] {
  return ORDER.map((key, i) => ({
    key,
    label: STAGE_LABELS[key],
    state: i < reached ? "done" : i === reached ? "active" : "pending",
    date: i <= reached ? dates[i] : undefined,
    detail: details[i],
  }));
}

/**
 * Runs TERRA's detectors over a field's observation record. Each detector
 * compares the latest window with the field's own earlier record and returns a
 * discovery only when its rule is met. Rules are simple and inspectable on purpose.
 */
export function detectDiscoveries(field: Field, obs: DailyObservation[], followUps: FollowUp[] = []): Discovery[] {
  const out: Discovery[] = [];
  const n = obs.length;
  const today = obs[n - 1];
  const past = obs[n - 1 - WINDOW];
  const stationPos = field.station.position;
  const anomalyPoint = (kind: Discovery["kind"]) =>
    field.points.find((p) => p.kind === "anomaly" && p.discoveryKind === kind)?.position ?? stationPos;

  // Baseline of 14-day changes across the earlier record
  const surfChanges: number[] = [];
  const gapSeries: number[] = [];
  for (let i = WINDOW; i < n - WINDOW; i++) {
    surfChanges.push(obs[i].surfaceVwc - obs[i - WINDOW].surfaceVwc);
    gapSeries.push(obs[i].deepVwc - obs[i].surfaceVwc);
  }

  // 1 — Rainfall departure from the monthly baseline
  const rain14 = sum(obs.slice(-WINDOW).map((o) => o.rainMm));
  const imerg14 = sum(obs.slice(-WINDOW).map((o) => o.rainImergMm));
  const expected14 = sum(obs.slice(-WINDOW).map((o) => field.climate.rainMm[monthOf(o.date)] / 30));
  const rainRatio = expected14 ? rain14 / expected14 : 1;

  // 2 — Surface / deep moisture divergence
  const surfChange = today.surfaceVwc - past.surfaceVwc;
  const deepChange = today.deepVwc - past.deepVwc;
  const gap = today.deepVwc - today.surfaceVwc;
  if (surfChange <= -5 && Math.abs(deepChange) <= 3) {
    const id = `${field.id}-moisture-divergence`;
    const z = zScore(surfChange, surfChanges);
    const follow = followUps.filter((f) => f.discoveryId === id).at(-1);
    const persists = follow ? follow.deepVwc - follow.surfaceVwc >= gap * 0.8 : false;
    const detected = addDays(today.date, -3);
    out.push({
      id, fieldId: field.id, kind: "moisture-divergence",
      title: "Unusual soil moisture pattern",
      category: "Water",
      summary: "Surface moisture has declined while deeper soil moisture remains relatively stable.",
      detectedOn: detected,
      status: follow ? "resolved" : "investigating",
      confidence: clamp(0.45 + (z !== null ? Math.min(Math.abs(z), 3) * 0.1 : 0) + (rainRatio < 0.5 ? 0.1 : 0), 0, 0.9),
      confidenceNote: "Both depths come from one station, so the pattern is well observed at that point but unconfirmed for the rest of the field.",
      observations: [
        { label: "Surface moisture, 10 cm", value: `${fmt(past.surfaceVwc, 1)}% → ${fmt(today.surfaceVwc, 1)}% (${signed(surfChange)} pts in 14 days)`, source: field.station.name, provenance: "measurement", date: today.date },
        { label: "Deeper moisture, 40 cm", value: `${fmt(past.deepVwc, 1)}% → ${fmt(today.deepVwc, 1)}% (${signed(deepChange)} pts in 14 days)`, source: field.station.name, provenance: "measurement", date: today.date },
        { label: "Rainfall, last 14 days", value: `${fmt(rain14, 0)} mm at the gauge; ${fmt(imerg14, 0)} mm in the IMERG grid cell`, source: "Station gauge · GPM IMERG", provenance: "measurement", date: today.date },
        { label: "Historical baseline", value: `Typical 14-day surface change in this record: ${signed(mean(surfChanges))} ± ${fmt(stdev(surfChanges), 1)} pts. Expected rain for the period: ${fmt(expected14, 0)} mm`, source: "Field record · monthly climatology", provenance: "model", date: today.date },
      ],
      interpretation: "The difference between surface and deeper moisture conditions may indicate a developing water availability pattern: the topsoil is drying faster than rain is replacing it, while water stored deeper has not yet been drawn down.",
      alternatives: [
        "A normal short dry spell that the next rain will erase.",
        "The 10 cm sensor losing contact with drying, shrinking soil, which exaggerates the decline.",
        "Roots still concentrated near the surface, so the crop has not started using deeper water.",
      ],
      confirmed: follow
        ? [persists
            ? `Follow-up on ${longDate(follow.date)} found the surface–deep gap at ${fmt(follow.deepVwc - follow.surfaceVwc, 1)} pts: the pattern persists.`
            : `Follow-up on ${longDate(follow.date)} found the surface–deep gap at ${fmt(follow.deepVwc - follow.surfaceVwc, 1)} pts: the pattern has eased.`]
        : [],
      nextObservation: {
        action: "Collect another surface and subsurface moisture measurement to determine whether the pattern persists.",
        rationale: "A second reading 2–3 days later, ideally at a different spot in the field, separates a real drying trend from a single-sensor effect.",
      },
      comparison: { label: "14-day change in surface moisture", current: round(surfChange, 1), baseline: round(mean(surfChanges), 1), unit: "pts", zScore: z },
      stages: stages(
        follow ? 5 : 2,
        [addDays(today.date, -WINDOW), detected, addDays(today.date, -1), follow?.date, follow?.date],
        [
          "Station readings at 10 cm and 40 cm are logged daily.",
          `Surface moisture fell ${fmt(Math.abs(surfChange), 1)} pts in 14 days while the 40 cm reading moved ${fmt(Math.abs(deepChange), 1)} pts. The surface–deep gap is now ${fmt(gap, 1)} pts against a usual ${fmt(mean(gapSeries), 1)} pts.`,
          "TERRA selected a repeat surface and subsurface measurement as the observation most likely to separate the possible explanations.",
          follow ? `You logged ${fmt(follow.surfaceVwc, 1)}% at the surface and ${fmt(follow.deepVwc, 1)}% at depth.` : "Waiting for a follow-up measurement. Log one below.",
          follow ? (persists ? "Water Memory now records a persisting surface drying pattern." : "Water Memory now records the pattern as a short dry spell that eased.") : "The field model will be updated once new data arrives.",
        ],
      ),
      location: anomalyPoint("moisture-divergence"),
      risk: "If the topsoil keeps drying, a crop in mid-season may come under water stress before the next rain.",
    });
  }

  if (rainRatio < 0.45 || rainRatio > 1.7) {
    const dry = rainRatio < 1;
    out.push({
      id: `${field.id}-rain-departure`, fieldId: field.id, kind: "rain-departure",
      title: dry ? "Rainfall well below the seasonal baseline" : "Rainfall well above the seasonal baseline",
      category: "Climate",
      summary: `The last 14 days brought ${fmt(rain14, 0)} mm of rain, against about ${fmt(expected14, 0)} mm expected for this time of year.`,
      detectedOn: addDays(today.date, -2),
      status: "new",
      confidence: Math.abs(imerg14 - rain14) < Math.max(15, rain14 * 0.5) ? 0.8 : 0.6,
      confidenceNote: "The station gauge and the satellite grid estimate are compared. Agreement between two independent sources raises confidence; the baseline itself is a demo climatology.",
      observations: [
        { label: "Station rain gauge, 14 days", value: `${fmt(rain14, 0)} mm`, source: field.station.name, provenance: "measurement", date: today.date },
        { label: "IMERG grid estimate, 14 days", value: `${fmt(imerg14, 0)} mm (≈10 km cell)`, source: "GPM IMERG", provenance: "satellite", date: today.date },
        { label: "Expected for the period", value: `${fmt(expected14, 0)} mm`, source: "Monthly climatology", provenance: "model", date: today.date },
      ],
      interpretation: dry
        ? "A dry spell is under way. Its effect on the crop depends on how much water is still stored in the soil."
        : "A wet spell is under way. Saturated soil can limit root oxygen and delay field work.",
      alternatives: [
        "The baseline is an average: individual two-week periods often differ from it.",
        dry ? "A partly blocked rain gauge would also read low." : "A single intense storm can dominate a two-week total.",
      ],
      confirmed: [],
      nextObservation: {
        action: dry ? "Check the rain gauge for blockage and watch the next 7 days of rainfall." : "Check low parts of the field for standing water after the next rain.",
        rationale: "Confirms the gauge reading and shows whether the departure is still growing.",
      },
      comparison: { label: "14-day rainfall", current: round(rain14, 0), baseline: round(expected14, 0), unit: "mm", zScore: null },
      stages: stages(1,
        [addDays(today.date, -WINDOW), addDays(today.date, -2)],
        [
          "Daily rainfall from the gauge and the IMERG grid cell.",
          `The 14-day total is ${fmt(rainRatio * 100, 0)}% of the seasonal expectation.`,
          "No investigation selected yet.",
          "No follow-up data yet.",
          "The field model has not changed.",
        ]),
      location: anomalyPoint("rain-departure"),
      risk: dry ? "Continued low rainfall would deepen any soil-water shortfall." : "Prolonged saturation raises the risk of waterlogging and nutrient loss by leaching.",
    });
  }

  // 3 — Vegetation index change against the crop stage
  const composites = obs.filter((o) => o.ndvi !== null);
  if (composites.length >= 3) {
    const last = composites[composites.length - 1];
    const prev = composites[composites.length - 2];
    const change = (last.ndvi as number) - (prev.ndvi as number);
    const stage = stageOnDay(CROPS[field.currentCrop], daysBetween(field.plantedOn, last.date));
    if (change <= -0.03 && (stage === "development" || stage === "mid-season")) {
      out.push({
        id: `${field.id}-ndvi-change`, fieldId: field.id, kind: "ndvi-change",
        title: "Vegetation index dipped during active growth",
        category: "Vegetation",
        summary: `NDVI fell from ${fmt(prev.ndvi, 2)} to ${fmt(last.ndvi, 2)} between the last two composites, at a growth stage when it normally holds or rises.`,
        detectedOn: last.date,
        status: "new",
        confidence: 0.4,
        confidenceNote: "A single composite can be lowered by cloud or haze. At 250 m, pixels also mix this field with its neighbours.",
        observations: [
          { label: "Latest NDVI composite", value: `${fmt(last.ndvi, 2)} (period ending ${shortDate(last.date)})`, source: "MODIS MOD13Q1, 250 m", provenance: "satellite", date: last.date },
          { label: "Previous composite", value: `${fmt(prev.ndvi, 2)} (period ending ${shortDate(prev.date)})`, source: "MODIS MOD13Q1, 250 m", provenance: "satellite", date: prev.date },
          { label: "Crop stage", value: `${CROPS[field.currentCrop].name}, ${stage}`, source: "Planting date + crop calendar", provenance: "model", date: last.date },
        ],
        interpretation: "The canopy may be greening more slowly than expected for this stage. Together with the dry topsoil, early water stress is one possibility.",
        alternatives: [
          "Residual cloud or haze in the composite period.",
          "Mixed pixels: neighbouring land with a different crop or a harvested plot.",
          "Normal variation between composites.",
        ],
        confirmed: [],
        nextObservation: {
          action: "Walk the field and note leaf rolling or colour change; compare with the next 16-day composite.",
          rationale: "Ground observation is the quickest way to tell a real canopy change from a satellite artefact.",
        },
        comparison: { label: "NDVI change between composites", current: round(change, 3), baseline: 0.02, unit: "NDVI", zScore: null },
        stages: stages(1, [prev.date, last.date],
          [
            "16-day NDVI composites for the pixels overlapping the field.",
            `NDVI dropped ${fmt(Math.abs(change), 2)} during ${stage}.`,
            "No investigation selected yet.",
            "No follow-up data yet.",
            "The field model has not changed.",
          ]),
        location: anomalyPoint("ndvi-change"),
        risk: "If the dip is real, crop growth may be slowing during a yield-sensitive stage.",
      });
    }
  }

  // 4 — Station vs satellite offset: a completed investigation
  const pairs = obs.filter((o) => o.smapVwc !== null);
  const diffs = pairs.map((o) => (o.smapVwc as number) - o.surfaceVwc);
  const offsetMean = mean(diffs);
  if (Math.abs(offsetMean) >= 1.5 && pairs.length > 20) {
    const first = pairs[0].date;
    out.push({
      id: `${field.id}-sensor-offset`, fieldId: field.id, kind: "sensor-offset",
      title: "Satellite and station moisture disagree by a steady margin",
      category: "Data quality",
      summary: `SMAP reads ${fmt(Math.abs(offsetMean), 1)} pts ${offsetMean > 0 ? "wetter" : "drier"} than the field station on average, and the gap is consistent.`,
      detectedOn: addDays(first, 30),
      status: "resolved",
      confidence: 0.85,
      confidenceNote: `Based on ${pairs.length} days where both sources reported.`,
      observations: [
        { label: "Mean difference, SMAP − station", value: `${signed(offsetMean)} pts over ${pairs.length} paired days`, source: "SMAP · field station", provenance: "model", date: today.date },
        { label: "Spread of the difference", value: `± ${fmt(stdev(diffs), 1)} pts`, source: "SMAP · field station", provenance: "model", date: today.date },
      ],
      interpretation: "The two sources measure different things: SMAP averages the top few centimetres over roughly 9 km, the station measures one point at 10 cm.",
      alternatives: [],
      confirmed: [
        "The offset is steady, which is what a difference of scale produces. It is not a sensor fault.",
        "TERRA uses SMAP for regional trend and timing, and the station for the field's actual level.",
      ],
      nextObservation: {
        action: "No action needed. Re-check the offset after any sensor is moved or replaced.",
        rationale: "A change in the offset would signal a sensor problem.",
      },
      comparison: { label: "Mean moisture, SMAP vs station", current: round(mean(pairs.map((o) => o.smapVwc as number)), 1), baseline: round(mean(pairs.map((o) => o.surfaceVwc)), 1), unit: "%", zScore: null },
      stages: stages(5,
        [first, addDays(first, 30), addDays(first, 31), addDays(first, 60), addDays(first, 61)],
        [
          "Station surface moisture and SMAP overpasses are logged side by side.",
          "After 30 days the two sources showed a persistent gap.",
          "TERRA chose to keep collecting paired readings to test whether the gap is steady or drifting.",
          "A further 30 days of paired readings were collected.",
          "Water Memory now stores a fixed station–satellite offset and treats SMAP as a regional signal.",
        ]),
      location: stationPos,
    });
  }

  return out;
}
