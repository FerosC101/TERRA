/**
 * Next Best Observation: which field check to do next for a discovery.
 *
 * Rule (simple, inspectable): among checks for this kind of discovery, keep those that tell apart at
 * least two of the causes still open, and rank by causes told apart per unit of effort, where
 * effort = minutes of work + WAIT_MINUTES_PER_DAY × days until the answer is known. Ties: less effort first.
 * Costs and the waiting weight are rough estimates (data/observationChecks.ts), not measured.
 */
import { OBSERVATION_CHECKS, WAIT_MINUTES_PER_DAY, type ObservationCheck } from "@/data/observationChecks";
import type { DiscoveryKind } from "@/types";

export interface RankedCheck {
  check: ObservationCheck;
  /** Open causes this check tells apart. */
  separated: string[];
  effortMinutes: number;
  score: number;
}

export function rankChecks(kind: DiscoveryKind, openCauses: string[], catalogue: ObservationCheck[] = OBSERVATION_CHECKS): RankedCheck[] {
  return catalogue
    .filter((c) => c.kinds.includes(kind))
    .map((check) => {
      const separated = check.separates.filter((id) => openCauses.includes(id));
      const effortMinutes = check.costMinutes + WAIT_MINUTES_PER_DAY * check.waitDays;
      return { check, separated, effortMinutes, score: separated.length / Math.max(1, effortMinutes) };
    })
    .filter((r) => r.separated.length >= 2)
    .sort((a, b) => b.score - a.score || a.effortMinutes - b.effortMinutes);
}
