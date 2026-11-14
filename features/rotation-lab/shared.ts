"use client";

import { CATEGORICAL } from "@/lib/chartTheme";
import { fmt, pct } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { evaluateRotations } from "@/services/rotationService";
import type { RotationEvaluation, RotationIndicators, RotationPlan, Scenario } from "@/types";

export function planColor(plan: RotationPlan): string {
  return CATEGORICAL[plan.colorSlot % CATEGORICAL.length];
}

/** Evaluates the given plans for the selected field under one scenario. */
export function useEvaluations(plans: RotationPlan[], scenario: Scenario) {
  const { field, settings, priorities } = useApp();
  const req = { fieldId: field.id, plans, settings, priorities, scenario };
  return useService<RotationEvaluation[]>(JSON.stringify(req), () => evaluateRotations(req));
}

export interface Criterion {
  key: string;
  label: string;
  help: string;
  value: (i: RotationIndicators, e: RotationEvaluation) => number;
  format: (v: number) => string;
  /** Which direction is generally preferable; null where it depends on the farm */
  better: "higher" | "lower" | null;
  max?: number;
}

export const CRITERIA: Criterion[] = [
  { key: "demand", label: "Crop water demand", help: "Total ETc over all cropped seasons. ETc = Kc × ET0.", value: (i) => i.demandMm, format: (v) => `${fmt(v)} mm`, better: "lower" },
  { key: "met", label: "Demand met by rain and soil water", help: "Share of ETc the water balance could supply without irrigation.", value: (i) => i.waterMetShare, format: (v) => pct(v), better: "higher", max: 1 },
  { key: "deficit", label: "Unmet water demand", help: "ETc the soil could not supply. A sign of likely water stress.", value: (i) => i.deficitMm, format: (v) => `${fmt(v)} mm`, better: "lower" },
  { key: "excess", label: "Excess water", help: "Runoff plus drainage below the root zone. High values mean rain the crops could not use.", value: (i) => i.excessMm, format: (v) => `${fmt(v)} mm`, better: null },
  { key: "families", label: "Crop families", help: "Number of distinct botanical families in the sequence.", value: (i) => i.distinctFamilies, format: (v) => fmt(v), better: "higher" },
  { key: "repeats", label: "Same family back to back", help: "Times a family follows itself. Repeats give that family's pests and diseases a continuous host.", value: (i) => i.sameFamilyRepeats, format: (v) => fmt(v), better: "lower" },
  { key: "cover", label: "Soil cover continuity", help: "Share of the whole period with a living canopy over the soil.", value: (i) => i.coverShare, format: (v) => pct(v), better: "higher", max: 1 },
  { key: "legumes", label: "Legume seasons", help: "Seasons with a nitrogen-fixing crop. A nutrient-management consideration, not a measured soil benefit.", value: (i) => i.legumeSeasons, format: (v) => fmt(v), better: "higher" },
  { key: "feeders", label: "Heavy feeders back to back", help: "Times a high nitrogen-demand crop follows another.", value: (i) => i.heavyFeederRepeats, format: (v) => fmt(v), better: "lower" },
  { key: "heat", label: "Heat exposure in mid-season", help: "Share of each crop's mid-season when average daily maximum temperature exceeds its indicative threshold.", value: (i) => i.heatShare, format: (v) => pct(v), better: "lower", max: 1 },
  { key: "priority", label: "Match to your priorities", help: "Weighted mean of five indicators using your weights. A summary of your own preferences, not a validated score.", value: (_i, e) => e.priorityMatch / 100, format: (v) => `${fmt(v * 100)} / 100`, better: "higher", max: 1 },
];

/** Plain-language gains and costs of one plan relative to the others being compared. */
export function tradeoffs(target: RotationEvaluation, all: RotationEvaluation[]): { gains: string[]; costs: string[] } {
  const gains: string[] = [];
  const costs: string[] = [];
  if (all.length < 2) return { gains, costs };
  const phrases: Record<string, [string, string]> = {
    demand: ["needs the least water", "needs the most water"],
    met: ["has the largest share of its water demand met without irrigation", "has the smallest share of its water demand met"],
    families: ["uses the most crop families", "uses the fewest crop families"],
    repeats: ["has the fewest same-family repeats", "repeats the same family most often"],
    cover: ["keeps the soil covered longest", "leaves the soil uncovered longest"],
    legumes: ["includes the most legume seasons", "includes the fewest legume seasons"],
    heat: ["has the least mid-season heat exposure", "has the most mid-season heat exposure"],
  };
  CRITERIA.filter((c) => phrases[c.key] && c.better).forEach((c) => {
    const values = all.map((e) => c.value(e.indicators, e));
    const mine = c.value(target.indicators, target);
    const best = c.better === "higher" ? Math.max(...values) : Math.min(...values);
    const worst = c.better === "higher" ? Math.min(...values) : Math.max(...values);
    if (best === worst) return;
    const unique = (v: number) => values.filter((x) => x === v).length === 1;
    if (mine === best && unique(best)) gains.push(`${phrases[c.key][0]} (${c.format(mine)})`);
    if (mine === worst && unique(worst)) costs.push(`${phrases[c.key][1]} (${c.format(mine)})`);
  });
  return { gains, costs };
}
