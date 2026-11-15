import { describe, expect, it } from "vitest";
import { DEFAULT_PRIORITIES, DEFAULT_SETTINGS } from "@/data/rotations";
import { FIELDS } from "@/data/fields";
import { SCENARIOS } from "@/data/scenarios";
import type { Field, RotationPlan } from "@/types";
import { evaluateRotation, rotationRisk } from "./waterBalance";

const lipa = FIELDS.find((f) => f.id === "lipa-cropland")!;
const cornX3: RotationPlan = { id: "t", name: "t", crops: ["corn", "corn", "corn"], colorSlot: 0, compare: true };
const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;
const withAwc = (f: Field, awc: number): Field => ({ ...f, soil: { ...f.soil, awcMmPerM: awc, profileDepthM: 1 } });

describe("evaluateRotation (rotation planner, 10-day bucket)", () => {
  it("matches a hand calculation of the first June step on Lipa's POWER climate", () => {
    // June rain 245 mm → 81.67 per step; ET0 4.09 × 365/36 = 41.47; corn Kc 0.3 on day 5 → ETc 12.44;
    // runoff (81.67 − 25) × 0.3 = 17.0; storage 0.6 × 150 = 90 → 90 + 81.67 − 17.0 − 12.44 = 142.2 mm.
    const r = evaluateRotation(cornX3, withAwc(lipa, 150), { seasonsPerYear: 2, startMonth: 5 }, DEFAULT_PRIORITIES, scenario("historical"));
    expect(r.timeline[0]).toMatchObject({ storageMm: 142.2, rainMm: 81.7, etcMm: 12.4, etaMm: 12.4 });
  });

  it("never gives a larger water deficit with more rain", () => {
    const base = evaluateRotation(cornX3, lipa, DEFAULT_SETTINGS, DEFAULT_PRIORITIES, scenario("historical"));
    const wet = evaluateRotation(cornX3, lipa, DEFAULT_SETTINGS, DEFAULT_PRIORITIES, scenario("wet"));
    const dry = evaluateRotation(cornX3, lipa, DEFAULT_SETTINGS, DEFAULT_PRIORITIES, scenario("dry"));
    expect(wet.indicators.deficitMm).toBeLessThanOrEqual(base.indicators.deficitMm);
    expect(dry.indicators.deficitMm).toBeGreaterThanOrEqual(base.indicators.deficitMm);
  });

  it("never gives a larger water deficit with a soil that stores more water", () => {
    const small = evaluateRotation(cornX3, withAwc(lipa, 80), DEFAULT_SETTINGS, DEFAULT_PRIORITIES, scenario("dry"));
    const large = evaluateRotation(cornX3, withAwc(lipa, 160), DEFAULT_SETTINGS, DEFAULT_PRIORITIES, scenario("dry"));
    expect(large.indicators.deficitMm).toBeLessThanOrEqual(small.indicators.deficitMm);
  });

  it("keeps the water balance closed in every step (storage stays within 0 and capacity)", () => {
    const r = evaluateRotation(cornX3, lipa, DEFAULT_SETTINGS, DEFAULT_PRIORITIES, scenario("hot-dry"));
    const cap = lipa.soil.awcMmPerM * lipa.soil.profileDepthM;
    for (const p of r.timeline) {
      expect(p.storageMm).toBeGreaterThanOrEqual(0);
      expect(p.storageMm).toBeLessThanOrEqual(cap + 1e-9);
    }
  });
});

describe("historical-years mode (D-014)", () => {
  it("uses the given 10-day rain instead of the monthly climatology, step by step", () => {
    const rain = Array(54).fill(0);
    const r = evaluateRotation(cornX3, lipa, DEFAULT_SETTINGS, DEFAULT_PRIORITIES, scenario("historical"), (k) => rain[k]);
    expect(r.timeline.every((p) => p.rainMm === 0)).toBe(true);
    expect(r.indicators.deficitMm).toBeGreaterThan(0); // no rain at all: the crop must run short
  });

  it("rotationRisk runs one rotation per start year and counts seasons that ran short", () => {
    const dry = Array(36).fill(0);
    const wet = Array(36).fill(200);
    const risk = rotationRisk(cornX3, lipa, DEFAULT_SETTINGS, DEFAULT_PRIORITIES, { "2001": wet, "2002": wet, "2003": dry, "2004": dry });
    // Start years need 54 steps (1.5 years) from June: 2001 and 2002 have a full series; 2003 too (ends Nov 2004).
    expect(risk.startYears).toEqual([2001, 2002, 2003]);
    expect(risk.seasons).toHaveLength(3);
    const s1 = risk.seasons[0];
    expect(s1.deficitByYear.map((d) => d.year)).toEqual([2001, 2002, 2003]);
    expect(s1.yearsShort).toBe(1); // only the 2003 start (all dry) runs short in its first season
  });
});
