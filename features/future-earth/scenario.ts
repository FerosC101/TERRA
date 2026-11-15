import { fmt, pct, signed } from "@/lib/format";
import type { RotationEvaluation, Scenario } from "@/types";

export function describeScenario(s: Scenario): string {
  if (s.rainChange === 0 && s.tempChangeC === 0) return "Average climate";
  const parts: string[] = [];
  if (s.rainChange !== 0) parts.push(`${signed(s.rainChange * 100, 0)}% rain`);
  if (s.tempChangeC !== 0) parts.push(`${signed(s.tempChangeC, 1)} °C`);
  return parts.join(", ");
}

export type StressKey = "reserve" | "unmet" | "met" | "heat" | "excess";

/** The lowest amount of plant-available water the root zone reaches during the rotation. */
export function lowestReserve(e: RotationEvaluation): number {
  return e.timeline.length ? Math.min(...e.timeline.map((t) => t.storageMm)) : 0;
}

export const SHORT_NAME: Record<string, string> = { historical: "Historical", dry: "Less rain", wet: "More rain", hot: "Hotter", "hot-dry": "Hot and dry", custom: "Custom" };

/** The outcomes compared between historical conditions and a scenario. */
export const OUTCOMES: Record<StressKey, { label: string; help: string; value: (e: RotationEvaluation) => number; format: (v: number) => string; delta: (now: number, base: number) => string; worseWhen: "higher" | "lower" | null }> = {
  reserve: { label: "Lowest soil water reached", help: "The least water left in the root zone at any point. Lower means closer to running short.", value: lowestReserve, format: (v) => `${fmt(v)} mm`, delta: (n, b) => `${signed(n - b, 0)} mm`, worseWhen: "lower" },
  unmet: { label: "Unmet water demand", help: "Crop water need that rain and soil water could not meet.", value: (e) => e.indicators.deficitMm, format: (v) => `${fmt(v)} mm`, delta: (n, b) => `${signed(n - b, 0)} mm`, worseWhen: "higher" },
  met: { label: "Demand met without irrigation", help: "Share of crop water need supplied by rain and soil water.", value: (e) => e.indicators.waterMetShare, format: (v) => pct(v), delta: (n, b) => `${signed((n - b) * 100, 0)} points`, worseWhen: "lower" },
  heat: { label: "Heat exposure in mid-season", help: "Share of mid-season above each crop's heat threshold.", value: (e) => e.indicators.heatShare, format: (v) => pct(v), delta: (n, b) => `${signed((n - b) * 100, 0)} points`, worseWhen: "higher" },
  excess: { label: "Excess water", help: "Runoff plus drainage: rain the crops could not use.", value: (e) => e.indicators.excessMm, format: (v) => `${fmt(v)} mm`, delta: (n, b) => `${signed(n - b, 0)} mm`, worseWhen: null },
};
