import { describe, expect, it } from "vitest";
import { FIELDS } from "@/data/fields";
import { sourcesForField } from "@/data/sources";
import { obsProvenance } from "@/lib/provenance";
import { discoveriesFor, mockFieldModel } from "./discoveryService";
import { livingFieldModel } from "./fieldModelService";
import { fieldObservations } from "./observationSource";

const plotA = FIELDS.find((f) => f.id === "lipa-plot-a")!;

describe("observations and model states share one calendar", () => {
  for (const f of FIELDS) {
    it(`${f.id}: model observations line up with the Living Field Model, day by day`, () => {
      const obs = mockFieldModel(f.id).observations;
      const states = livingFieldModel(f, fieldObservations(f));
      expect(obs.map((o) => o.date)).toEqual(states.map((s) => s.date));
    });
  }
});

describe("Plot A in the app", () => {
  it("is a farm site with a planned station and a fallow status", () => {
    expect(plotA.role).toBe("farm");
    expect(plotA.station.status).toBe("planned");
    expect(plotA.fallow?.since).toBe("2025-09-15");
  });

  it("runs the Discovery Engine on its real record with HLS NDVI and the farmer's seasons", () => {
    const ds = discoveriesFor(plotA, fieldObservations(plotA));
    expect(ds.length).toBeGreaterThan(0);
    expect(ds.every((d) => d.fieldId === "lipa-plot-a")).toBe(true);
  });

  it("labels station readings as a simulation and NASA values by their kind", () => {
    const last = fieldObservations(plotA).at(-1)!;
    expect(obsProvenance(plotA, "surfaceVwc")).toBe("simulated");
    expect(obsProvenance(plotA, "ecDsM")).toBe("simulated");
    expect(obsProvenance(plotA, "tmaxC")).toBe("model");
    expect(obsProvenance(plotA, "ndvi")).toBe("satellite");
    // 31 Dec 2025: IMERG Final has ended, so that day's rain is NASA POWER, a model
    expect(last.rainImergMm).toBeNull();
    expect(obsProvenance(plotA, "rainMm", last)).toBe("model");
  });

  it("marks the sources in its record as real and the station as not installed", () => {
    const src = Object.fromEntries(sourcesForField("lipa-plot-a").map((s) => [s.id, s]));
    expect(src.hls.integration).toBe("snapshot");
    expect(src.smap_l4.integration).toBe("snapshot");
    expect(src.modis.integration).toBe("demo");
    expect(src.station.statusNote).toMatch(/Not installed/);
  });

  it("relationships use real series only (no simulated EC or soil temperature)", () => {
    const labels = mockFieldModel("lipa-plot-a").relationships.map((r) => r.label).join(" | ");
    expect(labels).not.toMatch(/EC|soil temperature/i);
    expect(labels).toMatch(/SMAP L4/);
  });
});
