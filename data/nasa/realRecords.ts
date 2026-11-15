import { decodeRecord, type CompactRecord } from "@/lib/adapters/compactRecord";
import type { FieldDay } from "@/types/discovery-contract";
import lipa from "./lipa-cropland-record.json";

/**
 * Real records the app runs the models on (instead of the demo series), per field id. Lipa Cropland: NASA POWER,
 * GPM IMERG Final, SMAP L3 (at its measured time), SMAP L4 and MODIS NDVI, 2024-01-01..2025-12-31, written by
 * scripts/export-lipa-record.ts; realRecords.test.ts checks it equals a fresh build from the source files.
 */
const COMPACT: Record<string, CompactRecord> = {
  "lipa-cropland": lipa as CompactRecord,
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
