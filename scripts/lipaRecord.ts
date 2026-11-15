/**
 * Lipa Cropland's real record as the Discovery Engine sees it, built from the source files (Node only):
 * the pipeline's merged NASA record (POWER, IMERG, SMAP L3 placed at its measured time) + MODIS NDVI + SMAP L4.
 * Used by the Lipa scripts and by scripts/export-lipa-record.ts (the compact copy the app ships).
 */
import { readFileSync } from "node:fs";
import { FIELDS } from "@/data/fields";
import { mergeValues } from "@/lib/adapters/modisNdvi";
import { pipelineToFieldDays, type PipelineDailyRecord } from "@/lib/adapters/nasaPipeline";
import type { FieldDay } from "@/types/discovery-contract";
import { loadModisNdviValues } from "./modisNdviLipa";
import { loadSmapL4Values } from "./smapL4Lipa";
import { loadSmapAcquisitionUtc } from "./smapTimes";

export const PIPELINE_FILE = "docs/Data Pipeline/data/processed/terra_daily_merged.json";

export function buildLipaRecord(): { days: FieldDay[]; counts: { ndvi: number; ndviOutside: number; smapL4: number; smapL4Outside: number } } {
  const field = FIELDS.find((f) => f.id === "lipa-cropland")!;
  const records = JSON.parse(readFileSync(PIPELINE_FILE, "utf8")) as PipelineDailyRecord[];
  const pipelineDays = pipelineToFieldDays(records, { fieldId: field.id, timeZone: field.timezone, pipelineLocationId: field.pipelineLocationId },
    { smapAcquisitionUtc: loadSmapAcquisitionUtc() });
  const ndvi = loadModisNdviValues(field.timezone);
  const withNdvi = mergeValues(pipelineDays, ndvi, field.timezone);
  const l4 = loadSmapL4Values(field.timezone);
  const withL4 = mergeValues(withNdvi.days, l4, field.timezone);
  return { days: withL4.days, counts: { ndvi: ndvi.length, ndviOutside: withNdvi.dropped, smapL4: l4.length, smapL4Outside: withL4.dropped } };
}
