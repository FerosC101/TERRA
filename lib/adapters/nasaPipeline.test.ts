import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateDays } from "@/lib/science/discovery/engine";
import type { FieldDay, FieldLocation } from "@/types/discovery-contract";
import { pipelineToFieldDays, type PipelineDailyRecord, type PipelineObservation } from "./nasaPipeline";

const LIPA: FieldLocation = { fieldId: "lipa-cropland", timeZone: "Asia/Manila", pipelineLocationId: "lipa_cropland_001" };

const obs = (o: Partial<PipelineObservation> & Pick<PipelineObservation, "value" | "unit" | "source_dataset" | "product_name">): PipelineObservation => ({
  raw_variable: "x", product_version: "v", observation_type: "satellite", quality_flag: "OK", is_missing: o.value === null, ...o,
});

/** One merged daily record shaped like docs/Data Pipeline/data/processed/terra_daily_merged.json. */
function record(date: string, smap: number | null = 0.41): PipelineDailyRecord {
  return {
    date,
    timestamp: `${date}T00:00:00Z`,
    location_id: "lipa_cropland_001",
    source_quality_statuses: { GPM_IMERG: "VALID", NASA_POWER: "VALID", ...(smap === null ? {} : { SMAP: "VALID_WITH_WARNINGS" }) },
    quality_flags: smap === null ? {} : { SMAP: { retrieval_qual_decoded: { summary: "retrieval_not_recommended" } } },
    observations: {
      precipitation_imerg_mm: obs({ value: 2.5, unit: "mm/day", source_dataset: "GPM_IMERG", product_name: "GPM_3IMERGDF (Final Run)", product_version: "07B" }),
      precipitation_mm: obs({ value: 3.4, unit: "mm/day", source_dataset: "NASA_POWER", product_name: "NASA_POWER_AG_DAILY", product_version: "v2.10.3" }),
      air_temperature_max_c: obs({ value: 29.5, unit: "degC", source_dataset: "NASA_POWER", product_name: "NASA_POWER_AG_DAILY" }),
      et0_mm_day: obs({ value: 2.9, unit: "mm/day", source_dataset: "NASA_POWER", product_name: "TERRA_DERIVED_FAO56" }),
      relative_humidity_pct: obs({ value: 90, unit: "%", source_dataset: "NASA_POWER", product_name: "NASA_POWER_AG_DAILY" }),
      surface_soil_wetness_index: obs({ value: 0.9, unit: "dimensionless", source_dataset: "NASA_POWER", product_name: "NASA_POWER_AG_DAILY" }),
      soil_moisture_surface_m3_m3: obs({ value: smap, unit: "m3/m3", source_dataset: "SMAP", product_name: "SPL3SMP_E (L3 Enhanced Radiometer)", product_version: "006" }),
    },
  };
}

const pick = (d: FieldDay, variable: string, source: string) => d.values.find((v) => v.variable === variable && v.source === source);

describe("pipelineToFieldDays", () => {
  it("maps the contract's variables with canonical units, sources and provenance", () => {
    const [day] = pipelineToFieldDays([record("2024-01-02")], LIPA);
    expect(day.fieldId).toBe("lipa-cropland");
    expect(day.date).toBe("2024-01-02");
    expect(pick(day, "precipitation", "imerg")).toMatchObject({ value: 2.5, unit: "mm/day", provenance: "satellite", aggregation: "total", depthCm: null, product: "GPM_3IMERGDF (Final Run) 07B", quality: "ok" });
    expect(pick(day, "precipitation", "power")).toMatchObject({ value: 3.4, unit: "mm/day", provenance: "model", aggregation: "total" });
    expect(pick(day, "air_temperature_max", "power")).toMatchObject({ value: 29.5, unit: "degC", provenance: "model", aggregation: "max" });
    expect(pick(day, "et0", "power")).toMatchObject({ value: 2.9, unit: "mm/day", provenance: "model" });
    expect(pick(day, "soil_moisture", "smap")).toMatchObject({ value: 0.41, unit: "m3/m3", provenance: "satellite", depthCm: null });
  });

  it("leaves out variables the contract does not define (humidity, wetness index)", () => {
    const [day] = pipelineToFieldDays([record("2024-01-02")], LIPA);
    expect(day.values.map((v) => `${v.variable}/${v.source}`).sort()).toEqual(
      ["air_temperature_max/power", "et0/power", "precipitation/imerg", "precipitation/power", "soil_moisture/smap"],
    );
  });

  it("gives daily products their UTC-day period and places them on the local day by the D-002 midpoint rule", () => {
    const [day] = pipelineToFieldDays([record("2024-01-02")], LIPA);
    expect(pick(day, "precipitation", "imerg")?.period).toEqual({ start: "2024-01-02T00:00:00Z", end: "2024-01-02T23:59:59Z" });
    // UTC+14: the UTC day's midpoint (12:00Z) is 02:00 the next local day.
    const [kiribati] = pipelineToFieldDays([record("2024-01-02", null)], { ...LIPA, timeZone: "Pacific/Kiritimati" });
    expect(kiribati.date).toBe("2024-01-03");
  });

  it("keeps SMAP as an overpass at the pipeline's timestamp, with its quality warning", () => {
    const [day] = pipelineToFieldDays([record("2024-01-02")], LIPA);
    const smap = pick(day, "soil_moisture", "smap");
    expect(smap?.aggregation).toBe("instant");
    expect(smap?.period).toEqual({ start: "2024-01-02T00:00:00Z", end: "2024-01-02T00:00:00Z" });
    expect(smap?.quality).toBe("warning");
    expect(smap?.qualityNote).toContain("retrieval_not_recommended");
  });

  it("places SMAP at its measured acquisition time when given one (AM pass lands on the next Manila day)", () => {
    // Real case: file 2024-01-02, AM pass acquired 2024-01-02T21:45:10Z = 05:45 on 2024-01-03 in Manila.
    const days = pipelineToFieldDays([record("2024-01-02"), record("2024-01-03", null)], LIPA, {
      smapAcquisitionUtc: { "2024-01-02": "2024-01-02T21:45:10Z" },
    });
    expect(pick(days[0], "soil_moisture", "smap")).toBeUndefined();
    const smap = pick(days[1], "soil_moisture", "smap");
    expect(smap?.period).toEqual({ start: "2024-01-02T21:45:10Z", end: "2024-01-02T21:45:10Z" });
    expect(smap?.qualityNote).toContain("tb_time_seconds");
    expect(smap?.qualityNote).not.toContain("UNVERIFIED");
    expect(() => validateDays(days, "lipa-cropland")).not.toThrow();
  });

  it("falls back to the file date, labelled UNVERIFIED, when a SMAP day has no acquisition time", () => {
    const [day] = pipelineToFieldDays([record("2024-01-02")], LIPA, { smapAcquisitionUtc: {} });
    expect(pick(day, "soil_moisture", "smap")?.qualityNote).toContain("UNVERIFIED");
  });

  it("refuses an acquisition time that is not a UTC ISO instant", () => {
    expect(() => pipelineToFieldDays([record("2024-01-02")], LIPA, { smapAcquisitionUtc: { "2024-01-02": "2024-01-02 21:45" } })).toThrow(/UTC/);
  });

  it("omits SMAP on days without an overpass, but marks a missing daily value as missing", () => {
    const r = record("2024-01-02", null);
    r.observations.precipitation_imerg_mm = obs({ value: null, unit: "mm/day", source_dataset: "GPM_IMERG", product_name: "GPM_3IMERGDF (Final Run)" });
    const [day] = pipelineToFieldDays([r], LIPA);
    expect(pick(day, "soil_moisture", "smap")).toBeUndefined();
    expect(pick(day, "precipitation", "imerg")).toMatchObject({ value: null, quality: "missing" });
  });

  it("fills a gap between dates with an empty day, so the record stays consecutive", () => {
    const days = pipelineToFieldDays([record("2024-01-01"), record("2024-01-03")], LIPA);
    expect(days.map((d) => d.date)).toEqual(["2024-01-01", "2024-01-02", "2024-01-03"]);
    expect(days[1].values).toEqual([]);
    expect(() => validateDays(days, "lipa-cropland")).not.toThrow();
  });

  it("refuses records from another location, a unit it does not expect, or a value from the wrong dataset", () => {
    expect(() => pipelineToFieldDays([{ ...record("2024-01-02"), location_id: "elsewhere" }], LIPA)).toThrow(/elsewhere/);
    const pct = record("2024-01-02");
    pct.observations.soil_moisture_surface_m3_m3 = obs({ value: 41, unit: "%", source_dataset: "SMAP", product_name: "SPL3SMP_E" });
    expect(() => pipelineToFieldDays([pct], LIPA)).toThrow(/unit/);
    const swapped = record("2024-01-02");
    swapped.observations.precipitation_mm = obs({ value: 1, unit: "mm/day", source_dataset: "GPM_IMERG", product_name: "GPM_3IMERGDF" });
    expect(() => pipelineToFieldDays([swapped], LIPA)).toThrow(/GPM_IMERG/);
  });

  it("refuses an unknown quality status instead of guessing", () => {
    const r = record("2024-01-02");
    r.source_quality_statuses.NASA_POWER = "SOMETHING_NEW";
    expect(() => pipelineToFieldDays([r], LIPA)).toThrow(/SOMETHING_NEW/);
  });
});

describe("pipelineToFieldDays on the real Lipa record (whatever period the pipeline has retrieved)", () => {
  const file = "docs/Data Pipeline/data/processed/terra_daily_merged.json";
  const raw = (JSON.parse(readFileSync(file, "utf8")) as PipelineDailyRecord[]).sort((a, b) => a.date.localeCompare(b.date));
  const days = pipelineToFieldDays(raw, LIPA);

  it("produces a valid, consecutive record with no simulated values", () => {
    expect(days).toHaveLength(raw.length);
    expect(days[0].date).toBe(raw[0].date);
    expect(() => validateDays(days, "lipa-cropland")).not.toThrow();
    expect(days.flatMap((d) => d.values).some((v) => v.provenance === "simulated")).toBe(false);
  });

  it("keeps every value it maps exactly as the pipeline gave it", () => {
    raw.forEach((r, k) => {
      expect(pick(days[k], "precipitation", "imerg")?.value ?? null).toBe(r.observations.precipitation_imerg_mm?.value ?? null);
      expect(pick(days[k], "et0", "power")?.value).toBe(r.observations.et0_mm_day.value);
      expect(pick(days[k], "soil_moisture", "smap")?.value ?? null).toBe(r.observations.soil_moisture_surface_m3_m3?.value ?? null);
    });
    const smapInFile = raw.filter((r) => r.observations.soil_moisture_surface_m3_m3?.value != null).length;
    expect(days.filter((d) => pick(d, "soil_moisture", "smap")).length).toBe(smapInFile);
  });
});
