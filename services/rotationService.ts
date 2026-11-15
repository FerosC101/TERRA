import { DEKADS_BY_FIELD } from "@/data/nasa/lipaDekads";
import { evaluateRotation, rotationRisk, type RotationRisk } from "@/lib/science/waterBalance";
import type { EvaluateRequest, RotationEvaluation } from "@/types";
import { request } from "./apiClient";
import { mockField } from "./fieldSensorService";

/** Historical-years result (D-014) for one plan: per season, how often it ran short across real past years. */
export interface RealYears extends RotationRisk {
  /** Where the ten-day rain comes from. */
  source: string;
}

/** A rotation evaluation plus, for fields with real ten-day rain under historical conditions, its real-years result. */
export type Evaluation = RotationEvaluation & { realYears?: RealYears };

/**
 * Rotation evaluations. For a field with real ten-day rain (DEKADS_BY_FIELD, D-014), the historical-conditions
 * run also carries the real-years result: the average-climate run cannot show dry years.
 */
export function mockEvaluate(req: EvaluateRequest): Evaluation[] {
  const field = mockField(req.fieldId);
  const dekads = DEKADS_BY_FIELD[field.id];
  return req.plans.map((plan) => {
    const ev = evaluateRotation(plan, field, req.settings, req.priorities, req.scenario);
    if (!dekads || req.scenario.id !== "historical") return ev;
    const risk = rotationRisk(plan, field, req.settings, req.priorities, dekads);
    if (risk.startYears.length === 0) return ev;
    return { ...ev, realYears: { ...risk, source: "NASA POWER daily rain (model, ~50 km), summed to ten-day totals" } };
  });
}

/** POST /api/rotations/evaluate */
export function evaluateRotations(req: EvaluateRequest): Promise<Evaluation[]> {
  return request("/api/rotations/evaluate", () => mockEvaluate(req), { method: "POST", body: JSON.stringify(req) });
}
