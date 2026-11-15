import { describe, expect, it } from "vitest";
import { CROPS } from "@/data/crops";
import { FIELDS } from "@/data/fields";
import { calloutsFor } from "./sceneCallouts";
import { buildFieldSceneState } from "./simulation";
import type { ModelState } from "./state";

const field = FIELDS[0];
const state = {
  at: { date: "2026-11-14", storageMm: 110, surfaceVwc: 27, deepVwc: 31, soilTempC: 26, ecDsM: 0.4, rainMm: 0, tmaxC: 30, et0Mm: 4, etcMm: 4.2 },
  capacityMm: 200,
  crop: CROPS[field.currentCrop],
  dap: 50,
  ndviAt: { date: "2026-11-10", ndvi: 0.72 },
} as ModelState;

describe("scene callouts", () => {
  it("labels field-record readings by their real source", () => {
    const water = calloutsFor("water", buildFieldSceneState(field, state, "record"));
    const byId = Object.fromEntries(water.map((c) => [c.id, c]));
    expect(byId.storage.value).toBe("110 mm");
    expect(byId.storage.source).toBe("model");
    expect(byId.vwc10.source).toBe("measurement");
  });

  it("labels every reading as a simulation under a scenario", () => {
    const view = buildFieldSceneState(field, state, "monsoon");
    for (const dim of ["water", "soil", "vegetation", "climate"] as const) {
      for (const c of calloutsFor(dim, view)) if (c.source) expect(c.source).toBe("simulated");
    }
  });

  it("shows rain or sun from the day's rain gauge", () => {
    expect(calloutsFor("climate", buildFieldSceneState(field, state, "record"))[0].value).toBe("Dry and sunny");
    expect(calloutsFor("climate", buildFieldSceneState(field, state, "record", { rainMm: 12 }))[0].value).toBe("Rain");
  });

  it("gives one card per past season in the rotation view", () => {
    const cards = calloutsFor("rotation", buildFieldSceneState(field, state, "record"));
    expect(cards).toHaveLength(field.rotationHistory.length);
  });
});
