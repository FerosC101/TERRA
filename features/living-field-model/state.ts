import { CROPS } from "@/data/crops";
import { fmt } from "@/lib/format";
import type { FieldState } from "@/lib/science/fieldModel/state";
import { sum } from "@/lib/science/stats";
import type { DailyObservation, DimensionKey, Field, FieldModel } from "@/types";

/** Root-zone water the crop can still use, mm (Living Field Model, D-007). */
const availableMm = (s: FieldState) => s.water.tawMm - s.water.depletionMm;

/**
 * The model as it stood on one date: every figure the page shows, gathered in one place.
 * Water figures come from the Living Field Model (`states`, one per observation day).
 */
export function modelStateAt(field: Field, model: FieldModel, states: FieldState[], idx: number, span: number) {
  const obs = model.observations;
  const at = obs[Math.min(idx, obs.length - 1)];
  const living = states[Math.min(idx, states.length - 1)];
  const upTo = obs.slice(0, idx + 1);
  const last30 = upTo.slice(-30);
  const states30 = states.slice(Math.max(0, idx - 29), idx + 1);
  const crop = CROPS[field.currentCrop];
  const windowStart = Math.max(0, idx - span + 1);
  const families = [...new Set(field.rotationHistory.map((r) => CROPS[r.crop].familyCommon))];
  const ndviAt: DailyObservation | undefined = [...upTo].reverse().find((o) => o.ndvi !== null);
  const rain30 = sum(last30.map((o) => o.rainMm));
  const windowEnd = Math.min(obs.length, Math.max(idx + 1, windowStart + span));
  return {
    at,
    living,
    availableMm: availableMm(living),
    isLatest: idx === obs.length - 1,
    view: obs.slice(windowStart, windowEnd).map((o, k) => ({ ...o, waterMm: availableMm(states[windowStart + k]) })),
    upTo,
    crop,
    dap: living.water.dap,
    stage: living.water.stage,
    kc: living.water.kc,
    ndviAt,
    rain30,
    rain30Start: last30[0].date,
    etc30: sum(states30.map((s) => s.water.etcMm ?? 0)),
    storageChange30: availableMm(living) - availableMm(states30[0]),
    capacityMm: living.water.tawMm,
    families,
    legumeSeasons: field.rotationHistory.filter((r) => CROPS[r.crop].legume).length,
  };
}

export type ModelState = ReturnType<typeof modelStateAt>;

/** One headline figure per dimension, for the overview row. */
export function headline(state: ModelState): Record<DimensionKey, { value: string; caption: string }> {
  return {
    water: { value: `${fmt(state.availableMm, 0)} mm`, caption: "Estimated water in the root zone" },
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
