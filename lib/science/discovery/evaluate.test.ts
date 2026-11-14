import { describe, expect, it } from "vitest";
import type { LabelledEvent } from "@/lib/demo/syntheticFieldDays";
import type { DiscoveryKind } from "@/types";
import type { AnomalyRecord } from "@/types/discovery-contract";
import { scoreDetections } from "./evaluate";

const det = (detector: DiscoveryKind, end: string) => ({ detector, window: { start: end, end } }) as AnomalyRecord;
const DRY: LabelledEvent = { kind: "dry-spell", start: "2026-06-10", end: "2026-06-27", detectors: ["rain-departure", "moisture-divergence"] };

describe("scoreDetections", () => {
  it("matches a detection to an event when it ends between the event start and 14 days after the event end", () => {
    const scores = scoreDetections(
      [det("rain-departure", "2026-06-20"), det("moisture-divergence", "2026-07-15"), det("ndvi-change", "2026-06-01")],
      [DRY],
    );
    expect(scores["rain-departure"]).toEqual({ eventsExpected: 1, eventsDetected: 1, detections: 1, detectionsMatched: 1, delaysDays: [10] });
    // 2026-07-15 is 18 days after the event end: outside the 14-day tolerance.
    expect(scores["moisture-divergence"]).toEqual({ eventsExpected: 1, eventsDetected: 0, detections: 1, detectionsMatched: 0, delaysDays: [] });
    expect(scores["ndvi-change"]).toEqual({ eventsExpected: 0, eventsDetected: 0, detections: 1, detectionsMatched: 0, delaysDays: [] });
    expect(scores["sensor-offset"]).toEqual({ eventsExpected: 0, eventsDetected: 0, detections: 0, detectionsMatched: 0, delaysDays: [] });
  });

  it("includes a detection exactly 14 days after the event end and excludes one a day later", () => {
    expect(scoreDetections([det("rain-departure", "2026-07-11")], [DRY])["rain-departure"].eventsDetected).toBe(1);
    expect(scoreDetections([det("rain-departure", "2026-07-12")], [DRY])["rain-departure"].eventsDetected).toBe(0);
  });

  it("does not credit a detection that ends before the event starts", () => {
    expect(scoreDetections([det("rain-departure", "2026-06-09")], [DRY])["rain-departure"].eventsDetected).toBe(0);
  });

  it("counts an event once and measures delay from its first matching detection", () => {
    const s = scoreDetections([det("rain-departure", "2026-06-25"), det("rain-departure", "2026-06-15")], [DRY])["rain-departure"];
    expect(s).toEqual({ eventsExpected: 1, eventsDetected: 1, detections: 2, detectionsMatched: 2, delaysDays: [5] });
  });
});
