import { describe, expect, it } from "vitest";
import { parseSmapL4DailyCsv, smapL4ToValues } from "./smapL4";

const CSV = [
  "local_date,n_surface,n_rootzone,sm_surface_mean,sm_rootzone_mean,sm_surface_min,sm_surface_max,utc_stamps",
  "2024-01-01,5,5,,,0.312,0.3528,01:30 04:30 07:30 10:30 13:30",
  "2024-01-02,8,8,0.3462,0.3206,0.3415,0.3528,16:30 19:30 22:30 01:30 04:30 07:30 10:30 13:30",
].join("\n");

describe("parseSmapL4DailyCsv", () => {
  it("reads complete and partial days", () => {
    const rows = parseSmapL4DailyCsv(CSV);
    expect(rows).toEqual([
      { date: "2024-01-01", nSurface: 5, nRootzone: 5, surface: null, rootzone: null },
      { date: "2024-01-02", nSurface: 8, nRootzone: 8, surface: 0.3462, rootzone: 0.3206 },
    ]);
  });

  it("refuses values outside 0..0.9 m³/m³ and files with other columns", () => {
    expect(() => parseSmapL4DailyCsv(CSV.replace("0.3462", "34.62"))).toThrow(/0\.\.0\.9/);
    expect(() => parseSmapL4DailyCsv("date,sm\n2024-01-02,0.3")).toThrow(/column/);
  });
});

describe("smapL4ToValues", () => {
  const values = smapL4ToValues(parseSmapL4DailyCsv(CSV), "Asia/Manila");

  it("gives two values per complete day: surface (0–5 cm) and root zone (0–100 cm), as model output", () => {
    const day = values.filter((v) => v.period.start === "2024-01-01T16:00:00Z");
    expect(day.map((v) => [v.depthCm, v.value])).toEqual([[5, 0.3462], [100, 0.3206]]);
    expect(day[0]).toMatchObject({
      variable: "soil_moisture", source: "smap_l4", product: "SPL4SMGP 008", provenance: "model",
      unit: "m3/m3", aggregation: "mean", sampleCount: 8, quality: "ok",
      period: { start: "2024-01-01T16:00:00Z", end: "2024-01-02T15:59:59Z" },
    });
  });

  it("keeps an incomplete day as missing, with the count", () => {
    const partial = values.filter((v) => v.period.start === "2023-12-31T16:00:00Z");
    expect(partial).toHaveLength(2);
    expect(partial.every((v) => v.value === null && v.quality === "missing")).toBe(true);
    expect(partial[0].qualityNote).toMatch(/5 of 8/);
  });
});
