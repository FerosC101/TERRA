/** Test-only builders for hand-written FieldDay records. */
import { CROPS } from "@/data/crops";
import { addDays } from "@/lib/dates";
import type { AnyObservationValue, FieldDay } from "@/types/discovery-contract";
import type { DiscoveryContext } from "../engine";

/** One day's readings. A number is a valid value, null is a missing value, undefined means no value at all. */
export interface DaySpec {
  s10?: number | null;
  s40?: number | null;
  rain?: number | null;
  imerg?: number | null;
  smap?: number | null;
  ndvi?: number | null;
}

function value(
  date: string,
  variable: AnyObservationValue["variable"],
  source: AnyObservationValue["source"],
  depthCm: number | null,
  v: number | null,
  unit: string,
  aggregation: AnyObservationValue["aggregation"],
): AnyObservationValue {
  return {
    variable, source, depthCm, unit, aggregation,
    product: "test", provenance: source === "station" ? "measurement" : "satellite",
    value: v, quality: v === null ? "missing" : "ok",
    period: { start: `${date}T00:00:00Z`, end: `${date}T12:00:00Z` },
  } as AnyObservationValue;
}

export function makeDays(start: string, specs: DaySpec[], fieldId = "test-field"): FieldDay[] {
  return specs.map((s, i) => {
    const date = addDays(start, i);
    const values: AnyObservationValue[] = [];
    if (s.s10 !== undefined) values.push(value(date, "soil_moisture", "station", 10, s.s10, "m3/m3", "mean"));
    if (s.s40 !== undefined) values.push(value(date, "soil_moisture", "station", 40, s.s40, "m3/m3", "mean"));
    if (s.rain !== undefined) values.push(value(date, "precipitation", "station", null, s.rain, "mm/day", "total"));
    if (s.imerg !== undefined) values.push(value(date, "precipitation", "imerg", null, s.imerg, "mm/day", "total"));
    if (s.smap !== undefined) values.push(value(date, "soil_moisture", "smap", null, s.smap, "m3/m3", "instant"));
    if (s.ndvi !== undefined) values.push(value(date, "ndvi", "modis", null, s.ndvi, "dimensionless", "composite"));
    return { fieldId, date, values };
  });
}

/** Crop with 10-day stages: initial days 0–9, development 10–19, mid-season 20–29, late 30–39. */
export const TEST_CONTEXT: DiscoveryContext = {
  fieldId: "test-field",
  location: { lat: 16.87, lng: 121.58 },
  monthlyRainMm: Array(12).fill(300),
  crop: { ...CROPS.corn, stages: [10, 10, 10, 10] },
  plantedOn: "2026-06-01",
  runAt: "2026-08-01T00:00:00Z",
};
