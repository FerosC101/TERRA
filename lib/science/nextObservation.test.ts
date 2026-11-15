import { describe, expect, it } from "vitest";
import type { ObservationCheck } from "@/data/observationChecks";
import { rankChecks } from "./nextObservation";

const check = (id: string, costMinutes: number, waitDays: number, separates: string[]): ObservationCheck =>
  ({ id, action: id, rationale: "", costMinutes, waitDays, kinds: ["rain-departure"], separates, answers: [] });

describe("rankChecks", () => {
  it("prefers the check that tells more open causes apart per unit of effort", () => {
    const ranked = rankChecks("rain-departure", ["pattern-real", "gauge-blocked", "normal-variation"], [
      check("slow", 5, 7, ["pattern-real", "normal-variation"]),   // 2 / (5 + 210)
      check("quick", 10, 0, ["pattern-real", "gauge-blocked"]),   // 2 / 10
    ]);
    expect(ranked.map((r) => r.check.id)).toEqual(["quick", "slow"]);
  });

  it("drops checks that separate fewer than two open causes", () => {
    // gauge-blocked is not open (a wet spell), so the gauge check tells nothing apart
    const ranked = rankChecks("rain-departure", ["pattern-real", "single-storm"], [check("gauge", 10, 0, ["pattern-real", "gauge-blocked"])]);
    expect(ranked).toEqual([]);
  });
});
