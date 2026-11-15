import { describe, expect, it } from "vitest";
import { CROPS } from "@/data/crops";
import { fitStagesToSeason, seasonOn, type CropSeason } from "./season";

describe("fitStagesToSeason", () => {
  it("scales the four stages to the observed season length, keeping their proportions", () => {
    // Corn stages 20/30/40/25 = 115 days; a 92-day season (planted 2024-06-05, harvested 2024-09-05).
    const c = fitStagesToSeason(CROPS.corn, "2024-06-05", "2024-09-05");
    expect(c.stages.reduce((a, b) => a + b, 0)).toBe(92);
    expect(c.stages).toEqual([16, 24, 32, 20]);
    expect(c.kc).toEqual(CROPS.corn.kc);
  });

  it("refuses a harvest on or before planting", () => {
    expect(() => fitStagesToSeason(CROPS.corn, "2024-06-05", "2024-06-05")).toThrow(/after/);
  });
});

describe("seasonOn", () => {
  const seasons: CropSeason[] = [
    { crop: CROPS.corn, plantedOn: "2024-06-05", harvestedOn: "2024-09-15" },
    { crop: CROPS.corn, plantedOn: "2023-12-15", harvestedOn: "2024-03-15" },
  ];

  it("returns the latest season planted on or before the date (input order does not matter)", () => {
    expect(seasonOn(seasons, "2024-07-01")?.plantedOn).toBe("2024-06-05");
    expect(seasonOn(seasons, "2024-04-01")?.plantedOn).toBe("2023-12-15");
  });

  it("returns null before the first planting", () => {
    expect(seasonOn(seasons, "2023-12-14")).toBeNull();
  });
});
