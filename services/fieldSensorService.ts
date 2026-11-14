import { FIELDS } from "@/data/fields";
import { generateSeries } from "@/lib/demo/series";
import { auditObservations } from "@/lib/data/quality";
import type { DailyObservation, Field, QualityReport } from "@/types";
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

/**
 * GET /api/fields/{id}/observations — station and satellite-style series, one row per day.
 * Every response, mocked or fetched, passes the record audit before it is returned.
 */
export async function getObservations(fieldId: string): Promise<DailyObservation[]> {
  const raw = await request(`/api/fields/${fieldId}/observations`, () => generateSeries(mockField(fieldId)));
  return auditObservations(raw).rows;
}

/** What the record audit found for this field: duplicates, impossible values, extremes and gaps. */
export async function getDataQuality(fieldId: string): Promise<QualityReport> {
  const raw = await request(`/api/fields/${fieldId}/observations`, () => generateSeries(mockField(fieldId)));
  return auditObservations(raw).report;
}
