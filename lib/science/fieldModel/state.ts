/**
 * Living Field Model (D-007): what TERRA believes about one field on each day, where each belief came
 * from, how old it is, and how uncertain it is.
 *
 * Each day: yesterday's state + today's weather → the water balance (../water/cropWater.ts) predicts
 * today's soil water; then any soil-moisture reading nudges the prediction towards it.
 *
 * Nudge: a weighted average of the model and the reading, weighted by their uncertainties
 * (weight on the reading k = sdModel² / (sdModel² + sdReading²)); the result's uncertainty is
 * sqrt((1 − k)² sdModel² + k² sdReading²). Uncertainty grows by a fixed amount per day without a
 * reading. Settings: data/fieldModelRules.ts (heuristics, not calibrated).
 *
 * ASSUMPTIONS (UNVERIFIED)
 * 1. A 10 cm probe reading stands for the 0–10 cm model layer, and a 40 cm probe for the 10–100 cm layer.
 * 2. SMAP corrects the surface layer only on days with no 10 cm station or manual reading, and its
 *    steady offset from the field (see the sensor-offset detector) is not removed.
 * 3. Rain: station gauge, else IMERG, else NASA POWER, whichever is first usable that day.
 * 4. SMAP L4 (D-017, when `ctx.l4` is given): its 0–5 cm layer stands for the 0–10 cm model layer and its 0–100 cm
 *    root zone for the whole root zone; the 10–100 cm value is (root·1.0 m − surface·0.1 m) / 0.9 m. L4 runs on
 *    NASA's own soil, so each layer is first rescaled linearly onto this soil's range (m = a + b·L4, fitted on L4
 *    history). L4 is used before SMAP L3 for the surface and is the only satellite source for the deep layer.
 */
import { FIELD_MODEL_RULES as RULES } from "@/data/fieldModelRules";
import { seriesOf } from "@/lib/science/discovery/engine";
import type { Crop } from "@/types";
import type { FieldDay, SourceId } from "@/types/discovery-contract";
import { seasonOn, type CropSeason } from "../season";
import { layerVwc, rootZoneLimits, waterDay, type WaterDay } from "../water/cropWater";
import type { SoilParams, SoilState } from "../water/soilWater";

export interface LayerEstimate {
  /** m³/m³ */
  vwc: number;
  /** 1 sd, m³/m³ */
  sd: number;
  /** The last reading that corrected this layer, if any. */
  lastReading: { source: SourceId; date: string } | null;
}

export interface FieldState {
  date: string;
  /** Water balance outputs for the day, after any correction. */
  water: WaterDay;
  surface: LayerEstimate;
  deep: LayerEstimate;
  rain: { mm: number | null; source: SourceId | null };
  /** Latest NDVI composite up to this day. */
  ndvi: { value: number; date: string } | null;
  soil: SoilState;
}

/** A soil-moisture reading entered by a person (a follow-up), m³/m³. */
export interface ManualReading {
  date: string;
  surfaceVwc?: number;
  deepVwc?: number;
}

type ReadingSource = keyof typeof RULES.readingSd;

/** Moves a layer estimate towards a reading, weighted by both uncertainties. */
export function nudge(layer: LayerEstimate, reading: number, source: ReadingSource, date: string): LayerEstimate {
  const sr = RULES.readingSd[source];
  const k = layer.sd ** 2 / (layer.sd ** 2 + sr ** 2);
  return {
    vwc: layer.vwc + k * (reading - layer.vwc),
    sd: Math.sqrt((1 - k) ** 2 * layer.sd ** 2 + k ** 2 * sr ** 2),
    lastReading: { source, date },
  };
}


/** SMAP L4 settings for the field model (D-017): where the two layers are stored and their linear rescaling. */
export interface L4Rescale {
  source: SourceId;
  surfaceDepthCm: number;
  rootDepthCm: number;
  surface: { a: number; b: number };
  root: { a: number; b: number };
}

export function runFieldModel(
  days: FieldDay[],
  ctx: { crop: Crop; plantedOn: string; soil: Omit<SoilParams, "p">; seasons?: CropSeason[]; l4?: L4Rescale },
  manual: ManualReading[] = [],
): FieldState[] {
  const soil: SoilParams = { ...ctx.soil, p: ctx.crop.depletionP };
  const { raw } = rootZoneLimits(soil);
  const surfaceMm = (v: number) => (soil.fc - v) * 1000 * soil.surfaceDepthM;
  const deepMm = (v: number) => (soil.fc - v) * 1000 * (soil.rootDepthM - soil.surfaceDepthM);
  // The model holds no water above field capacity; the topsoil can dry to TEW (eq. 78), the deep layer to wilting point.
  const clampSurface = (v: number) => Math.min(soil.fc, Math.max(soil.fc - soil.tewMm / (1000 * soil.surfaceDepthM), v));
  const clampDeep = (v: number) => Math.min(soil.fc, Math.max(soil.wp, v));
  const surfaceAvailMm = (soil.fc - soil.wp) * 1000 * soil.surfaceDepthM;

  const rainBy: [SourceId, (number | null)[]][] = (["station", "imerg", "power"] as SourceId[]).map((s) => [s, seriesOf(days, "precipitation", s, null)]);
  const et0 = seriesOf(days, "et0", "power", null);
  const st10 = seriesOf(days, "soil_moisture", "station", 10);
  const st40 = seriesOf(days, "soil_moisture", "station", 40);
  const smap = seriesOf(days, "soil_moisture", "smap", null);
  const ndvi = seriesOf(days, "ndvi", "modis", null);
  const l4 = ctx.l4;
  const l4s = l4 ? seriesOf(days, "soil_moisture", l4.source, l4.surfaceDepthCm) : days.map(() => null);
  const l4r = l4 ? seriesOf(days, "soil_moisture", l4.source, l4.rootDepthCm) : days.map(() => null);
  const deepThick = soil.rootDepthM - soil.surfaceDepthM;

  let soilState: SoilState = { surfaceDepletionMm: 0, deepDepletionMm: 0 };
  let surface: LayerEstimate = { vwc: soil.fc, sd: RULES.startSd, lastReading: null };
  let deep: LayerEstimate = { vwc: soil.fc, sd: RULES.startSd, lastReading: null };
  let lastNdvi: FieldState["ndvi"] = null;

  return days.map((d, k) => {
    const rainHit = rainBy.find(([, s]) => s[k] !== null);
    const rain = { mm: rainHit ? rainHit[1][k] : null, source: rainHit ? rainHit[0] : null };
    const season = ctx.seasons ? seasonOn(ctx.seasons, d.date) ?? ctx.seasons[0] : { crop: ctx.crop, plantedOn: ctx.plantedOn };
    const step = waterDay(soilState, { date: d.date, rainMm: rain.mm, et0Mm: et0[k] }, season.crop, season.plantedOn, { ...soil, p: season.crop.depletionP });
    soilState = step.state;
    const v = layerVwc(soilState, soil);
    surface = { ...surface, vwc: v.surfaceVwc, sd: surface.sd + RULES.sdGrowthPerDay };
    deep = { ...deep, vwc: v.deepVwc, sd: deep.sd + RULES.sdGrowthPerDay };

    const m = manual.filter((r) => r.date === d.date).at(-1);
    if (st10[k] !== null) surface = nudge(surface, st10[k] as number, "station", d.date);
    if (m?.surfaceVwc !== undefined) surface = nudge(surface, m.surfaceVwc, "manual", d.date);
    const noSurfaceGround = st10[k] === null && m?.surfaceVwc === undefined;
    const surfL4 = l4 && l4s[k] !== null ? l4.surface.a + l4.surface.b * (l4s[k] as number) : null;
    const rootL4 = l4 && l4r[k] !== null ? l4.root.a + l4.root.b * (l4r[k] as number) : null;
    if (noSurfaceGround && surfL4 !== null) surface = nudge(surface, surfL4, "smap_l4", d.date);
    else if (noSurfaceGround && smap[k] !== null) surface = nudge(surface, smap[k] as number, "smap", d.date);
    if (st40[k] !== null) deep = nudge(deep, st40[k] as number, "station", d.date);
    if (m?.deepVwc !== undefined) deep = nudge(deep, m.deepVwc, "manual", d.date);
    if (st40[k] === null && m?.deepVwc === undefined && rootL4 !== null && surfL4 !== null) {
      deep = nudge(deep, (rootL4 * soil.rootDepthM - surfL4 * soil.surfaceDepthM) / deepThick, "smap_l4", d.date);
    }

    surface = { ...surface, vwc: clampSurface(surface.vwc) };
    deep = { ...deep, vwc: clampDeep(deep.vwc) };
    soilState = { surfaceDepletionMm: surfaceMm(surface.vwc), deepDepletionMm: deepMm(deep.vwc) };
    const dr = Math.min(soilState.surfaceDepletionMm, surfaceAvailMm) + soilState.deepDepletionMm;
    if (ndvi[k] !== null) lastNdvi = { value: ndvi[k] as number, date: d.date };

    return {
      date: d.date,
      water: { ...step.day, depletionMm: dr, refillMm: dr > raw ? dr : 0, surfaceVwc: surface.vwc, deepVwc: deep.vwc },
      surface,
      deep,
      rain,
      ndvi: lastNdvi,
      soil: soilState,
    };
  });
}
