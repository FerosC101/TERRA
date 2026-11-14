/**
 * Exports one SIMULATED field record (with planted problems and the engine's alarms) to CSV
 * for inspection in a spreadsheet.
 * Run: npx tsx scripts/export-synthetic-csv.ts            → experiments/samples/synthetic-field-seed1-fao56.csv
 *      npx tsx scripts/export-synthetic-csv.ts demo-v1    → experiments/samples/synthetic-field-seed1.csv (original model)
 * The fao56 version also has station gaps: 3% random missing days and a 5-day outage from day 140.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { CROPS, stageOnDay } from "@/data/crops";
import { daysBetween } from "@/lib/dates";
import { generateSyntheticFieldDays, type InjectedEvent } from "@/lib/demo/syntheticFieldDays";
import { runDiscovery } from "@/lib/science/discovery/engine";
import type { FieldDay } from "@/types/discovery-contract";
import { EXPERIMENT_FIELD } from "./discoveryHarness";

const SEED = 1;
const MODEL = process.argv[2] === "demo-v1" ? "demo-v1" : "fao56";
const MISSING = MODEL === "fao56" ? { rate: 0.03, outages: [{ startDay: 140, days: 5 }] } : undefined;
const PLANTED = "2026-06-01";
const field = EXPERIMENT_FIELD;
const events: InjectedEvent[] = [
  { kind: "dry-spell", startDay: 100, days: 18 },
  { kind: "wet-spell", startDay: 160, days: 14 },
  { kind: "ndvi-dip", day: 70, drop: 0.08 },
  { kind: "smap-bias", bias: 0.03 },
];

const { days, events: labels } = generateSyntheticFieldDays({
  fieldId: `synthetic-${SEED}`, start: "2026-05-01", days: 240, seed: SEED,
  climate: field.climate, crop: CROPS.corn, plantedOn: PLANTED, events, soilModel: MODEL, missing: MISSING,
});
const alarms = runDiscovery(days, {
  fieldId: `synthetic-${SEED}`, location: field.station.position, monthlyRainMm: field.climate.rainMm,
  crop: CROPS.corn, plantedOn: PLANTED, runAt: "2026-11-14T00:00:00Z",
});

const get = (d: FieldDay, variable: string, source: string, depthCm: number | null = null) =>
  d.values.find((v) => v.variable === variable && v.source === source && v.depthCm === depthCm)?.value ?? null;
const fmt = (x: number | null, digits: number) => (x === null ? "" : x.toFixed(digits));

const header = [
  "date", "day", "days_after_planting", "crop_stage",
  "rain_gauge_mm", "rain_imerg_mm", "et0_mm", "tmax_c",
  "soil_moisture_10cm_m3m3", "soil_moisture_40cm_m3m3", "smap_soil_moisture_m3m3", "ndvi",
  "planted_problem", "alarm_raised", "provenance",
];
const rows = days.map((d, i) => {
  const dap = daysBetween(PLANTED, d.date);
  const planted = labels.filter((e) => e.kind !== "smap-bias" && d.date >= e.start && d.date <= e.end).map((e) => e.kind);
  const raised = alarms.filter((a) => a.window.end === d.date).map((a) => a.detector);
  return [
    d.date, i, dap, stageOnDay(CROPS.corn, dap),
    fmt(get(d, "precipitation", "station"), 1), fmt(get(d, "precipitation", "imerg"), 1),
    fmt(get(d, "et0", "power"), 2), fmt(get(d, "air_temperature_max", "power"), 1),
    fmt(get(d, "soil_moisture", "station", 10), 3), fmt(get(d, "soil_moisture", "station", 40), 3),
    fmt(get(d, "soil_moisture", "smap"), 3), fmt(get(d, "ndvi", "modis"), 3),
    planted.join(" + "), raised.join(" + "), "simulated",
  ].join(",");
});

mkdirSync("experiments/samples", { recursive: true });
const out = MODEL === "fao56" ? "experiments/samples/synthetic-field-seed1-fao56.csv" : "experiments/samples/synthetic-field-seed1.csv";
writeFileSync(out, `${header.join(",")}\n${rows.join("\n")}\n`);
console.log(`wrote ${out}: ${rows.length} days, ${alarms.length} alarms`);
console.log("planted:", JSON.stringify(labels));
console.log("alarms:", alarms.map((a) => `${a.window.end} ${a.detector}`).join("; "));
