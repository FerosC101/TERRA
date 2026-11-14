import { CROPS, cropDuration, stageOnDay } from "@/data/crops";
import { daysBetween, monthOf } from "@/lib/dates";
import { sum } from "@/lib/science/stats";
import { fmt } from "@/lib/format";
import type { DailyObservation, Discovery, Field } from "@/types";

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
    rainPeriodStart: last14[0].date,
    rainExpected14: sum(last14.map((o) => field.climate.rainMm[monthOf(o.date)] / 30)),
    rain30: sum(obs.slice(-30).map((o) => o.rainMm)),
    lastNdvi,
    ndviChange: lastNdvi && prevNdvi ? (lastNdvi.ndvi as number) - (prevNdvi.ndvi as number) : 0,
    lastSmap,
    capacityMm: field.soil.awcMmPerM * field.soil.profileDepthM,
  };
}

export type FieldSummary = ReturnType<typeof summariseField>;

export interface ActivityItem {
  date: string;
  title: string;
  detail: string;
  kind: "discovery" | "observation" | "field";
  href?: string;
}

/** The most recent notable events for a field, newest first. Shared by Overview and Reports. */
export function buildActivity(field: Field, obs: DailyObservation[], discoveries: Discovery[], limit = 6): ActivityItem[] {
  const items: ActivityItem[] = [];
  const latestOf = (pick: (o: DailyObservation) => boolean) => [...obs].reverse().find(pick);
  discoveries.forEach((d) => items.push({ date: d.detectedOn, title: d.title, detail: d.summary, kind: "discovery", href: `/discoveries/${d.id}` }));
  const ndvi = latestOf((o) => o.ndvi !== null);
  if (ndvi) items.push({ date: ndvi.date, title: "Vegetation composite received", detail: `16-day NDVI of ${fmt(ndvi.ndvi, 2)} (satellite, 250 m).`, kind: "observation" });
  const rain = latestOf((o) => o.rainMm >= 15);
  if (rain) items.push({ date: rain.date, title: "Last substantial rain", detail: `${fmt(rain.rainMm, 0)} mm at the station gauge.`, kind: "observation" });
  if (field.plantedOn >= obs[0].date) items.push({ date: field.plantedOn, title: `${CROPS[field.currentCrop].name} planted`, detail: "Planting date from the field record.", kind: "field" });
  return items.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
}
