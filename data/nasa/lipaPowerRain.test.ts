import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIPA_POWER_RAIN_NORMAL } from "./lipaPowerRain";

const JSON_FILE = "docs/Data Pipeline/data/external/power_history/rain_calibration_lipa.json";

describe("LIPA_POWER_RAIN_NORMAL", () => {
  it("matches the calibration output (normal, per-month limits)", () => {
    const c = JSON.parse(readFileSync(JSON_FILE, "utf8"));
    expect(c.window_days).toBe(14);
    expect(c.percentiles).toEqual([5, 95]);
    expect(LIPA_POWER_RAIN_NORMAL.monthlyMm).toEqual(c.monthly_normal_mm);
    expect(LIPA_POWER_RAIN_NORMAL.lowRatioByMonth).toEqual(c.low_ratio_by_month);
    expect(LIPA_POWER_RAIN_NORMAL.highRatioByMonth).toEqual(c.high_ratio_by_month);
    expect(LIPA_POWER_RAIN_NORMAL.longWindowDays).toBe(c.long_window_days);
    expect(LIPA_POWER_RAIN_NORMAL.longLowRatioByMonth).toEqual(c.long_low_ratio_by_month);
  });
});
