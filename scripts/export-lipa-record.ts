/**
 * Writes the compact real Lipa record the app uses (data/nasa/lipa-cropland-record.json), built by
 * scripts/lipaRecord.ts from the pipeline record, MODIS NDVI and SMAP L4. Rerun after any of those change.
 * Run: npx tsx scripts/export-lipa-record.ts
 */
import { writeFileSync } from "node:fs";
import { encodeRecord } from "@/lib/adapters/compactRecord";
import { buildLipaRecord } from "./lipaRecord";

const OUT = "data/nasa/lipa-cropland-record.json";
const { days, counts } = buildLipaRecord();
const text = JSON.stringify(encodeRecord(days));
writeFileSync(OUT, text);
console.log(`${OUT}: ${days.length} days, ${days.reduce((n, d) => n + d.values.length, 0)} values, ${(text.length / 1024).toFixed(0)} KB`, counts);
