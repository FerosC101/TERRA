import { NASA_SNAPSHOTS } from "@/data/nasa";
import { realRecord } from "@/data/nasa/realRecords";
import { sourcesForField } from "@/data/sources";
import { realSeriesRows } from "@/lib/adapters/realSeries";
import { generateAnomalies } from "@/lib/demo/series";
import type { DataSource, MonthlyAnomaly, NasaSnapshot, RealSeriesRow } from "@/types";
import { IS_DEMO, request } from "./apiClient";
import { mockField } from "./fieldSensorService";

/**
 * NASA Earth-observation access. No NASA endpoint is called for data values in this
 * build: `getConnectionStatus` reports that plainly so the UI can never show a
 * simulated series as a live observation. (The Field Explorer's NASA moisture view
 * loads map pictures live from NASA GIBS; see nasaGibsService.ts.)
 */
export function getDataSources(fieldId: string): Promise<DataSource[]> {
  return request(`/api/fields/${fieldId}/sources`, () => sourcesForField(fieldId));
}

/**
 * The real NASA record the data pipeline retrieved for this field, if one is
 * bundled. Resolves to null for fields the pipeline has not been run for.
 */
export function getNasaSnapshot(fieldId: string): Promise<NasaSnapshot | null> {
  return request(`/api/fields/${fieldId}/nasa-snapshot`, () => NASA_SNAPSHOTS[fieldId] ?? null);
}

/**
 * Daily rows of the field's real record (NASA POWER, IMERG, SMAP L3/L4, MODIS NDVI) for evidence charts,
 * or null for fields that run on demo data.
 */
export function getRealSeries(fieldId: string): Promise<RealSeriesRow[] | null> {
  return request(`/api/fields/${fieldId}/real-series`, () => {
    const days = realRecord(fieldId);
    return days ? realSeriesRows(days) : null;
  });
}

export interface ConnectionStatus {
  mode: "demo" | "backend";
  label: string;
  detail: string;
}

export function getConnectionStatus(): ConnectionStatus {
  return IS_DEMO
    ? { mode: "demo", label: "Demo data", detail: "No field station or live NASA service is connected. Time series are generated locally for demonstration. Where a real NASA record has been retrieved for a field, it is shown separately and labelled." }
    : { mode: "backend", label: "Backend connected", detail: "Data is served by the TERRA API. Check each value's source tag for its origin." };
}

/** Monthly rainfall and temperature departures (POWER-style baseline) */
export function getClimateAnomalies(fieldId: string): Promise<MonthlyAnomaly[]> {
  return request(`/api/fields/${fieldId}/anomalies`, () => generateAnomalies(mockField(fieldId)));
}
