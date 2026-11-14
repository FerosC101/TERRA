import { describe, expect, it } from "vitest";
import { CROPS } from "@/data/crops";
import { FIELDS } from "@/data/fields";

/** Illustrative Cagayan Valley climatology, picked by field id (FIELDS[0] differs between branches). */
const CLIMATE = FIELDS.find((f) => f.id === "riverside")!.climate;
import { generateSyntheticFieldDays } from "@/lib/demo/syntheticFieldDays";
import type { AnyObservationValue } from "@/types/discovery-contract";
import { BASELINE_DETECTORS, detectOnDay, runDiscovery } from "./engine";
import { makeDays, TEST_CONTEXT as ctx, type DaySpec } from "./__tests__/fixtures";

const START = "2026-06-01";
const of = (detector: string, records: ReturnType<typeof detectOnDay>) => records.filter((r) => r.detector === detector);

/** Surface 0.30 for days 0–14, then linear decline reaching 0.30 − drop on day 28. Deep fixed. */
function divergenceDays(drop: number, deepEnd = 0.3): DaySpec[] {
  return Array.from({ length: 29 }, (_, i) => ({
    s10: i <= 14 ? 0.3 : 0.3 - ((i - 14) * drop) / 14,
    s40: i < 28 ? 0.3 : deepEnd,
  }));
}

describe("moisture-divergence", () => {
  it("fires when surface falls by at least 0.05 m3/m3 in 14 days while deep holds", () => {
    const [r] = of("moisture-divergence", detectOnDay(makeDays(START, divergenceDays(0.06)), 28, ctx));
    expect(r.id).toBe("test-field:moisture-divergence:2026-06-29");
    expect(r.window).toEqual({ start: "2026-06-15", end: "2026-06-29" });
    expect(r.signals[0]).toMatchObject({ variable: "soil_moisture", source: "station", depthCm: 10, statistic: "change", unit: "m3/m3", baselineKind: "own-history" });
    expect(r.signals[0].observed).toBeCloseTo(-0.06, 6);
    expect(r.signals[1]).toMatchObject({ depthCm: 40 });
    expect(r.signals[1].observed).toBeCloseTo(0, 6);
    expect(r.coverage).toEqual([{ variable: "soil_moisture", source: "station", daysWithData: 15, daysInWindow: 15 }]);
    expect(r).toMatchObject({ spatialSupport: "point", confidenceBasis: "heuristic", detectedAt: ctx.runAt, location: ctx.location });
  });

  it("fires at exactly the 0.05 threshold despite floating-point error", () => {
    expect(of("moisture-divergence", detectOnDay(makeDays(START, divergenceDays(0.05)), 28, ctx))).toHaveLength(1);
  });

  it("does not fire just below the threshold", () => {
    expect(of("moisture-divergence", detectOnDay(makeDays(START, divergenceDays(0.049)), 28, ctx))).toHaveLength(0);
  });

  it("does not fire when deep moisture also moves by more than 0.03", () => {
    expect(of("moisture-divergence", detectOnDay(makeDays(START, divergenceDays(0.06, 0.26)), 28, ctx))).toHaveLength(0);
  });

  it("does not fire when the reading 14 days earlier is missing", () => {
    const specs = divergenceDays(0.06);
    specs[14] = { ...specs[14], s10: null };
    expect(of("moisture-divergence", detectOnDay(makeDays(START, specs), 28, ctx))).toHaveLength(0);
  });

  it("does not fire before 14 days of record exist", () => {
    expect(of("moisture-divergence", detectOnDay(makeDays(START, divergenceDays(0.06)), 13, ctx))).toHaveLength(0);
  });

  it("scores the change against earlier 14-day changes only", () => {
    // Baseline changes: day14−day0 = +0.01, day15−day1 = −0.01 → mean 0, sd 0.0141421.
    // Today (day 29): 0.23 − 0.29 = −0.06 → z = −4.2426; confidence 0.45 + min(|z|,3)·0.1 = 0.75.
    const specs: DaySpec[] = Array.from({ length: 30 }, () => ({ s10: 0.3, s40: 0.3 }));
    specs[14].s10 = 0.31;
    specs[15].s10 = 0.29;
    specs[29].s10 = 0.23;
    const [r] = of("moisture-divergence", detectOnDay(makeDays(START, specs), 29, ctx));
    expect(r.signals[0].baseline).toBeCloseTo(0, 6);
    expect(r.signals[0].zScore).toBeCloseTo(-4.2426, 3);
    expect(r.confidence).toBeCloseTo(0.75, 6);
  });

  it("adds 0.1 confidence when 14-day rain is below half the climatology (as in detect.ts)", () => {
    // No z-score (one baseline value) → 0.45; zero rain over the last 14 days → +0.1.
    const withRain = divergenceDays(0.06).map((s, i) => ({ ...s, rain: i >= 15 ? 0 : 10 }));
    const [dry] = of("moisture-divergence", detectOnDay(makeDays(START, withRain), 28, ctx));
    const [noGauge] = of("moisture-divergence", detectOnDay(makeDays(START, divergenceDays(0.06)), 28, ctx));
    expect(dry.confidence).toBeCloseTo(0.55, 6);
    expect(noGauge.confidence).toBeCloseTo(0.45, 6);
  });

  it("uses a value flagged 'warning' but ignores one flagged 'invalid'", () => {
    const flag = (quality: AnyObservationValue["quality"]) => {
      const days = makeDays(START, divergenceDays(0.06));
      const v = days[28].values.find((x) => x.depthCm === 10)!;
      v.quality = quality;
      return of("moisture-divergence", detectOnDay(days, 28, ctx));
    };
    expect(flag("warning")).toHaveLength(1);
    expect(flag("invalid")).toHaveLength(0);
  });
});

/** 14 June days. Climatology 300 mm/month → 10 mm/day → 140 mm expected. */
function rainDays(gaugeTotal: number, imergTotal: number): DaySpec[] {
  return Array.from({ length: 14 }, (_, i) => ({ rain: i === 0 ? gaugeTotal : 0, imerg: i === 0 ? imergTotal : 0 }));
}

describe("rain-departure", () => {
  it("fires when 14-day gauge rain is below 45% of the climatology", () => {
    const [r] = of("rain-departure", detectOnDay(makeDays(START, rainDays(50, 48)), 13, ctx));
    expect(r.window).toEqual({ start: "2026-06-01", end: "2026-06-14" });
    expect(r.signals[0]).toMatchObject({ variable: "precipitation", source: "station", statistic: "total", observed: 50, unit: "mm", baselineKind: "climatology" });
    expect(r.signals[0].baseline).toBeCloseTo(140, 6);
    expect(r.signals[1]).toMatchObject({ source: "imerg", observed: 48, baseline: 50, baselineKind: "other-source", baselineSource: "station" });
    expect(r.confidence).toBe(0.8);
  });

  it("fires when rain is above 170% of the climatology", () => {
    expect(of("rain-departure", detectOnDay(makeDays(START, rainDays(250, 240)), 13, ctx))).toHaveLength(1);
  });

  it("does not fire inside the normal range", () => {
    expect(of("rain-departure", detectOnDay(makeDays(START, rainDays(70, 70)), 13, ctx))).toHaveLength(0);
  });

  it("lowers confidence when the satellite disagrees with the gauge", () => {
    const [r] = of("rain-departure", detectOnDay(makeDays(START, rainDays(50, 0)), 13, ctx));
    expect(r.confidence).toBe(0.6);
  });

  it("does not treat a missing gauge day as zero rain (strict baseline rule)", () => {
    const specs = rainDays(50, 48);
    specs[5] = { ...specs[5], rain: null };
    expect(of("rain-departure", detectOnDay(makeDays(START, specs), 13, ctx, BASELINE_DETECTORS))).toHaveLength(0);
  });

  it("does not fire with fewer than 14 days", () => {
    expect(of("rain-departure", detectOnDay(makeDays(START, rainDays(50, 48)), 12, ctx))).toHaveLength(0);
  });

  it("spreads each month's climatology over that month's real length (31-day July)", () => {
    // July 310 mm / 31 days = 10 mm/day → 140 mm expected; 64 mm is 0.457 of it → no alarm.
    // (Dividing by 30 would give 144.7 mm expected and ratio 0.442 → a false alarm.)
    const july = { ...ctx, monthlyRainMm: ctx.monthlyRainMm.map((m, k) => (k === 6 ? 310 : m)) };
    expect(of("rain-departure", detectOnDay(makeDays("2026-07-01", rainDays(64, 64)), 13, july))).toHaveLength(0);
    const [r] = of("rain-departure", detectOnDay(makeDays("2026-07-01", rainDays(50, 50)), 13, july));
    expect(r.signals[0].baseline).toBeCloseTo(140, 6);
  });
});

/** Composites on day 0, day `prev` and day `last`; planted 2026-06-01 with 10-day stages. */
function ndviDays(prev: number, last: number, prevValue: number, lastValue: number, withFirst = true): DaySpec[] {
  return Array.from({ length: last + 1 }, (_, i) =>
    i === 0 && withFirst ? { ndvi: prevValue } : i === prev ? { ndvi: prevValue } : i === last ? { ndvi: lastValue } : {});
}

describe("ndvi-change", () => {
  it("fires when NDVI drops by at least 0.03 during mid-season", () => {
    const [r] = of("ndvi-change", detectOnDay(makeDays(START, ndviDays(5, 21, 0.5, 0.45)), 21, ctx));
    expect(r.window).toEqual({ start: "2026-06-06", end: "2026-06-22" });
    expect(r.signals[0]).toMatchObject({ variable: "ndvi", source: "modis", statistic: "change", unit: "dimensionless" });
    expect(r.signals[0].observed).toBeCloseTo(-0.05, 6);
    expect(r.spatialSupport).toBe("grid-cell");
  });

  it("ignores a drop during the late stage, when the canopy is expected to decline", () => {
    expect(of("ndvi-change", detectOnDay(makeDays(START, ndviDays(17, 33, 0.5, 0.45)), 33, ctx))).toHaveLength(0);
  });

  it("ignores a drop smaller than 0.03", () => {
    expect(of("ndvi-change", detectOnDay(makeDays(START, ndviDays(5, 21, 0.5, 0.48)), 21, ctx))).toHaveLength(0);
  });

  it("needs at least three composites in the record (as in detect.ts)", () => {
    expect(of("ndvi-change", detectOnDay(makeDays(START, ndviDays(5, 21, 0.5, 0.45, false)), 21, ctx))).toHaveLength(0);
  });

  it("only evaluates on the day a new composite arrives", () => {
    const days = makeDays(START, [...ndviDays(5, 21, 0.5, 0.45), {}]);
    expect(of("ndvi-change", detectOnDay(days, 22, ctx))).toHaveLength(0);
  });
});

/** Station 0.30 every day; SMAP on every third day (0, 3, …). */
function offsetDays(n: number, smap: number): DaySpec[] {
  return Array.from({ length: n }, (_, i) => (i % 3 === 0 ? { s10: 0.3, smap } : { s10: 0.3 }));
}

describe("sensor-offset", () => {
  it("fires when SMAP and station differ by at least 0.015 on average over more than 20 pairs", () => {
    const [r] = of("sensor-offset", detectOnDay(makeDays(START, offsetDays(61, 0.32)), 60, ctx));
    expect(r.window).toEqual({ start: "2026-06-01", end: "2026-07-31" });
    expect(r.signals[0]).toMatchObject({ source: "smap", statistic: "mean", baselineKind: "other-source", baselineSource: "station", unit: "m3/m3" });
    expect(r.signals[0].observed).toBeCloseTo(0.32, 6);
    expect(r.signals[0].baseline).toBeCloseTo(0.3, 6);
    expect(r.coverage).toEqual([{ variable: "soil_moisture", source: "smap", daysWithData: 21, daysInWindow: 61 }]);
  });

  it("waits for more than 20 pairs", () => {
    expect(of("sensor-offset", detectOnDay(makeDays(START, offsetDays(58, 0.32)), 57, ctx))).toHaveLength(0);
  });

  it("does not fire for a small offset", () => {
    expect(of("sensor-offset", detectOnDay(makeDays(START, offsetDays(61, 0.31)), 60, ctx))).toHaveLength(0);
  });
});

describe("runDiscovery", () => {
  it("reports a persisting pattern once, on its first day", () => {
    // 0.005/day decline from day 15: the 14-day change first reaches −0.05 on day 24 and stays there.
    const specs: DaySpec[] = Array.from({ length: 35 }, (_, i) => ({
      s10: i <= 14 ? 0.3 : 0.3 - (i - 14) * 0.005,
      s40: 0.3,
    }));
    const records = of("moisture-divergence", runDiscovery(makeDays(START, specs), ctx));
    expect(records.map((r) => r.window.end)).toEqual(["2026-06-25"]);
  });

  it("returns nothing for an empty record", () => {
    expect(runDiscovery([], ctx)).toEqual([]);
  });

  it("does not re-report a persisting pattern after a day it could not evaluate", () => {
    const specs: DaySpec[] = Array.from({ length: 35 }, (_, i) => ({
      s10: i <= 14 ? 0.3 : 0.3 - (i - 14) * 0.005,
      s40: 0.3,
    }));
    specs[30] = { ...specs[30], s10: null };
    const records = of("moisture-divergence", runDiscovery(makeDays(START, specs), ctx));
    expect(records.map((r) => r.window.end)).toEqual(["2026-06-25"]);
  });

  it("uses only days up to the evaluated day (no look-ahead)", () => {
    const { days } = generateSyntheticFieldDays({
      fieldId: ctx.fieldId, start: "2026-05-01", days: 150, seed: 7, climate: CLIMATE, crop: CROPS.corn, plantedOn: "2026-06-01",
      events: [{ kind: "dry-spell", startDay: 70, days: 20 }, { kind: "smap-bias", bias: 0.03 }],
    });
    const corn = { ...ctx, crop: CROPS.corn };
    for (let i = 0; i < days.length; i++) {
      expect(detectOnDay(days, i, corn)).toEqual(detectOnDay(days.slice(0, i + 1), i, corn));
    }
  });
});

describe("synthetic records with missing days", () => {
  it("runs without error and never raises a moisture alarm on a day with no station data", () => {
    const { days } = generateSyntheticFieldDays({
      fieldId: ctx.fieldId, start: "2026-05-01", days: 240, seed: 3, climate: CLIMATE, crop: CROPS.corn,
      plantedOn: "2026-06-01", missing: { rate: 0.05, outages: [{ startDay: 90, days: 7 }] },
    });
    const records = runDiscovery(days, { ...ctx, crop: CROPS.corn });
    const stationless = new Set(days.filter((d) => d.values.some((v) => v.source === "station" && v.value === null)).map((d) => d.date));
    for (const r of records.filter((x) => x.detector === "moisture-divergence")) {
      expect(stationless.has(r.window.end)).toBe(false);
    }
  });
});

describe("input checks", () => {
  const days = () => makeDays(START, Array.from({ length: 5 }, () => ({ s10: 0.3, s40: 0.3 })));

  it("rejects days out of order", () => {
    const d = days();
    [d[1], d[2]] = [d[2], d[1]];
    expect(() => runDiscovery(d, ctx)).toThrow(/consecutive/);
  });

  it("rejects a gap in the dates", () => {
    const d = days();
    d.splice(2, 1);
    expect(() => runDiscovery(d, ctx)).toThrow(/consecutive/);
  });

  it("rejects a repeated date", () => {
    const d = days();
    d[2] = { ...d[2], date: d[1].date };
    expect(() => runDiscovery(d, ctx)).toThrow(/consecutive/);
  });

  it("rejects a day from another field", () => {
    const d = days();
    d[3] = { ...d[3], fieldId: "other-field" };
    expect(() => runDiscovery(d, ctx)).toThrow(/other-field/);
  });

  it("rejects two values for the same variable, source and depth on one day", () => {
    const d = days();
    d[1].values.push({ ...d[1].values[0] });
    expect(() => runDiscovery(d, ctx)).toThrow(/duplicate/i);
  });

  it("rejects soil moisture outside 0–1 m3/m3, e.g. a value sent in %", () => {
    const d = days();
    d[2].values[0] = { ...d[2].values[0], value: 30 } as AnyObservationValue;
    expect(() => runDiscovery(d, ctx)).toThrow(/0\.\.1/);
  });

  it("applies the same checks to detectOnDay", () => {
    const d = days();
    d.splice(2, 1);
    expect(() => detectOnDay(d, 3, ctx)).toThrow(/consecutive/);
  });
});
