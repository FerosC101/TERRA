import { describe, expect, it } from "vitest";
import { CROPS } from "@/data/crops";
import { LIPA_PLOT_A_CROP_SEASONS } from "@/data/cropCalendar";
import { realRecord } from "@/data/nasa/realRecords";
import { LIPA_PLOT_A_SOILGRIDS_SOIL } from "@/data/soils";
import { simulatePlannedStation } from "@/lib/demo/stationModel";
import { seriesOf } from "@/lib/science/discovery/engine";
import { runFieldModel } from "@/lib/science/fieldModel/state";
import { realMonthlyAnomalies, realObservations } from "./realObservations";

const days = realRecord("lipa-plot-a")!;
const states = runFieldModel(days, { crop: CROPS.corn, plantedOn: "2025-06-05", soil: LIPA_PLOT_A_SOILGRIDS_SOIL, seasons: LIPA_PLOT_A_CROP_SEASONS });
const rows = realObservations(days, states, { ndviSource: "hls", stationSeed: 5203 });

describe("realObservations (Plot A)", () => {
  it("keeps the record's own dates, one row per model state", () => {
    expect(rows.map((r) => r.date)).toEqual(states.map((s) => s.date));
    expect(rows[0].date).toBe("2024-01-01");
    expect(rows.at(-1)!.date).toBe("2025-12-31");
  });

  it("carries the real NASA values unchanged (rounded)", () => {
    const imerg = seriesOf(days, "precipitation", "imerg", null);
    const power = seriesOf(days, "precipitation", "power", null);
    const ndvi = seriesOf(days, "ndvi", "hls", null);
    rows.forEach((r, k) => {
      expect(r.rainMm).toBe(Math.round(((imerg[k] ?? power[k]) as number) * 10) / 10);
      expect(r.rainImergMm === null).toBe(imerg[k] === null);
      expect(r.ndvi === null).toBe(ndvi[k] === null);
    });
    // 12 HLS clear passes over the plot, 1 of them before the record starts (export-lipa-record counts)
    expect(rows.filter((r) => r.ndvi !== null)).toHaveLength(11);
  });

  it("shows root-zone water from the model and stays within the soil's limits", () => {
    rows.forEach((r, k) => expect(r.storageMm).toBeCloseTo(states[k].water.tawMm - states[k].water.depletionMm, 1));
    expect(Math.max(...rows.map((r) => r.storageMm))).toBeLessThanOrEqual(76.01);
  });

  it("refuses states that do not match the record's days", () => {
    expect(() => realObservations(days, states.slice(1), { ndviSource: "hls", stationSeed: 1 })).toThrow(/must cover/);
  });
});

describe("simulatePlannedStation", () => {
  const input = rows.slice(0, 60).map((r) => ({ date: r.date, rainMm: r.rainMm, etcMm: r.etcMm, tmaxC: r.tmaxC }));
  it("is reproducible for a seed and responds to the weather", () => {
    expect(simulatePlannedStation(input, 7)).toEqual(simulatePlannedStation(input, 7));
    const dry = simulatePlannedStation(input.map((d) => ({ ...d, rainMm: 0 })), 7);
    const wet = simulatePlannedStation(input.map((d) => ({ ...d, rainMm: 20 })), 7);
    expect(dry.at(-1)!.surfaceVwc).toBeLessThan(wet.at(-1)!.surfaceVwc);
  });
});

describe("realMonthlyAnomalies", () => {
  it("gives one departure per complete month, from real POWER rain against its normal", () => {
    const normal = Array(12).fill(100);
    const a = realMonthlyAnomalies(days, normal, Array(12).fill(30));
    expect(a).toHaveLength(24);
    const power = seriesOf(days, "precipitation", "power", null);
    const jan24 = days.reduce((s, d, k) => (d.date.startsWith("2024-01") ? s + (power[k] ?? 0) : s), 0);
    expect(a[0]).toMatchObject({ month: "Jan 24", rainAnomalyPct: Math.round(jan24 - 100) });
  });
});
