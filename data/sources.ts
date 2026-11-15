import { FIELDS } from "@/data/fields";
import { NASA_SNAPSHOTS } from "@/data/nasa";
import { realRecord } from "@/data/nasa/realRecords";
import { longDate } from "@/lib/dates";
import type { DataSource } from "@/types";
import type { SourceId } from "@/types/discovery-contract";

/**
 * The data sources TERRA is designed around. `integration: "demo"` means this
 * build generates stand-in values locally. `sourcesForField` upgrades the
 * products for which a real pipeline snapshot is bundled for that field.
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
    id: "smap", name: "NASA SMAP", product: "SPL3SMP_E",
    variable: "Surface soil moisture (top ~5 cm)",
    spatialResolution: "~9 km grid", temporalResolution: "Every 2–3 days",
    kind: "satellite", integration: "demo",
    caveat: "One grid cell is hundreds of times larger than a farm plot. It describes the surrounding landscape, not this field. Over Lipa, NASA flags every 2024–2025 retrieval as \"not recommended\".",
  },
  {
    id: "smap_l4", name: "NASA SMAP L4", product: "SPL4SMGP",
    variable: "Surface (0–5 cm) and root-zone (0–100 cm) soil moisture",
    spatialResolution: "~9 km grid", temporalResolution: "3-hourly, used as daily means",
    kind: "model", integration: "demo",
    caveat: "A land-model estimate with SMAP brightness temperatures assimilated, not a measurement. One grid cell covers the surrounding landscape, not this field.",
  },
  {
    id: "smap-gibs", name: "NASA SMAP L4 map", product: "SPL4SMGP v8 via NASA GIBS (SMAP_L4_Analyzed_Surface_Soil_Moisture)",
    variable: "Surface soil moisture, m³/m³ (map imagery only)",
    spatialResolution: "9 km grid", temporalResolution: "Daily image (12:00 UTC analysis), published a few days late",
    kind: "model", integration: "live",
    caveat: "A model analysis that assimilates SMAP satellite observations, not a direct measurement. One 9 km cell covers the whole field and its surroundings. Shown as a picture on the map; no values enter TERRA's calculations.",
  },
  {
    id: "imerg", name: "NASA GPM IMERG", product: "GPM_3IMERGDF",
    variable: "Precipitation",
    spatialResolution: "0.1° (~10 km)", temporalResolution: "Half-hourly, used as daily totals",
    kind: "satellite", integration: "demo",
    caveat: "An area-average estimate. Local storms can differ substantially from the grid value. The V07 Final daily product ends on 2025-09-30.",
  },
  {
    id: "modis", name: "NASA MODIS", product: "MOD13Q1",
    variable: "NDVI vegetation index",
    spatialResolution: "250 m", temporalResolution: "16-day composite",
    kind: "satellite", integration: "demo",
    caveat: "Pixels at field edges mix in neighbouring land. Cloud can lower values in the wet season.",
  },
  {
    id: "hls", name: "NASA HLS", product: "HLSS30_VI / HLSL30_VI v2.0",
    variable: "NDVI vegetation index",
    spatialResolution: "30 m", temporalResolution: "Every 2–5 days (Landsat + Sentinel-2), cloud permitting",
    kind: "satellite", integration: "demo",
    caveat: "Fine enough for a small plot, but clouds block most wet-season passes. Landsat and Sentinel-2 values on the same day can differ.",
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

const SNAPSHOT_PRODUCTS = ["power", "imerg", "smap"];

/** Data sources with their status for one field. */
export function sourcesForField(fieldId: string): DataSource[] {
  const real = realRecord(fieldId);
  if (real) {
    // A field with a real record: the sources in that record are real; the station is planned or simulated, not measured.
    const inRecord = new Set(real.flatMap((d) => d.values.map((v) => v.source)));
    const span = `${longDate(real[0].date)} to ${longDate(real[real.length - 1].date)}`;
    const station = FIELDS.find((f) => f.id === fieldId)?.station;
    return DATA_SOURCES.map((src) => {
      if (inRecord.has(src.id as SourceId)) return { ...src, integration: "snapshot", statusNote: `Real record bundled for ${span}.` };
      if (src.id === "station") {
        return { ...src, statusNote: station?.status === "planned"
          ? "Not installed yet (planned site). The readings shown are simulated from the station's design, never measured."
          : "No hardware connected. The readings shown are simulated from the station's design, never measured." };
      }
      if (src.integration === "live") return { ...src, statusNote: "Fetched live from NASA GIBS when the Field Explorer's NASA moisture view is opened." };
      return { ...src, statusNote: "Not used for this field." };
    });
  }
  const snap = NASA_SNAPSHOTS[fieldId];
  return DATA_SOURCES.map((src) => {
    if (snap && SNAPSHOT_PRODUCTS.includes(src.id)) {
      return { ...src, integration: "snapshot", statusNote: `Retrieved record bundled for ${longDate(snap.start)} to ${longDate(snap.end)}. Values outside that period are demo data.` };
    }
    if (src.id === "power" && FIELDS.find((f) => f.id === fieldId)?.climate.basis === "retrieved") {
      return { ...src, integration: "snapshot", statusNote: "Monthly climatology retrieved from NASA POWER." };
    }
    if (src.integration === "live") return { ...src, statusNote: "Fetched live from NASA GIBS when the Field Explorer's NASA moisture view is opened." };
    return { ...src, statusNote: src.id === "station" ? "No hardware connected. Demo values." : "Not connected. Demo values." };
  });
}
