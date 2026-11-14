import type { NasaDailyRecord, NasaSnapshot } from "@/types";
import lipa from "./lipa-cropland-2024-01.json";

/**
 * Records retrieved by the TERRA NASA data pipeline (docs/Data Pipeline) and
 * bundled with the web app as a static snapshot. These are real NASA values for
 * the Lipa Cropland area. They cover 1–15 January 2024 only, so they sit beside
 * the demo record and are never mixed into it.
 *
 * Exported from data/processed/terra_daily_merged.json. SMAP is converted from
 * m³/m³ to % volumetric; days without an overpass stay null.
 */
export const NASA_SNAPSHOTS: Record<string, NasaSnapshot> = {
  "lipa-cropland": {
    fieldId: "lipa-cropland",
    locationId: "lipa_cropland_001",
    start: "2024-01-01",
    end: "2024-01-15",
    note: "Retrieved by the TERRA data pipeline: NASA POWER daily agroclimatology v2.10.3, GPM IMERG Final V07B (GPM_3IMERGDF) and SMAP SPL3SMP_E v006. Area-scale values for the Lipa Cropland boundary, not field-plot measurements.",
    records: lipa as NasaDailyRecord[],
  },
};
