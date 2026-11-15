import { decodeRecord, type CompactRecord } from "@/lib/adapters/compactRecord";
import type { FieldDay } from "@/types/discovery-contract";
import lipa from "./lipa-cropland-record.json";
import plotA from "./lipa-plot-a-record.json";

/**
 * Real records the app runs the models on (instead of the demo series), per field id, 2024-01-01..2025-12-31,
 * written by scripts/export-lipa-record.ts; realRecords.test.ts checks each equals a fresh build from the source files.
 * - Lipa Cropland: NASA POWER, GPM IMERG Final, SMAP L3 (at its measured time), SMAP L4 and MODIS NDVI.
 * - Plot A: the same weather and SMAP L3 (Lipa Cropland pipeline record, 3.3 km east), SMAP L4 at the plot centre
 *   and HLS 30 m NDVI over the plot.
 * Only real values: no simulated station reading is ever part of a record.
 */
const COMPACT: Record<string, CompactRecord> = {
  "lipa-cropland": lipa as CompactRecord,
  "lipa-plot-a": plotA as CompactRecord,
};

const cache = new Map<string, FieldDay[]>();

/** The field's real record, or null when the field has none (it then runs on the demo series). */
export function realRecord(fieldId: string): FieldDay[] | null {
  const c = COMPACT[fieldId];
  if (!c) return null;
  if (!cache.has(fieldId)) cache.set(fieldId, decodeRecord(c));
  return cache.get(fieldId)!;
}

export const hasRealRecord = (fieldId: string) => fieldId in COMPACT;

/** The last day of the field's record: the real record's end, or `fallback` (the demo record's end) for demo fields. */
export function recordEndDate(fieldId: string, fallback: string): string {
  const days = realRecord(fieldId);
  return days ? days[days.length - 1].date : fallback;
}
