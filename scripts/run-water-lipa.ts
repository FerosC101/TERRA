/**
 * Daily crop water balance on the REAL Lipa record (docs/Data Pipeline/data/processed/terra_daily_merged.json).
 * Run: npm run water:lipa                 (farmer-reported crop calendar, Plot A: data/cropCalendar.ts)
 *      npm run water:lipa -- YYYY-MM-DD   (one corn season planted that day, ASSUMED)
 *
 * Field: Plot A (data/lipaPlotA.ts), 3.3 km west of the Lipa Cropland AOI.
 * Inputs: ET0 from NASA POWER (FAO-56, computed by the pipeline); rain from GPM IMERG, or NASA POWER on days
 * IMERG is missing (counted below), all from the Lipa Cropland pipeline record (no record exists for Plot A;
 * the source cells are far coarser than the 3.3 km offset); crop calendar as reported by the farmer of Plot A
 * (approximate dates, stage lengths fitted to each season); soil LIPA_PLOT_A_SOILGRIDS_SOIL, a MODEL ESTIMATE.
 * The record starts 2024-01-01, 17 days after the reported 2023-12-15 planting; the soil starts full (assumed).
 * The output is a model run, not a measurement of the field.
 */
import { readFileSync } from "node:fs";
import { LIPA_PLOT_A_CROP_SEASONS, LIPA_PLOT_A_SEASONS } from "@/data/cropCalendar";
import { CROPS } from "@/data/crops";
import { FIELDS } from "@/data/fields";
import { LIPA_PLOT_A } from "@/data/lipaPlotA";
import { pipelineToFieldDays, type PipelineDailyRecord } from "@/lib/adapters/nasaPipeline";
import { seriesOf } from "@/lib/science/discovery/engine";
import type { CropSeason } from "@/lib/science/season";
import { runSeasonalWaterBalance } from "@/lib/science/water/cropWater";
import { sum } from "@/lib/science/stats";

const FILE = "docs/Data Pipeline/data/processed/terra_daily_merged.json";
const field = FIELDS.find((f) => f.id === "lipa-cropland")!;
const assumed = process.argv[2];
const seasons: CropSeason[] = assumed ? [{ crop: CROPS[field.currentCrop], plantedOn: assumed }] : LIPA_PLOT_A_CROP_SEASONS;
const soil = LIPA_PLOT_A.soil;
const days = pipelineToFieldDays(JSON.parse(readFileSync(FILE, "utf8")) as PipelineDailyRecord[],
  { fieldId: field.id, timeZone: field.timezone, pipelineLocationId: field.pipelineLocationId });

const imerg = seriesOf(days, "precipitation", "imerg", null);
const power = seriesOf(days, "precipitation", "power", null);
const et0 = seriesOf(days, "et0", "power", null);
let powerRainDays = 0;
const inputs = days.map((d, k) => {
  if (imerg[k] === null && power[k] !== null) powerRainDays++;
  return { date: d.date, rainMm: imerg[k] ?? power[k], et0Mm: et0[k] };
});
const out = runSeasonalWaterBalance(inputs, seasons, soil);
const ok = out.filter((d) => d.note !== "missing-input");

console.log(`Real weather: ${FILE}`);
console.log(`${out.length} days, ${out[0].date} .. ${out.at(-1)!.date}`);
console.log(`Rain: IMERG, with NASA POWER on ${powerRainDays} days IMERG was missing. ET0: NASA POWER.`);
console.log(assumed
  ? `Crop: one corn season planted ${assumed} (ASSUMED).`
  : "Crop calendar: farmer-reported, Plot A (data/cropCalendar.ts), approximate dates.");
console.log(`Field: ${LIPA_PLOT_A.name}, ${LIPA_PLOT_A.areaHa} ha; weather from the ${LIPA_PLOT_A.weatherFromPipelineLocationId} record (3.3 km east).`);
console.log("Soil: SoilGrids estimate for Plot A (model, not measured).\n");
console.log(`Days run: ${ok.length}; days skipped for missing input: ${out.length - ok.length}`);
console.log(`Totals over days run: rain ${sum(inputs.filter((_, k) => out[k].note === undefined).map((i) => i.rainMm as number)).toFixed(0)} mm, ` +
  `ETc ${sum(ok.map((d) => d.etcMm as number)).toFixed(0)} mm, ETa ${sum(ok.map((d) => d.etaMm as number)).toFixed(0)} mm\n`);

const sorted = [...seasons].sort((a, b) => a.plantedOn.localeCompare(b.plantedOn));
console.log("Per season (days inside the record):");
sorted.forEach((s, n) => {
  const end = s.harvestedOn ?? sorted[n + 1]?.plantedOn ?? out.at(-1)!.date;
  const inSeason = out.filter((d) => d.date >= s.plantedOn && d.date < end && d.stage !== "pre" && d.stage !== "post");
  const name = assumed ? `planted ${s.plantedOn}` : LIPA_PLOT_A_SEASONS.find((x) => x.plantedOn === s.plantedOn)!.season;
  const stressed = inSeason.filter((d) => d.stressed);
  console.log(`  ${name.padEnd(18)} ${s.plantedOn}..${end}  ${String(inSeason.length).padStart(3)} days, ` +
    `${String(stressed.length).padStart(2)} with water stress (Ks < 1)` +
    (stressed.length ? ` [${stressed[0].date}..${stressed.at(-1)!.date}]` : "") +
    `, max depletion ${Math.max(0, ...inSeason.map((d) => d.depletionMm)).toFixed(0)} of TAW ${out[0].tawMm.toFixed(0)} mm (RAW ${inSeason[0]?.rawMm.toFixed(0) ?? "-"})`);
});
