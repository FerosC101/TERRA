import { describe, expect, it } from "vitest";
import { realRecord } from "@/data/nasa/realRecords";
import { seriesOf } from "@/lib/science/discovery/engine";
import { discoveriesFor, discoveryInput } from "./discoveryService";
import { mockField } from "./fieldSensorService";
import { fieldObservations } from "./observationSource";

const cardsFor = (id: string) => { const f = mockField(id); return discoveriesFor(f, fieldObservations(f)); };
const simulated = (d: { observations: { provenance: string }[] }) => d.observations.some((o) => o.provenance === "simulated");

describe("discoveriesFor on the real Lipa record", () => {
  const ds = cardsFor("lipa-cropland");
  const rain = ds.filter((d) => d.kind === "rain-departure");

  it("lists every rain onset, newest first, including the 2024 season-long drought", () => {
    expect(rain).toHaveLength(16);
    expect(ds.map((d) => d.detectedOn)).toEqual([...ds.map((d) => d.detectedOn)].sort().reverse());
    const drought = rain.find((d) => d.detectedOn === "2024-04-15")!;
    expect(drought.title).toBe("Rainfall well below normal");
    expect(drought.summary).toMatch(/^The 90 days to 15 Apr 2024 brought/);
    expect(drought.comparison.label).toBe("90-day rainfall");
  });

  it("words POWER rain as a model estimate and never as simulated", () => {
    for (const d of rain) {
      expect(d.observations[0].label).toMatch(/^Modelled \(NASA POWER\) rain, \d+ days$/);
      expect(simulated(d)).toBe(false);
    }
  });

  it("runs the other three rules on SIMULATED / ASSUMED inputs and says so on every such card (D-020)", () => {
    const kinds = new Set(ds.map((d) => d.kind));
    expect(kinds).toEqual(new Set(["rain-departure", "moisture-divergence", "ndvi-change", "sensor-offset"]));
    for (const d of ds.filter((x) => x.kind !== "rain-departure")) {
      expect(simulated(d)).toBe(true);
      expect(d.title).toMatch(/simulated|assumed/);
      expect(d.confidenceNote).toContain("D-020");
      expect(d.confidence).toBeLessThan(0.5);
    }
  });

  it("never adds simulated values to the real record the Living Field Model reads", () => {
    const f = mockField("lipa-cropland");
    const { days } = discoveryInput(f, fieldObservations(f));
    expect(seriesOf(days, "soil_moisture", "station", 10).every((v) => v !== null)).toBe(true);
    expect(seriesOf(realRecord(f.id)!, "soil_moisture", "station", 10).every((v) => v === null)).toBe(true);
  });

  it("a demo field still shows only the latest alarm of each detector", () => {
    const demo = cardsFor("riverside");
    expect(new Set(demo.map((d) => d.kind)).size).toBe(demo.length);
  });
});
