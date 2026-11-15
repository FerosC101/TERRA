/**
 * The planned TERRA station's readings as a SIMULATION: the two-layer moisture bucket, soil temperature and bulk EC
 * used by the demo series (lib/demo/series.ts), split out so the same equations can also run on REAL weather for
 * fields that have a real record but no installed station (simulatePlannedStation).
 *
 * Nothing here is measured. These equations are illustrative, not calibrated to any sensor or soil; the output is
 * display-only (labelled "Simulation" in the app) and never enters a FieldDay record or any model (D-019).
 * Depths follow the app's existing 10 cm / 40 cm cards; the hardware spec lists 10 / 30 / 60 cm probes (open item).
 */
import { round, clamp } from "@/lib/format";
import { createRng, gaussian } from "@/lib/rng";

/** Layer limits, % volumetric water content. */
const WILT = 12;
const FC = 34;
const SAT = 42;

export interface StationSoil {
  /** 0–15 cm layer, % VWC */
  surface: number;
  /** 30–70 cm layer, % VWC */
  deep: number;
}

export const STATION_START: StationSoil = { surface: 27, deep: 30 };

/** Water stress of the surface layer, 0 (wilting) .. 1 (field capacity), from yesterday's state. */
export function surfaceStress(s: StationSoil): number {
  return clamp((s.surface - WILT) / (FC - WILT), 0, 1);
}

/** One day of the two-layer bucket: rain in, 0.8 × ETc out of the surface, 0.12 × ETc out of the deep layer. */
export function stepStationSoil(s: StationSoil, rainMm: number, etcMm: number): StationSoil {
  const surfStress = surfaceStress(s);
  // Surface layer (0–15 cm): 1 mm of water ≈ 0.667 % VWC
  const infil = Math.min(rainMm, (SAT - s.surface) * 1.5);
  const toDeep = rainMm - infil + Math.max(0, s.surface - FC) * 0.35 * 1.5;
  const surface = clamp(s.surface + (infil - 0.8 * etcMm * surfStress) * 0.667 - Math.max(0, s.surface - FC) * 0.35, WILT, SAT);
  // Deep layer (30–70 cm): 1 mm ≈ 0.25 % VWC — responds slowly
  const deepStress = clamp((s.deep - 16) / 12, 0, 1);
  const deep = clamp(s.deep + (toDeep * 0.6 - 0.12 * etcMm * deepStress) * 0.25 - Math.max(0, s.deep - 33) * 0.02, 16, 36);
  return { surface, deep };
}

/** Soil temperature at 10 cm from the day's maximum air temperature, warmer when the surface is dry. */
export function stationSoilTempC(tmaxC: number, surfStress: number, noise: number): number {
  return round(tmaxC - 5.2 + (1 - surfStress) * 1.8 + noise * 0.4, 1);
}

/** Bulk EC rises with moisture (it is not a nutrient reading). */
export function stationEcDsM(surface: number, noise: number): number {
  return round(0.32 + 0.011 * (surface - 20) + noise * 0.012, 2);
}

export interface PlannedStationDay {
  date: string;
  surfaceVwc: number;
  deepVwc: number;
  soilTempC: number;
  ecDsM: number;
}

/**
 * Simulated readings of a planned (not installed) station, one per day, driven by REAL daily rain, crop water use
 * (ETc) and maximum air temperature. Seeded, so the same inputs always give the same output.
 */
export function simulatePlannedStation(
  days: { date: string; rainMm: number; etcMm: number; tmaxC: number }[],
  seed: number,
): PlannedStationDay[] {
  const rng = createRng(seed);
  let s = STATION_START;
  return days.map((d) => {
    const stress = surfaceStress(s);
    s = stepStationSoil(s, d.rainMm, d.etcMm);
    return {
      date: d.date,
      surfaceVwc: round(s.surface + gaussian(rng) * 0.5, 1),
      deepVwc: round(s.deep + gaussian(rng) * 0.3, 1),
      soilTempC: stationSoilTempC(d.tmaxC, stress, gaussian(rng)),
      ecDsM: stationEcDsM(s.surface, gaussian(rng)),
    };
  });
}
