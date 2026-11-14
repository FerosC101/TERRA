import type { Field, LatLng, MonthlyClimate } from "@/types";

/** Offsets a coordinate by metres east / north. */
export function offset(origin: LatLng, eastM: number, northM: number): LatLng {
  const lat = origin.lat + northM / 111320;
  const lng = origin.lng + eastM / (111320 * Math.cos((origin.lat * Math.PI) / 180));
  return { lat, lng };
}

/**
 * Illustrative monthly climatologies. They follow the structure of a NASA POWER
 * agroclimatology request (monthly precipitation, ET0, T2M_MAX) and the general
 * seasonality of each region, but the numbers were written for this demo and
 * were NOT retrieved from NASA POWER.
 */
const CAGAYAN_VALLEY: MonthlyClimate = {
  rainMm: [60, 40, 45, 70, 160, 190, 220, 240, 250, 290, 250, 150],
  et0MmDay: [3.0, 3.6, 4.4, 5.1, 5.0, 4.6, 4.3, 4.1, 4.0, 3.6, 3.1, 2.8],
  tmaxC: [28, 29.5, 32, 34.5, 35, 34.5, 33.5, 33, 32.5, 31, 29.5, 28],
  source: "Illustrative demo climatology (NASA POWER-style variables)",
};

const BUKIDNON_UPLAND: MonthlyClimate = {
  rainMm: [140, 110, 110, 130, 240, 310, 320, 300, 310, 300, 200, 150],
  et0MmDay: [3.3, 3.7, 4.2, 4.4, 4.0, 3.6, 3.5, 3.6, 3.6, 3.5, 3.3, 3.1],
  tmaxC: [28.5, 29, 30, 31, 30.5, 29.5, 29, 29, 29.5, 29.5, 29, 28.5],
  source: "Illustrative demo climatology (NASA POWER-style variables)",
};

function rectangle(center: LatLng, widthM: number, heightM: number, skewM = 0): LatLng[] {
  const w = widthM / 2;
  const h = heightM / 2;
  return [
    offset(center, -w + skewM, h),
    offset(center, w + skewM * 0.4, h * 0.92),
    offset(center, w + 18, -h * 0.25),
    offset(center, w - skewM, -h),
    offset(center, -w * 0.35, -h * 1.06),
    offset(center, -w - skewM * 0.5, -h * 0.9),
    offset(center, -w - 12, h * 0.2),
  ];
}

const northTerrace: LatLng = { lat: 16.8731, lng: 121.5846 };
const riverside: LatLng = { lat: 17.1296, lng: 121.8831 };
const uplandC: LatLng = { lat: 8.1250, lng: 125.0850 };

export const FIELDS: Field[] = [
  {
    id: "north-terrace",
    name: "North Terrace Field",
    farm: "Demo Farm · Cagayan Valley",
    location: "San Mateo, Isabela, Philippines",
    center: northTerrace,
    boundary: rectangle(northTerrace, 410, 290, 26),
    areaHa: 11.8,
    currentCrop: "corn",
    plantedOn: "2026-08-30",
    soil: {
      texture: "Clay loam",
      awcMmPerM: 150,
      profileDepthM: 1,
      note: "Texture from a farmer-entered field record. Available water capacity is a typical value for the texture class, not a laboratory result.",
    },
    station: {
      id: "TS-01",
      name: "TERRA Station 01",
      position: offset(northTerrace, -60, 40),
      status: "simulated",
      sensors: ["Soil moisture 10 cm", "Soil moisture 40 cm", "Soil temperature 10 cm", "Bulk EC", "Rain gauge"],
    },
    points: [
      { id: "m1", kind: "moisture", label: "Probe point NW", position: offset(northTerrace, -150, 95), moistureOffset: 1.2 },
      { id: "m2", kind: "moisture", label: "Probe point NE", position: offset(northTerrace, 140, 88), moistureOffset: -2.6 },
      { id: "m3", kind: "moisture", label: "Probe point centre", position: offset(northTerrace, 20, -10), moistureOffset: -0.8 },
      { id: "m4", kind: "moisture", label: "Probe point SW", position: offset(northTerrace, -130, -100), moistureOffset: 2.1 },
      { id: "m5", kind: "moisture", label: "Probe point SE", position: offset(northTerrace, 150, -95), moistureOffset: -3.4 },
      { id: "a1", kind: "anomaly", label: "Moisture divergence", position: offset(northTerrace, -60, 40), discoveryKind: "moisture-divergence" },
      { id: "a2", kind: "anomaly", label: "Vegetation index dip", position: offset(northTerrace, 120, -40), discoveryKind: "ndvi-change" },
    ],
    rotationHistory: [
      { season: "Wet 2024", crop: "corn" },
      { season: "Dry 2024–25", crop: "corn" },
      { season: "Wet 2025", crop: "corn" },
      { season: "Dry 2025–26", crop: "mungbean", note: "First legume break in three seasons" },
      { season: "Wet 2026", crop: "corn", note: "Current crop" },
    ],
    climate: CAGAYAN_VALLEY,
    demoPattern: "dry-spell",
    seed: 4107,
  },
  {
    id: "riverside",
    name: "Riverside Plot",
    farm: "Demo Farm · Cagayan Valley",
    location: "Ilagan, Isabela, Philippines",
    center: riverside,
    boundary: rectangle(riverside, 300, 220, -18),
    areaHa: 6.4,
    currentCrop: "mungbean",
    plantedOn: "2026-10-08",
    previousCrop: { crop: "corn", plantedOn: "2026-05-25" },
    soil: {
      texture: "Silt loam",
      awcMmPerM: 170,
      profileDepthM: 1,
      note: "Texture from a farmer-entered field record. Available water capacity is a typical value for the texture class.",
    },
    station: {
      id: "TS-02",
      name: "TERRA Station 02",
      position: offset(riverside, 40, -30),
      status: "simulated",
      sensors: ["Soil moisture 10 cm", "Soil moisture 40 cm", "Soil temperature 10 cm", "Bulk EC", "Rain gauge"],
    },
    points: [
      { id: "m1", kind: "moisture", label: "Probe point north", position: offset(riverside, -20, 80), moistureOffset: 0.9 },
      { id: "m2", kind: "moisture", label: "Probe point east", position: offset(riverside, 110, 10), moistureOffset: 3.1 },
      { id: "m3", kind: "moisture", label: "Probe point south", position: offset(riverside, -10, -85), moistureOffset: 4.4 },
      { id: "m4", kind: "moisture", label: "Probe point west", position: offset(riverside, -115, -5), moistureOffset: -1.5 },
      { id: "a1", kind: "anomaly", label: "Rainfall departure", position: offset(riverside, 40, -30), discoveryKind: "rain-departure" },
    ],
    rotationHistory: [
      { season: "Wet 2024", crop: "corn" },
      { season: "Dry 2024–25", crop: "peanut" },
      { season: "Wet 2025", crop: "corn" },
      { season: "Dry 2025–26", crop: "squash" },
      { season: "Wet 2026", crop: "corn" },
      { season: "Late wet 2026", crop: "mungbean", note: "Current crop" },
    ],
    climate: CAGAYAN_VALLEY,
    demoPattern: "wet-spell",
    seed: 9203,
  },
  {
    id: "upland-c",
    name: "Upland Block C",
    farm: "Demo Farm · Bukidnon",
    location: "Malaybalay, Bukidnon, Philippines",
    center: uplandC,
    boundary: rectangle(uplandC, 520, 350, 34),
    areaHa: 18.2,
    currentCrop: "sweetpotato",
    plantedOn: "2026-08-24",
    previousCrop: { crop: "peanut", plantedOn: "2026-01-10" },
    soil: {
      texture: "Clay",
      awcMmPerM: 140,
      profileDepthM: 1,
      note: "Texture from a farmer-entered field record. Available water capacity is a typical value for the texture class.",
    },
    station: {
      id: "TS-03",
      name: "TERRA Station 03",
      position: offset(uplandC, 80, 60),
      status: "simulated",
      sensors: ["Soil moisture 10 cm", "Soil moisture 40 cm", "Soil temperature 10 cm", "Bulk EC", "Rain gauge"],
    },
    points: [
      { id: "m1", kind: "moisture", label: "Probe point upslope", position: offset(uplandC, -180, 120), moistureOffset: -2.8 },
      { id: "m2", kind: "moisture", label: "Probe point mid-slope", position: offset(uplandC, 10, 10), moistureOffset: 0.4 },
      { id: "m3", kind: "moisture", label: "Probe point downslope", position: offset(uplandC, 190, -120), moistureOffset: 3.6 },
    ],
    rotationHistory: [
      { season: "Wet 2024", crop: "corn" },
      { season: "Dry 2024–25", crop: "sweetpotato" },
      { season: "Wet 2025", crop: "corn" },
      { season: "Dry 2025–26", crop: "peanut" },
      { season: "Wet 2026", crop: "sweetpotato", note: "Current crop" },
    ],
    climate: BUKIDNON_UPLAND,
    demoPattern: "steady",
    seed: 615,
  },
];
