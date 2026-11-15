import { describe, expect, it } from "vitest";
import { validateDays } from "@/lib/science/discovery/engine";
import { telemetryToFieldDays, type TelemetryFrame } from "./telemetry";

// Made-up frames for the test, not pod data. 2026-06-01T00:00:00Z is 08:00 in Asia/Manila.
const T0 = Date.parse("2026-06-01T00:00:00Z") / 1000;
const frame = (k: number, over: Partial<TelemetryFrame> = {}): TelemetryFrame => ({
  node_id: "POD-TEST", field_id: "lipa-cropland", timestamp_s: T0 + k * 900, sequence_id: k,
  moisture_10cm_pct: 20 + k, moisture_40cm_pct: 30, soil_temp_c: 27, soil_ec_dsm: 1.2, air_temp_c: 28 + k, rain_mm: 0.2, ...over,
});
const LIPA = { fieldId: "lipa-cropland", timeZone: "Asia/Manila" };

describe("telemetryToFieldDays", () => {
  it("aggregates frames into one local day: mean moisture in m3/m3, rain total, max air temperature", () => {
    const days = telemetryToFieldDays([frame(0), frame(1), frame(2), frame(2)], LIPA);
    expect(() => validateDays(days, "lipa-cropland")).not.toThrow();
    expect(days).toHaveLength(1);
    const v = (variable: string, depth: number | null) => days[0].values.find((x) => x.variable === variable && x.depthCm === depth)!;
    expect(v("soil_moisture", 10).value).toBeCloseTo(0.21, 10); // mean of 20, 21, 22 % (duplicate frame dropped)
    expect(v("precipitation", null).value).toBeCloseTo(0.6, 10);
    expect(v("air_temperature_max", null).value).toBe(30);
    expect(v("soil_moisture", 10).provenance).toBe("measurement");
    expect(v("soil_moisture", 10).quality).toBe("warning"); // 3 frames < 48
  });
});
