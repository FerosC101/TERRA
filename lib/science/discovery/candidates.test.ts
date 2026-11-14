import { describe, expect, it } from "vitest";
import { BASELINE_DETECTORS, detectOnDay, runDiscovery, type DetectorSet } from "./engine";
import { fieldZMoisture, ndviTrendBreak, rainWithImergFill } from "./candidates";
import { makeDays, TEST_CONTEXT as ctx, type DaySpec } from "./__tests__/fixtures";

const START = "2026-06-01";
const withSet = (kind: keyof DetectorSet, detector: DetectorSet[keyof DetectorSet]): DetectorSet => ({ ...BASELINE_DETECTORS, [kind]: detector });
const of = (detector: string, records: ReturnType<typeof detectOnDay>) => records.filter((r) => r.detector === detector);

/**
 * Surface: 0.30 on days 0–13, then s[j] = s[j−14] ± 0.01 (+ on even j, − on odd j), so every earlier
 * 14-day change is ±0.01. Day `today` is set to s[today − 14] + change. Deep fixed at 0.30.
 * For today = 48 the history is j = 14..34: 11 × (+0.01), 10 × (−0.01) → mean 0.000476, sd 0.0102353.
 */
function zDays(today: number, change: number): DaySpec[] {
  const s: number[] = [];
  for (let j = 0; j <= today; j++) s.push(j < 14 ? 0.3 : s[j - 14] + (j % 2 === 0 ? 0.01 : -0.01));
  s[today] = s[today - 14] + change;
  return s.map((v) => ({ s10: v, s40: 0.3 }));
}

describe("fieldZMoisture (candidate: unusual for this field)", () => {
  const set = withSet("moisture-divergence", fieldZMoisture({ zThreshold: -2, minHistory: 20 }));

  it("fires on a drop the fixed rule misses when it is unusual for this field", () => {
    // change −0.03 → z = (−0.03 − 0.000476) / 0.0102353 = −2.978 ≤ −2; the fixed rule needs −0.05.
    const days = makeDays(START, zDays(48, -0.03));
    const [r] = of("moisture-divergence", detectOnDay(days, 48, ctx, set));
    expect(r.signals[0].zScore).toBeCloseTo(-2.978, 2);
    expect(r.detectorVersion).toMatch(/\+field-z$/);
    expect(of("moisture-divergence", detectOnDay(days, 48, ctx))).toHaveLength(0);
  });

  it("does not fire on a drop that is ordinary for this field", () => {
    // change −0.015 → z = −1.512 > −2
    expect(of("moisture-divergence", detectOnDay(makeDays(START, zDays(48, -0.015)), 48, ctx, set))).toHaveLength(0);
  });

  it("stays silent until it has 20 earlier 14-day changes to compare with", () => {
    // today = 46 → history j = 14..32 = 19 values
    expect(of("moisture-divergence", detectOnDay(makeDays(START, zDays(46, -0.03)), 46, ctx, set))).toHaveLength(0);
  });

  it("keeps the divergence condition: no alarm when deep moisture also moves by more than 0.03", () => {
    const specs = zDays(48, -0.03);
    specs[48] = { ...specs[48], s40: 0.26 };
    expect(of("moisture-divergence", detectOnDay(makeDays(START, specs), 48, ctx, set))).toHaveLength(0);
  });
});

/** 14 June days: gauge 50 mm and IMERG 48 mm on day 0, zero after; climatology 140 mm expected. */
const rain = (): DaySpec[] => Array.from({ length: 14 }, (_, i) => ({ rain: i === 0 ? 50 : 0, imerg: i === 0 ? 48 : 0 }));

describe("rainWithImergFill (candidate: satellite fills gauge gaps)", () => {
  const set = withSet("rain-departure", rainWithImergFill({ maxFilledDays: 2 }));

  it("fills a missing gauge day with IMERG instead of giving up", () => {
    const specs = rain();
    specs[0] = { ...specs[0], rain: null }; // the 50 mm day is missing → filled with IMERG's 48 mm
    const [r] = of("rain-departure", detectOnDay(makeDays(START, specs), 13, ctx, set));
    expect(r.signals[0].observed).toBeCloseTo(48, 9);
    expect(r.coverage[0]).toEqual({ variable: "precipitation", source: "station", daysWithData: 13, daysInWindow: 14 });
    expect(r.detectorVersion).toMatch(/\+imerg-fill$/);
    expect(of("rain-departure", detectOnDay(makeDays(START, specs), 13, ctx, BASELINE_DETECTORS))).toHaveLength(0); // baseline gives up
  });

  it("accepts two filled days but not three", () => {
    const two = rain().map((s, i) => (i === 3 || i === 4 ? { ...s, rain: null } : s));
    const three = rain().map((s, i) => (i >= 3 && i <= 5 ? { ...s, rain: null } : s));
    expect(of("rain-departure", detectOnDay(makeDays(START, two), 13, ctx, set))).toHaveLength(1);
    expect(of("rain-departure", detectOnDay(makeDays(START, three), 13, ctx, set))).toHaveLength(0);
  });

  it("cannot fill a day when IMERG is missing too", () => {
    const specs = rain();
    specs[4] = { rain: null, imerg: null };
    expect(of("rain-departure", detectOnDay(makeDays(START, specs), 13, ctx, set))).toHaveLength(0);
  });

  it("behaves exactly like the baseline when no gauge day is missing", () => {
    const days = makeDays(START, rain());
    const [a] = of("rain-departure", detectOnDay(days, 13, ctx, set));
    const [b] = of("rain-departure", detectOnDay(days, 13, ctx, BASELINE_DETECTORS));
    expect({ ...a, detectorVersion: "" }).toEqual({ ...b, detectorVersion: "" });
  });
});

/** Composites on days a, b, c (values va, vb, vc); planted 2026-06-01 with 10-day stages (development = days 10–19). */
function ndvi(a: number, b: number, c: number, va: number, vb: number, vc: number): DaySpec[] {
  return Array.from({ length: c + 1 }, (_, i) => (i === a ? { ndvi: va } : i === b ? { ndvi: vb } : i === c ? { ndvi: vc } : {}));
}

describe("ndviTrendBreak (candidate: growth suddenly slows)", () => {
  const set = withSet("ndvi-change", ndviTrendBreak({ minSlowdown: 0.05 }));

  it("fires during green-up when growth slows by at least 0.05, which the fixed rule misses", () => {
    // +0.15 then +0.07 → slowdown −0.08; NDVI still rises, so the fixed rule (needs a −0.03 fall) is silent.
    const days = makeDays(START, ndvi(0, 6, 12, 0.3, 0.45, 0.52));
    const [r] = of("ndvi-change", detectOnDay(days, 12, ctx, set));
    expect(r.signals[0].observed).toBeCloseTo(0.07, 9);
    expect(r.signals[0].baseline).toBeCloseTo(0.15, 9);
    expect(r.window).toEqual({ start: "2026-06-07", end: "2026-06-13" });
    expect(of("ndvi-change", detectOnDay(days, 12, ctx))).toHaveLength(0);
  });

  it("does not fire for a smaller slowdown", () => {
    // +0.15 then +0.12 → −0.03
    expect(of("ndvi-change", detectOnDay(makeDays(START, ndvi(0, 6, 12, 0.3, 0.45, 0.57)), 12, ctx, set))).toHaveLength(0);
  });

  it("ignores the late stage, when the canopy is expected to decline", () => {
    expect(of("ndvi-change", detectOnDay(makeDays(START, ndvi(22, 28, 34, 0.6, 0.6, 0.5)), 34, ctx, set))).toHaveLength(0);
  });

  it("needs three composites", () => {
    const specs = ndvi(0, 6, 12, 0.3, 0.45, 0.52);
    specs[0] = {};
    expect(of("ndvi-change", detectOnDay(makeDays(START, specs), 12, ctx, set))).toHaveLength(0);
  });
});

describe("engine default after E-004 (D-005)", () => {
  it("fills a missing gauge day with IMERG by default, while BASELINE_DETECTORS keeps the strict rule", () => {
    const specs = rain();
    specs[0] = { ...specs[0], rain: null };
    const days = makeDays(START, specs);
    const [r] = of("rain-departure", runDiscovery(days, ctx));
    expect(r.detectorVersion).toMatch(/\+imerg-fill$/);
    expect(of("rain-departure", runDiscovery(days, ctx, BASELINE_DETECTORS))).toHaveLength(0);
  });

  it("keeps the baseline moisture, NDVI and sensor-offset rules as the default", () => {
    const days = makeDays(START, Array.from({ length: 29 }, (_, i) => ({ s10: i <= 14 ? 0.3 : 0.3 - ((i - 14) * 0.06) / 14, s40: 0.3 })));
    const [r] = of("moisture-divergence", runDiscovery(days, ctx));
    expect(r.detectorVersion).not.toMatch(/\+/);
  });
});

describe("candidate sets in runDiscovery", () => {
  it("runs a full record with all candidates swapped in", () => {
    const set: DetectorSet = {
      ...BASELINE_DETECTORS,
      "moisture-divergence": fieldZMoisture({ zThreshold: -2, minHistory: 20 }),
      "rain-departure": rainWithImergFill({ maxFilledDays: 2 }),
      "ndvi-change": ndviTrendBreak({ minSlowdown: 0.05 }),
    };
    const records = runDiscovery(makeDays(START, zDays(48, -0.03)), ctx, set);
    expect(records.map((r) => r.detector)).toContain("moisture-divergence");
  });
});
