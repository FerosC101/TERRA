import { addDays, daysBetween } from "@/lib/dates";
import type { DailyObservation, QualityIssue, QualityReport } from "@/types";

/**
 * Record audit applied to every observation series before a page sees it,
 * whether it came from the demo generator or from a backend.
 *
 * Rules, in order:
 *  - rows are sorted by date and exact duplicate dates are removed (last one wins);
 *  - a physically impossible station value rejects the whole row, so it shows as
 *    a missing day instead of being replaced by zero or a guess;
 *  - an impossible satellite value becomes null (those fields are already sparse);
 *  - extreme but possible events are kept and flagged, never deleted;
 *  - gaps are counted and reported. Nothing is interpolated.
 */
const STATION_BOUNDS: { key: keyof DailyObservation; label: string; min: number; max: number }[] = [
  { key: "rainMm", label: "Rainfall", min: 0, max: 1000 },
  { key: "surfaceVwc", label: "Soil moisture, 10 cm", min: 0, max: 60 },
  { key: "deepVwc", label: "Soil moisture, 40 cm", min: 0, max: 60 },
  { key: "soilTempC", label: "Soil temperature", min: -5, max: 60 },
  { key: "tmaxC", label: "Air temperature", min: -10, max: 55 },
  { key: "ecDsM", label: "Bulk EC", min: 0, max: 20 },
];

const SATELLITE_BOUNDS: { key: "smapVwc" | "ndvi" | "lstC"; label: string; min: number; max: number }[] = [
  { key: "smapVwc", label: "SMAP soil moisture", min: 0, max: 60 },
  { key: "ndvi", label: "NDVI", min: -1, max: 1 },
  { key: "lstC", label: "Land surface temperature", min: -10, max: 75 },
];

export const EXTREME_RAIN_MM = 100;
export const EXTREME_TMAX_C = 40;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function auditObservations(input: DailyObservation[]): { rows: DailyObservation[]; report: QualityReport } {
  const issues: QualityIssue[] = [];
  const byDate = new Map<string, DailyObservation>();
  let duplicatesRemoved = 0;
  let rowsRejected = 0;

  for (const row of input) {
    if (!ISO_DAY.test(row.date)) {
      rowsRejected++;
      issues.push({ date: String(row.date), variable: "Date", value: null, kind: "invalid", note: "Not an ISO calendar day. Row rejected." });
      continue;
    }
    if (byDate.has(row.date)) {
      duplicatesRemoved++;
      issues.push({ date: row.date, variable: "Row", value: null, kind: "duplicate", note: "Duplicate date. The later row was kept." });
    }
    byDate.set(row.date, row);
  }

  const rows: DailyObservation[] = [];
  for (const row of [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const bad = STATION_BOUNDS.find((b) => {
      const v = row[b.key] as number;
      return typeof v !== "number" || Number.isNaN(v) || v < b.min || v > b.max;
    });
    if (bad) {
      rowsRejected++;
      issues.push({ date: row.date, variable: bad.label, value: (row[bad.key] as number) ?? null, kind: "invalid", note: `Outside the possible range ${bad.min}–${bad.max}. Day treated as missing.` });
      continue;
    }
    let clean = row;
    for (const b of SATELLITE_BOUNDS) {
      const v = row[b.key];
      if (v !== null && (Number.isNaN(v) || v < b.min || v > b.max)) {
        clean = { ...clean, [b.key]: null };
        issues.push({ date: row.date, variable: b.label, value: v, kind: "invalid", note: `Outside the possible range ${b.min}–${b.max}. Value set to unavailable.` });
      }
    }
    if (clean.rainMm >= EXTREME_RAIN_MM) issues.push({ date: row.date, variable: "Rainfall", value: clean.rainMm, kind: "extreme", note: `At least ${EXTREME_RAIN_MM} mm in a day. Kept as a valid extreme event.` });
    if (clean.tmaxC >= EXTREME_TMAX_C) issues.push({ date: row.date, variable: "Air temperature", value: clean.tmaxC, kind: "extreme", note: `At least ${EXTREME_TMAX_C} °C. Kept as a valid extreme event.` });
    rows.push(clean);
  }

  let missingDays = 0;
  for (let i = 1; i < rows.length; i++) {
    const gap = daysBetween(rows[i - 1].date, rows[i].date) - 1;
    if (gap > 0) {
      missingDays += gap;
      issues.push({ date: addDays(rows[i - 1].date, 1), variable: "Row", value: null, kind: "gap", note: `${gap} day${gap === 1 ? "" : "s"} with no record. Not filled.` });
    }
  }

  return {
    rows,
    report: {
      rows: rows.length,
      start: rows[0]?.date ?? null,
      end: rows[rows.length - 1]?.date ?? null,
      duplicatesRemoved,
      rowsRejected,
      missingDays,
      issues,
    },
  };
}
