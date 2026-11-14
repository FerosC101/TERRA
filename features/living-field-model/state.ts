import { CROPS, kcOnDay, stageOnDay } from "@/data/crops";
import { daysBetween } from "@/lib/dates";
import { fmt } from "@/lib/format";
import { sum } from "@/lib/science/stats";
import type { DailyObservation, DimensionKey, Field, FieldModel } from "@/types";

/** The model as it stood on one date: every figure the page shows, derived in one place. */
export function modelStateAt(field: Field, model: FieldModel, idx: number, span: number) {
  const obs = model.observations;
  const at = obs[Math.min(idx, obs.length - 1)];
  const upTo = obs.slice(0, idx + 1);
  const last30 = upTo.slice(-30);
  const crop = CROPS[field.currentCrop];
  const dap = daysBetween(field.plantedOn, at.date);
  const windowStart = Math.max(0, idx - span + 1);
  const families = [...new Set(field.rotationHistory.map((r) => CROPS[r.crop].familyCommon))];
  const ndviAt: DailyObservation | undefined = [...upTo].reverse().find((o) => o.ndvi !== null);
  const rain30 = sum(last30.map((o) => o.rainMm));
  return {
    at,
    isLatest: idx === obs.length - 1,
    view: obs.slice(windowStart, Math.min(obs.length, Math.max(idx + 1, windowStart + span))),
    upTo,
    crop,
    dap,
    stage: stageOnDay(crop, dap),
    kc: kcOnDay(crop, dap),
    ndviAt,
    rain30,
    rain30Start: last30[0].date,
    etc30: sum(last30.map((o) => o.etcMm)),
    storageChange30: at.storageMm - last30[0].storageMm,
    capacityMm: field.soil.awcMmPerM * field.soil.profileDepthM,
    families,
    legumeSeasons: field.rotationHistory.filter((r) => CROPS[r.crop].legume).length,
  };
}

export type ModelState = ReturnType<typeof modelStateAt>;

/** One headline figure per dimension, for the overview row. */
export function headline(state: ModelState): Record<DimensionKey, { value: string; caption: string }> {
  return {
    water: { value: `${fmt(state.at.storageMm, 0)} mm`, caption: "Estimated water in the root zone" },
    soil: { value: `${fmt(state.at.soilTempC, 1)} °C`, caption: "Soil temperature at 10 cm" },
    vegetation: { value: state.ndviAt ? fmt(state.ndviAt.ndvi, 2) : "Unavailable", caption: "Vegetation index (NDVI)" },
    climate: { value: `${fmt(state.rain30, 0)} mm`, caption: "Rain in the last 30 days" },
    rotation: { value: `${state.families.length} ${state.families.length === 1 ? "family" : "families"}`, caption: "Crop families grown" },
  };
}

export function strength(r: number): { label: "strong" | "moderate" | "weak"; level: 1 | 2 | 3 } {
  const a = Math.abs(r);
  return a >= 0.6 ? { label: "strong", level: 3 } : a >= 0.3 ? { label: "moderate", level: 2 } : { label: "weak", level: 1 };
}
