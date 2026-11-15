/**
 * Measured SMAP L3 acquisition times for Lipa (scripts/fetch-smap-overpass-time.py, F-011):
 * file date → UTC instant, for pipelineToFieldDays' `smapAcquisitionUtc`.
 */
import { readFileSync } from "node:fs";

const SMAP_TIMES = "docs/Data Pipeline/data/external/smap_l3_overpass_time/smap_l3_overpass_time_lipa.csv";

export function loadSmapAcquisitionUtc(): Record<string, string> {
  const [header, ...rows] = readFileSync(SMAP_TIMES, "utf8").trim().split(/\r?\n/).map((l) => l.split(","));
  if (rows.some((r) => r.length !== header.length)) throw new Error(`${SMAP_TIMES}: a row has a different number of fields than the header`);
  const col = (name: string) => header.indexOf(name);
  return Object.fromEntries(rows.filter((r) => r[col("acquisition_utc")]).map((r) => [r[col("file_date")], r[col("acquisition_utc")]]));
}
