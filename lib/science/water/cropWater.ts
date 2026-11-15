/**
 * Daily crop water requirement and soil-water balance for one field.
 *
 *   ETc = Kc × ET0                     FAO-56 single crop coefficient (Kc from data/crops.ts, indicative)
 *   two-layer soil step                ./soilWater.ts (evaporation from the topsoil, Ks-limited transpiration)
 *
 * Outputs per day: crop water use (ETc), actual use (ETa = E + T), root-zone depletion, Ks, whether the
 * crop is stressed (Ks < 1), and the refill amount once depletion passes RAW (the FAO-56 point to irrigate).
 *
 * ASSUMPTIONS
 * 1. The record starts at field capacity (zero depletion). UNVERIFIED for any real start date.
 * 2. A day with missing rain or ET0 is not guessed: its outputs are null and the soil state carries
 *    over unchanged. This understates drying when ET0 is missing and wetting when rain is missing.
 * 3. No irrigation is applied; `refillMm` is what would be needed, not what was given.
 */
import { kcOnDay, stageOnDay } from "@/data/crops";
import { daysBetween } from "@/lib/dates";
import { seasonOn, type CropSeason } from "@/lib/science/season";
import type { Crop } from "@/types";
import { canopyCover, soilStep, type SoilParams, type SoilState } from "./soilWater";

export interface WaterInput {
  date: string;
  rainMm: number | null;
  et0Mm: number | null;
}

export interface WaterDay {
  date: string;
  /** Days after planting. */
  dap: number;
  stage: ReturnType<typeof stageOnDay>;
  kc: number;
  /** null on days with a missing input (assumption 2). */
  etcMm: number | null;
  etaMm: number | null;
  ks: number | null;
  /** Root-zone depletion below field capacity at the end of the day, mm. */
  depletionMm: number;
  tawMm: number;
  rawMm: number;
  stressed: boolean | null;
  /** Water needed to refill the root zone to field capacity when depletion exceeds RAW, else 0. */
  refillMm: number;
  surfaceVwc: number;
  deepVwc: number;
  /** "missing-input" when rain or ET0 was missing. */
  note?: "missing-input";
}

export function rootZoneLimits(soil: SoilParams) {
  const taw = (soil.fc - soil.wp) * 1000 * soil.rootDepthM;
  return { taw, raw: soil.p * taw };
}

function depletionOf(state: SoilState, soil: SoilParams): number {
  return Math.min(state.surfaceDepletionMm, (soil.fc - soil.wp) * 1000 * soil.surfaceDepthM) + state.deepDepletionMm;
}

/** Soil state as volumetric water content of each layer, m³/m³. */
export function layerVwc(state: SoilState, soil: SoilParams): { surfaceVwc: number; deepVwc: number } {
  return {
    surfaceVwc: soil.fc - state.surfaceDepletionMm / (1000 * soil.surfaceDepthM),
    deepVwc: soil.fc - state.deepDepletionMm / (1000 * (soil.rootDepthM - soil.surfaceDepthM)),
  };
}

/** One day of the balance: yesterday's soil state + today's weather → today's outputs and state. */
export function waterDay(state: SoilState, d: WaterInput, crop: Crop, plantedOn: string, soil: SoilParams): { day: WaterDay; state: SoilState } {
  const { taw, raw } = rootZoneLimits(soil);
  const dap = daysBetween(plantedOn, d.date);
  const kc = kcOnDay(crop, dap);
  const base = { date: d.date, dap, stage: stageOnDay(crop, dap), kc, tawMm: taw, rawMm: raw };

  if (d.rainMm === null || d.et0Mm === null) {
    const dr = depletionOf(state, soil);
    return {
      state,
      day: { ...base, etcMm: null, etaMm: null, ks: null, stressed: null, depletionMm: dr, refillMm: dr > raw ? dr : 0, ...layerVwc(state, soil), note: "missing-input" },
    };
  }

  const etc = kc * d.et0Mm;
  const r = soilStep(state, { rainMm: d.rainMm, etcMm: etc, canopyCover: canopyCover(crop, dap) }, soil);
  const dr = depletionOf(r.state, soil);
  return {
    state: r.state,
    day: {
      ...base,
      etcMm: etc,
      etaMm: r.evaporationMm + r.transpirationMm,
      ks: r.ks,
      stressed: r.ks < 1,
      depletionMm: dr,
      refillMm: dr > raw ? dr : 0,
      surfaceVwc: r.surfaceVwc,
      deepVwc: r.deepVwc,
    },
  };
}

/**
 * Daily balance over several cropping seasons, one continuous soil state. Each day uses the season
 * planted latest on or before it (`seasonOn`); before the first planting, the first season (bare soil,
 * Kc 0.25). Between harvest and the next planting the previous season is "post" (bare soil, Kc 0.25).
 */
export function runSeasonalWaterBalance(
  inputs: WaterInput[],
  seasons: CropSeason[],
  soil: Omit<SoilParams, "p">,
  start: SoilState = { surfaceDepletionMm: 0, deepDepletionMm: 0 },
): WaterDay[] {
  if (seasons.length === 0) throw new Error("runSeasonalWaterBalance needs at least one season");
  const first = [...seasons].sort((a, b) => a.plantedOn.localeCompare(b.plantedOn))[0];
  let state = start;
  return inputs.map((d) => {
    const s = seasonOn(seasons, d.date) ?? first;
    const r = waterDay(state, d, s.crop, s.plantedOn, { ...soil, p: s.crop.depletionP });
    state = r.state;
    return r.day;
  });
}

export function runDailyWaterBalance(
  inputs: WaterInput[],
  crop: Crop,
  plantedOn: string,
  soil: Omit<SoilParams, "p">,
  start: SoilState = { surfaceDepletionMm: 0, deepDepletionMm: 0 },
): WaterDay[] {
  const prm: SoilParams = { ...soil, p: crop.depletionP };
  let state = start;
  return inputs.map((d) => {
    const r = waterDay(state, d, crop, plantedOn, prm);
    state = r.state;
    return r.day;
  });
}
