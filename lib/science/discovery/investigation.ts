/**
 * Investigation flow of one discovery: its status and the five stages shown in the app.
 * new → (follow-up logged) → resolved. A follow-up answers the question the card asked;
 * whether it confirmed or eased the pattern is said in `confirmed`, not in the status.
 */
import type { DiscoveryStatus, FollowUp, InvestigationStage, StageKey } from "@/types";

const LABELS: Record<StageKey, string> = {
  observed: "Observed",
  anomaly: "Anomaly detected",
  investigation: "Investigation selected",
  "new-data": "New data collected",
  "model-updated": "Field model updated",
};
const ORDER: StageKey[] = ["observed", "anomaly", "investigation", "new-data", "model-updated"];

export function latestFollowUp(discoveryId: string, followUps: FollowUp[]): FollowUp | undefined {
  return followUps.filter((f) => f.discoveryId === discoveryId).at(-1);
}

export function statusOf(followUp: FollowUp | undefined): DiscoveryStatus {
  return followUp ? "resolved" : "new";
}

export function stagesFor(p: {
  windowStart: string;
  windowEnd: string;
  observedDetail: string;
  anomalyDetail: string;
  nextAction: string;
  followUp?: FollowUp;
  followUpDetail?: string;
}): InvestigationStage[] {
  const f = p.followUp;
  const reached = f ? ORDER.length : 2;
  const dates = [p.windowStart, p.windowEnd, p.windowEnd, f?.date, f?.date];
  const details = [
    p.observedDetail,
    p.anomalyDetail,
    `Suggested check: ${p.nextAction}`,
    f ? p.followUpDetail ?? "Follow-up logged." : "Waiting for a follow-up.",
    !f ? "Not updated yet."
      : f.surfaceVwc !== undefined ? "The Living Field Model now uses these readings on this date (D-007)."
      : "The answer is stored with this discovery; it does not change the soil-water model.",
  ];
  return ORDER.map((key, i) => ({
    key,
    label: LABELS[key],
    state: i < reached ? "done" : i === reached ? "active" : "pending",
    date: i <= reached ? dates[i] : undefined,
    detail: details[i],
  }));
}
