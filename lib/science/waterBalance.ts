import { CROPS, cropDuration, kcOnDay } from "@/data/crops";
import { monthShort } from "@/lib/dates";
import { clamp, round } from "@/lib/format";
import type {
  Field, Priorities, RotationEvaluation, RotationIndicators, RotationPlan,
  RotationSettings, Scenario, SeasonResult, StepPoint,
} from "@/types";

/**
 * Rotation water-balance model.
 *
 *   ETc = Kc × ET0                         (FAO-56 single crop coefficient)
 *   S_t = S_{t-1} + P − ETa − R − D        (single-layer soil-water bucket)
 *
 * It runs in ten-day steps over the field's monthly climatology. Everything it
 * returns is a model estimate for comparing rotations with each other — it is
 * not a yield forecast and has not been validated against this field.
 */
export const ASSUMPTIONS = {
  stepDays: 365 / 36,
  /** Share of rain above the threshold that runs off instead of soaking in */
  runoffCoefficient: 0.3,
  runoffThresholdMm: 25,
  /** Assumed rise in ET0 per °C of warming */
  et0PerDegree: 0.025,
  bareSoilKc: 0.25,
  initialStorageShare: 0.6,
};

export function evaluateRotation(
  plan: RotationPlan,
  field: Field,
  settings: RotationSettings,
  priorities: Priorities,
  scenario: Scenario,
): RotationEvaluation {
  const { stepDays } = ASSUMPTIONS;
  const stepsPerWindow = 36 / settings.seasonsPerYear;
  const windowDays = round(stepsPerWindow * stepDays);
  const capacity = field.soil.awcMmPerM * field.soil.profileDepthM;
  let storage = capacity * ASSUMPTIONS.initialStorageShare;

  const seasons: SeasonResult[] = [];
  const timeline: StepPoint[] = [];
  const notes: string[] = [];

  plan.crops.forEach((cropId, index) => {
    const crop = CROPS[cropId];
    const duration = cropDuration(crop);
    const startStep = settings.startMonth * 3 + index * stepsPerWindow;
    const startMonth = Math.floor(startStep / 3) % 12;
    const endMonth = Math.floor((startStep + stepsPerWindow - 1) / 3) % 12;
    const isFallow = cropId === "fallow";
    const overrun = !isFallow && duration > windowDays;
    const midStart = crop.stages[0] + crop.stages[1];
    const midEnd = midStart + crop.stages[2];

    const s: SeasonResult = {
      index, cropId,
      windowLabel: `${monthShort(startMonth)}–${monthShort(endMonth)}`,
      durationDays: Math.min(duration, windowDays), windowDays, overrun,
      demandMm: 0, rainMm: 0, metMm: 0, deficitMm: 0, runoffMm: 0, drainageMm: 0,
      heatShare: 0, coveredDays: 0,
    };
    let midSteps = 0;
    let hotSteps = 0;

    for (let k = 0; k < stepsPerWindow; k++) {
      const step = startStep + k;
      const month = Math.floor(step / 3) % 12;
      const day = k * stepDays + stepDays / 2;
      const growing = !isFallow && day < duration;

      const rain = (field.climate.rainMm[month] / 3) * (1 + scenario.rainChange);
      const et0 = field.climate.et0MmDay[month] * stepDays * (1 + ASSUMPTIONS.et0PerDegree * scenario.tempChangeC);
      const kc = growing ? kcOnDay(crop, day) : ASSUMPTIONS.bareSoilKc;
      const etc = kc * et0;

      const runoff = Math.max(0, rain - ASSUMPTIONS.runoffThresholdMm) * ASSUMPTIONS.runoffCoefficient;
      const available = Math.min(capacity, storage + rain - runoff);
      const depletion = 1 - available / capacity;
      const p = crop.depletionP;
      const ks = depletion <= p ? 1 : clamp((1 - depletion) / (1 - p), 0, 1);
      const eta = Math.min(etc * ks, storage + rain - runoff);
      const next = storage + rain - runoff - eta;
      const drainage = Math.max(0, next - capacity);
      storage = clamp(next - drainage, 0, capacity);

      s.rainMm += rain;
      s.runoffMm += runoff;
      s.drainageMm += drainage;
      if (growing) {
        s.demandMm += etc;
        s.metMm += eta;
        s.deficitMm += etc - eta;
        if (crop.cover && day >= crop.stages[0] / 2) s.coveredDays += stepDays;
        if (crop.heatThresholdC !== null && day >= midStart && day < midEnd) {
          midSteps++;
          if (field.climate.tmaxC[month] + scenario.tempChangeC > crop.heatThresholdC) hotSteps++;
        }
      }
      timeline.push({
        step: index * stepsPerWindow + k,
        label: `S${index + 1} · ${monthShort(month)}`,
        storageMm: round(storage, 1),
        rainMm: round(rain, 1),
        etcMm: round(etc, 1),
        etaMm: round(eta, 1),
      });
    }

    s.heatShare = midSteps ? hotSteps / midSteps : 0;
    s.coveredDays = Math.min(s.coveredDays, windowDays);
    (["demandMm", "rainMm", "metMm", "deficitMm", "runoffMm", "drainageMm"] as const).forEach((key) => {
      s[key] = round(s[key], 0);
    });
    if (overrun) {
      notes.push(`Season ${index + 1}: ${crop.name} needs about ${duration} days but the season window is ${windowDays} days. Its water use is cut off at the window.`);
    }
    seasons.push(s);
  });

  const indicators = summarise(plan, seasons);
  return {
    planId: plan.id,
    scenarioId: scenario.id,
    seasons,
    indicators,
    timeline,
    priorityMatch: priorityMatch(indicators, priorities),
    notes,
  };
}

function summarise(plan: RotationPlan, seasons: SeasonResult[]): RotationIndicators {
  const total = (key: keyof SeasonResult) => seasons.reduce((a, s) => a + (s[key] as number), 0);
  const cropped = plan.crops.filter((c) => c !== "fallow");
  const families = new Set(cropped.map((c) => CROPS[c].family));
  let sameFamilyRepeats = 0;
  let heavyFeederRepeats = 0;
  for (let i = 1; i < plan.crops.length; i++) {
    const a = CROPS[plan.crops[i - 1]];
    const b = CROPS[plan.crops[i]];
    if (a.id !== "fallow" && b.id !== "fallow" && a.family === b.family) sameFamilyRepeats++;
    if (a.nutrientRole === "heavy-feeder" && b.nutrientRole === "heavy-feeder") heavyFeederRepeats++;
  }
  const legumeSeasons = plan.crops.filter((c) => CROPS[c].legume).length;
  const n = Math.max(1, plan.crops.length);
  const demand = total("demandMm");
  const deficit = total("deficitMm");
  const heatSeasons = seasons.filter((s) => CROPS[s.cropId].heatThresholdC !== null);
  const heatShare = heatSeasons.length ? heatSeasons.reduce((a, s) => a + s.heatShare, 0) / heatSeasons.length : 0;
  const waterStressShare = demand ? deficit / demand : 0;
  // Legume share up to one season in two counts fully; back-to-back heavy feeders subtract.
  const nutrientIndex = clamp(Math.min(1, legumeSeasons / (n / 2)) - heavyFeederRepeats / n, 0, 1);

  return {
    demandMm: demand,
    rainMm: total("rainMm"),
    metMm: total("metMm"),
    deficitMm: deficit,
    excessMm: total("runoffMm") + total("drainageMm"),
    waterMetShare: demand ? total("metMm") / demand : 1,
    diversityShare: cropped.length ? families.size / Math.min(n, 4) : 0,
    distinctFamilies: families.size,
    sameFamilyRepeats,
    coverShare: total("coveredDays") / (n * (seasons[0]?.windowDays ?? 1)),
    legumeSeasons,
    heavyFeederRepeats,
    nutrientIndex,
    heatShare,
    waterStressShare,
    climateExposure: (waterStressShare + heatShare) / 2,
  };
}

/**
 * Weighted mean of five 0–1 indicators using the farmer's own weights.
 * A convenience summary of "how well does this fit what I said I care about" —
 * not a scientifically validated score.
 */
export function priorityMatch(ind: RotationIndicators, w: Priorities): number {
  const parts: [number, number][] = [
    [w.water, ind.waterMetShare],
    [w.diversity, clamp(ind.diversityShare, 0, 1)],
    [w.cover, ind.coverShare],
    [w.climate, 1 - ind.climateExposure],
    [w.nutrients, ind.nutrientIndex],
  ];
  const weight = parts.reduce((a, [x]) => a + x, 0);
  if (!weight) return 0;
  return round((parts.reduce((a, [x, v]) => a + x * v, 0) / weight) * 100, 0);
}
