/**
 * Adds the planned station's SIMULATED soil-moisture readings to a real record, as station probe values, so the
 * Discovery Engine's station rules (moisture divergence, source offset) can run on a field with no installed probe
 * (D-020). Discovery Engine input only; never give the result to the Living Field Model.
 *
 * Input rows: the field's daily observation rows on the record's dates (lib/adapters/realObservations.ts), whose
 * surfaceVwc / deepVwc come from lib/demo/stationModel.ts. Those layers are 0–15 cm and 30–70 cm; they are stored at
 * depthCm 10 and 40, the depths the moisture rule reads, as the demo adapter does (lib/adapters/demoSeries.ts).
 * Values: % → m³/m³. Period: the local day (Asia/Manila, UTC+8). Rain, SMAP, NDVI and every real value are unchanged.
 */
import type { DailyObservation } from "@/types";
import type { AnyObservationValue, FieldDay } from "@/types/discovery-contract";

export const SIMULATED_STATION_PRODUCT = "planned-station simulation (lib/demo/stationModel.ts), driven by real rain and modelled ETc";

const H = 3600_000;
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

export function withSimulatedStation(days: FieldDay[], rows: DailyObservation[]): FieldDay[] {
  if (rows.length !== days.length || rows.some((r, k) => r.date !== days[k].date)) {
    throw new Error("withSimulatedStation: observation rows must cover the record's days, in order");
  }
  if (days.some((d) => d.values.some((v) => v.variable === "soil_moisture" && v.source === "station"))) {
    throw new Error("withSimulatedStation: the record already has station soil moisture; a simulation must not replace it");
  }
  return days.map((d, k) => {
    const start = Date.parse(`${d.date}T00:00:00Z`) - 8 * H;
    const period = { start: iso(start), end: iso(start + 24 * H - 1000) };
    const probe = (depthCm: number, pct: number): AnyObservationValue => ({
      variable: "soil_moisture", source: "station", depthCm, value: pct / 100, unit: "m3/m3", aggregation: "mean",
      product: SIMULATED_STATION_PRODUCT, provenance: "simulated", period, quality: "ok",
    } as AnyObservationValue);
    return { ...d, values: [...d.values, probe(10, rows[k].surfaceVwc), probe(40, rows[k].deepVwc)] };
  });
}
