import { describe, expect, it } from "vitest";
import { detectorReport } from "./detectorStatusService";
import { mockField } from "./fieldSensorService";

describe("detector report", () => {
  it("Lipa Cropland: rain runs on POWER with calibrated limits; the other three run on simulated or assumed inputs (D-020)", () => {
    const r = detectorReport(mockField("lipa-cropland"));
    expect(r.real).toBe(true);
    expect([r.recordStart, r.recordEnd]).toEqual(["2024-01-01", "2025-12-31"]);
    const by = Object.fromEntries(r.detectors.map((d) => [d.kind, d]));
    expect(by["rain-departure"].blocked).toBeUndefined();
    expect(by["rain-departure"].onsets).toBe(16);
    expect(by["rain-departure"].rule).toContain("NASA POWER");
    expect(by["rain-departure"].rule).not.toContain("45%");
    expect(by["rain-departure"].simulatedInput).toBeUndefined();
    for (const k of ["moisture-divergence", "ndvi-change", "sensor-offset"]) {
      expect(by[k].blocked).toBeUndefined();
      expect(by[k].simulatedInput).toMatch(/SIMULATED|ASSUMED/);
      expect(by[k].decidedDays).toBeGreaterThan(0);
    }
  });

  it("a demo field states the fixed demonstration limits and has no blocked rule for moisture", () => {
    const r = detectorReport(mockField("riverside"));
    expect(r.real).toBe(false);
    const rain = r.detectors.find((d) => d.kind === "rain-departure")!;
    expect(rain.rule).toContain("Fixed demonstration limits");
    expect(r.detectors.find((d) => d.kind === "moisture-divergence")!.blocked).toBeUndefined();
  });
});
