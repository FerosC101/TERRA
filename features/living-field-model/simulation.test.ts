import { describe, expect, it } from "vitest";
import { CROPS } from "@/data/crops";
import { FIELDS } from "@/data/fields";
import { buildFieldSceneState } from "./simulation";
import type { ModelState } from "./state";

const field = FIELDS[0];
const state = {
  at: {
    date: "2026-11-14",
    storageMm: 110,
    surfaceVwc: 27,
    deepVwc: 31,
    soilTempC: 26,
    ecDsM: 0.4,
    rainMm: 2,
    tmaxC: 30,
    et0Mm: 4,
    etcMm: 4.2,
  },
  capacityMm: 200,
  crop: CROPS[field.currentCrop],
  dap: 50,
  ndviAt: { date: "2026-11-10", ndvi: 0.72 },
} as ModelState;

describe("field simulation isolation", () => {
  it("preserves field-record metrics and NDVI date", () => {
    const s = buildFieldSceneState(field, state, "record");
    expect(s.metrics.storageMm).toBe(110);
    expect(s.metrics.etcMm).toBe(4.2);
    expect(s.ndviDate).toBe("2026-11-10");
    expect(s.isSimulated).toBe(false);
  });

  it("applies overrides after scenario defaults without editing the observation", () => {
    const before = JSON.stringify(state);
    const s = buildFieldSceneState(field, state, "monsoon", { rainMm: 0 });
    expect(s.metrics.rainMm).toBe(0);
    expect(s.metrics.storageMm).toBe(192);
    expect(s.isSimulated).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("handles zero capacity and missing NDVI honestly", () => {
    const s = buildFieldSceneState(
      field,
      { ...state, capacityMm: 0, ndviAt: undefined },
      "record",
    );
    expect(s.metrics.storageRatio).toBe(0);
    expect(s.metrics.ndvi).toBeUndefined();
    expect(s.crop.canopyVigor).toBeNull();
  });

  it("clamps explicit controls and restores record values on reset", () => {
    expect(
      buildFieldSceneState(field, state, "record", { storageMm: 999 }).metrics
        .storageMm,
    ).toBe(200);
    expect(
      buildFieldSceneState(field, state, "record", {}).metrics.storageMm,
    ).toBe(110);
  });

  it("recomputes crop stage and demand for a crop override", () => {
    const s = buildFieldSceneState(field, state, "record", {
      cropId: "fallow",
      dap: 20,
    });
    expect(s.crop.id).toBe("fallow");
    expect(s.metrics.etcMm).toBe(1);
  });
});
