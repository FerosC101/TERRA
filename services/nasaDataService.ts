import { DATA_SOURCES } from "@/data/sources";
import { generateAnomalies } from "@/lib/demo/series";
import type { DataSource, MonthlyAnomaly } from "@/types";
import { IS_DEMO, request } from "./apiClient";
import { mockField } from "./fieldSensorService";

/**
 * NASA Earth-observation access. In this build no NASA endpoint is called:
 * `getConnectionStatus` reports that plainly so the UI can never show a
 * simulated series as a live observation.
 */
export function getDataSources(): Promise<DataSource[]> {
  return request("/api/sources", () => DATA_SOURCES);
}

export interface ConnectionStatus {
  mode: "demo" | "backend";
  label: string;
  detail: string;
}

export function getConnectionStatus(): ConnectionStatus {
  return IS_DEMO
    ? { mode: "demo", label: "Demo dataset", detail: "Not connected to NASA services or a field station. All values are generated locally for demonstration." }
    : { mode: "backend", label: "Backend connected", detail: "Data is served by the TERRA API. Check each value's source tag for its origin." };
}

/** Monthly rainfall and temperature departures (POWER-style baseline) */
export function getClimateAnomalies(fieldId: string): Promise<MonthlyAnomaly[]> {
  return request(`/api/fields/${fieldId}/anomalies`, () => generateAnomalies(mockField(fieldId)));
}
