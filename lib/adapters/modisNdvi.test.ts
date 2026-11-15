import { describe, expect, it } from "vitest";
import type { FieldDay } from "@/types/discovery-contract";
import { mergeValues, modisNdviToValues, parseModisNdviCsv } from "./modisNdvi";

const HEADER = "product,file_doy,composite_start,composite_end_nominal,n_aoi_pixels,n_good,n_marginal,n_usable,n_reliability_2,n_reliability_3,ndvi_mean_good,ndvi_mean_good_or_marginal,ndvi_mean_all_valid,ndvi_field,pixel_day_min,pixel_day_max";
const CSV = [
  HEADER,
  "MOD13Q1,2024001,2024-01-01,2024-01-16,42,38,4,40,0,0,0.7123,0.71,0.7,0.7123,2024-01-03,2024-01-12",
  "MYD13Q1,2024009,2024-01-09,2024-01-24,42,10,5,10,0,27,0.65,0.6,0.55,,2024-01-10,2024-01-20",
].join("\n");

const days = (from: string, n: number): FieldDay[] =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    return { fieldId: "lipa-cropland", date: d, values: [] };
  });

describe("parseModisNdviCsv", () => {
  it("reads the processing script's columns", () => {
    const rows = parseModisNdviCsv(CSV);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ product: "MOD13Q1", compositeStart: "2024-01-01", compositeEnd: "2024-01-16", nAoi: 42, nGood: 38, nUsable: 40, ndvi: 0.7123 });
    expect(rows[1].ndvi).toBeNull();
  });

  it("refuses a file with other columns", () => {
    expect(() => parseModisNdviCsv("product,ndvi\nMOD13Q1,0.5")).toThrow(/column/);
  });
});

describe("modisNdviToValues", () => {
  const [ok, blank] = modisNdviToValues(parseModisNdviCsv(CSV), "Asia/Manila");

  it("spans the 16-day window in local (Manila) days, as UTC instants", () => {
    expect(ok).toMatchObject({
      variable: "ndvi", source: "modis", product: "MOD13Q1 061", provenance: "satellite", value: 0.7123,
      unit: "dimensionless", depthCm: null, aggregation: "composite", quality: "ok", sampleCount: 40,
      period: { start: "2023-12-31T16:00:00Z", end: "2024-01-16T15:59:59Z" },
    });
    expect(ok.qualityNote).toMatch(/40 of 42 AOI pixels usable \(38 good, 2 cloud-free marginal\)/);
  });

  it("keeps a composite with too few good pixels as missing, with the counts", () => {
    expect(blank).toMatchObject({ value: null, quality: "missing" });
    expect(blank.qualityNote).toMatch(/10 of 42/);
  });
});

describe("mergeValues", () => {
  it("places a composite on its last local day and drops values outside the record", () => {
    const values = modisNdviToValues(parseModisNdviCsv(CSV), "Asia/Manila");
    const { days: out, dropped } = mergeValues(days("2024-01-10", 10), values, "Asia/Manila");
    expect(out.find((d) => d.date === "2024-01-16")!.values.map((v) => v.value)).toEqual([0.7123]);
    expect(dropped).toBe(1); // the MYD composite ends 2024-01-24, after the record
    expect(out).toHaveLength(10);
  });

  it("refuses a second value of the same variable/source/depth on one day", () => {
    const [v] = modisNdviToValues(parseModisNdviCsv(CSV), "Asia/Manila");
    expect(() => mergeValues(days("2024-01-16", 1), [v, v], "Asia/Manila")).toThrow(/already has/);
  });
});
