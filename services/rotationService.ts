import { evaluateRotation } from "@/lib/science/waterBalance";
import type { EvaluateRequest, RotationEvaluation } from "@/types";
import { request } from "./apiClient";
import { mockField } from "./fieldSensorService";

export function mockEvaluate(req: EvaluateRequest): RotationEvaluation[] {
  const field = mockField(req.fieldId);
  return req.plans.map((plan) => evaluateRotation(plan, field, req.settings, req.priorities, req.scenario));
}

/** POST /api/rotations/evaluate */
export function evaluateRotations(req: EvaluateRequest): Promise<RotationEvaluation[]> {
  return request("/api/rotations/evaluate", () => mockEvaluate(req), { method: "POST", body: JSON.stringify(req) });
}
