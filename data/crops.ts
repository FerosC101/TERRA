import type { Crop, CropId } from "@/types";

/**
 * Crop parameters. Kc values, stage lengths and depletion fractions are
 * indicative figures in the style of FAO Irrigation & Drainage Paper 56
 * (Tables 11, 12 and 22), shortened for tropical cultivars where noted.
 * They are starting points — a real deployment must calibrate them locally.
 */
export const CROPS: Record<CropId, Crop> = {
  corn: {
    id: "corn", name: "Corn", family: "Poaceae", familyCommon: "Grass",
    kc: { ini: 0.3, mid: 1.2, end: 0.5 }, stages: [20, 30, 40, 25], depletionP: 0.55,
    heatThresholdC: 35, legume: false, nutrientRole: "heavy-feeder", cover: true,
    note: "High water demand at tasselling and silking; a heavy nitrogen user.",
    basis: "FAO-56 maize (grain), tropical season length",
  },
  sorghum: {
    id: "sorghum", name: "Sorghum", family: "Poaceae", familyCommon: "Grass",
    kc: { ini: 0.3, mid: 1.05, end: 0.55 }, stages: [20, 30, 40, 25], depletionP: 0.55,
    heatThresholdC: 38, legume: false, nutrientRole: "moderate-feeder", cover: true,
    note: "More tolerant of heat and dry spells than corn.",
    basis: "FAO-56 sorghum (grain)",
  },
  mungbean: {
    id: "mungbean", name: "Mung Bean", family: "Fabaceae", familyCommon: "Legume",
    kc: { ini: 0.4, mid: 1.05, end: 0.35 }, stages: [15, 20, 25, 10], depletionP: 0.45,
    heatThresholdC: 38, legume: true, nutrientRole: "nitrogen-fixer", cover: true,
    note: "Short-season legume; fits between main crops.",
    basis: "FAO-56 green gram, short-duration cultivar",
  },
  peanut: {
    id: "peanut", name: "Peanut", family: "Fabaceae", familyCommon: "Legume",
    kc: { ini: 0.4, mid: 1.15, end: 0.6 }, stages: [25, 30, 40, 20], depletionP: 0.5,
    heatThresholdC: 36, legume: true, nutrientRole: "nitrogen-fixer", cover: true,
    note: "Legume with moderate water demand; sensitive to waterlogging at pegging.",
    basis: "FAO-56 groundnut",
  },
  soybean: {
    id: "soybean", name: "Soybean", family: "Fabaceae", familyCommon: "Legume",
    kc: { ini: 0.4, mid: 1.15, end: 0.5 }, stages: [15, 20, 45, 20], depletionP: 0.5,
    heatThresholdC: 35, legume: true, nutrientRole: "nitrogen-fixer", cover: true,
    note: "Legume; pod fill is sensitive to water shortage.",
    basis: "FAO-56 soybean, tropical season length",
  },
  sweetpotato: {
    id: "sweetpotato", name: "Sweet Potato", family: "Convolvulaceae", familyCommon: "Morning glory",
    kc: { ini: 0.5, mid: 1.15, end: 0.65 }, stages: [15, 30, 50, 25], depletionP: 0.65,
    heatThresholdC: 35, legume: false, nutrientRole: "moderate-feeder", cover: true,
    note: "Vines give dense ground cover; tolerates dry spells once established.",
    basis: "FAO-56 sweet potato",
  },
  squash: {
    id: "squash", name: "Squash", family: "Cucurbitaceae", familyCommon: "Gourd",
    kc: { ini: 0.5, mid: 0.95, end: 0.75 }, stages: [20, 30, 30, 15], depletionP: 0.5,
    heatThresholdC: 35, legume: false, nutrientRole: "moderate-feeder", cover: true,
    note: "Broad-leaf vegetable; a different family from cereals and legumes.",
    basis: "FAO-56 squash / zucchini",
  },
  sunnhemp: {
    id: "sunnhemp", name: "Sunn Hemp (cover)", family: "Fabaceae", familyCommon: "Legume",
    kc: { ini: 0.4, mid: 1.0, end: 0.9 }, stages: [10, 20, 25, 5], depletionP: 0.5,
    heatThresholdC: null, legume: true, nutrientRole: "nitrogen-fixer", cover: true,
    note: "Green-manure cover crop, not harvested. Uses water but protects the soil.",
    basis: "Assumed — FAO-56 has no Kc for sunn hemp; values follow a generic legume forage",
  },
  fallow: {
    id: "fallow", name: "Fallow (bare)", family: "—", familyCommon: "None",
    kc: { ini: 0.25, mid: 0.25, end: 0.25 }, stages: [30, 30, 30, 30], depletionP: 0.5,
    heatThresholdC: null, legume: false, nutrientRole: "none", cover: false,
    note: "No crop. Soil is exposed; only bare-soil evaporation is counted.",
    basis: "Assumed bare-soil coefficient of 0.25",
  },
};

export const CROP_LIST: Crop[] = Object.values(CROPS);

export function cropDuration(crop: Crop): number {
  return crop.stages.reduce((a, b) => a + b, 0);
}

/** FAO-56 piecewise crop coefficient for a given day after planting. */
export function kcOnDay(crop: Crop, day: number): number {
  const [ini, dev, mid, late] = crop.stages;
  if (day < 0) return 0.25;
  if (day < ini) return crop.kc.ini;
  if (day < ini + dev) return crop.kc.ini + ((day - ini) / dev) * (crop.kc.mid - crop.kc.ini);
  if (day < ini + dev + mid) return crop.kc.mid;
  if (day < ini + dev + mid + late) {
    return crop.kc.mid + ((day - ini - dev - mid) / late) * (crop.kc.end - crop.kc.mid);
  }
  return 0.25;
}

export function stageOnDay(crop: Crop, day: number): "pre" | "initial" | "development" | "mid-season" | "late" | "post" {
  const [ini, dev, mid, late] = crop.stages;
  if (day < 0) return "pre";
  if (day < ini) return "initial";
  if (day < ini + dev) return "development";
  if (day < ini + dev + mid) return "mid-season";
  if (day < ini + dev + mid + late) return "late";
  return "post";
}
