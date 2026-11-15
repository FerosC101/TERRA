import { describe, expect, it } from "vitest";
import { DEFAULT_PLANS, DEFAULT_PRIORITIES, DEFAULT_SETTINGS } from "@/data/rotations";
import { SCENARIOS } from "@/data/scenarios";
import { mockEvaluate } from "./rotationService";

const req = (fieldId: string, scenarioId: string) => ({
  fieldId, plans: DEFAULT_PLANS, settings: DEFAULT_SETTINGS, priorities: DEFAULT_PRIORITIES,
  scenario: SCENARIOS.find((s) => s.id === scenarioId)!,
});

describe("rotation service, real years (D-014)", () => {
  it("returns a structured real-years result for Lipa under historical conditions", () => {
    const evs = mockEvaluate(req("lipa-cropland", "historical"));
    for (const [i, ev] of evs.entries()) {
      expect(ev.realYears?.planId).toBe(DEFAULT_PLANS[i].id);
      expect(ev.realYears!.startYears.length).toBeGreaterThan(20);
      expect(ev.realYears!.seasons).toHaveLength(DEFAULT_PLANS[i].crops.length);
      for (const s of ev.realYears!.seasons) expect(s.yearsShort).toBeLessThanOrEqual(ev.realYears!.startYears.length);
      // The result is no longer flattened into note strings.
      expect(ev.notes.some((n) => n.startsWith("Real rain"))).toBe(false);
    }
  });

  it("has no real-years result under a climate scenario or for a demo field", () => {
    expect(mockEvaluate(req("lipa-cropland", "dry")).every((e) => !e.realYears)).toBe(true);
    expect(mockEvaluate(req("riverside", "historical")).every((e) => !e.realYears)).toBe(true);
  });
});
