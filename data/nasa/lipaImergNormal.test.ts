import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIPA_IMERG_NORMAL } from "./lipaImergNormal";

const CSV = "docs/Data Pipeline/data/external/imerg_monthly/imerg_monthly_normal_lipa_2001_2023.csv";

describe("LIPA_IMERG_NORMAL", () => {
  it("matches the downloaded IMERG normal CSV, month by month", () => {
    const rows = readFileSync(CSV, "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
    expect(rows.map((r) => Number(r[0]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    rows.forEach((r, i) => {
      expect(Number(r[1])).toBe(23); // years in the mean
      expect(Math.abs(LIPA_IMERG_NORMAL.monthlyMm[i] - Number(r[2]))).toBeLessThanOrEqual(0.05);
    });
  });
});
