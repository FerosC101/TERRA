/**
 * Exports the model results the model report charts (docs/reports/data/*.json). Everything is computed here from the
 * real records and the calibrated settings; the report builder only draws it.
 * Run: npx tsx scripts/export-model-results.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { LIPA_PLOT_A_SEASONS } from "@/data/cropCalendar";
import { CROPS } from "@/data/crops";
import { FIELDS } from "@/data/fields";
import { LIPA_REAL_EVENTS } from "@/data/lipaEvents";
import { LIPA_PLOT_A } from "@/data/lipaPlotA";
import { LIPA_RAIN_SETTINGS, REAL_FIELD_SETTINGS } from "@/data/lipaModelConfig";
import { LIPA_POWER_DEKADS } from "@/data/nasa/lipaDekads";
import { LIPA_IMERG_NORMAL } from "@/data/nasa/lipaImergNormal";
import { DEFAULT_PLANS, DEFAULT_PRIORITIES, DEFAULT_SETTINGS } from "@/data/rotations";
import { DISCOVERY_RULES } from "@/data/discoveryRules";
import { FIELD_MODEL_RULES } from "@/data/fieldModelRules";
import { CAUSES, OBSERVATION_CHECKS, WAIT_MINUTES_PER_DAY } from "@/data/observationChecks";
import { HISTORICAL } from "@/data/scenarios";
import { INDICATIVE_SOIL, LIPA_PLOT_A_SOILGRIDS_SOIL, LIPA_SOILGRIDS_SOIL } from "@/data/soils";
import { DEFAULT_DETECTORS, runDiscovery, seriesOf, type DiscoveryContext } from "@/lib/science/discovery/engine";
import { runFieldModel } from "@/lib/science/fieldModel/state";
import { rootZoneLimits, runSeasonalWaterBalance } from "@/lib/science/water/cropWater";
import { ASSUMPTIONS, evaluateRotation, rotationRisk } from "@/lib/science/waterBalance";
import type { AnomalyRecord, FieldDay } from "@/types/discovery-contract";
import { buildLipaRecord } from "./lipaRecord";
import { hlsNdviToValues, parseHlsNdviCsv } from "@/lib/adapters/hlsNdvi";
import { mergeValues } from "@/lib/adapters/modisNdvi";

const OUT = "docs/reports/data";
mkdirSync(OUT, { recursive: true });
const write = (name: string, data: unknown) => writeFileSync(`${OUT}/${name}`, JSON.stringify(data));

const field = FIELDS.find((f) => f.id === "lipa-cropland")!;
const { days } = buildLipaRecord();
const base: DiscoveryContext = {
  fieldId: field.id, location: field.center, monthlyRainMm: field.climate.rainMm, crop: CROPS.corn,
  plantedOn: field.plantedOn, runAt: "2026-11-15T00:00:00Z",
};

type Verdict = "unknown" | "no" | "dry" | "wet";
const verdicts = (det: (d: FieldDay[], c: DiscoveryContext) => unknown, ctx: DiscoveryContext): Verdict[] =>
  days.map((_, i) => {
    const o = det(days.slice(0, i + 1), ctx) as AnomalyRecord | "no" | "unknown";
    if (typeof o === "string") return o;
    return o.signals[0].observed < o.signals[0].baseline ? "dry" : "wet";
  });
const onsets = (ctx: DiscoveryContext, kind: AnomalyRecord["detector"]) =>
  runDiscovery(days, ctx).filter((a) => a.detector === kind)
    .map((a) => ({ start: a.window.start, end: a.window.end, observed: a.signals[0].observed, baseline: a.signals[0].baseline, rule: a.signals[0].rule }));

// --- Rain: old (IMERG, fixed 0.45/1.7) vs new (POWER, calibrated) -----------------------------------------------
const oldCtx = { ...base, rainNormals: { imerg: LIPA_IMERG_NORMAL } };
const newCtx = { ...base, ...LIPA_RAIN_SETTINGS };
const rain = DEFAULT_DETECTORS["rain-departure"];
write("rain.json", {
  dates: days.map((d) => d.date),
  power: seriesOf(days, "precipitation", "power", null),
  imerg: seriesOf(days, "precipitation", "imerg", null),
  old: verdicts(rain, oldCtx),
  new: verdicts(rain, newCtx),
  oldOnsets: onsets(oldCtx, "rain-departure"),
  newOnsets: onsets(newCtx, "rain-departure"),
  events: LIPA_REAL_EVENTS,
  calibration: JSON.parse(readFileSync("docs/Data Pipeline/data/external/power_history/rain_calibration_lipa.json", "utf8")),
});

// --- Daily water balance on Plot A (farmer calendar, Plot A soil) ---------------------------------------------------
const imerg = seriesOf(days, "precipitation", "imerg", null);
const power = seriesOf(days, "precipitation", "power", null);
const et0 = seriesOf(days, "et0", "power", null);
const inputs = days.map((d, k) => ({ date: d.date, rainMm: imerg[k] ?? power[k], et0Mm: et0[k] }));
const wb = runSeasonalWaterBalance(inputs, [...LIPA_PLOT_A.seasons], LIPA_PLOT_A.soil);
write("water_plot_a.json", {
  days: wb.map((d) => ({ date: d.date, stage: d.stage, depletion: d.depletionMm, raw: d.rawMm, taw: d.tawMm, ks: d.ks, etc: d.etcMm, eta: d.etaMm })),
  seasons: LIPA_PLOT_A_SEASONS.map((s) => {
    const inS = wb.filter((d) => d.date >= s.plantedOn && d.date < s.harvestedOn && d.stage !== "pre" && d.stage !== "post");
    const st = inS.filter((d) => d.stressed);
    return { ...s, days: inS.length, stressDays: st.length, firstStress: st[0]?.date ?? null, lastStress: st.at(-1)?.date ?? null,
      maxDepletion: Math.max(0, ...inS.map((d) => d.depletionMm)), taw: wb[0].tawMm, raw: inS[0]?.rawMm ?? null };
  }),
  rainSource: "IMERG, POWER where IMERG is missing",
});

// --- Rotation planner: average climate vs real years ----------------------------------------------------------------
write("rotation.json", DEFAULT_PLANS.map((p) => ({
  plan: p,
  average: evaluateRotation(p, field, DEFAULT_SETTINGS, DEFAULT_PRIORITIES, HISTORICAL).seasons.map((s) => ({ window: s.windowLabel, crop: s.cropId, deficit: s.deficitMm })),
  risk: rotationRisk(p, field, DEFAULT_SETTINGS, DEFAULT_PRIORITIES, LIPA_POWER_DEKADS),
})));

// --- Living Field Model: old (SMAP L3, AOI soil) ---------------------------------------------------------------------
const fmOld = runFieldModel(days, { crop: CROPS.corn, plantedOn: field.plantedOn, soil: LIPA_SOILGRIDS_SOIL });
const fmNewSettings = REAL_FIELD_SETTINGS["lipa-cropland"] as DiscoveryContext & { fieldModelL4?: Parameters<typeof runFieldModel>[1]["l4"] };
const fmNew = fmNewSettings.fieldModelL4
  ? runFieldModel(days, { crop: CROPS.corn, plantedOn: field.plantedOn, soil: LIPA_SOILGRIDS_SOIL, l4: fmNewSettings.fieldModelL4 })
  : null;
const fmRow = (s: ReturnType<typeof runFieldModel>[number]) => ({ date: s.date, surface: s.surface.vwc, deep: s.deep.vwc, surfaceSd: s.surface.sd, src: s.surface.lastReading?.source ?? null });
write("field_model.json", {
  fc: LIPA_SOILGRIDS_SOIL.fc, wp: LIPA_SOILGRIDS_SOIL.wp,
  old: fmOld.map(fmRow),
  new: fmNew ? fmNew.map(fmRow) : null,
  l4Surface: seriesOf(days, "soil_moisture", "smap_l4", 5),
  l4Root: seriesOf(days, "soil_moisture", "smap_l4", 100),
});
console.log(`wrote ${OUT}: rain.json, water_plot_a.json, rotation.json, field_model.json (field model v2: ${fmNew ? "yes" : "pending calibration"})`);

// --- Parameters of every model, read from the code (the report prints these, never typed values) -------------------
{
  const plotSoil = { ...LIPA_PLOT_A_SOILGRIDS_SOIL, p: CROPS.corn.depletionP };
  const aoiSoil = { ...LIPA_SOILGRIDS_SOIL, p: CROPS.corn.depletionP };
  // Per-season inputs of the Plot A water balance (from the model's own daily output).
  const seasonInputs = LIPA_PLOT_A_SEASONS.map((s, n) => {
    const idx = inputs.map((d, k) => ({ d, k })).filter(({ d }) => d.date >= s.plantedOn && d.date < s.harvestedOn);
    const sum = (f: (k: number) => number | null) => idx.reduce((a, { k }) => a + (f(k) ?? 0), 0);
    return {
      season: s.season, stages: LIPA_PLOT_A.seasons[n].crop.stages,
      daysInRecord: idx.length, rainMm: Math.round(sum((k) => inputs[k].rainMm)), et0Mm: Math.round(sum((k) => inputs[k].et0Mm)),
      etcMm: Math.round(sum((k) => wb[k].etcMm)), etaMm: Math.round(sum((k) => wb[k].etaMm)),
      powerRainDays: idx.filter(({ k }) => imerg[k] === null && power[k] !== null).length,
    };
  });
  write("params.json", {
    discoveryRules: DISCOVERY_RULES,
    corn: CROPS.corn,
    plotASoil: { ...LIPA_PLOT_A_SOILGRIDS_SOIL, ...rootZoneLimits(plotSoil) },
    aoiSoil: { ...LIPA_SOILGRIDS_SOIL, ...rootZoneLimits(aoiSoil) },
    indicativeSoil: INDICATIVE_SOIL,
    seasonInputs,
    fieldModelRules: FIELD_MODEL_RULES,
    rotation: { assumptions: ASSUMPTIONS, priorities: DEFAULT_PRIORITIES, settings: DEFAULT_SETTINGS, soil: field.soil, climate: field.climate },
    nbo: { waitMinutesPerDay: WAIT_MINUTES_PER_DAY, checks: OBSERVATION_CHECKS.map((c) => ({ id: c.id, action: c.action, costMinutes: c.costMinutes, waitDays: c.waitDays, kinds: c.kinds, separates: c.separates.length })),
      causes: Object.fromEntries(Object.entries(CAUSES).map(([k, v]) => [k, v.length])) },
    fieldModelOld: {
      days: fmOld.length,
      surfaceAtFc: fmOld.filter((s) => Math.abs(s.surface.vwc - LIPA_SOILGRIDS_SOIL.fc) < 1e-6).length,
      deepAtFc: fmOld.filter((s) => Math.abs(s.deep.vwc - LIPA_SOILGRIDS_SOIL.fc) < 1e-6).length,
      smapCorrectionDays: seriesOf(days, "soil_moisture", "smap", null).filter((v) => v !== null).length,
      surfaceSdMedian: [...fmOld.map((s) => s.surface.sd)].sort((a, b) => a - b)[Math.floor(fmOld.length / 2)],
    },
  });
  console.log("wrote params.json");
}

// --- Plot A NDVI change rule (HLS, farmer's seasons): verdict tally, computed here ------------------------------------
{
  const csv = readFileSync("docs/Data Pipeline/data/external/hls_plot_a/hls_ndvi_plot_a.csv", "utf8");
  const rows = parseHlsNdviCsv(csv);
  const plotDays = mergeValues(days.map((d) => ({ ...d, fieldId: LIPA_PLOT_A.id, values: d.values.filter((v) => v.variable !== "ndvi") })),
    hlsNdviToValues(rows), LIPA_PLOT_A.timezone).days;
  const ctx: DiscoveryContext = { ...base, fieldId: LIPA_PLOT_A.id, location: LIPA_PLOT_A.center, seasons: [...LIPA_PLOT_A.seasons], ndviSource: "hls",
    plantedOn: LIPA_PLOT_A.seasons[0].plantedOn };
  const det = DEFAULT_DETECTORS["ndvi-change"];
  const tally = { unknown: 0, no: 0, alarm: 0 };
  plotDays.forEach((_, i) => { const o = det(plotDays.slice(0, i + 1), ctx); tally[o === "unknown" ? "unknown" : o === "no" ? "no" : "alarm"]++; });
  write("ndvi_plot_a.json", { tally, days: plotDays.length, passes: rows.length, usablePasses: rows.filter((r) => r.ndvi !== null).length,
    wetSeason2024Usable: rows.filter((r) => r.ndvi !== null && r.localDate >= "2024-06-05" && r.localDate <= "2024-09-15").length });
  console.log("wrote ndvi_plot_a.json", tally);
}
