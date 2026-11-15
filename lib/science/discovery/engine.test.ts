import { describe, expect, it } from "vitest";
import { CROPS } from "@/data/crops";
import { FIELDS } from "@/data/fields";

/** Illustrative Cagayan Valley climatology, picked by field id (FIELDS[0] differs between branches). */
const CLIMATE = FIELDS.find((f) => f.id === "riverside")!.climate;
import { generateSyntheticFieldDays } from "@/lib/demo/syntheticFieldDays";
import type { AnyObservationValue } from "@/types/discovery-contract";
import { DISCOVERY_RULES } from "@/data/discoveryRules";
import { BASELINE_DETECTORS, DEFAULT_DETECTORS, detectOnDay, runDiscovery } from "./engine";
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

describe("moisture-divergence SMAP L4 fallback (D-015)", () => {
  const md = DEFAULT_DETECTORS["moisture-divergence"];
  // June limits: surface must fall by ≥ 0.04 in 14 days, root zone may move ≤ 0.02.
  const l4Ctx = { ...ctx, moistureFallback: { source: "smap_l4" as const, surfaceDepthCm: 5, deepDepthCm: 100,
    minSurfaceDropByMonth: Array(12).fill(0.04), maxDeepChangeByMonth: Array(12).fill(0.02), basis: "test L4 history" } };
  /** L4 surface 0.30 for days 0–14 then falling linearly by `drop` to day 28; root zone falls by `rootDrop`. */
  const l4Days = (drop: number, rootDrop = 0): DaySpec[] => Array.from({ length: 29 }, (_, i) => ({
    l4s: i <= 14 ? 0.3 : 0.3 - ((i - 14) * drop) / 14,
    l4r: i <= 14 ? 0.3 : 0.3 - ((i - 14) * rootDrop) / 14,
  }));

  it("with no station probes, uses SMAP L4 layers and the month's calibrated limits; labelled as a fallback", () => {
    const r = md(makeDays(START, l4Days(0.05)), l4Ctx);
    if (typeof r === "string") throw new Error(`expected an alarm, got ${r}`);
    expect(r.signals[0]).toMatchObject({ source: "smap_l4", depthCm: 5, statistic: "change" });
    expect(r.signals[0].observed).toBeCloseTo(-0.05, 6);
    expect(r.signals[1]).toMatchObject({ source: "smap_l4", depthCm: 100 });
    expect(r.signals[0].rule).toContain("test L4 history");
    expect(r.spatialSupport).toBe("grid-cell");
    expect(r.detectorVersion).toMatch(/\+smap-l4-fallback$/);
    expect(r.confidence).toBe(DISCOVERY_RULES.rainSatelliteFallback.confidence);
  });

  it("says no when the topsoil drop is within the usual range or the root zone also moves a lot", () => {
    expect(md(makeDays(START, l4Days(0.03)), l4Ctx)).toBe("no");
    expect(md(makeDays(START, l4Days(0.05, 0.03)), l4Ctx)).toBe("no");
  });

  it("stays unknown without the fallback settings, and keeps station probes first", () => {
    expect(md(makeDays(START, l4Days(0.05)), ctx)).toBe("unknown");
    const both = divergenceDays(0.06).map((s, i) => ({ ...s, ...l4Days(0)[i] }));
    const r = md(makeDays(START, both), l4Ctx);
    if (typeof r === "string") throw new Error(`expected an alarm, got ${r}`);
    expect(r.signals[0].source).toBe("station");
  });
});

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

describe("rain-departure satellite fallback (D-006)", () => {
  const rain = DEFAULT_DETECTORS["rain-departure"];
  /** IMERG normal of 300 mm every month → 140 mm expected over 14 June days. */
  const satCtx = { ...ctx, rainNormals: { imerg: { monthlyMm: Array(12).fill(300), basis: "test IMERG normal" } } };
  const imergOnly = (total: number): DaySpec[] => Array.from({ length: 14 }, (_, i) => ({ imerg: i === 0 ? total : 0 }));

  it("with no gauge in the window, compares IMERG with IMERG's own normal and labels the alarm", () => {
    const r = rain(makeDays(START, imergOnly(50)), satCtx);
    if (typeof r === "string") throw new Error(`expected an alarm, got ${r}`);
    expect(r.signals).toHaveLength(1);
    expect(r.signals[0]).toMatchObject({ variable: "precipitation", source: "imerg", statistic: "total", observed: 50, baselineKind: "climatology", unit: "mm" });
    expect(r.signals[0].baseline).toBeCloseTo(140, 6);
    expect(r.signals[0].rule).toContain("test IMERG normal");
    expect(r.spatialSupport).toBe("grid-cell");
    expect(r.detectorVersion).toMatch(/\+satellite-fallback$/);
    expect(r.coverage).toContainEqual({ variable: "precipitation", source: "station", daysWithData: 0, daysInWindow: 14 });
    expect(r.confidence).toBe(DISCOVERY_RULES.rainSatelliteFallback.confidence);
    expect(r.confidence).toBeLessThan(0.6);
  });

  it("stays unknown without a normal from the same source (never IMERG vs the station normal)", () => {
    expect(rain(makeDays(START, imergOnly(50)), ctx)).toBe("unknown");
  });

  it("says no inside the normal range", () => {
    expect(rain(makeDays(START, imergOnly(140)), satCtx)).toBe("no");
  });

  it("does not treat a missing satellite day as zero rain", () => {
    const specs = imergOnly(50);
    specs[4] = { imerg: null };
    expect(rain(makeDays(START, specs), satCtx)).toBe("unknown");
  });

  it("keeps the station first: any usable gauge day leaves the decision to the gauge rule", () => {
    const gappy = rainDays(50, 48);
    for (let k = 1; k <= 5; k++) gappy[k] = { ...gappy[k], rain: null }; // 5 gaps > 2 fillable
    expect(rain(makeDays(START, gappy), satCtx)).toBe("unknown");
    const r = rain(makeDays(START, rainDays(50, 48)), satCtx);
    if (typeof r === "string") throw new Error(`expected an alarm, got ${r}`);
    expect(r.signals[0].source).toBe("station");
    expect(r.detectorVersion).not.toMatch(/satellite-fallback/);
  });

  it("falls back when the station sent only missing values (a full outage)", () => {
    const outage = imergOnly(50).map((s) => ({ ...s, rain: null }));
    expect(typeof rain(makeDays(START, outage), satCtx)).toBe("object");
  });
  describe("calibrated per-month limits and a field's own fallback source (D-013)", () => {
    // POWER normal 300 mm every month → 140 mm expected over 14 June days; June limits 0.2 and 2.5.
    const low = Array(12).fill(0.2);
    const high = Array(12).fill(2.5);
    const powerCtx = {
      ...ctx,
      rainFallbackSource: "power" as const,
      rainNormals: { power: { monthlyMm: Array(12).fill(300), basis: "test POWER normal", lowRatioByMonth: low, highRatioByMonth: high, thresholdBasis: "test p5/p95" } },
    };
    const powerOnly = (total: number): DaySpec[] => Array.from({ length: 14 }, (_, i) => ({ power: i === 0 ? total : 0 }));

    it("uses the field's source and the window-end month's limits instead of the fixed 0.45 / 1.7", () => {
      expect(rain(makeDays(START, powerOnly(50)), powerCtx)).toBe("no"); // ratio 0.36: below 0.45, above 0.2
      const r = rain(makeDays(START, powerOnly(20)), powerCtx); // ratio 0.14 < 0.2
      if (typeof r === "string") throw new Error(`expected an alarm, got ${r}`);
      expect(r.signals[0]).toMatchObject({ source: "power", observed: 20 });
      expect(r.signals[0].rule).toContain("ratio < 0.2 or ratio > 2.5");
      expect(r.signals[0].rule).toContain("test p5/p95");
      expect(rain(makeDays(START, powerOnly(300)), powerCtx)).toBe("no"); // ratio 2.14 < 2.5
      expect(typeof rain(makeDays(START, powerOnly(400)), powerCtx)).toBe("object"); // ratio 2.86
    });

    it("flags a season-long drought with the 90-day window when every 14-day window is within limits", () => {
      // 90 days at 40 % of normal, rain spread evenly: each 14-day ratio is 0.4 (> 0.2), the 90-day ratio 0.4 < 0.5.
      const drought = { ...powerCtx, rainNormals: { power: { ...powerCtx.rainNormals.power, longLowRatioByMonth: Array(12).fill(0.5), longWindowDays: 90 } } };
      const spread: DaySpec[] = Array.from({ length: 90 }, () => ({ power: (300 / 30) * 0.4 }));
      const r = rain(makeDays("2026-03-01", spread), drought);
      if (typeof r === "string") throw new Error(`expected an alarm, got ${r}`);
      expect(r.window.start).toBe("2026-03-01");
      expect(r.signals[0].rule).toContain("90-day ratio < 0.5");
      expect(r.signals[0].observed).toBeCloseTo(360, 6);
      expect(rain(makeDays("2026-03-01", spread), powerCtx)).toBe("no"); // no long limits: 14-day rule only
    });

    it("without per-month limits keeps the fixed thresholds (unchanged behaviour)", () => {
      const fixed = { ...powerCtx, rainNormals: { power: { monthlyMm: Array(12).fill(300), basis: "fixed" } } };
      expect(typeof rain(makeDays(START, powerOnly(50)), fixed)).toBe("object"); // 0.36 < 0.45
    });
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

  // Planted 30 days after START, so day 45 is development (day 15 after planting).
  const late = { ...ctx, plantedOn: "2026-07-01" };

  it("is unknown when the previous composite is more than maxGapDays old (e.g. a cloud gap)", () => {
    const gap = DISCOVERY_RULES.ndviChange.maxGapDays;
    const days = makeDays(START, ndviDays(45 - gap - 1, 45, 0.5, 0.45));
    expect(DEFAULT_DETECTORS["ndvi-change"](days, late)).toBe("unknown");
  });

  it("reads the NDVI source named in the context (e.g. HLS for a small plot); MODIS stays the default", () => {
    const hlsDays = makeDays(START, ndviDays(5, 21, 0.5, 0.45)).map((d) => ({
      ...d, values: d.values.map((v) => (v.variable === "ndvi" ? { ...v, source: "hls" as const } : v)),
    }));
    const [r] = of("ndvi-change", detectOnDay(hlsDays, 21, { ...ctx, ndviSource: "hls" }));
    expect(r.signals[0]).toMatchObject({ variable: "ndvi", source: "hls" });
    expect(r.coverage[0]).toMatchObject({ source: "hls" });
    expect(DEFAULT_DETECTORS["ndvi-change"](hlsDays, ctx)).toBe("unknown"); // default reads MODIS: none here
  });

  describe("below-normal rule for a field without a crop calendar (D-016)", () => {
    // Composites on day 0, 16 and 32 (2026-06-01, 06-17, 07-03). Normal's 10th percentile 0.5 for every day of year.
    const lowByDoy = Object.fromEntries(Array.from({ length: 366 }, (_, k) => [k + 1, 0.5]));
    const nCtx = { ...ctx, plantedOn: "2030-01-01", ndviNormal: { lowByDayOfYear: lowByDoy, basis: "test MODIS 2001–2023 p10" } };
    const comp = (a: number, b: number, c: number): DaySpec[] => Array.from({ length: 33 }, (_, i) => (i === 0 ? { ndvi: a } : i === 16 ? { ndvi: b } : i === 32 ? { ndvi: c } : {}));

    it("alarms when a new composite is below the 10th percentile of its date, whatever the crop stage", () => {
      const [r] = of("ndvi-change", detectOnDay(makeDays(START, comp(0.7, 0.68, 0.45)), 32, nCtx));
      expect(r.signals[0]).toMatchObject({ variable: "ndvi", source: "modis", statistic: "mean", observed: 0.45, baseline: 0.5, baselineKind: "climatology" });
      expect(r.signals[0].rule).toContain("test MODIS 2001–2023 p10");
    });

    it("says no at or above the limit, even after a drop that the change rule would flag", () => {
      expect(DEFAULT_DETECTORS["ndvi-change"](makeDays(START, comp(0.8, 0.8, 0.55)), nCtx)).toBe("no");
    });

    it("is unknown on a day of year the normal does not cover", () => {
      const partial = { ...nCtx, ndviNormal: { lowByDayOfYear: { 1: 0.5 }, basis: "x" } };
      expect(DEFAULT_DETECTORS["ndvi-change"](makeDays(START, comp(0.7, 0.68, 0.45)), partial)).toBe("unknown");
    });
  });

  it("with several seasons, gates on the season the day belongs to", () => {
    // Composites on days 0, 25, 45 (2026-06-01 + 45 = 2026-07-16); drop on day 45.
    const days = makeDays(START, ndviDays(25, 45, 0.5, 0.45));
    const s1 = { crop: ctx.crop, plantedOn: "2026-04-01" }; // day 45 is 106 days after: post-harvest
    const s2 = { crop: ctx.crop, plantedOn: "2026-07-01" }; // day 45 is day 15: development
    expect(of("ndvi-change", detectOnDay(days, 45, { ...ctx, seasons: [s1, s2] }))).toHaveLength(1);
    expect(DEFAULT_DETECTORS["ndvi-change"](days, { ...ctx, seasons: [s1] })).toBe("no");
  });

  it("still compares composites exactly maxGapDays apart", () => {
    const gap = DISCOVERY_RULES.ndviChange.maxGapDays;
    expect(of("ndvi-change", detectOnDay(makeDays(START, ndviDays(45 - gap, 45, 0.5, 0.45)), 45, late))).toHaveLength(1);
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
