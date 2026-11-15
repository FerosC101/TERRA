import { CROPS } from "@/data/crops";
import { REAL_FIELD_MODEL } from "@/data/lipaModelConfig";
import { realRecord } from "@/data/nasa/realRecords";
import { INDICATIVE_SOIL } from "@/data/soils";
import { seriesToFieldDays } from "@/lib/adapters/demoSeries";
import { runFieldModel, type FieldState } from "@/lib/science/fieldModel/state";
import type { DailyObservation, Field, FollowUp } from "@/types";
import { request } from "./apiClient";
import { mockField } from "./fieldSensorService";
import { fieldObservations } from "./observationSource";

/**
 * Living Field Model (D-007) for a field's record. Logged follow-ups (%, as entered) correct the
 * soil-moisture state on their date. A field with a real record (Lipa Cropland, Plot A) runs on it with its SoilGrids
 * soil and, where reported, the farmer's crop seasons (data/lipaModelConfig.ts REAL_FIELD_MODEL); without seasons the
 * crop is the field's current crop for the whole record. Demo fields run on the demo series.
 */
export function livingFieldModel(field: Field, obs: DailyObservation[], followUps: FollowUp[] = []): FieldState[] {
  const manual = followUps.map((f) => ({
    date: f.date,
    surfaceVwc: f.surfaceVwc === undefined ? undefined : f.surfaceVwc / 100,
    deepVwc: f.deepVwc === undefined ? undefined : f.deepVwc / 100,
  }));
  const real = realRecord(field.id);
  const cfg = real ? REAL_FIELD_MODEL[field.id] : undefined;
  return runFieldModel(real ?? seriesToFieldDays(obs, field),
    { crop: CROPS[field.currentCrop], plantedOn: field.plantedOn, soil: cfg?.soil ?? INDICATIVE_SOIL, seasons: cfg?.seasons }, manual);
}

/** GET /api/fields/{id}/state */
export function getFieldState(fieldId: string, followUps: FollowUp[] = []): Promise<FieldState[]> {
  return request(`/api/fields/${fieldId}/state`, () => {
    const field = mockField(fieldId);
    return livingFieldModel(field, fieldObservations(field), followUps);
  });
}
