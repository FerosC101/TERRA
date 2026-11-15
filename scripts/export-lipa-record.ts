/**
 * Writes the compact real records the app uses, rebuilt from the source files:
 *   data/nasa/lipa-cropland-record.json  (scripts/lipaRecord.ts: pipeline record + MODIS NDVI + SMAP L4)
 *   data/nasa/lipa-plot-a-record.json    (scripts/plotARecord.ts: pipeline weather + HLS NDVI + SMAP L4 at Plot A)
 * Rerun after any of those inputs change. Run: npx tsx scripts/export-lipa-record.ts
 */
import { writeFileSync } from "node:fs";
import { encodeRecord } from "@/lib/adapters/compactRecord";
import type { FieldDay } from "@/types/discovery-contract";
import { buildLipaRecord } from "./lipaRecord";
import { buildPlotARecord } from "./plotARecord";

function write(out: string, days: FieldDay[], counts: object) {
  const text = JSON.stringify(encodeRecord(days));
  writeFileSync(out, text);
  console.log(`${out}: ${days.length} days, ${days.reduce((n, d) => n + d.values.length, 0)} values, ${(text.length / 1024).toFixed(0)} KB`, counts);
}

const lipa = buildLipaRecord();
write("data/nasa/lipa-cropland-record.json", lipa.days, lipa.counts);
const plotA = buildPlotARecord();
write("data/nasa/lipa-plot-a-record.json", plotA.days, plotA.counts);
