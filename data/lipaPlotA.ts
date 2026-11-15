import { LIPA_PLOT_A_CROP_SEASONS } from "@/data/cropCalendar";
import { LIPA_PLOT_A_SOILGRIDS_SOIL } from "@/data/soils";
import type { LatLng } from "@/types";

/**
 * Plot A: Mang Edgar's corn plot, Barangay Pusil, Lipa City (DATA-MANIFEST.md section 9).
 * Boundary: four corners DRAWN ON A MAP (not GPS), given by the ML engineer on 2026-11-15
 * ("docs/Data Pipeline/Lipa Plot A.geojson"). 173 m × 156 m ≈ 2.69 ha.
 *
 * It lies OUTSIDE the Lipa Cropland AOI: its centre is 3.3 km west of the AOI centroid (2.3 km beyond the AOI's
 * west edge). Not in data/fields.ts, so the app does not show it (adding it there is a UI decision).
 *
 * Weather: the NASA pipeline has no record for Plot A. Scripts use the Lipa Cropland record
 * (`lipa_cropland_001`); its sources are much coarser than the 3.3 km offset (POWER 0.5° × 0.625°,
 * IMERG 0.1° with the same 4 surrounding cells, SMAP 9 km), so the values are close but not identical (UNVERIFIED).
 */
export const LIPA_PLOT_A = {
  id: "lipa-plot-a",
  name: "Lipa Plot A (Mang Edgar, corn)",
  location: "Barangay Pusil, Lipa City, Batangas, Philippines",
  timezone: "Asia/Manila",
  geojson: "docs/Data Pipeline/Lipa Plot A.geojson",
  center: { lat: 13.9838, lng: 121.1539 } satisfies LatLng,
  boundary: [
    { lat: 13.9831, lng: 121.1531 }, { lat: 13.9831, lng: 121.1547 },
    { lat: 13.9845, lng: 121.1547 }, { lat: 13.9845, lng: 121.1531 },
  ] satisfies LatLng[],
  areaHa: 2.69,
  /** Pipeline record borrowed for weather (see above). */
  weatherFromPipelineLocationId: "lipa_cropland_001",
  seasons: LIPA_PLOT_A_CROP_SEASONS,
  soil: LIPA_PLOT_A_SOILGRIDS_SOIL,
} as const;
