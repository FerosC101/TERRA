import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIPA_PLOT_A_SOILGRIDS_SOIL, LIPA_SOILGRIDS_SOIL } from "./soils";

const CSV = "docs/Data Pipeline/data/external/soilgrids/soilgrids_lipa_summary.csv";
const PLOT_A_CSV = "docs/Data Pipeline/data/external/soilgrids/lipa_plot_a/soilgrids_lipa_plot_a_summary.csv";
const THICKNESS_CM: Record<string, number> = { "0-5cm": 5, "5-15cm": 10, "15-30cm": 15, "30-60cm": 30, "60-100cm": 40 };

function meanOf(prop: string, depths: Record<string, number>, csv = CSV, cells = 20): number {
  const [header, ...rows] = readFileSync(csv, "utf8").trim().split(/\r?\n/).map((l) => l.split(","));
  const c = (n: string) => header.indexOf(n);
  let sum = 0;
  let w = 0;
  for (const [depth, t] of Object.entries(depths)) {
    const r = rows.find((x) => x[c("property")] === prop && x[c("depth")] === depth && x[c("statistic")] === "mean");
    expect(r, `${prop} ${depth}`).toBeDefined();
    expect(Number(r![c("n_cells")])).toBe(cells);
    sum += Number(r![c("aoi_mean")]) * t;
    w += t;
  }
  return sum / w;
}

describe("LIPA_SOILGRIDS_SOIL", () => {
  it("fc and wp are the 0–100 cm thickness-weighted SoilGrids means (33 and 1500 kPa)", () => {
    expect(Math.abs(LIPA_SOILGRIDS_SOIL.fc - meanOf("wv0033", THICKNESS_CM))).toBeLessThanOrEqual(0.0005);
    expect(Math.abs(LIPA_SOILGRIDS_SOIL.wp - meanOf("wv1500", THICKNESS_CM))).toBeLessThanOrEqual(0.0005);
  });

  it("tewMm follows (θFC − 0.5 θWP) × Ze with the 0–10 cm values", () => {
    const top = { "0-5cm": 5, "5-15cm": 5 };
    const tew = (meanOf("wv0033", top) - 0.5 * meanOf("wv1500", top)) * 1000 * LIPA_SOILGRIDS_SOIL.surfaceDepthM;
    expect(Math.abs(LIPA_SOILGRIDS_SOIL.tewMm - tew)).toBeLessThanOrEqual(0.05);
  });
});

describe("LIPA_PLOT_A_SOILGRIDS_SOIL", () => {
  it("matches the one-cell SoilGrids values for Plot A (0–100 cm weighted; TEW from 0–10 cm)", () => {
    expect(Math.abs(LIPA_PLOT_A_SOILGRIDS_SOIL.fc - meanOf("wv0033", THICKNESS_CM, PLOT_A_CSV, 1))).toBeLessThanOrEqual(0.0005);
    expect(Math.abs(LIPA_PLOT_A_SOILGRIDS_SOIL.wp - meanOf("wv1500", THICKNESS_CM, PLOT_A_CSV, 1))).toBeLessThanOrEqual(0.0005);
    const top = { "0-5cm": 5, "5-15cm": 5 };
    const tew = (meanOf("wv0033", top, PLOT_A_CSV, 1) - 0.5 * meanOf("wv1500", top, PLOT_A_CSV, 1)) * 1000 * 0.1;
    expect(Math.abs(LIPA_PLOT_A_SOILGRIDS_SOIL.tewMm - tew)).toBeLessThanOrEqual(0.01);
  });
});
