import { CROPS, kcOnDay, stageOnDay } from "@/data/crops";
import type { CropId, Field } from "@/types";
import type { ModelState } from "./state";

export type SimulationPresetId =
  | "record"
  | "normal"
  | "drought"
  | "monsoon"
  | "salinity-lock";

export type SimulationOverrides = Partial<
  Record<
    | "storageMm"
    | "surfaceVwc"
    | "deepVwc"
    | "soilTempC"
    | "ecDsM"
    | "ndvi"
    | "rainMm"
    | "tmaxC"
    | "et0Mm"
    | "dap",
    number
  >
> & { cropId?: CropId };

export const PRESETS = {
  record: { label: "Field record", values: {} },
  normal: {
    label: "Normal drained",
    values: {
      surfaceVwc: 26,
      deepVwc: 30,
      storageRatio: 0.68,
      soilTempC: 26.5,
      ecDsM: 0.45,
      ndvi: 0.76,
      rainMm: 2,
      tmaxC: 29.5,
      et0Mm: 3.6,
    },
  },
  drought: {
    label: "Dry spell",
    values: {
      surfaceVwc: 13,
      deepVwc: 18,
      storageRatio: 0.2,
      soilTempC: 33.5,
      ecDsM: 0.28,
      ndvi: 0.38,
      rainMm: 0,
      tmaxC: 36.2,
      et0Mm: 6.1,
    },
  },
  monsoon: {
    label: "Monsoon surge",
    values: {
      surfaceVwc: 40,
      deepVwc: 36,
      storageRatio: 0.96,
      soilTempC: 24.2,
      ecDsM: 0.52,
      ndvi: 0.72,
      rainMm: 42,
      tmaxC: 26,
      et0Mm: 2.1,
    },
  },
  "salinity-lock": {
    label: "Salinity lock",
    values: {
      surfaceVwc: 34,
      deepVwc: 35,
      storageRatio: 0.8,
      soilTempC: 30.8,
      ecDsM: 3.4,
      ndvi: 0.41,
      rainMm: 0,
      tmaxC: 33.8,
      et0Mm: 4.8,
    },
  },
} as const;

export const CONTROL_RANGES = {
  storageMm: [0, 300, 1, "mm"],
  surfaceVwc: [8, 48, 0.1, "%"],
  deepVwc: [12, 42, 0.1, "%"],
  soilTempC: [18, 40, 0.1, "°C"],
  ecDsM: [0.1, 5, 0.01, "dS/m"],
  ndvi: [0.12, 0.9, 0.01, ""],
  rainMm: [0, 60, 0.1, "mm/day"],
  tmaxC: [20, 42, 0.1, "°C"],
  et0Mm: [1, 8, 0.1, "mm/day"],
  dap: [0, 130, 1, "days"],
} as const;

const clamp = (n: number, a = 0, b = 1) =>
  Math.min(b, Math.max(a, Number.isFinite(n) ? n : a));

/** Visual mappings only: these factors are not calibrated soil or crop predictions. */
export function buildFieldSceneState(
  field: Field,
  s: ModelState,
  preset: SimulationPresetId,
  overrides: SimulationOverrides = {},
) {
  const capacityMm = Math.max(0, s.capacityMm);
  const baseline: SimulationOverrides = {
    storageMm: s.at.storageMm,
    surfaceVwc: s.at.surfaceVwc,
    deepVwc: s.at.deepVwc,
    soilTempC: s.at.soilTempC,
    ecDsM: s.at.ecDsM,
    ndvi: s.ndviAt?.ndvi ?? undefined,
    rainMm: s.at.rainMm,
    tmaxC: s.at.tmaxC,
    et0Mm: s.at.et0Mm,
    dap: s.dap,
  };
  const p = PRESETS[preset].values as SimulationOverrides & {
    storageRatio?: number;
  };
  const values = {
    ...baseline,
    ...p,
    ...(p.storageRatio !== undefined
      ? { storageMm: p.storageRatio * capacityMm }
      : {}),
    ...overrides,
  };
  for (const key of Object.keys(overrides) as (keyof typeof overrides)[]) {
    if (key === "cropId") continue;
    const range = CONTROL_RANGES[key];
    if (values[key] !== undefined) {
      values[key] = clamp(
        values[key]!,
        key === "storageMm" ? 0 : range[0],
        key === "storageMm" ? capacityMm : range[1],
      );
    }
  }
  const crop = CROPS[overrides.cropId ?? field.currentCrop];
  const dap = values.dap ?? s.dap;
  const simulated = preset !== "record" || Object.keys(overrides).length > 0;
  return {
    date: s.at.date,
    ndviDate: s.ndviAt?.date ?? null,
    isSimulated: simulated,
    provenance: simulated ? ("simulated" as const) : ("model" as const),
    metrics: {
      ...values,
      capacityMm,
      storageRatio: capacityMm ? clamp(values.storageMm! / capacityMm) : 0,
      etcMm: simulated ? kcOnDay(crop, dap) * values.et0Mm! : s.at.etcMm,
    },
    crop: {
      ...crop,
      dap,
      stage: stageOnDay(crop, dap),
      growthFactor: clamp(dap / Math.max(1, crop.stages[0] + crop.stages[1])),
      canopyVigor:
        values.ndvi === undefined ? null : clamp((values.ndvi - 0.12) / 0.78),
      heatStress:
        crop.heatThresholdC !== null && values.tmaxC! >= crop.heatThresholdC,
    },
    soil: {
      texture: field.soil.texture,
      wetnessTop: clamp(values.surfaceVwc! / 48),
      wetnessDeep: clamp(values.deepVwc! / 42),
      salinityAlert:
        values.ecDsM! >= 3
          ? "lock"
          : values.ecDsM! >= 2.5
            ? "elevated"
            : "none",
    },
    weather: {
      rainIntensity: clamp(values.rainMm! / 60),
      cloudCover: clamp(values.rainMm! / 20),
      evapShimmer: clamp((values.et0Mm! - 3) / 5),
    },
    rotationStrips: field.rotationHistory.map((r, i, a) => ({
      ...r,
      isLegume: CROPS[r.crop].legume,
      isRepeatFamily:
        i > 0 && CROPS[a[i - 1].crop].family === CROPS[r.crop].family,
    })),
    stationStatusColor: values.ecDsM! >= 2.5 ? "#9a6410" : "#37864a",
  };
}

export type FieldSceneState = ReturnType<typeof buildFieldSceneState>;
