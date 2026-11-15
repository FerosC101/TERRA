/**
 * Cropping seasons: which season a day belongs to, and crop stage lengths fitted to a real season.
 *
 * ASSUMPTION (fitStagesToSeason): when the observed season (planting → harvest) is shorter or longer than
 * the crop's indicative stages (data/crops.ts), the four FAO-56 stage lengths are scaled in proportion so
 * they add up to the observed length. FAO-56 says stage lengths should be adjusted to local conditions;
 * proportional scaling is our simplification (UNVERIFIED for Lipa corn).
 */
import { daysBetween } from "@/lib/dates";
import type { Crop } from "@/types";

export interface CropSeason {
  crop: Crop;
  plantedOn: string;
  /** Harvest date, when known; used to fit the stage lengths. */
  harvestedOn?: string;
}

export function fitStagesToSeason(crop: Crop, plantedOn: string, harvestedOn: string): Crop {
  const length = daysBetween(plantedOn, harvestedOn);
  if (length <= 0) throw new Error(`Harvest ${harvestedOn} must be after planting ${plantedOn}`);
  const total = crop.stages.reduce((a, b) => a + b, 0);
  const scaled = crop.stages.map((s) => Math.round((s * length) / total));
  scaled[3] += length - scaled.reduce((a, b) => a + b, 0); // rounding remainder goes to the late stage
  return { ...crop, stages: scaled as Crop["stages"] };
}

/** The season with the latest planting date on or before `date`; null before the first planting. */
export function seasonOn(seasons: CropSeason[], date: string): CropSeason | null {
  let best: CropSeason | null = null;
  for (const s of seasons) {
    if (s.plantedOn <= date && (!best || s.plantedOn > best.plantedOn)) best = s;
  }
  return best;
}
