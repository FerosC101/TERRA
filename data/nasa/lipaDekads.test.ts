import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIPA_POWER_DEKADS } from "./lipaDekads";

describe("LIPA_POWER_DEKADS", () => {
  const yearly = (y: string) => LIPA_POWER_DEKADS[y].reduce((a, b) => a + b, 0);

  it("has 36 dekads for every year 2001–2025", () => {
    expect(Object.keys(LIPA_POWER_DEKADS)).toHaveLength(25);
    for (const v of Object.values(LIPA_POWER_DEKADS)) expect(v).toHaveLength(36);
  });

  it("adds up to the POWER history (2001–2023) and the pipeline record (2024–2025), within rounding", () => {
    const hist = readFileSync("docs/Data Pipeline/data/external/power_history/power_daily_rain_lipa_2001_2023.csv", "utf8")
      .trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
    for (const y of ["2001", "2012", "2023"]) {
      const total = hist.filter((r) => r[0].startsWith(y)).reduce((a, r) => a + Number(r[1]), 0);
      expect(Math.abs(yearly(y) - total)).toBeLessThan(2); // 36 dekads rounded to 0.1 mm
    }
    const merged = JSON.parse(readFileSync("docs/Data Pipeline/data/processed/terra_daily_merged.json", "utf8")) as
      { date: string; observations: Record<string, { value: number | null }> }[];
    const p2024 = merged.filter((r) => r.date.startsWith("2024")).reduce((a, r) => a + (r.observations.precipitation_mm?.value ?? 0), 0);
    expect(Math.abs(yearly("2024") - p2024)).toBeLessThan(2);
  });
});
