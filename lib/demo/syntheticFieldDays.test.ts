import { describe, expect, it } from "vitest";
import { CROPS } from "@/data/crops";
import { FIELDS } from "@/data/fields";

/** Illustrative Cagayan Valley climatology, picked by field id (FIELDS[0] differs between branches). */
const CLIMATE = FIELDS.find((f) => f.id === "riverside")!.climate;
import type { AnyObservationValue, FieldDay } from "@/types/discovery-contract";
import { generateSyntheticFieldDays, type SyntheticOptions } from "./syntheticFieldDays";

const BASE: SyntheticOptions = {
  fieldId: "synthetic-1",
  start: "2026-05-01",
  days: 120,
  seed: 42,
  climate: CLIMATE,
  crop: CROPS.corn,
  plantedOn: "2026-06-01",
};

const pick = (d: FieldDay, variable: string, source: string, depthCm: number | null = null) =>
  d.values.find((v) => v.variable === variable && v.source === source && v.depthCm === depthCm);

describe("generateSyntheticFieldDays", () => {
  it("is reproducible from its seed", () => {
    expect(generateSyntheticFieldDays(BASE)).toEqual(generateSyntheticFieldDays(BASE));
    expect(generateSyntheticFieldDays({ ...BASE, seed: 43 }).days).not.toEqual(generateSyntheticFieldDays(BASE).days);
  });

  it("produces one FieldDay per consecutive local date", () => {
    const { days } = generateSyntheticFieldDays(BASE);
    expect(days).toHaveLength(120);
    expect(days[0].date).toBe("2026-05-01");
    expect(days[119].date).toBe("2026-08-28");
  });

  it("places every value on its local day by the D-002 rule (UTC+8)", () => {
    const H = 3600_000;
    const localDate = (ms: number) => new Date(ms + 8 * H).toISOString().slice(0, 10);
    for (const d of generateSyntheticFieldDays(BASE).days) {
      for (const v of d.values) {
        const s = Date.parse(v.period.start);
        const e = Date.parse(v.period.end);
        const anchor = e - s <= 24 * H ? (s + e) / 2 : e;
        expect(localDate(anchor), `${v.source}/${v.variable} on ${d.date}`).toBe(d.date);
      }
    }
  });

  it("labels every value as simulated, in canonical units and physical ranges", () => {
    const units: Record<string, string> = { soil_moisture: "m3/m3", precipitation: "mm/day", et0: "mm/day", air_temperature_max: "degC", ndvi: "dimensionless" };
    for (const d of generateSyntheticFieldDays(BASE).days) {
      for (const v of d.values as AnyObservationValue[]) {
        expect(v.provenance).toBe("simulated");
        expect(v.unit).toBe(units[v.variable]);
        expect(v.value).not.toBeNull();
        const x = v.value as number;
        if (v.variable === "soil_moisture") expect(x >= 0 && x <= 1).toBe(true);
        if (v.variable === "ndvi") expect(x >= -1 && x <= 1).toBe(true);
        if (v.variable === "precipitation" || v.variable === "et0") expect(x).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("reports SMAP every third day and an NDVI composite every 16th day", () => {
    const { days } = generateSyntheticFieldDays(BASE);
    expect(days.filter((d) => pick(d, "soil_moisture", "smap")).length).toBe(40);
    expect(days.filter((d) => pick(d, "ndvi", "modis")).map((d) => d.date).slice(0, 2)).toEqual(["2026-05-16", "2026-06-01"]);
  });

  it("injects a dry spell as zero gauge rain without disturbing earlier days", () => {
    const clean = generateSyntheticFieldDays(BASE);
    const dry = generateSyntheticFieldDays({ ...BASE, events: [{ kind: "dry-spell", startDay: 60, days: 20 }] });
    for (let i = 60; i < 80; i++) expect(pick(dry.days[i], "precipitation", "station")?.value).toBe(0);
    expect(dry.days.slice(0, 60)).toEqual(clean.days.slice(0, 60));
    expect(dry.events).toEqual([{ kind: "dry-spell", start: "2026-06-30", end: "2026-07-19", detectors: ["rain-departure", "moisture-divergence"] }]);
  });

  it("leaves values the event does not drive unchanged after it too (ET0, Tmax, NDVI)", () => {
    const clean = generateSyntheticFieldDays(BASE).days;
    const dry = generateSyntheticFieldDays({ ...BASE, events: [{ kind: "dry-spell", startDay: 60, days: 20 }] }).days;
    for (let i = 80; i < clean.length; i++) {
      for (const [variable, source] of [["et0", "power"], ["air_temperature_max", "power"], ["ndvi", "modis"]]) {
        expect(pick(dry[i], variable, source)).toEqual(pick(clean[i], variable, source));
      }
    }
  });

  it("dries the topsoil slowly under a full canopy (FAO-56 model): at most 0.0075 m3/m3 per day", () => {
    // Mid-season = record days 81–120. Hand bound: evaporation ≈ 0 under full cover; 10% of
    // ETc (≤ 1.2 × ~4.1 mm) from 100 mm ≈ 0.005 per day, plus sensor noise over 15 days.
    const { days } = generateSyntheticFieldDays({ ...BASE, events: [{ kind: "dry-spell", startDay: 85, days: 16 }] });
    const s = (i: number) => pick(days[i], "soil_moisture", "station", 10)?.value as number;
    expect((s(100) - s(85)) / 15).toBeGreaterThan(-0.0075);
  });

  it("keeps the earlier soil model available as 'demo-v1', reproducing its output exactly", () => {
    // Literals printed by the v1 generator before the change (seed 42, dry spell from day 100).
    const { days } = generateSyntheticFieldDays({ ...BASE, days: 115, soilModel: "demo-v1", events: [{ kind: "dry-spell", startDay: 100, days: 10 }] });
    expect((pick(days[101], "soil_moisture", "station", 10)?.value as number).toFixed(4)).toBe("0.2622");
    expect((pick(days[102], "soil_moisture", "station", 10)?.value as number).toFixed(4)).toBe("0.2411");
    expect((pick(days[101], "soil_moisture", "station", 40)?.value as number).toFixed(4)).toBe("0.3527");
  });

  it("marks every station reading missing during an outage, and keeps satellite values", () => {
    const { days } = generateSyntheticFieldDays({ ...BASE, missing: { outages: [{ startDay: 40, days: 5 }] } });
    for (let i = 40; i < 45; i++) {
      for (const v of days[i].values.filter((x) => x.source === "station")) {
        expect(v.value).toBeNull();
        expect(v.quality).toBe("missing");
      }
      expect(pick(days[i], "precipitation", "imerg")?.value).not.toBeNull();
    }
    expect(pick(days[45], "soil_moisture", "station", 10)?.value).not.toBeNull();
  });

  it("drops random station days without changing any value that is still reported", () => {
    const clean = generateSyntheticFieldDays(BASE).days;
    const gappy = generateSyntheticFieldDays({ ...BASE, missing: { rate: 0.1 } }).days;
    let missingDays = 0;
    gappy.forEach((d, i) => {
      if (pick(d, "soil_moisture", "station", 10)?.value === null) missingDays++;
      else expect(d).toEqual(clean[i]);
    });
    expect(missingDays).toBeGreaterThan(0);
  });

  it("injects a SMAP bias as an exact shift of every SMAP value", () => {
    const clean = generateSyntheticFieldDays(BASE).days;
    const biased =generateSyntheticFieldDays({ ...BASE, events: [{ kind: "smap-bias", bias: 0.03 }] }).days;
    clean.forEach((d, i) => {
      const a = pick(d, "soil_moisture", "smap");
      if (a) expect((pick(biased[i], "soil_moisture", "smap")?.value as number) - (a.value as number)).toBeCloseTo(0.03, 9);
    });
  });

  it("injects an NDVI dip on the first composite on or after the given day", () => {
    const clean = generateSyntheticFieldDays(BASE);
    const dipped = generateSyntheticFieldDays({ ...BASE, events: [{ kind: "ndvi-dip", day: 50, drop: 0.08 }] });
    // Composites fall on days 15, 31, 47, 63 … → day 63 = 2026-07-03.
    const i = 63;
    expect((pick(clean.days[i], "ndvi", "modis")?.value as number) - (pick(dipped.days[i], "ndvi", "modis")?.value as number)).toBeCloseTo(0.08, 9);
    expect(dipped.events).toEqual([{ kind: "ndvi-dip", start: "2026-07-03", end: "2026-07-03", detectors: ["ndvi-change"] }]);
  });
});
