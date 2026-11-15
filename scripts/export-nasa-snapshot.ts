/**
 * Writes the app's bundled NASA snapshot (data/nasa/*.json) from the pipeline's merged record.
 * Usage: npx tsx scripts/export-nasa-snapshot.ts <start YYYY-MM-DD> <end YYYY-MM-DD> <out.json>
 * Example: npx tsx scripts/export-nasa-snapshot.ts 2024-01-01 2025-12-31 data/nasa/lipa-cropland-2024-2025.json
 *
 * It only writes the file. Pointing data/nasa/index.ts at it is a UI decision: the Living Field
 * Model draws one bar per day, lists every day in a table, and fixes the SMAP axis at 30–60 %.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pipelineToSnapshotRecords, type MergedRecordForSnapshot } from "@/lib/adapters/nasaSnapshot";

const [start, end, out] = process.argv.slice(2);
if (!start || !end || !out) {
  console.error("Usage: npx tsx scripts/export-nasa-snapshot.ts <start> <end> <out.json>");
  process.exit(1);
}
const merged = JSON.parse(readFileSync("docs/Data Pipeline/data/processed/terra_daily_merged.json", "utf8")) as MergedRecordForSnapshot[];
const records = pipelineToSnapshotRecords(merged, start, end);
writeFileSync(out, JSON.stringify(records, null, 1) + "\n");
console.log(`${records.length} days written to ${out} (${records[0]?.date} .. ${records.at(-1)?.date})`);
