/**
 * Sensitivity of the daily water balance (Plot A, farmer-reported corn seasons, real 2024–2025 weather).
 * Run: npx tsx scripts/water-sensitivity-plot-a.ts   → finalTuning/data/water_sensitivity.json
 *
 * Question: do the model's per-season stress days, and the season ranking, hold when the settings we are
 * least sure of are moved within a stated range? Variants were fixed BEFORE the first run (2026-11-15):
 *   soil-low / soil-high   FC and WP of the Lipa Cropland SoilGrids cell with the lowest / highest 0–100 cm
 *                          available water (20 cells, 250 m, ~3.3 km east of Plot A): the nearby spatial spread
 *                          of the same model, not a measured range.
 *   rain-power             NASA POWER rain only (baseline: IMERG, POWER on days IMERG is missing).
 *   plant-minus7 / plus7   every season planted and harvested 7 days earlier / later (the farmer reports
 *                          staggered planting of a few days to a week).
 *   p-0.45 / p-0.65        corn depletion fraction p ±0.10 around the FAO-56 table value 0.55 (test values).
 *   kc-mid-0.9 / 1.1       corn mid-season Kc ×0.9 / ×1.1 (1.08 / 1.32; test values).
 *   start-raw              soil on 2024-01-01 already depleted to RAW instead of full (the record starts
 *                          17 days after the reported 2023-12-15 planting; the true state is unknown).
 * Ranking check (from the farmer's account; provenance of the transcript to be confirmed by the ML owner):
 *   2024 dry > 2025 dry > each wet season, in stress days.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { LIPA_PLOT_A_SEASONS } from "@/data/cropCalendar";
import { CROPS } from "@/data/crops";
import { FIELDS } from "@/data/fields";
import { LIPA_PLOT_A } from "@/data/lipaPlotA";
import { pipelineToFieldDays, type PipelineDailyRecord } from "@/lib/adapters/nasaPipeline";
import { addDays } from "@/lib/dates";
import { seriesOf } from "@/lib/science/discovery/engine";
import { fitStagesToSeason, type CropSeason } from "@/lib/science/season";
import { rootZoneLimits, runSeasonalWaterBalance, type WaterDay } from "@/lib/science/water/cropWater";
import type { SoilParams, SoilState } from "@/lib/science/water/soilWater";
import type { Crop } from "@/types";

const FILE = "docs/Data Pipeline/data/processed/terra_daily_merged.json";
const CELLS = "docs/Data Pipeline/data/external/soilgrids/soilgrids_lipa_cells.csv";
const OUT_DIR = "finalTuning/data";

const field = FIELDS.find((f) => f.id === "lipa-cropland")!;
const days = pipelineToFieldDays(JSON.parse(readFileSync(FILE, "utf8")) as PipelineDailyRecord[],
  { fieldId: field.id, timeZone: field.timezone, pipelineLocationId: field.pipelineLocationId });
const imerg = seriesOf(days, "precipitation", "imerg", null);
const power = seriesOf(days, "precipitation", "power", null);
const et0 = seriesOf(days, "et0", "power", null);
const inputsBase = days.map((d, k) => ({ date: d.date, rainMm: imerg[k] ?? power[k], et0Mm: et0[k] }));
const inputsPower = days.map((d, k) => ({ date: d.date, rainMm: power[k], et0Mm: et0[k] }));

// SoilGrids cells: depth-weighted (0–100 cm) FC (wv0033) and WP (wv1500) per cell, as for Plot A.
const LAYERS: [string, number][] = [["0-5cm", 5], ["5-15cm", 10], ["15-30cm", 15], ["30-60cm", 30], ["60-100cm", 40]];
const cellRows = readFileSync(CELLS, "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
const byCell = new Map<string, Record<string, number>>();
for (const [coverage, lon, lat, , value] of cellRows) {
  const key = `${lon},${lat}`;
  if (!byCell.has(key)) byCell.set(key, {});
  byCell.get(key)![coverage] = Number(value);
}
const weighted = (c: Record<string, number>, prop: string) => {
  const parts = LAYERS.map(([d, w]) => [c[`${prop}_${d}_mean`], w] as const);
  return parts.some(([v]) => v === undefined) ? null : parts.reduce((a, [v, w]) => a + v * w, 0) / 100;
};
const cells = [...byCell.entries()]
  .map(([key, c]) => ({ key, fc: weighted(c, "wv0033"), wp: weighted(c, "wv1500") }))
  .filter((c): c is { key: string; fc: number; wp: number } => c.fc !== null && c.wp !== null)
  .map((c) => ({ ...c, tawMm: (c.fc - c.wp) * 1000 }))
  .sort((a, b) => a.tawMm - b.tawMm);
if (cells.length === 0) throw new Error("no complete SoilGrids cells");
const lowCell = cells[0];
const highCell = cells[cells.length - 1];

const baseSoil = LIPA_PLOT_A.soil;
const seasonsWith = (crop: (c: Crop) => Crop, shiftDays = 0): CropSeason[] =>
  LIPA_PLOT_A_SEASONS.map((s) => {
    const plantedOn = addDays(s.plantedOn, shiftDays);
    const harvestedOn = addDays(s.harvestedOn, shiftDays);
    return { crop: fitStagesToSeason(crop(CROPS[s.crop]), plantedOn, harvestedOn), plantedOn, harvestedOn };
  });
const same = (c: Crop) => c;
const startAtRaw = (soil: Omit<SoilParams, "p">): SoilState => {
  const { raw } = rootZoneLimits({ ...soil, p: CROPS.corn.depletionP });
  const share = soil.surfaceDepthM / soil.rootDepthM;
  return { surfaceDepletionMm: raw * share, deepDepletionMm: raw * (1 - share) };
};

interface Variant { id: string; label: string; inputs: typeof inputsBase; seasons: CropSeason[]; soil: Omit<SoilParams, "p">; start?: SoilState }
const variants: Variant[] = [
  { id: "baseline", label: "Baseline (as in the model report)", inputs: inputsBase, seasons: seasonsWith(same), soil: baseSoil },
  { id: "soil-low", label: `Soil: lowest-water nearby cell (TAW ${lowCell.tawMm.toFixed(0)} mm)`, inputs: inputsBase, seasons: seasonsWith(same),
    soil: { ...baseSoil, fc: lowCell.fc, wp: lowCell.wp } },
  { id: "soil-high", label: `Soil: highest-water nearby cell (TAW ${highCell.tawMm.toFixed(0)} mm)`, inputs: inputsBase, seasons: seasonsWith(same),
    soil: { ...baseSoil, fc: highCell.fc, wp: highCell.wp } },
  { id: "rain-power", label: "Rain: NASA POWER only", inputs: inputsPower, seasons: seasonsWith(same), soil: baseSoil },
  { id: "plant-minus7", label: "Planting 7 days earlier", inputs: inputsBase, seasons: seasonsWith(same, -7), soil: baseSoil },
  { id: "plant-plus7", label: "Planting 7 days later", inputs: inputsBase, seasons: seasonsWith(same, 7), soil: baseSoil },
  { id: "p-0.45", label: "Depletion fraction p = 0.45", inputs: inputsBase, seasons: seasonsWith((c) => ({ ...c, depletionP: 0.45 })), soil: baseSoil },
  { id: "p-0.65", label: "Depletion fraction p = 0.65", inputs: inputsBase, seasons: seasonsWith((c) => ({ ...c, depletionP: 0.65 })), soil: baseSoil },
  { id: "kc-mid-0.9", label: "Mid-season Kc × 0.9 (1.08)", inputs: inputsBase, seasons: seasonsWith((c) => ({ ...c, kc: { ...c.kc, mid: c.kc.mid * 0.9 } })), soil: baseSoil },
  { id: "kc-mid-1.1", label: "Mid-season Kc × 1.1 (1.32)", inputs: inputsBase, seasons: seasonsWith((c) => ({ ...c, kc: { ...c.kc, mid: c.kc.mid * 1.1 } })), soil: baseSoil },
  { id: "start-raw", label: "Soil on 2024-01-01 already at RAW (not full)", inputs: inputsBase, seasons: seasonsWith(same), soil: baseSoil, start: startAtRaw(baseSoil) },
];

function perSeason(out: WaterDay[], seasons: CropSeason[]) {
  return seasons.map((s, n) => {
    const inSeason = out.filter((d) => d.date >= s.plantedOn && d.date < s.harvestedOn! && d.stage !== "pre" && d.stage !== "post");
    const stressed = inSeason.filter((d) => d.stressed);
    return {
      season: LIPA_PLOT_A_SEASONS[n].season,
      plantedOn: s.plantedOn,
      harvestedOn: s.harvestedOn!,
      daysInRecord: inSeason.length,
      stressDays: stressed.length,
      firstStress: stressed[0]?.date ?? null,
      maxDepletionMm: Math.max(0, ...inSeason.map((d) => d.depletionMm)),
      tawMm: out[0].tawMm,
      rawMm: inSeason[0]?.rawMm ?? null,
    };
  });
}

const results = variants.map((v) => {
  const out = runSeasonalWaterBalance(v.inputs, v.seasons, v.soil, v.start);
  const seasons = perSeason(out, v.seasons);
  const sd = Object.fromEntries(seasons.map((s) => [s.season, s.stressDays]));
  const rankingHolds = sd["2024 dry"] > sd["2025 dry"] && sd["2025 dry"] > sd["2024 wet"] && sd["2025 dry"] > sd["2025 wet"];
  return { id: v.id, label: v.label, seasons, rankingHolds, depletion: v.id === "baseline" ? undefined : out.map((d) => +d.depletionMm.toFixed(2)) };
});

// Rain each source recorded inside each season (days in the record only), and ET0, to explain differences.
const seasonInputs = LIPA_PLOT_A_SEASONS.map((s) => {
  const ks = days.map((d, k) => (d.date >= s.plantedOn && d.date < s.harvestedOn ? k : -1)).filter((k) => k >= 0);
  const tot = (xs: (number | null)[]) => +ks.reduce((a, k) => a + (xs[k] ?? 0), 0).toFixed(1);
  return {
    season: s.season, days: ks.length,
    imergMm: tot(imerg), imergDays: ks.filter((k) => imerg[k] !== null).length,
    powerMm: tot(power), powerDays: ks.filter((k) => power[k] !== null).length,
    usedMm: tot(inputsBase.map((i) => i.rainMm)), et0Mm: tot(et0),
  };
});

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/water_sensitivity.json`, JSON.stringify({
  generated: new Date().toISOString(),
  record: { file: FILE, first: days[0].date, last: days.at(-1)!.date, days: days.length },
  rain: { imergDays: imerg.filter((x) => x !== null).length, powerFillDays: inputsBase.filter((_, k) => imerg[k] === null && power[k] !== null).length },
  soilCells: { n: cells.length, low: lowCell, high: highCell, plotA: { fc: baseSoil.fc, wp: baseSoil.wp, tawMm: (baseSoil.fc - baseSoil.wp) * 1000 } },
  dates: days.map((d) => d.date),
  rainMm: inputsBase.map((i) => i.rainMm),
  et0Mm: inputsBase.map((i) => i.et0Mm),
  seasonInputs,
  variants: results,
}, null, 1));
for (const s of seasonInputs) {
  console.log(`${s.season.padEnd(9)} ${s.days} days | IMERG ${s.imergMm} mm (${s.imergDays} d) | POWER ${s.powerMm} mm (${s.powerDays} d) | used ${s.usedMm} mm | ET0 ${s.et0Mm} mm`);
}

console.log(`SoilGrids cells with all layers: ${cells.length}; TAW range ${lowCell.tawMm.toFixed(1)}–${highCell.tawMm.toFixed(1)} mm (Plot A ${((baseSoil.fc - baseSoil.wp) * 1000).toFixed(1)})`);
for (const r of results) {
  console.log(`${r.id.padEnd(13)} ${r.seasons.map((s) => `${s.season}: ${String(s.stressDays).padStart(2)}`).join(" | ")}  ranking ${r.rankingHolds ? "holds" : "BREAKS"}`);
}
