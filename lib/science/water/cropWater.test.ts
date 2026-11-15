import { describe, expect, it } from "vitest";
import { CROPS } from "@/data/crops";
import { INDICATIVE_SOIL } from "@/data/soils";
import { addDays } from "@/lib/dates";
import { runDailyWaterBalance, runSeasonalWaterBalance } from "./cropWater";
import { soilStep } from "./soilWater";

const corn = CROPS.corn;

describe("runDailyWaterBalance", () => {
  it("uses ETc = Kc × ET0 and reaches stress, with a refill need, in a long dry spell", () => {
    const inputs = Array.from({ length: 60 }, (_, i) => ({ date: addDays("2026-03-01", i), rainMm: 0, et0Mm: 5 }));
    const out = runDailyWaterBalance(inputs, corn, "2026-01-15", INDICATIVE_SOIL);
    expect(out[0].etcMm).toBeCloseTo(out[0].kc * 5, 9);
    const firstStress = out.findIndex((d) => d.stressed);
    expect(firstStress).toBeGreaterThan(0);
    expect(out[firstStress].depletionMm).toBeGreaterThan(out[firstStress].rawMm - 6); // stress starts near RAW
    expect(out.at(-1)!.refillMm).toBeGreaterThan(0);
  });

  it("does not guess a day with missing ET0: outputs null, soil state unchanged", () => {
    const out = runDailyWaterBalance(
      [{ date: "2026-03-01", rainMm: 0, et0Mm: 5 }, { date: "2026-03-02", rainMm: 0, et0Mm: null }],
      corn, "2026-01-15", INDICATIVE_SOIL,
    );
    expect(out[1].etcMm).toBeNull();
    expect(out[1].depletionMm).toBe(out[0].depletionMm);
  });
});

describe("soilStep hand check (2026-11-15)", () => {
  it("matches a hand calculation with half canopy, stage-2 evaporation and no stress", () => {
    // TAW 170, RAW 85 (p 0.5). Kr = (24.5 − 12)/(24.5 − 9) = 0.80645 → E = 0.80645 × 0.5 × 5 = 2.0161 mm.
    // Dr = 12 + 60 = 72 ≤ 85 → Ks = 1; T = 0.5 × 5 = 2.5 mm, 0.25 from the surface, 2.25 from depth.
    // De = 12 + 2.0161 + 0.25 = 14.2661 → θ10 = 0.32 − 0.142661 = 0.177339; Dd = 62.25 → θdeep = 0.32 − 62.25/900 = 0.250833.
    const r = soilStep({ surfaceDepletionMm: 12, deepDepletionMm: 60 }, { rainMm: 0, etcMm: 5, canopyCover: 0.5 }, { ...INDICATIVE_SOIL, p: 0.5 });
    expect(r.evaporationMm).toBeCloseTo(2.0161, 4);
    expect(r.ks).toBe(1);
    expect(r.surfaceVwc).toBeCloseTo(0.177339, 5);
    expect(r.deepVwc).toBeCloseTo(0.250833, 5);
  });
});

describe("runSeasonalWaterBalance", () => {
  const inputs = Array.from({ length: 200 }, (_, i) => ({ date: addDays("2026-01-01", i), rainMm: i % 9 === 0 ? 20 : 0, et0Mm: 4.5 }));

  it("with one season gives exactly the single-season result", () => {
    expect(runSeasonalWaterBalance(inputs, [{ crop: corn, plantedOn: "2026-02-01" }], INDICATIVE_SOIL))
      .toEqual(runDailyWaterBalance(inputs, corn, "2026-02-01", INDICATIVE_SOIL));
  });

  it("switches to the second season on its planting day and keeps one soil state", () => {
    const out = runSeasonalWaterBalance(inputs, [{ crop: corn, plantedOn: "2026-01-10" }, { crop: corn, plantedOn: "2026-05-20" }], INDICATIVE_SOIL);
    const k = inputs.findIndex((d) => d.date === "2026-05-20");
    expect(out[k - 1].stage).toBe("post"); // first season (115 days from 2026-01-10) is over
    expect(out[k].stage).toBe("initial");
    expect(out[k].kc).toBe(corn.kc.ini);
  });
});
