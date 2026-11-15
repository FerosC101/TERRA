import { CROPS } from "@/data/crops";
import { fmt } from "@/lib/format";
import type { CropId, DimensionKey, Provenance } from "@/types";
import type { FieldSceneState } from "./simulation";

/**
 * Layout of the field scene, in scene units (1 unit ≈ 1 m of soil depth; distances
 * across the field are not to scale). The plot sits in open farmland and its front
 * edge is cut away to show the soil profile. Shared by the 3D scene and the callouts.
 */
export const LAYOUT = {
  /** The managed plot; z = front is the cut face */
  plot: { x0: -4.5, x1: 4.5, z0: -5, front: 2 },
  soilDepth: 1,
  topsoil: 0.25,
  station: { x: -3.6, z: 1.4 },
  /** Probe rods seen on the cut face, at 10 cm and 40 cm */
  probes: { shallow: { x: -3.75, depth: 0.1 }, deep: { x: -3.45, depth: 0.4 } },
  crops: { cols: 12, rows: 8, x0: -2.9, x1: 4.05, z0: -4.55, z1: 1.5 },
  sun: [-4, 5.2, -10] as [number, number, number],
} as const;

type Shape = "tall" | "bush" | "tallbush" | "vine" | "bare";
export const CROP_SHAPE: Record<CropId, Shape> = {
  corn: "tall", sorghum: "tall", mungbean: "bush", peanut: "bush", soybean: "bush",
  sunnhemp: "tallbush", squash: "vine", sweetpotato: "vine", fallow: "bare",
};
const FULL_HEIGHT: Record<Shape, number> = { tall: 1.7, bush: 0.5, tallbush: 1.15, vine: 0.28, bare: 0.04 };

/** Drawn canopy height for a crop at a growth factor (0 at planting, 1 at full canopy). */
export function canopyHeight(cropId: CropId, growth: number): number {
  return FULL_HEIGHT[CROP_SHAPE[cropId]] * (0.12 + 0.88 * Math.min(1, Math.max(0, growth)));
}

/** Rain on the day, in mm, from which the climate view shows rain instead of sun. */
export const RAIN_DAY_MM = 1;

export const STAGE_LABEL: Record<string, string> = {
  pre: "Before planting", initial: "Establishment", development: "Development",
  "mid-season": "Mid-season", late: "Late season", post: "Harvested",
};

export interface SceneCallout {
  id: string;
  label: string;
  value: string;
  sub?: string;
  source?: Provenance;
  tone?: "warn";
  /** Crop picture shown in the card */
  image?: string;
  /** Point in the scene the callout points at */
  anchor: [number, number, number];
  /** Where the card sits relative to the anchor, in pixels at full width */
  offset: [number, number];
}

/** The pop-up readouts for one tab, anchored to the part of the scene they describe. */
export function calloutsFor(dim: DimensionKey, v: FieldSceneState): SceneCallout[] {
  const m = v.metrics;
  // Every reading is a what-if once a scenario or override is applied
  const src = (kind: Provenance): Provenance => (v.isSimulated ? "simulated" : kind);
  const { probes, soilDepth, station, plot } = LAYOUT;
  const front = plot.front;
  const waterTop = -soilDepth + m.storageRatio * soilDepth;
  const height = canopyHeight(v.crop.id, v.crop.growthFactor);
  const shallow: SceneCallout = {
    id: "vwc10", label: "Moisture at 10 cm", value: `${fmt(m.surfaceVwc, 1)} %`, source: src("measurement"),
    anchor: [probes.shallow.x, -probes.shallow.depth, front], offset: [-60, 70],
  };
  const deep: SceneCallout = {
    id: "vwc40", label: "Moisture at 40 cm", value: `${fmt(m.deepVwc, 1)} %`, source: src("measurement"),
    anchor: [probes.deep.x, -probes.deep.depth, front], offset: [40, 80],
  };
  const etc: SceneCallout = {
    id: "etc", label: "Crop water use", value: `${fmt(m.etcMm, 1)} mm/day`, sub: "ETc = Kc × ET₀", source: src("model"),
    anchor: [1.9, height * 0.9, -0.8], offset: [60, -60],
  };
  const heat: SceneCallout[] = v.crop.heatStress && v.crop.heatThresholdC !== null
    ? [{
      id: "heat", label: "Max air temperature", value: `${fmt(m.tmaxC, 1)} °C`, tone: "warn",
      sub: `Above ${v.crop.name.toLowerCase()}'s ${v.crop.heatThresholdC} °C threshold`, source: src("measurement"),
      anchor: [-1.0, height * 0.6, 1.5], offset: [-120, 70],
    }]
    : [];

  switch (dim) {
    case "water":
      return [
        {
          id: "storage", label: "Root-zone water", value: `${fmt(m.storageMm, 0)} mm`,
          sub: `${Math.round(m.storageRatio * 100)} % of ${fmt(m.capacityMm, 0)} mm it can hold`, source: src("model"),
          anchor: [0.9, waterTop, front], offset: [70, 70],
        },
        { ...shallow, offset: [-40, -120] },
        { ...deep, offset: [-90, 90] },
        {
          id: "rain", label: "Rain today", value: `${fmt(m.rainMm, 1)} mm`, source: src("measurement"),
          anchor: [0.2, 0.02, -0.4], offset: [-40, -150],
        },
        etc,
      ];
    case "soil":
      return [
        {
          id: "temp", label: "Soil temperature, 10 cm", value: `${fmt(m.soilTempC, 1)} °C`, source: src("measurement"),
          anchor: [station.x + 1.3, -0.08, front], offset: [70, -90],
        },
        {
          id: "ec", label: "Bulk electrical conductivity", value: `${fmt(m.ecDsM, 2)} dS/m`, source: src("measurement"),
          ...(v.soil.salinityAlert !== "none"
            ? { tone: "warn" as const, sub: "High: possible salinity, not lab-confirmed" }
            : { sub: "Within the usual range" }),
          anchor: [station.x + 1.6, -0.55, front], offset: [90, 30],
        },
        {
          id: "texture", label: "Soil texture", value: v.soil.texture, sub: "From the field record",
          anchor: [station.x + 1.0, -0.85, front], offset: [70, 60],
        },
        { ...shallow, offset: [-50, -110] },
        { ...deep, offset: [-120, 60] },
      ];
    case "vegetation":
      return [
        {
          id: "crop", label: v.crop.name, value: STAGE_LABEL[v.crop.stage] ?? v.crop.stage, sub: `Day ${v.crop.dap} after planting`,
          image: `/crops/${v.crop.id}.png`, anchor: [-0.7, height * 0.75, 1.0], offset: [-80, -110],
        },
        {
          id: "ndvi", label: "Vegetation index (NDVI)", value: m.ndvi === undefined || m.ndvi === null ? "Unavailable" : fmt(m.ndvi, 2),
          sub: v.isSimulated ? undefined : v.ndviDate ? `16-day composite to ${v.ndviDate}` : "No composite yet",
          source: src("satellite"), anchor: [0.4, height, -0.9], offset: [60, -50],
        },
        { ...etc, anchor: [2.3, height * 0.55, 0.9], offset: [70, 30] },
        ...heat,
      ];
    case "climate": {
      const rainy = (m.rainMm ?? 0) >= RAIN_DAY_MM;
      return [
        {
          id: "sky", label: "Today", value: rainy ? "Rain" : "Dry and sunny", sub: rainy ? "Rain gauge above 1 mm" : "Less than 1 mm of rain",
          source: src("measurement"), anchor: rainy ? [-1.2, 4.2, -5] : LAYOUT.sun, offset: [-110, 10],
        },
        {
          id: "rain", label: "Rain", value: `${fmt(m.rainMm, 1)} mm`, source: src("measurement"),
          anchor: [1.4, 1.6, 0.2], offset: [80, -50],
        },
        {
          id: "tmax", label: "Max air temperature", value: `${fmt(m.tmaxC, 1)} °C`, source: src("measurement"),
          ...(v.crop.heatStress ? { tone: "warn" as const, sub: "Above the crop's heat threshold" } : {}),
          anchor: [-1.4, 1.1, 0.4], offset: [-110, 20],
        },
        {
          id: "et0", label: "Evaporative demand (ET₀)", value: `${fmt(m.et0Mm, 1)} mm/day`, source: src("model"),
          anchor: [1.6, 0.05, 1.3], offset: [70, 50],
        },
      ];
    }
    case "rotation": {
      const n = v.rotationStrips.length;
      return v.rotationStrips.map((r, i) => {
        const crop = CROPS[r.crop];
        const x = plot.x0 + ((i + 0.5) * (plot.x1 - plot.x0)) / n;
        return {
          id: `season-${i}`, label: r.season, value: crop.name.replace(" (cover)", "").replace(" (bare)", ""),
          sub: r.isRepeatFamily ? "Same family as before" : r.isLegume ? "Legume: adds nitrogen" : crop.familyCommon,
          tone: r.isRepeatFamily ? ("warn" as const) : undefined,
          // Alternate between the back and front edges so neighbouring cards never meet
          image: `/crops/${r.crop}.png`, anchor: [x, 0.06, i % 2 ? plot.front - 0.3 : plot.z0 + 0.3] as [number, number, number],
          offset: [0, i % 2 ? 36 : -36] as [number, number],
        };
      });
    }
  }
}
