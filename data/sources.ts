import type { DataSource } from "@/types";

/**
 * The data sources TERRA is designed around. `integration: "demo"` means this
 * build generates stand-in values locally; nothing is retrieved from NASA.
 */
export const DATA_SOURCES: DataSource[] = [
  {
    id: "station", name: "TERRA field station", product: "In-field sensors",
    variable: "Soil moisture (10 cm, 40 cm), soil temperature, bulk EC, rainfall",
    spatialResolution: "Single point in the field", temporalResolution: "Continuous, summarised daily",
    kind: "measurement", integration: "demo",
    caveat: "One point does not describe the whole field. Bulk EC changes with moisture and temperature and is not a nutrient reading.",
  },
  {
    id: "smap", name: "NASA SMAP", product: "SPL3SMP_E / SPL4SMGP",
    variable: "Surface soil moisture (top ~5 cm)",
    spatialResolution: "~9 km grid", temporalResolution: "Every 2–3 days",
    kind: "satellite", integration: "demo",
    caveat: "One grid cell is hundreds of times larger than a farm plot. It describes the surrounding landscape, not this field.",
  },
  {
    id: "imerg", name: "NASA GPM IMERG", product: "GPM_3IMERGDF",
    variable: "Precipitation",
    spatialResolution: "0.1° (~10 km)", temporalResolution: "Half-hourly, used as daily totals",
    kind: "satellite", integration: "demo",
    caveat: "An area-average estimate. Local storms can differ substantially from the grid value.",
  },
  {
    id: "modis", name: "NASA MODIS", product: "MOD13Q1",
    variable: "NDVI vegetation index",
    spatialResolution: "250 m", temporalResolution: "16-day composite",
    kind: "satellite", integration: "demo",
    caveat: "Pixels at field edges mix in neighbouring land. Cloud can lower values in the wet season.",
  },
  {
    id: "ecostress", name: "NASA ECOSTRESS", product: "ECO_L2T_LSTE",
    variable: "Land surface temperature",
    spatialResolution: "~70 m", temporalResolution: "Irregular, every 1–5 days at varying times",
    kind: "satellite", integration: "demo",
    caveat: "Overpass time varies, so readings on different days are not directly comparable without care.",
  },
  {
    id: "power", name: "NASA POWER", product: "Agroclimatology",
    variable: "Historical temperature, precipitation, solar radiation (inputs to ET0)",
    spatialResolution: "0.5° × 0.625° (~50 km)", temporalResolution: "Daily, 1981–present",
    kind: "model", integration: "demo",
    caveat: "A reanalysis-based regional record. Good for climate baselines, coarse for a single field.",
  },
  {
    id: "nex", name: "NASA NEX-GDDP-CMIP6", product: "Downscaled CMIP6 projections",
    variable: "Future daily temperature and precipitation",
    spatialResolution: "0.25° (~25 km)", temporalResolution: "Daily, to 2100",
    kind: "model", integration: "demo",
    caveat: "Projections of climate, not weather forecasts. Not yet connected — Future Earth uses fixed adjustments instead.",
  },
];
