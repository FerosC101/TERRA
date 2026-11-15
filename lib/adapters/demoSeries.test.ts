import { describe, expect, it } from "vitest";
import { FIELDS } from "@/data/fields";
import { generateSeries } from "@/lib/demo/series";
import { validateDays } from "@/lib/science/discovery/engine";
import { seriesToFieldDays } from "./demoSeries";

describe("seriesToFieldDays", () => {
  const field = FIELDS.find((f) => f.id === "riverside")!;
  const obs = generateSeries(field);
  const days = seriesToFieldDays(obs, field);

  it("gives a valid record, every value simulated", () => {
    expect(() => validateDays(days, field.id)).not.toThrow();
    expect(days).toHaveLength(obs.length);
    expect(days.flatMap((d) => d.values).every((v) => v.provenance === "simulated")).toBe(true);
  });

  it("converts soil moisture from % to m3/m3", () => {
    const v = days[0].values.find((x) => x.variable === "soil_moisture" && x.depthCm === 10)!;
    expect(v.value).toBeCloseTo(obs[0].surfaceVwc / 100, 10);
  });
});
