import { describe, expect, it } from "vitest";
import { daysBetween } from "@/lib/dates";
import { LIPA_PLOT_A_CROP_SEASONS, LIPA_PLOT_A_SEASONS } from "./cropCalendar";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY: Record<string, number> = { Early: 5, Mid: 15, Late: 25 };

/** "Mid-December 2023" or "Early June 2024" (the PDF uses both forms) → ISO date, documented convention. */
function convert(reported: string): string {
  const m = /^(Early|Mid|Late)[- ](\w+) (\d{4})$/.exec(reported);
  if (!m) throw new Error(`unparsed: ${reported}`);
  return `${m[3]}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, "0")}-${String(DAY[m[1]]).padStart(2, "0")}`;
}

describe("LIPA_PLOT_A_SEASONS", () => {
  it("converts every reported date with the early/mid/late = 5/15/25 convention", () => {
    for (const s of LIPA_PLOT_A_SEASONS) {
      expect(s.plantedOn).toBe(convert(s.plantedReported));
      expect(s.harvestedOn).toBe(convert(s.harvestedReported));
    }
  });

  it("fits corn's stages to each season length (91–102 days)", () => {
    LIPA_PLOT_A_CROP_SEASONS.forEach((s) => {
      expect(s.crop.stages.reduce((a, b) => a + b, 0)).toBe(daysBetween(s.plantedOn, s.harvestedOn!));
    });
    expect(LIPA_PLOT_A_CROP_SEASONS.map((s) => daysBetween(s.plantedOn, s.harvestedOn!))).toEqual([91, 102, 102, 102]);
  });
});
