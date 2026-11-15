import { sourcesForField } from "@/data/sources";
import { auditObservations } from "@/lib/data/quality";
import { DEMO_TODAY } from "@/lib/dates";
import { generateAnomalies, generateSeries } from "@/lib/demo/series";
import type { FieldReport, FollowUp } from "@/types";
import { request } from "./apiClient";
import { discoveriesFor } from "./discoveryService";
import { mockField } from "./fieldSensorService";

export function mockReport(fieldId: string, followUps: FollowUp[] = []): FieldReport {
  const field = mockField(fieldId);
  const { rows: observations, report: quality } = auditObservations(generateSeries(field));
  return {
    id: fieldId,
    generatedOn: DEMO_TODAY,
    field,
    latest: observations[observations.length - 1],
    observations,
    discoveries: discoveriesFor(field, observations, followUps),
    anomalies: generateAnomalies(field),
    sources: sourcesForField(fieldId),
    quality,
  };
}

/** GET /api/reports/{id} — the report id is the field id */
export function getReport(fieldId: string, followUps: FollowUp[] = []): Promise<FieldReport> {
  return request(`/api/reports/${fieldId}`, () => mockReport(fieldId, followUps));
}
