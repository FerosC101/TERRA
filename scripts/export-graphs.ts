/**
 * Writes CSVs for notebooks/terra-graphs.ipynb. Run: npm run export:graphs
 *
 * notebooks/data/lipa_daily.csv   REAL pipeline record (IMERG, POWER, SMAP L3) + Discovery Engine alarms;
 *                                 SMAP sits on its measured acquisition day in Manila (F-011), not the file date
 * notebooks/data/lipa_water.csv   model output: daily water balance on the real weather, with an ASSUMED
 *                                 planting date (2024-06-01) and the SoilGrids soil estimate (see scripts/run-water-lipa.ts)
 * The synthetic record is already exported by scripts/export-synthetic-csv.ts (experiments/samples/).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CROPS } from "@/data/crops";
import { FIELDS } from "@/data/fields";
import { LIPA_SOILGRIDS_SOIL } from "@/data/soils";
import { LIPA_RAIN_SETTINGS } from "@/data/lipaModelConfig";
import { LIPA_IMERG_NORMAL } from "@/data/nasa/lipaImergNormal";
import { pipelineToFieldDays, type PipelineDailyRecord } from "@/lib/adapters/nasaPipeline";
import { runDiscovery, seriesOf } from "@/lib/science/discovery/engine";
import { runDailyWaterBalance } from "@/lib/science/water/cropWater";
import { loadSmapAcquisitionUtc } from "./smapTimes";

const OUT = "notebooks/data";
const PLANTED = "2024-06-01"; // ASSUMED: the real crop calendar is unknown
const field = FIELDS.find((f) => f.id === "lipa-cropland")!;
const crop = CROPS[field.currentCrop];
const days = pipelineToFieldDays(
  JSON.parse(readFileSync("docs/Data Pipeline/data/processed/terra_daily_merged.json", "utf8")) as PipelineDailyRecord[],
  { fieldId: field.id, timeZone: field.timezone, pipelineLocationId: field.pipelineLocationId },
  { smapAcquisitionUtc: loadSmapAcquisitionUtc() },
);

const imerg = seriesOf(days, "precipitation", "imerg", null);
const power = seriesOf(days, "precipitation", "power", null);
const et0 = seriesOf(days, "et0", "power", null);
const smap = seriesOf(days, "soil_moisture", "smap", null);
const alarms = runDiscovery(days, {
  fieldId: field.id, location: field.center, monthlyRainMm: field.climate.rainMm, crop, plantedOn: field.plantedOn,
  runAt: new Date().toISOString(), ...LIPA_RAIN_SETTINGS,
});
const alarmOn = new Map(alarms.map((a) => [a.window.end, a.detector]));

const cell = (v: number | string | null | undefined) => (v === null || v === undefined ? "" : String(v));
const csv = (header: string[], rows: (number | string | null | undefined)[][]) =>
  [header.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n") + "\n";

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/lipa_daily.csv`, csv(
  ["date", "rain_imerg_mm", "rain_power_mm", "et0_power_mm", "smap_m3m3", "imerg_normal_mm_day", "alarm"],
  days.map((d, k) => {
    const m = Number(d.date.slice(5, 7)) - 1;
    const dim = new Date(Date.UTC(Number(d.date.slice(0, 4)), m + 1, 0)).getUTCDate();
    return [d.date, imerg[k], power[k], et0[k], smap[k], (LIPA_IMERG_NORMAL.monthlyMm[m] / dim).toFixed(2), alarmOn.get(d.date)];
  }),
));

const water = runDailyWaterBalance(
  days.map((d, k) => ({ date: d.date, rainMm: imerg[k] ?? power[k], et0Mm: et0[k] })), crop, PLANTED, LIPA_SOILGRIDS_SOIL);
writeFileSync(`${OUT}/lipa_water.csv`, csv(
  ["date", "stage", "kc", "etc_mm", "eta_mm", "ks", "depletion_mm", "raw_mm", "taw_mm", "surface_vwc", "deep_vwc"],
  water.map((w) => [w.date, w.stage, w.kc.toFixed(3), w.etcMm?.toFixed(2), w.etaMm?.toFixed(2), w.ks?.toFixed(3),
    w.depletionMm.toFixed(1), w.rawMm.toFixed(1), w.tawMm.toFixed(1), w.surfaceVwc.toFixed(4), w.deepVwc.toFixed(4)]),
));
console.log(`Wrote ${OUT}/lipa_daily.csv (${days.length} days, ${alarms.length} alarms) and ${OUT}/lipa_water.csv`);
