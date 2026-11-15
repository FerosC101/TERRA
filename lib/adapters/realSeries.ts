/**
 * Chart rows from a real FieldDay record (one row per local day), for pages that show the evidence behind a
 * real-data discovery. Soil moisture in % (m³/m³ × 100) as the app's other charts; null where there is no value.
 */
import { seriesOf } from "@/lib/science/discovery/engine";
import type { RealSeriesRow } from "@/types";
import type { FieldDay } from "@/types/discovery-contract";

const pct = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 10);

export function realSeriesRows(days: FieldDay[]): RealSeriesRow[] {
  const power = seriesOf(days, "precipitation", "power", null);
  const imerg = seriesOf(days, "precipitation", "imerg", null);
  const l4s = seriesOf(days, "soil_moisture", "smap_l4", 5);
  const l4r = seriesOf(days, "soil_moisture", "smap_l4", 100);
  const l3 = seriesOf(days, "soil_moisture", "smap", null);
  const ndvi = seriesOf(days, "ndvi", "modis", null);
  return days.map((d, k) => ({
    date: d.date,
    rainPowerMm: power[k],
    rainImergMm: imerg[k],
    smapL4SurfacePct: pct(l4s[k]),
    smapL4RootPct: pct(l4r[k]),
    smapL3Pct: pct(l3[k]),
    ndvi: ndvi[k],
  }));
}
