/**
 * Runs the Discovery Engine on the REAL Lipa record retrieved by the NASA data pipeline
 * (docs/Data Pipeline/data/processed/terra_daily_merged.json) and reports, per detector,
 * how many days it could evaluate. Run: npm run discovery:lipa
 *
 * MODIS NDVI (scripts/process-modis-ndvi-lipa.py) and SMAP L4 (scripts/process-smap-l4-lipa.py, source `smap_l4`) are
 * added when their CSVs exist.
 *
 * Crop calendar: unknown for the Lipa Cropland AOI. The farmer-reported calendar (data/cropCalendar.ts) is for
 * Plot A, which lies 3.3 km outside the AOI (data/lipaPlotA.ts), so it is NOT used here. The NDVI detector gets
 * the app's placeholder planting date, or one ASSUMED season from the first argument.
 * Run: npm run discovery:lipa -- [plantedOn YYYY-MM-DD]
 */
import { readFileSync } from "node:fs";
import { CROPS } from "@/data/crops";
import { FIELDS } from "@/data/fields";
import { LIPA_RAIN_SETTINGS } from "@/data/lipaModelConfig";
import { mergeValues } from "@/lib/adapters/modisNdvi";
import { pipelineToFieldDays, type PipelineDailyRecord } from "@/lib/adapters/nasaPipeline";
import { DEFAULT_DETECTORS, runDiscovery, type DiscoveryContext } from "@/lib/science/discovery/engine";
import type { DiscoveryKind } from "@/types";
import { loadModisNdviValues, MODIS_NDVI_CSV } from "./modisNdviLipa";
import { loadSmapL4Values, SMAP_L4_CSV } from "./smapL4Lipa";
import { loadSmapAcquisitionUtc } from "./smapTimes";

const FILE = "docs/Data Pipeline/data/processed/terra_daily_merged.json";
const field = FIELDS.find((f) => f.id === "lipa-cropland")!;
const records = JSON.parse(readFileSync(FILE, "utf8")) as PipelineDailyRecord[];
const pipelineDays = pipelineToFieldDays(records, { fieldId: field.id, timeZone: field.timezone, pipelineLocationId: field.pipelineLocationId }, { smapAcquisitionUtc: loadSmapAcquisitionUtc() });
const ndvi = loadModisNdviValues(field.timezone);
const withNdvi = mergeValues(pipelineDays, ndvi, field.timezone);
const ndviOutside = withNdvi.dropped;
// SMAP L4 (D-011): in the record for every detector to see; no detector reads `smap_l4` yet (D-006: test first).
const smapL4 = loadSmapL4Values(field.timezone);
const { days, dropped: smapL4Outside } = mergeValues(withNdvi.days, smapL4, field.timezone);
const assumed = process.argv[2];
const plantedOn = assumed ?? field.plantedOn;

const ctx: DiscoveryContext = {
  fieldId: field.id,
  location: field.center,
  monthlyRainMm: field.climate.rainMm,
  crop: CROPS[field.currentCrop],
  plantedOn,
  runAt: new Date().toISOString(),
  // D-013: no gauge, so POWER rain vs its own 2001–2023 normal with calibrated per-month limits.
  ...LIPA_RAIN_SETTINGS,
};


console.log(`Real record: ${FILE}`);
console.log(`${days.length} days, ${days[0].date} .. ${days.at(-1)!.date}`);
console.log(ndvi.length ? `MODIS NDVI: ${MODIS_NDVI_CSV}, ${ndvi.length} composites (${ndviOutside} outside the record)` : "MODIS NDVI: not processed yet");
console.log(smapL4.length ? `SMAP L4: ${SMAP_L4_CSV}, ${smapL4.length / 2} days × 2 layers (${smapL4Outside} values outside the record)` : "SMAP L4: not processed yet");
console.log(assumed
  ? `Crop ${ctx.crop.name}, one season planted ${assumed} (ASSUMED)\n`
  : `Crop calendar: unknown for this AOI; app placeholder (${ctx.crop.name}, planted ${plantedOn}, not real)\n`);

console.log("Values per variable/source (days with a usable value):");
const count = new Map<string, number>();
for (const d of days) for (const v of d.values) if (v.value !== null) count.set(`${v.variable}/${v.source}`, (count.get(`${v.variable}/${v.source}`) ?? 0) + 1);
for (const [k, n] of [...count].sort()) console.log(`  ${k.padEnd(28)} ${n}`);

console.log("\nDetector verdicts across all days (unknown = not enough data to decide):");
for (const [kind, detect] of Object.entries(DEFAULT_DETECTORS) as [DiscoveryKind, (typeof DEFAULT_DETECTORS)[DiscoveryKind]][]) {
  const tally = { unknown: 0, no: 0, alarm: 0 };
  days.forEach((_, i) => {
    const o = detect(days.slice(0, i + 1), ctx);
    tally[o === "unknown" ? "unknown" : o === "no" ? "no" : "alarm"]++;
  });
  console.log(`  ${kind.padEnd(20)} unknown ${tally.unknown}, no ${tally.no}, alarm ${tally.alarm}`);
}

console.log("\nWhy unknown:");
console.log("  moisture-divergence  needs station probes at 10 and 40 cm (none); SMAP L4 fallback not built yet (D-006)");
console.log("  rain-departure       no gauge: POWER vs its 2001–2023 normal, calibrated 14-day p5/p95 and 90-day p10 limits (D-013)");
console.log(`  ndvi-change          ${ndvi.length ? "needs 3 composites, and alarms only in the development or mid-season stage of the planting date given" : "needs MODIS NDVI (not processed yet)"}`);
console.log("  sensor-offset        needs a ground soil sensor (none)");

const alarms = runDiscovery(days, ctx);
console.log(`\nAlarms raised: ${alarms.length}`);
for (const a of alarms) console.log(`  ${a.window.end} ${a.detector} (confidence ${a.confidence})`);
