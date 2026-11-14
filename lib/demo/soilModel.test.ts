import { describe, expect, it } from "vitest";
import { soilStep, type SoilParams } from "./soilModel";

/*
 * Hand-derived cases. Parameters: silt loam inside FAO-56 Table 19 ranges.
 * Surface layer Ze = 0.10 m → water above wilting point (0.32 − 0.15) × 100 = 17 mm.
 * Root zone 1.0 m → deep part 0.9 m → (0.17) × 900 = 153 mm; TAW = 170 mm; RAW = 0.55 × 170 = 93.5 mm.
 * TEW = (0.32 − 0.5 × 0.15) × 100 = 24.5 mm; REW = 9 mm.
 */
const P: SoilParams = { fc: 0.32, wp: 0.15, surfaceDepthM: 0.1, rootDepthM: 1.0, rewMm: 9, tewMm: 24.5, p: 0.55 };

describe("soilStep", () => {
  it("evaporates at the full rate from bare, moist topsoil (stage 1)", () => {
    const r = soilStep({ surfaceDepletionMm: 0, deepDepletionMm: 0 }, { rainMm: 0, etcMm: 4, canopyCover: 0 }, P);
    expect(r.evaporationMm).toBeCloseTo(4, 9);
    expect(r.transpirationMm).toBeCloseTo(0, 9);
    expect(r.surfaceVwc).toBeCloseTo(0.28, 9); // 0.32 − 4 / 100
    expect(r.deepVwc).toBeCloseTo(0.32, 9);
  });

  it("halves evaporation midway between REW and TEW (stage 2)", () => {
    // Kr = (24.5 − 16.75) / (24.5 − 9) = 0.5 → E = 2 mm; De = 18.75 → θ = 0.32 − 0.1875
    const r = soilStep({ surfaceDepletionMm: 16.75, deepDepletionMm: 0 }, { rainMm: 0, etcMm: 4, canopyCover: 0 }, P);
    expect(r.evaporationMm).toBeCloseTo(2, 9);
    expect(r.surfaceVwc).toBeCloseTo(0.1325, 9);
  });

  it("stops evaporating once the topsoil reaches TEW", () => {
    const r = soilStep({ surfaceDepletionMm: 24.5, deepDepletionMm: 0 }, { rainMm: 0, etcMm: 4, canopyCover: 0 }, P);
    expect(r.evaporationMm).toBeCloseTo(0, 9);
    expect(r.surfaceVwc).toBeCloseTo(0.075, 9); // 0.32 − 0.245 = half the wilting point
  });

  it("takes transpiration from the root zone by depth: 10% from the top 0.10 m under full canopy", () => {
    // T = 5 mm, Ks = 1 → 0.5 mm from the surface (θ −0.005), 4.5 mm from 900 mm deep (θ −0.005)
    const r = soilStep({ surfaceDepletionMm: 0, deepDepletionMm: 0 }, { rainMm: 0, etcMm: 5, canopyCover: 1 }, P);
    expect(r.evaporationMm).toBeCloseTo(0, 9);
    expect(r.transpirationMm).toBeCloseTo(5, 9);
    expect(r.surfaceVwc).toBeCloseTo(0.315, 9);
    expect(r.deepVwc).toBeCloseTo(0.315, 9);
  });

  it("can take a larger, top-weighted share of transpiration from the surface layer", () => {
    // Share 0.3 of T = 5 mm → 1.5 mm from the surface (θ 0.32 − 0.015), 3.5 mm from 900 mm (θ 0.32 − 0.003889)
    const r = soilStep({ surfaceDepletionMm: 0, deepDepletionMm: 0 }, { rainMm: 0, etcMm: 5, canopyCover: 1 }, { ...P, surfaceUptakeShare: 0.3 });
    expect(r.surfaceVwc).toBeCloseTo(0.305, 9);
    expect(r.deepVwc).toBeCloseTo(0.316111, 6);
  });

  it("reduces transpiration once root-zone depletion exceeds RAW (water stress)", () => {
    // Dr = 10 + 110 = 120 > 93.5 → Ks = (170 − 120) / ((1 − 0.55) × 170) = 50 / 76.5 = 0.653595
    const r = soilStep({ surfaceDepletionMm: 10, deepDepletionMm: 110 }, { rainMm: 0, etcMm: 5, canopyCover: 1 }, P);
    expect(r.transpirationMm).toBeCloseTo(3.267974, 5);
  });

  it("does not pull transpiration from topsoil already at wilting point; the deep layer supplies it", () => {
    const r = soilStep({ surfaceDepletionMm: 17, deepDepletionMm: 0 }, { rainMm: 0, etcMm: 5, canopyCover: 1 }, P);
    expect(r.transpirationMm).toBeCloseTo(5, 9);
    expect(r.state.surfaceDepletionMm).toBeCloseTo(17, 9);
    expect(r.state.deepDepletionMm).toBeCloseTo(5, 9);
  });

  it("refills the topsoil first, passes the excess down, and loses water above field capacity the same day", () => {
    // De 4 − 20 mm rain → 16 mm excess → deep 2 − 16 → 14 mm deep percolation
    const r = soilStep({ surfaceDepletionMm: 4, deepDepletionMm: 2 }, { rainMm: 20, etcMm: 0, canopyCover: 0 }, P);
    expect(r.state).toEqual({ surfaceDepletionMm: 0, deepDepletionMm: 0 });
    expect(r.deepPercolationMm).toBeCloseTo(14, 9);
  });
});
