/**
 * Adapter: the app's demo record (lib/demo/series.ts, DailyObservation[]) → Discovery Engine input (D-002).
 *
 * Lets the engine run on the same record the app's charts show. Every value is SIMULATED.
 * Soil moisture is converted from % to m³/m³; nothing else is changed.
 * Periods follow lib/demo/syntheticFieldDays.ts: station values cover the local day, IMERG and
 * POWER the UTC day, SMAP is an instant at 06:00 local, NDVI a 16-day composite ending on its date.
 * Only Asia/Manila (UTC+8, no daylight saving) is supported, which covers every demo field.
 */
import { addDays } from "@/lib/dates";
import type { DailyObservation } from "@/types";
import type { AnyObservationValue, FieldDay } from "@/types/discovery-contract";

const H = 3600_000;
const UTC_OFFSET_H = 8;
const COMPOSITE_DAYS = 16;
const PRODUCT = "demo series (lib/demo/series.ts)";

const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
const utcMidnight = (date: string) => Date.parse(`${date}T00:00:00Z`);
const localMidnight = (date: string) => utcMidnight(date) - UTC_OFFSET_H * H;

function val(
  variable: AnyObservationValue["variable"],
  source: AnyObservationValue["source"],
  depthCm: number | null,
  value: number,
  unit: string,
  aggregation: AnyObservationValue["aggregation"],
  [start, end]: [number, number],
): AnyObservationValue {
  return {
    variable, source, depthCm, value, unit, aggregation,
    product: PRODUCT,
    provenance: "simulated",
    period: { start: iso(start), end: iso(end) },
    quality: "ok",
  } as AnyObservationValue;
}

export function seriesToFieldDays(obs: DailyObservation[], field: { id: string; timezone: string }): FieldDay[] {
  if (field.timezone !== "Asia/Manila") throw new Error(`Demo adapter supports Asia/Manila only, not ${field.timezone}`);
  return obs.map((o) => {
    const local: [number, number] = [localMidnight(o.date), localMidnight(o.date) + 24 * H - 1000];
    const utcDay: [number, number] = [utcMidnight(o.date), utcMidnight(o.date) + 24 * H - 1000];
    const values: AnyObservationValue[] = [
      val("soil_moisture", "station", 10, o.surfaceVwc / 100, "m3/m3", "mean", local),
      val("soil_moisture", "station", 40, o.deepVwc / 100, "m3/m3", "mean", local),
      val("precipitation", "station", null, o.rainMm, "mm/day", "total", local),
      val("soil_temperature", "station", 10, o.soilTempC, "degC", "mean", local),
      val("bulk_ec", "station", 10, o.ecDsM, "dS/m", "mean", local),
      val("precipitation", "imerg", null, o.rainImergMm, "mm/day", "total", utcDay),
      val("et0", "power", null, o.et0Mm, "mm/day", "total", utcDay),
      val("air_temperature_max", "power", null, o.tmaxC, "degC", "max", utcDay),
    ];
    if (o.smapVwc !== null) {
      const overpass = localMidnight(o.date) + 6 * H;
      values.push(val("soil_moisture", "smap", null, o.smapVwc / 100, "m3/m3", "instant", [overpass, overpass]));
    }
    if (o.ndvi !== null) {
      values.push(val("ndvi", "modis", null, o.ndvi, "dimensionless", "composite", [localMidnight(addDays(o.date, -(COMPOSITE_DAYS - 1))), local[1]]));
    }
    return { fieldId: field.id, date: o.date, values };
  });
}
