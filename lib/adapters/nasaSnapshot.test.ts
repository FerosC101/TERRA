import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import bundled from "@/data/nasa/lipa-cropland-2024-01.json";
import { pipelineToSnapshotRecords, type MergedRecordForSnapshot } from "./nasaSnapshot";

const MERGED = "docs/Data Pipeline/data/processed/terra_daily_merged.json";

describe("pipelineToSnapshotRecords", () => {
  const merged = JSON.parse(readFileSync(MERGED, "utf8")) as MergedRecordForSnapshot[];

  it("reproduces the bundled 2024-01-01..15 snapshot from the pipeline record", () => {
    expect(pipelineToSnapshotRecords(merged, "2024-01-01", "2024-01-15")).toEqual(bundled);
  });

  it("keeps missing values null and never fills them", () => {
    const out = pipelineToSnapshotRecords(merged, "2025-10-01", "2025-10-31");
    expect(out).toHaveLength(31);
    expect(out.every((r) => r.rainImergMm === null)).toBe(true); // IMERG Final V07 ends 2025-09-30
    expect(out.filter((r) => r.smapVwc === null).every((r) => r.smapFlag === null)).toBe(true);
  });
});
