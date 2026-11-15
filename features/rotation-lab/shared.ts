"use client";

import { CATEGORICAL } from "@/lib/chartTheme";
import { fmt, pct } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { evaluateRotations, type Evaluation } from "@/services/rotationService";
import type { RotationEvaluation, RotationIndicators, RotationPlan, Scenario } from "@/types";

export function planColor(plan: RotationPlan): string {
  return CATEGORICAL[plan.colorSlot % CATEGORICAL.length];
}

/** Evaluates the given plans for the selected field under one scenario. */
export function useEvaluations(plans: RotationPlan[], scenario: Scenario) {
  const { field, settings, priorities } = useApp();
  const req = { fieldId: field.id, plans, settings, priorities, scenario };
  return useService<Evaluation[]>(JSON.stringify(req), () => evaluateRotations(req));
}

export type CriterionGroup = "Water" | "Crop diversity" | "Soil cover" | "Nutrient management" | "Climate exposure";

export interface Criterion {
  key: string;
  group: CriterionGroup;
  label: string;
  help: string;
  value: (i: RotationIndicators, e: RotationEvaluation) => number;
  format: (v: number) => string;
  /** Which direction is generally preferable; null where it depends on the farm */
  better: "higher" | "lower" | null;
  max?: number;
}

/** The indicators every rotation is compared on. Each one is a direct output of the model, not a score. */
export const CRITERIA: Criterion[] = [
  { key: "demand", group: "Water", label: "Estimated water demand", help: "Water the crops would use over all cropped seasons if never short (ETc = Kc × ET0).", value: (i) => i.demandMm, format: (v) => `${fmt(v)} mm`, better: "lower" },
  { key: "met", group: "Water", label: "Demand met by rain and soil water", help: "Share of that demand the field could supply without irrigation.", value: (i) => i.waterMetShare, format: (v) => pct(v), better: "higher", max: 1 },
  { key: "deficit", group: "Water", label: "Unmet water demand", help: "Demand the soil could not supply. A sign of likely water stress.", value: (i) => i.deficitMm, format: (v) => `${fmt(v)} mm`, better: "lower" },
  { key: "excess", group: "Water", label: "Excess water", help: "Runoff plus drainage below the roots: rain the crops could not use.", value: (i) => i.excessMm, format: (v) => `${fmt(v)} mm`, better: null },
  { key: "families", group: "Crop diversity", label: "Crop families", help: "Number of different botanical families in the sequence.", value: (i) => i.distinctFamilies, format: (v) => fmt(v), better: "higher" },
  { key: "repeats", group: "Crop diversity", label: "Same family back to back", help: "Times a family follows itself, giving its pests and diseases a continuous host.", value: (i) => i.sameFamilyRepeats, format: (v) => fmt(v), better: "lower" },
  { key: "cover", group: "Soil cover", label: "Time with a living canopy", help: "Share of the whole period with a crop covering the soil.", value: (i) => i.coverShare, format: (v) => pct(v), better: "higher", max: 1 },
  { key: "legumes", group: "Nutrient management", label: "Seasons with a legume", help: "Seasons with a nitrogen-fixing crop. A planning consideration, not a measured soil benefit.", value: (i) => i.legumeSeasons, format: (v) => fmt(v), better: "higher" },
  { key: "feeders", group: "Nutrient management", label: "Heavy feeders back to back", help: "Times a crop with high nitrogen demand follows another.", value: (i) => i.heavyFeederRepeats, format: (v) => fmt(v), better: "lower" },
  { key: "heat", group: "Climate exposure", label: "Heat exposure in mid-season", help: "Share of each crop's mid-season when the average daily maximum is above its heat threshold.", value: (i) => i.heatShare, format: (v) => pct(v), better: "lower", max: 1 },
];

/**
 * The only composite figure in the lab. It is kept apart from the indicators
 * because it reflects the user's own weights, not a property of the rotation.
 */
export const PRIORITY_MATCH: Criterion = {
  key: "priority", group: "Water", label: "Match to your priorities",
  help: "Weighted mean of five indicators scaled 0 to 1, using your weights.",
  value: (_i, e) => e.priorityMatch / 100, format: (v) => `${fmt(v * 100)} out of 100`, better: "higher", max: 1,
};

export const BETTER_HINT: Record<"higher" | "lower" | "none", string> = {
  higher: "Higher is generally better",
  lower: "Lower is generally better",
  none: "Depends on the farm",
};

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
