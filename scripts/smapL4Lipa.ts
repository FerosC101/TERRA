/**
 * SMAP L4 daily means (scripts/process-smap-l4-lipa.py, DATA-MANIFEST.md section 7) as contract values
 * (`smap_l4`, D-011), for mergeValues(). Returns [] when the CSV has not been produced yet.
 */
import { existsSync, readFileSync } from "node:fs";
import { parseSmapL4DailyCsv, smapL4ToValues } from "@/lib/adapters/smapL4";
import type { AnyObservationValue } from "@/types/discovery-contract";

/** Lipa Cropland AOI centroid point. Plot A's point (smap_l4_plot_a) is processed separately. */
export const SMAP_L4_CSV = "docs/Data Pipeline/data/external/smap_l4/smap_l4_daily_lipa.csv";

export function loadSmapL4Values(timeZone: string, file = SMAP_L4_CSV): AnyObservationValue[] {
  if (!existsSync(file)) return [];
  return smapL4ToValues(parseSmapL4DailyCsv(readFileSync(file, "utf8")), timeZone);
}
