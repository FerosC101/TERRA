import { CROPS, cropDuration, kcOnDay } from "@/data/crops";
import { addDays, daysBetween, DEMO_TODAY, monthOf } from "@/lib/dates";
import { clamp, round } from "@/lib/format";
import { createRng, gaussian } from "@/lib/rng";
import type { DailyObservation, Field, MonthlyAnomaly } from "@/types";
import { STATION_START, stationEcDsM, stationSoilTempC, stepStationSoil, surfaceStress, type StationSoil } from "./stationModel";

/**
 * Generates the demo observation record for a field.
 *
 * Nothing here is retrieved from a sensor or from NASA. Rain is drawn from the
 * field's monthly climatology, then a simple two-layer soil bucket turns rain
 * and crop water use (ETc = Kc × ET0) into surface and deep moisture. The
 * "satellite" series are derived from those with the sampling pattern and
 * typical offsets of the real products, so the UI can be built honestly
 * around their real limitations.
 */
export const RECORD_DAYS = 240;
const SPELL_DAYS = 18;

const cache = new Map<string, DailyObservation[]>();

export function generateSeries(field: Field): DailyObservation[] {
  const hit = cache.get(field.id);
  if (hit) return hit;

  const rng = createRng(field.seed);
  const crop = CROPS[field.currentCrop];
  const start = addDays(DEMO_TODAY, -(RECORD_DAYS - 1));
  const out: DailyObservation[] = [];

  let soil: StationSoil = STATION_START;
  const capacity = field.soil.awcMmPerM * field.soil.profileDepthM;
  let storage = capacity * 0.6;
  let lastNdvi = 0.24;

  for (let i = 0; i < RECORD_DAYS; i++) {
    const date = addDays(start, i);
    const m = monthOf(date);
    const fromEnd = RECORD_DAYS - 1 - i;
    const clim = field.climate;

    // Rainfall: wet-day occurrence, exponential amounts
    const monthly = clim.rainMm[m];
    const pWet = clamp(monthly / 420, 0.08, 0.7);
    const meanWet = monthly / (30 * pWet);
    let rain = rng() < pWet ? -Math.log(Math.max(rng(), 1e-6)) * meanWet : 0;
    const spellNoise = rng();
    if (fromEnd < SPELL_DAYS) {
      if (field.demoPattern === "dry-spell") rain = spellNoise < 0.12 ? rain * 0.12 : 0;
      if (field.demoPattern === "wet-spell") rain = rain * 1.9 + (spellNoise < 0.5 ? 9 : 0);
    }
    rain = round(rain, 1);
    const rainImerg = round(Math.max(0, rain * (0.75 + 0.5 * rng()) + (rain > 0 ? gaussian(rng) * 1.5 : rng() < 0.06 ? rng() * 3 : 0)), 1);

    const cloudy = rain > 8;
    const et0 = round(Math.max(1.2, clim.et0MmDay[m] * (cloudy ? 0.78 : 1.06) + gaussian(rng) * 0.3), 2);
    const tmax = round(clim.tmaxC[m] + (cloudy ? -1.6 : 0.6) + gaussian(rng) * 1.1 + (fromEnd < SPELL_DAYS && field.demoPattern === "dry-spell" ? 1.4 : 0), 1);

    // Which crop is in the ground on this date: the current one, or the one before it
    let dap = daysBetween(field.plantedOn, date);
    let active = crop;
    if (dap < 0 && field.previousCrop) {
      const prevDay = daysBetween(field.previousCrop.plantedOn, date);
      const prev = CROPS[field.previousCrop.crop];
      if (prevDay >= 0 && prevDay < cropDuration(prev)) {
        dap = prevDay;
        active = prev;
      }
    }
    const kc = kcOnDay(active, dap);
    const etc = round(kc * et0, 2);

    // Two-layer station bucket (lib/demo/stationModel.ts)
    const surfStress = surfaceStress(soil);
    soil = stepStationSoil(soil, rain, etc);
    const { surface, deep } = soil;

    // Root-zone storage: S_t = S_{t-1} + P − ETc·Ks − R − D
    const runoff = Math.max(0, rain - 30) * 0.3;
    const dep = 1 - storage / capacity;
    const ks = dep <= active.depletionP ? 1 : clamp((1 - dep) / (1 - active.depletionP), 0, 1);
    storage = Math.min(capacity, Math.max(0, storage + rain - runoff - etc * ks));

    const surfaceObs = round(surface + gaussian(rng) * 0.5, 1);
    const deepObs = round(deep + gaussian(rng) * 0.3, 1);

    // SMAP-style: every third day, landscape-scale so smoother and offset wetter
    const smap = i % 3 === 1 ? round(clamp(surface * 0.82 + 8.2 + gaussian(rng) * 1.3, 8, 45), 1) : null;

    // MODIS-style NDVI: 16-day composite following the crop canopy
    let ndvi: number | null = null;
    if (fromEnd % 16 === 5) {
      const canopy = dap < 0 ? 0 : clamp(kc / active.kc.mid, 0, 1);
      const target = dap < 0 ? 0.24 + 0.04 * rng() : 0.22 + 0.6 * canopy ** 1.2;
      lastNdvi = lastNdvi + (target - lastNdvi) * 0.75 + gaussian(rng) * 0.012;
      let value = lastNdvi;
      if (fromEnd === 5 && field.demoPattern === "dry-spell") value -= 0.12;
      ndvi = round(clamp(value, 0.12, 0.9), 3);
    }

    // ECOSTRESS-style LST: irregular acquisitions, warmer when the surface is dry
    const lst = !cloudy && rng() < 0.22 ? round(tmax + 2.5 + (1 - surfStress) * 5 + gaussian(rng) * 1.2, 1) : null;

    out.push({
      date,
      rainMm: rain,
      rainImergMm: rainImerg,
      et0Mm: et0,
      etcMm: etc,
      tmaxC: tmax,
      soilTempC: stationSoilTempC(tmax, surfStress, gaussian(rng)),
      surfaceVwc: surfaceObs,
      deepVwc: deepObs,
      smapVwc: smap,
      ndvi,
      lstC: lst,
      ecDsM: stationEcDsM(surface, gaussian(rng)),
      storageMm: round(storage, 1),
    });
  }

  cache.set(field.id, out);
  return out;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 36 months of rainfall and temperature departures from the monthly baseline (demo). */
export function generateAnomalies(field: Field): MonthlyAnomaly[] {
  const rng = createRng(field.seed * 7 + 13);
  const out: MonthlyAnomaly[] = [];
  let drift = 0;
  for (let i = 35; i >= 0; i--) {
    const d = new Date(Date.UTC(2026, 10 - i, 1));
    drift = drift * 0.6 + gaussian(rng) * 0.25;
    let rain = gaussian(rng) * 22 - drift * 20;
    if (i === 0 && field.demoPattern === "dry-spell") rain = -46;
    if (i === 0 && field.demoPattern === "wet-spell") rain = 58;
    out.push({
      month: `${MONTH_LABELS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
      rainAnomalyPct: round(clamp(rain, -80, 120), 0),
      tempAnomalyC: round(0.35 + drift + gaussian(rng) * 0.25, 2),
    });
  }
  return out;
}
