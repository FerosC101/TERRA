/**
 * Discovery Engine on Lipa Plot A (data/lipaPlotA.ts): Mang Edgar's 2.69 ha corn plot, 3.3 km west of the
 * Lipa Cropland AOI. Run: npm run discovery:plot-a
 *
 * Inputs:
 * - weather (IMERG, POWER, SMAP L3) from the Lipa Cropland pipeline record (no record exists for Plot A; the source
 *   cells are far coarser than the offset, see data/lipaPlotA.ts);
 * - NDVI from HLS 30 m over the plot (scripts/process-hls-ndvi-plot-a.py, source `hls`, D-012);
 * - SMAP L4 at the plot centre when processed (data/external/smap_l4_plot_a/), else none;
 * - crop calendar: the farmer-reported seasons (data/cropCalendar.ts).
 */
import { CROPS } from "@/data/crops";
import { FIELDS } from "@/data/fields";
import { LIPA_PLOT_A } from "@/data/lipaPlotA";
import { LIPA_RAIN_SETTINGS } from "@/data/lipaModelConfig";
import { DEFAULT_DETECTORS, runDiscovery, type DiscoveryContext } from "@/lib/science/discovery/engine";
import type { DiscoveryKind } from "@/types";
import { buildPlotARecord } from "./plotARecord";

const lipa = FIELDS.find((f) => f.id === "lipa-cropland")!;
const { days, counts } = buildPlotARecord();

const first = [...LIPA_PLOT_A.seasons].sort((a, b) => a.plantedOn.localeCompare(b.plantedOn))[0];
const ctx: DiscoveryContext = {
  fieldId: LIPA_PLOT_A.id,
  location: LIPA_PLOT_A.center,
  monthlyRainMm: lipa.climate.rainMm,
  crop: CROPS.corn,
  plantedOn: first.plantedOn,
  seasons: [...LIPA_PLOT_A.seasons],
  ndviSource: "hls",
  runAt: new Date().toISOString(),
  ...LIPA_RAIN_SETTINGS,
};

console.log(`Field: ${LIPA_PLOT_A.name}, ${LIPA_PLOT_A.areaHa} ha (${LIPA_PLOT_A.location})`);
console.log(`${days.length} days, ${days[0].date} .. ${days.at(-1)!.date}; weather from ${LIPA_PLOT_A.weatherFromPipelineLocationId}`);
console.log(`HLS NDVI: ${counts.hls} overpass days with a plot value (${counts.hlsOutside} outside the record)`);
console.log(counts.smapL4 ? `SMAP L4 (plot centre): ${counts.smapL4 / 2} days` : "SMAP L4 (plot centre): not processed yet");
console.log(`Crop calendar: ${LIPA_PLOT_A.seasons.length} farmer-reported corn seasons\n`);

console.log("Detector verdicts across all days (unknown = not enough data to decide):");
for (const [kind, detect] of Object.entries(DEFAULT_DETECTORS) as [DiscoveryKind, (typeof DEFAULT_DETECTORS)[DiscoveryKind]][]) {
  const tally = { unknown: 0, no: 0, alarm: 0 };
  days.forEach((_, i) => {
    const o = detect(days.slice(0, i + 1), ctx);
    tally[o === "unknown" ? "unknown" : o === "no" ? "no" : "alarm"]++;
  });
  console.log(`  ${kind.padEnd(20)} unknown ${tally.unknown}, no ${tally.no}, alarm ${tally.alarm}`);
}

const alarms = runDiscovery(days, ctx);
console.log(`\nAlarms raised: ${alarms.length}`);
for (const a of alarms) {
  const s = a.signals[0];
  console.log(`  ${a.window.start}..${a.window.end} ${a.detector} (confidence ${a.confidence})` +
    (a.detector.startsWith("ndvi") ? ` NDVI change ${s.observed.toFixed(3)}` : ""));
}
