import { describe, expect, it } from "vitest";
import { buildLipaRecord } from "@/scripts/lipaRecord";
import { buildPlotARecord } from "@/scripts/plotARecord";
import type { FieldDay } from "@/types/discovery-contract";
import { realRecord } from "./realRecords";

const sorted = (days: FieldDay[]) => days.map((d) => ({ ...d, values: [...d.values].sort((a, b) =>
  `${a.variable}|${a.source}|${a.depthCm}`.localeCompare(`${b.variable}|${b.source}|${b.depthCm}`)) }));

describe("bundled real records", () => {
  it("Lipa Cropland equals a fresh build from the pipeline record, MODIS NDVI and SMAP L4 (rerun export-lipa-record if not)", () => {
    expect(sorted(realRecord("lipa-cropland")!)).toEqual(sorted(buildLipaRecord().days));
  }, 60_000); // rebuilds from the 7.9 MB pipeline record: slow when the whole suite runs in parallel

  it("Plot A equals a fresh build from the pipeline weather, HLS NDVI and SMAP L4 at the plot (rerun export-lipa-record if not)", () => {
    expect(sorted(realRecord("lipa-plot-a")!)).toEqual(sorted(buildPlotARecord().days));
  }, 60_000); // rebuilds from the 7.9 MB pipeline record: slow when the whole suite runs in parallel

  it("holds no simulated value and no station value (the planned station's readings are display-only)", () => {
    for (const id of ["lipa-cropland", "lipa-plot-a"]) {
      const values = realRecord(id)!.flatMap((d) => d.values);
      expect(values.some((v) => v.provenance === "simulated")).toBe(false);
      expect(values.some((v) => v.source === "station")).toBe(false);
    }
  });

  it("Plot A's NDVI comes from HLS, not MODIS", () => {
    const sources = new Set(realRecord("lipa-plot-a")!.flatMap((d) => d.values).filter((v) => v.variable === "ndvi").map((v) => v.source));
    expect([...sources]).toEqual(["hls"]);
  });

  it("has no record for demo fields", () => {
    expect(realRecord("riverside")).toBeNull();
  });
});
