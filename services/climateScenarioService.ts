import { SCENARIOS } from "@/data/scenarios";
import type { EvaluateRequest, RotationEvaluation, Scenario } from "@/types";
import { request } from "./apiClient";
import { mockEvaluate } from "./rotationService";

export interface SimulateRequest extends Omit<EvaluateRequest, "scenario"> {
  scenarios: Scenario[];
}

export interface ScenarioResult {
  scenario: Scenario;
  evaluations: RotationEvaluation[];
}

export function getScenarios(): Promise<Scenario[]> {
  return request("/api/scenarios", () => SCENARIOS);
}

export function mockSimulate(req: SimulateRequest): ScenarioResult[] {
  return req.scenarios.map((scenario) => ({ scenario, evaluations: mockEvaluate({ ...req, scenario }) }));
}

/** POST /api/scenarios/simulate — every rotation under every requested scenario */
export function simulateScenarios(req: SimulateRequest): Promise<ScenarioResult[]> {
  return request("/api/scenarios/simulate", () => mockSimulate(req), { method: "POST", body: JSON.stringify(req) });
}
