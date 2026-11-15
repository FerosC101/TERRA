import { CROPS } from "@/data/crops";
import { REAL_FIELD_MODEL, REAL_FIELD_SETTINGS } from "@/data/lipaModelConfig";
import { LIPA_POWER_RAIN_NORMAL } from "@/data/nasa/lipaPowerRain";
import { realRecord } from "@/data/nasa/realRecords";
import { realMonthlyAnomalies, realObservations } from "@/lib/adapters/realObservations";
import { generateAnomalies, generateSeries } from "@/lib/demo/series";
import { runFieldModel } from "@/lib/science/fieldModel/state";
import type { DailyObservation, Field, MonthlyAnomaly } from "@/types";

/**
 * The one place the services get a field's daily observation rows and monthly climate departures:
 * - a field with a real record (data/nasa/realRecords.ts): rows on the record's own dates (2024–2025) from the real NASA
 *   values, the Living Field Model's water and ETc, and the planned station's SIMULATED readings
 *   (lib/adapters/realObservations.ts); departures from real POWER rain and air temperature;
 * - a demo field: the demo series (lib/demo/series.ts).
 * Model inputs never come from here for real fields: the models read realRecord() directly.
 */
const cache = new Map<string, DailyObservation[]>();

export function fieldObservations(field: Field): DailyObservation[] {
  const days = realRecord(field.id);
  if (!days) return generateSeries(field);
  const hit = cache.get(field.id);
  if (hit) return hit;
  const cfg = REAL_FIELD_MODEL[field.id];
  if (!cfg) throw new Error(`No REAL_FIELD_MODEL entry for ${field.id} (data/lipaModelConfig.ts)`);
  // The model run without follow-ups: the baseline the rows show (pages that log follow-ups ask for states separately).
  const states = runFieldModel(days, { crop: CROPS[field.currentCrop], plantedOn: field.plantedOn, soil: cfg.soil, seasons: cfg.seasons });
  const rows = realObservations(days, states, { ndviSource: REAL_FIELD_SETTINGS[field.id]?.ndviSource ?? "modis", stationSeed: field.seed });
  cache.set(field.id, rows);
  return rows;
}

export function fieldAnomalies(field: Field): MonthlyAnomaly[] {
  const days = realRecord(field.id);
  // Real fields at Lipa share one POWER cell: the 2001–2023 POWER rain normal and the field's POWER climatology.
  return days ? realMonthlyAnomalies(days, LIPA_POWER_RAIN_NORMAL.monthlyMm, field.climate.tmaxC) : generateAnomalies(field);
}
