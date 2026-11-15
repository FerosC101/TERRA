import { describe, expect, it } from "vitest";
import type { AnyObservationValue, FieldDay } from "@/types/discovery-contract";
import { decodeRecord, encodeRecord } from "./compactRecord";

const v = (over: Partial<AnyObservationValue>): AnyObservationValue => ({
  variable: "precipitation", source: "power", product: "POWER", provenance: "model", value: 1, unit: "mm/day",
  depthCm: null, aggregation: "total", period: { start: "2024-01-01T00:00:00Z", end: "2024-01-01T23:59:59Z" }, quality: "ok",
  ...over,
} as AnyObservationValue);

const sorted = (days: FieldDay[]) => days.map((d) => ({ ...d, values: [...d.values].sort((a, b) =>
  `${a.variable}|${a.source}|${a.depthCm}`.localeCompare(`${b.variable}|${b.source}|${b.depthCm}`)) }));

describe("compact record", () => {
  it("round-trips days, values, notes, sample counts and missing values", () => {
    const days: FieldDay[] = [
      { fieldId: "f", date: "2024-01-01", values: [v({}), v({ variable: "soil_moisture", source: "smap_l4", unit: "m3/m3", depthCm: 5, value: null, quality: "missing", qualityNote: "5 of 8", sampleCount: 5, aggregation: "mean", provenance: "model" })] },
      { fieldId: "f", date: "2024-01-02", values: [v({ variable: "soil_moisture", source: "smap", unit: "m3/m3", value: 0.4, aggregation: "instant", provenance: "satellite", period: { start: "2024-01-01T21:50:00Z", end: "2024-01-01T21:50:00Z" } }), v({ value: 0 })] },
      { fieldId: "f", date: "2024-01-03", values: [] },
    ];
    expect(sorted(decodeRecord(JSON.parse(JSON.stringify(encodeRecord(days)))))).toEqual(sorted(days));
  });

  it("refuses a record mixing fields", () => {
    expect(() => encodeRecord([{ fieldId: "a", date: "2024-01-01", values: [] }, { fieldId: "b", date: "2024-01-02", values: [] }])).toThrow(/one field/);
  });
});
