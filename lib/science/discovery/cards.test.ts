import { describe, expect, it } from "vitest";
import { CROPS } from "@/data/crops";
import { FIELDS } from "@/data/fields";
import { generateSyntheticFieldDays } from "@/lib/demo/syntheticFieldDays";
import { runDiscovery } from "./engine";
import { toDiscovery } from "./cards";

describe("toDiscovery", () => {
  const field = FIELDS.find((f) => f.id === "riverside")!;
  const { days } = generateSyntheticFieldDays({
    fieldId: field.id, start: "2026-06-01", days: 120, seed: 7, climate: field.climate,
    crop: CROPS[field.currentCrop], plantedOn: "2026-06-10",
    events: [{ kind: "dry-spell", startDay: 60, days: 20 }],
  });
  const records = runDiscovery(days, {
    fieldId: field.id, location: field.center, monthlyRainMm: field.climate.rainMm,
    crop: CROPS[field.currentCrop], plantedOn: "2026-06-10", runAt: "2026-11-15T00:00:00Z",
  });

  it("turns a rain alarm into a card whose evidence keeps the data's provenance", () => {
    const rain = records.find((r) => r.detector === "rain-departure")!;
    const d = toDiscovery(rain, days, field);
    expect(d.detectedOn).toBe(rain.window.end);
    expect(d.status).toBe("new");
    expect(d.observations[0].provenance).toBe("simulated");
    expect(d.stages.map((s) => s.state)).toEqual(["done", "done", "active", "pending", "pending"]);
  });

  it("marks a discovery resolved once a follow-up is logged", () => {
    const rec = records.find((r) => r.detector === "moisture-divergence") ?? records[0];
    const first = toDiscovery(rec, days, field);
    const d = toDiscovery(rec, days, field, [{ discoveryId: first.id, date: rec.window.end, surfaceVwc: 15, deepVwc: 30 }]);
    expect(d.status).toBe("resolved");
    expect(d.confirmed).toHaveLength(1);
  });
});
