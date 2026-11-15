import { CROPS } from "@/data/crops";
import { realRecord } from "@/data/nasa/realRecords";
import { INDICATIVE_SOIL, LIPA_SOILGRIDS_SOIL } from "@/data/soils";
import { seriesToFieldDays } from "@/lib/adapters/demoSeries";
import { generateSeries } from "@/lib/demo/series";
import { runFieldModel, type FieldState } from "@/lib/science/fieldModel/state";
import type { DailyObservation, Field, FollowUp } from "@/types";
import { request } from "./apiClient";
import { mockField } from "./fieldSensorService";

/**
 * Living Field Model (D-007) for a field's record. Logged follow-ups (%, as entered) correct the
 * soil-moisture state on their date. The crop is the field's current crop for the whole record.
 * A field with a real record (Lipa Cropland) runs on it with its SoilGrids soil; others on the demo series.
 */
export function livingFieldModel(field: Field, obs: DailyObservation[], followUps: FollowUp[] = []): FieldState[] {
  const manual = followUps.map((f) => ({
    date: f.date,
    surfaceVwc: f.surfaceVwc === undefined ? undefined : f.surfaceVwc / 100,
    deepVwc: f.deepVwc === undefined ? undefined : f.deepVwc / 100,
  }));
  const real = realRecord(field.id);
  return runFieldModel(real ?? seriesToFieldDays(obs, field),
    { crop: CROPS[field.currentCrop], plantedOn: field.plantedOn, soil: real ? REAL_SOIL[field.id] : INDICATIVE_SOIL }, manual);
}

/** Soil for fields with a real record (SoilGrids estimates, data/soils.ts). */
const REAL_SOIL: Record<string, typeof INDICATIVE_SOIL> = { "lipa-cropland": LIPA_SOILGRIDS_SOIL };

/** GET /api/fields/{id}/state */
export function getFieldState(fieldId: string, followUps: FollowUp[] = []): Promise<FieldState[]> {
  return request(`/api/fields/${fieldId}/state`, () => {
    const field = mockField(fieldId);
    return livingFieldModel(field, generateSeries(field), followUps);
  });
}
