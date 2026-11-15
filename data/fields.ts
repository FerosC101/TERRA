import type { Field, LatLng, MonthlyClimate } from "@/types";

/** Offsets a coordinate by metres east / north. */
export function offset(origin: LatLng, eastM: number, northM: number): LatLng {
  const lat = origin.lat + northM / 111320;
  const lng = origin.lng + eastM / (111320 * Math.cos((origin.lat * Math.PI) / 180));
  return { lat, lng };
}

/**
 * Illustrative monthly climatologies for the two secondary demo fields. They follow the structure of a NASA POWER
 * agroclimatology request (monthly precipitation, ET0, T2M_MAX) and the general
 * seasonality of each region, but the numbers were written for this demo and
 * were NOT retrieved from NASA POWER.
 */
const CAGAYAN_VALLEY: MonthlyClimate = {
  rainMm: [60, 40, 45, 70, 160, 190, 220, 240, 250, 290, 250, 150],
  et0MmDay: [3.0, 3.6, 4.4, 5.1, 5.0, 4.6, 4.3, 4.1, 4.0, 3.6, 3.1, 2.8],
  tmaxC: [28, 29.5, 32, 34.5, 35, 34.5, 33.5, 33, 32.5, 31, 29.5, 28],
  source: "Illustrative demo climatology (NASA POWER-style variables)",
  basis: "illustrative",
};

const BUKIDNON_UPLAND: MonthlyClimate = {
  rainMm: [140, 110, 110, 130, 240, 310, 320, 300, 310, 300, 200, 150],
  et0MmDay: [3.3, 3.7, 4.2, 4.4, 4.0, 3.6, 3.5, 3.6, 3.6, 3.5, 3.3, 3.1],
  tmaxC: [28.5, 29, 30, 31, 30.5, 29.5, 29, 29, 29.5, 29.5, 29, 28.5],
  source: "Illustrative demo climatology (NASA POWER-style variables)",
  basis: "illustrative",
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

/**
 * NASA POWER climatology for the Lipa Cropland area (13.983° N, 121.185° E, 162 m).
 * Retrieved 14 Nov 2026 from the POWER Climatology API v2.10.1, 2001–2025 means.
 * Rainfall is PRECTOTCORR × days in month. Maximum temperature is T2M + T2M_RANGE / 2.
 * ET0 is FAO-56 Penman-Monteith computed from the monthly POWER means
 * (T2M, T2M_RANGE, RH2M, WS2M, ALLSKY_SFC_SW_DWN). POWER is a ~50 km regional
 * product: it describes the area's climate, not conditions inside the field.
 */
const LIPA_POWER: MonthlyClimate = {
  rainMm: [144, 134, 105, 91, 163, 245, 283, 238, 272, 335, 351, 388],
  et0MmDay: [2.72, 3.35, 4.13, 4.92, 4.62, 4.09, 3.71, 3.6, 3.62, 3.3, 2.91, 2.51],
  tmaxC: [26.7, 27.6, 29.6, 32.1, 32.0, 30.2, 29.0, 28.8, 29.0, 28.7, 28.0, 27.1],
  source: "NASA POWER climatology, 2001–2025 (~50 km regional means)",
  basis: "retrieved",
};

/**
 * The primary demonstration field. Its boundary is the Lipa_Cropland_AOI polygon
 * used by the TERRA NASA data pipeline (docs/Data Pipeline/Lipa Cropland.geojson),
 * and its centre is that polygon's centroid, so the web app, the pipeline and the
 * hardware station all refer to the same ground.
 */
const lipa: LatLng = { lat: 13.983842, lng: 121.184648 };
const LIPA_BOUNDARY: LatLng[] = [
  [121.180302, 13.987887], [121.181271, 13.984303], [121.17961, 13.983545], [121.179512, 13.982984],
  [121.176299, 13.981375], [121.178408, 13.976575], [121.183187, 13.978996], [121.182508, 13.98123],
  [121.184092, 13.98201], [121.185371, 13.979918], [121.193002, 13.982692], [121.188807, 13.990451],
  [121.186069, 13.98934], [121.184397, 13.988404], [121.183664, 13.98934],
].map(([lng, lat]) => ({ lat, lng }));

const riverside: LatLng = { lat: 17.1296, lng: 121.8831 };
const uplandC: LatLng = { lat: 8.1250, lng: 125.0850 };

const STATION_SENSORS = ["Soil moisture 10 cm", "Soil moisture 40 cm", "Soil temperature 10 cm", "Bulk EC", "Rain gauge"];

export const FIELDS: Field[] = [
  {
    id: "lipa-cropland",
    name: "Lipa Cropland",
    farm: "TERRA demonstration site",
    location: "Lipa City, Batangas, Philippines",
    role: "primary",
    timezone: "Asia/Manila",
    pipelineLocationId: "lipa_cropland_001",
    center: lipa,
    boundary: LIPA_BOUNDARY,
    areaHa: 133.7,
    currentCrop: "corn",
    plantedOn: "2026-08-30",
    soil: {
      texture: "Clay loam over clay",
      // ISRIC SoilGrids 2.0 (model estimate, 20 cells over the AOI): (FC 0.321 − WP 0.238) × 1000 = 83 mm per m,
      // the same values as LIPA_SOILGRIDS_SOIL (data/soils.ts). DATA-MANIFEST.md section 10.
      awcMmPerM: 83,
      profileDepthM: 1,
      source: "soilgrids",
      note: "ISRIC SoilGrids 2.0 estimate for this area (250 m model, not a laboratory test): clay 39–45 %, water held between field capacity and wilting point about 83 mm per metre.",
    },
    station: {
      id: "TS-01",
      name: "TERRA Station 01",
      position: offset(lipa, 120, 180),
      status: "simulated",
      sensors: STATION_SENSORS,
    },
    points: [
      { id: "m1", kind: "moisture", label: "Probe point north-west", position: offset(lipa, -330, 380), moistureOffset: 1.2 },
      { id: "m2", kind: "moisture", label: "Probe point north-east", position: offset(lipa, 330, 560), moistureOffset: -2.6 },
      { id: "m3", kind: "moisture", label: "Probe point centre", position: offset(lipa, 150, -60), moistureOffset: -0.8 },
      { id: "m4", kind: "moisture", label: "Probe point south-west", position: offset(lipa, -560, -420), moistureOffset: 2.1 },
      { id: "m5", kind: "moisture", label: "Probe point east", position: offset(lipa, 620, 60), moistureOffset: -3.4 },
      { id: "a1", kind: "anomaly", label: "Moisture divergence", position: offset(lipa, 120, 180), discoveryKind: "moisture-divergence" },
      { id: "a2", kind: "anomaly", label: "Vegetation index dip", position: offset(lipa, 420, 330), discoveryKind: "ndvi-change" },
    ],
    rotationHistory: [
      { season: "Wet 2024", crop: "corn" },
      { season: "Dry 2024–25", crop: "corn" },
      { season: "Wet 2025", crop: "corn" },
      { season: "Dry 2025–26", crop: "mungbean", note: "First legume break in three seasons" },
      { season: "Wet 2026", crop: "corn", note: "Current crop" },
    ],
    climate: LIPA_POWER,
    demoPattern: "dry-spell",
    seed: 4107,
  },
  {
    id: "riverside",
    name: "Riverside Plot",
    farm: "Demo Farm · Cagayan Valley",
    location: "Ilagan, Isabela, Philippines",
    role: "secondary",
    timezone: "Asia/Manila",
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
      sensors: STATION_SENSORS,
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
    role: "secondary",
    timezone: "Asia/Manila",
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
      sensors: STATION_SENSORS,
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
