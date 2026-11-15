/**
 * Adapter: TERRA Field Explorer pod telemetry (hardware/backend/telemetry_server.py, `SensorTelemetry`)
 * → Discovery Engine input (D-002): one FieldDay per local date, provenance "measurement", source "station".
 *
 * Only what the pod itself measures is kept: soil moisture per depth, soil temperature, bulk EC,
 * rain and air temperature. The frame's satellite-like fields (smap_moisture_pct, ndvi,
 * ecostress_canopy_temp_c, nisar_backscatter_db) and storage_mm are dropped: they are not pod
 * measurements. The server's own `to_terra_daily_observation` is not used (it copies the gauge's
 * rain into the IMERG field and computes ET0 with non-FAO-56 constants).
 *
 * ASSUMPTIONS (UNVERIFIED)
 * 1. `rain_mm` is the rain since the previous frame (firmware resets the tip counter each frame),
 *    so a day's rain is the sum of its frames.
 * 2. `timestamp_s` is Unix seconds (UTC). The firmware builds it from a fixed start time plus uptime,
 *    with no clock sync, so real dates need a real clock first.
 * 3. Soil temperature and EC are read at 10 cm. Probe depths differ between firmware (10/30/40 cm)
 *    and the hardware spec (10/30/60 cm); every depth present in a frame is kept.
 * 4. A day with fewer than MIN_FRAMES_PER_DAY frames is kept but marked "warning" (15-min sampling gives 96).
 */
import { addDays } from "@/lib/dates";
import type { AnyObservationValue, FieldDay, FieldLocation } from "@/types/discovery-contract";

/** One frame as the telemetry server stores it (`telemetry` in each record). Only read fields are typed. */
export interface TelemetryFrame {
  node_id: string;
  field_id: string;
  timestamp_s: number;
  sequence_id: number;
  moisture_10cm_pct?: number;
  moisture_30cm_pct?: number;
  moisture_40cm_pct?: number;
  moisture_60cm_pct?: number;
  soil_temp_c: number;
  soil_ec_dsm: number;
  air_temp_c: number;
  rain_mm: number;
}

export const MIN_FRAMES_PER_DAY = 48;
const DEPTHS = [10, 30, 40, 60] as const;

const localDate = (ms: number, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

export function telemetryToFieldDays(frames: TelemetryFrame[], location: FieldLocation): FieldDay[] {
  // Offline batches can resend a frame: keep one per node and sequence id.
  const unique = [...new Map(frames.map((f) => [`${f.node_id}:${f.sequence_id}`, f])).values()];
  const byDate = new Map<string, TelemetryFrame[]>();
  for (const f of unique) {
    if (f.field_id !== location.fieldId) throw new Error(`Frame ${f.sequence_id} is for field "${f.field_id}", not "${location.fieldId}"`);
    const date = localDate(f.timestamp_s * 1000, location.timeZone);
    byDate.set(date, [...(byDate.get(date) ?? []), f]);
  }

  const toValues = (fs: TelemetryFrame[]): AnyObservationValue[] => {
    const times = fs.map((f) => f.timestamp_s * 1000);
    const common = {
      source: "station" as const,
      product: "TERRA Field Explorer pod",
      provenance: "measurement" as const,
      sensorId: fs[0].node_id,
      period: { start: iso(Math.min(...times)), end: iso(Math.max(...times)) },
      sampleCount: fs.length,
      quality: fs.length < MIN_FRAMES_PER_DAY ? ("warning" as const) : ("ok" as const),
      ...(fs.length < MIN_FRAMES_PER_DAY ? { qualityNote: `${fs.length} frames (fewer than ${MIN_FRAMES_PER_DAY})` } : {}),
    };
    const out: AnyObservationValue[] = [];
    for (const depth of DEPTHS) {
      const xs = fs.map((f) => f[`moisture_${depth}cm_pct`]).filter((v): v is number => typeof v === "number");
      if (xs.length) out.push({ ...common, variable: "soil_moisture", value: mean(xs) / 100, unit: "m3/m3", depthCm: depth, aggregation: "mean" });
    }
    out.push(
      { ...common, variable: "soil_temperature", value: mean(fs.map((f) => f.soil_temp_c)), unit: "degC", depthCm: 10, aggregation: "mean" },
      { ...common, variable: "bulk_ec", value: mean(fs.map((f) => f.soil_ec_dsm)), unit: "dS/m", depthCm: 10, aggregation: "mean" },
      { ...common, variable: "precipitation", value: fs.reduce((a, f) => a + f.rain_mm, 0), unit: "mm/day", depthCm: null, aggregation: "total" },
      { ...common, variable: "air_temperature_max", value: Math.max(...fs.map((f) => f.air_temp_c)), unit: "degC", depthCm: null, aggregation: "max" },
    );
    return out;
  };

  const dates = [...byDate.keys()].sort();
  if (!dates.length) return [];
  const days: FieldDay[] = [];
  for (let d = dates[0]; d <= dates[dates.length - 1]; d = addDays(d, 1)) {
    const fs = byDate.get(d);
    days.push({ fieldId: location.fieldId, date: d, values: fs ? toValues(fs) : [] });
  }
  return days;
}
