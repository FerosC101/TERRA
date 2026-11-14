import { FIELDS } from "@/data/fields";
import { generateSeries } from "@/lib/demo/series";
import type { DailyObservation, Field } from "@/types";
import { request } from "./apiClient";

export function mockField(id: string): Field {
  const field = FIELDS.find((f) => f.id === id);
  if (!field) throw new Error(`Unknown field: ${id}`);
  return field;
}

/** GET /api/fields */
export function getFields(): Promise<Field[]> {
  return request("/api/fields", () => FIELDS);
}

/** GET /api/fields/{id}/observations — station and satellite-style series, one row per day */
export function getObservations(fieldId: string): Promise<DailyObservation[]> {
  return request(`/api/fields/${fieldId}/observations`, () => generateSeries(mockField(fieldId)));
}
