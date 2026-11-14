import { DATA_SOURCES } from "@/data/sources";
import { DEMO_TODAY } from "@/lib/dates";
import { generateAnomalies, generateSeries } from "@/lib/demo/series";
import { detectDiscoveries } from "@/lib/science/detect";
import type { FieldReport, FollowUp } from "@/types";
import { request } from "./apiClient";
import { mockField } from "./fieldSensorService";

export function mockReport(fieldId: string, followUps: FollowUp[] = []): FieldReport {
  const field = mockField(fieldId);
  const observations = generateSeries(field);
  return {
    id: fieldId,
    generatedOn: DEMO_TODAY,
    field,
    latest: observations[observations.length - 1],
    observations,
    discoveries: detectDiscoveries(field, observations, followUps),
    anomalies: generateAnomalies(field),
    sources: DATA_SOURCES,
  };
}

/** GET /api/reports/{id} — the report id is the field id */
export function getReport(fieldId: string, followUps: FollowUp[] = []): Promise<FieldReport> {
  return request(`/api/reports/${fieldId}`, () => mockReport(fieldId, followUps));
}
