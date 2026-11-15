/**
 * Adapter: TERRA NASA data pipeline merged daily records → the app's bundled `NasaDailyRecord`s
 * (data/nasa/*.json, shown in the Living Field Model as "Retrieved NASA record").
 *
 * Same rules as the existing 2024-01-01..15 snapshot (nasaSnapshot.test.ts reproduces it):
 * temperatures, rain and ET0 rounded to 0.01; SMAP converted m³/m³ → % and rounded to 0.1;
 * `quality` is the pipeline's overall status for the day; the SMAP flag text only on overpass days.
 * Missing values stay null; nothing is filled.
 */
import type { NasaDailyRecord } from "@/types";

/** One record of terra_daily_merged.json; only the fields read here. */
export interface MergedRecordForSnapshot {
  date: string;
  quality_status: NasaDailyRecord["quality"];
  flat_observations: Record<string, number | null | undefined>;
  quality_flags?: { SMAP?: { retrieval_qual_decoded?: { summary?: string } | null } };
}

const round = (v: number | null | undefined, dp: number): number | null =>
  v === null || v === undefined ? null : Math.round(v * 10 ** dp) / 10 ** dp;

export function pipelineToSnapshotRecords(records: MergedRecordForSnapshot[], start: string, end: string): NasaDailyRecord[] {
  return records
    .filter((r) => r.date >= start && r.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      const f = r.flat_observations;
      const sm = f.soil_moisture_surface_m3_m3;
      const hasSmap = sm !== null && sm !== undefined;
      return {
        date: r.date,
        quality: r.quality_status,
        airTempC: round(f.air_temperature_c, 2),
        airTempMaxC: round(f.air_temperature_max_c, 2),
        airTempMinC: round(f.air_temperature_min_c, 2),
        rainPowerMm: round(f.precipitation_mm, 2),
        rainImergMm: round(f.precipitation_imerg_mm, 2),
        et0Mm: round(f.et0_mm_day, 2),
        smapVwc: hasSmap ? round(sm * 100, 1) : null,
        smapFlag: hasSmap ? (r.quality_flags?.SMAP?.retrieval_qual_decoded?.summary ?? null) : null,
      };
    });
}
