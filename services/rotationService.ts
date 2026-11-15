import { CROPS } from "@/data/crops";
import { DEKADS_BY_FIELD } from "@/data/nasa/lipaDekads";
import { evaluateRotation, rotationRisk } from "@/lib/science/waterBalance";
import type { EvaluateRequest, RotationEvaluation } from "@/types";
import { request } from "./apiClient";
import { mockField } from "./fieldSensorService";

/**
 * Rotation evaluations. For a field with real ten-day rain (DEKADS_BY_FIELD, D-014), the historical-conditions
 * run also reports, per season, how often the rotation ran short of water across real past years: the
 * average-climate run cannot show dry years.
 */
export function mockEvaluate(req: EvaluateRequest): RotationEvaluation[] {
  const field = mockField(req.fieldId);
  const dekads = DEKADS_BY_FIELD[field.id];
  return req.plans.map((plan) => {
    const ev = evaluateRotation(plan, field, req.settings, req.priorities, req.scenario);
    if (!dekads || req.scenario.id !== "historical") return ev;
    const risk = rotationRisk(plan, field, req.settings, req.priorities, dekads);
    const n = risk.startYears.length;
    if (n === 0) return ev;
    const span = `${risk.startYears[0]}–${risk.startYears[n - 1] + 1}`;
    const short = risk.seasons.filter((s) => s.yearsShort > 0);
    const notes = short.length
      ? short.map((s) => `Real rain ${span} (NASA POWER): season ${s.index + 1} (${CROPS[s.cropId].name}, ${s.windowLabel}) ran short of water in ${s.yearsShort} of ${n} years; in the driest 20 % of years by ${s.dry20DeficitMm} mm or more.`)
      : [`Real rain ${span} (NASA POWER): no season of this rotation ran short of water in any of ${n} years.`];
    return { ...ev, notes: [...ev.notes, ...notes] };
  });
}

/** POST /api/rotations/evaluate */
export function evaluateRotations(req: EvaluateRequest): Promise<RotationEvaluation[]> {
  return request("/api/rotations/evaluate", () => mockEvaluate(req), { method: "POST", body: JSON.stringify(req) });
}
