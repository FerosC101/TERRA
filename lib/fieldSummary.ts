import { CROPS, cropDuration, stageOnDay } from "@/data/crops";
import { daysBetween, monthOf } from "@/lib/dates";
import { sum } from "@/lib/science/stats";
import type { DailyObservation, Field } from "@/types";

/** Headline figures derived from the observation record — shared by Overview and Reports. */
export function summariseField(field: Field, obs: DailyObservation[]) {
  const latest = obs[obs.length - 1];
  const prior = obs[obs.length - 15];
  const last14 = obs.slice(-14);
  const crop = CROPS[field.currentCrop];
  const dap = daysBetween(field.plantedOn, latest.date);
  const ndviRows = obs.filter((o) => o.ndvi !== null);
  const lastNdvi = ndviRows[ndviRows.length - 1];
  const prevNdvi = ndviRows[ndviRows.length - 2];
  const lastSmap = [...obs].reverse().find((o) => o.smapVwc !== null);
  return {
    latest,
    crop,
    dap,
    stage: stageOnDay(crop, dap),
    duration: cropDuration(crop),
    surfaceChange14: latest.surfaceVwc - prior.surfaceVwc,
    deepChange14: latest.deepVwc - prior.deepVwc,
    soilTempChange14: latest.soilTempC - prior.soilTempC,
    rain14: sum(last14.map((o) => o.rainMm)),
    rainExpected14: sum(last14.map((o) => field.climate.rainMm[monthOf(o.date)] / 30)),
    rain30: sum(obs.slice(-30).map((o) => o.rainMm)),
    lastNdvi,
    ndviChange: lastNdvi && prevNdvi ? (lastNdvi.ndvi as number) - (prevNdvi.ndvi as number) : 0,
    lastSmap,
    capacityMm: field.soil.awcMmPerM * field.soil.profileDepthM,
  };
}

export type FieldSummary = ReturnType<typeof summariseField>;
