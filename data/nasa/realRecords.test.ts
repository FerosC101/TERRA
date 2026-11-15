import { describe, expect, it } from "vitest";
import { buildLipaRecord } from "@/scripts/lipaRecord";
import type { FieldDay } from "@/types/discovery-contract";
import { realRecord } from "./realRecords";

const sorted = (days: FieldDay[]) => days.map((d) => ({ ...d, values: [...d.values].sort((a, b) =>
  `${a.variable}|${a.source}|${a.depthCm}`.localeCompare(`${b.variable}|${b.source}|${b.depthCm}`)) }));

describe("bundled real record (Lipa Cropland)", () => {
  it("equals a fresh build from the pipeline record, MODIS NDVI and SMAP L4 (rerun export-lipa-record if not)", () => {
    expect(sorted(realRecord("lipa-cropland")!)).toEqual(sorted(buildLipaRecord().days));
  });

  it("has no record for demo fields", () => {
    expect(realRecord("riverside")).toBeNull();
  });
});
