import { describe, expect, it } from "vitest";
import { CROPS } from "@/data/crops";
import { FIELDS } from "@/data/fields";
import { INDICATIVE_SOIL } from "@/data/soils";
import { generateSyntheticFieldDays } from "@/lib/demo/syntheticFieldDays";
import { nudge, runFieldModel } from "./state";

describe("nudge", () => {
  it("moves a layer towards a reading by the uncertainty weight and lowers its uncertainty", () => {
    // sdModel 0.02 = sdStation 0.02 → k = 0.5: halfway; sd = sqrt(0.25·0.0004 + 0.25·0.0004) = 0.01414
    const n = nudge({ vwc: 0.30, sd: 0.02, lastReading: null }, 0.20, "station", "2026-06-01");
    expect(n.vwc).toBeCloseTo(0.25, 9);
    expect(n.sd).toBeCloseTo(0.014142, 5);
    expect(n.lastReading).toEqual({ source: "station", date: "2026-06-01" });
  });
});

describe("runFieldModel", () => {
  const field = FIELDS.find((f) => f.id === "riverside")!;
  const crop = CROPS[field.currentCrop];
  const { days } = generateSyntheticFieldDays({ fieldId: field.id, start: "2026-06-01", days: 60, seed: 3, climate: field.climate, crop, plantedOn: "2026-06-10" });
  const states = runFieldModel(days, { crop, plantedOn: "2026-06-10", soil: INDICATIVE_SOIL });

  it("gives one state per day, corrected by the station when it reports", () => {
    expect(states).toHaveLength(days.length);
    expect(states.at(-1)!.surface.lastReading?.source).toBe("station");
    expect(states.at(-1)!.rain.source).toBe("station");
  });

  it("grows uncertainty on days without readings", () => {
    const noStation = days.map((d) => ({ ...d, values: d.values.filter((v) => v.source !== "station" && v.source !== "smap") }));
    const s = runFieldModel(noStation, { crop, plantedOn: "2026-06-10", soil: INDICATIVE_SOIL });
    expect(s.at(-1)!.surface.sd).toBeGreaterThan(s[0].surface.sd);
    expect(s.at(-1)!.surface.lastReading).toBeNull();
  });
});

describe("runFieldModel with SMAP L4 (D-017)", () => {
  // Hand-written record: 10 days, no rain and no ET (et0 0) so the water balance alone keeps the soil at FC,
  // SMAP L4 every day at surface 0.20 and root zone 0.25, SMAP L3 at 0.50 on day 5.
  const crop = CROPS.corn;
  const day = (i: number) => `2026-06-${String(i + 1).padStart(2, "0")}`;
  const val = (date: string, variable: string, source: string, depthCm: number | null, value: number, aggregation = "mean") => ({
    variable, source, depthCm, value, aggregation, unit: variable === "soil_moisture" ? "m3/m3" : "mm/day", product: "t",
    provenance: "model", quality: "ok", period: { start: `${date}T00:00:00Z`, end: `${date}T12:00:00Z` },
  });
  const days = Array.from({ length: 10 }, (_, i) => ({
    fieldId: "f", date: day(i), values: [
      val(day(i), "precipitation", "power", null, 0, "total"), val(day(i), "et0", "power", null, 0, "total"),
      val(day(i), "soil_moisture", "smap_l4", 5, 0.2), val(day(i), "soil_moisture", "smap_l4", 100, 0.25),
      ...(i === 5 ? [val(day(i), "soil_moisture", "smap", null, 0.5, "instant")] : []),
    ],
  })) as never;
  // Identity mapping (a = 0, b = 1): mapped surface 0.20, root zone 0.25 → deep (0.25·1.0 − 0.20·0.1)/0.9 = 0.2556.
  const l4 = { source: "smap_l4" as const, surfaceDepthCm: 5, rootDepthCm: 100, surface: { a: 0, b: 1 }, root: { a: 0, b: 1 } };

  it("corrects both layers from SMAP L4 (rescaled), and prefers L4 over SMAP L3 for the surface", () => {
    const s = runFieldModel(days, { crop, plantedOn: "2026-06-01", soil: INDICATIVE_SOIL, l4 });
    expect(s.every((x) => x.surface.lastReading?.source === "smap_l4" && x.deep.lastReading?.source === "smap_l4")).toBe(true);
    expect(s.at(-1)!.surface.vwc).toBeLessThan(INDICATIVE_SOIL.fc - 0.05); // pulled from FC 0.32 towards 0.20
    expect(s.at(-1)!.deep.vwc).toBeLessThan(0.3);
    expect(s.at(-1)!.deep.vwc).toBeGreaterThan(0.2556 - 0.01);
  });

  it("without L4 settings keeps the old behaviour (SMAP L3 corrects the surface only)", () => {
    const s = runFieldModel(days, { crop, plantedOn: "2026-06-01", soil: INDICATIVE_SOIL });
    expect(s[5].surface.lastReading?.source).toBe("smap");
    expect(s.at(-1)!.deep.lastReading).toBeNull();
  });
});
