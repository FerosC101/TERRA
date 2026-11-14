/**
 * Scores Discovery Engine detections against labelled (injected) events.
 * A detection matches an event when its detector is one the event should trigger
 * and its window ends between the event start and `toleranceDays` after the event end.
 */
import type { LabelledEvent } from "@/lib/demo/syntheticFieldDays";
import { addDays, daysBetween } from "@/lib/dates";
import type { DiscoveryKind } from "@/types";
import type { AnomalyRecord } from "@/types/discovery-contract";

export const DETECTOR_KINDS: DiscoveryKind[] = ["moisture-divergence", "rain-departure", "ndvi-change", "sensor-offset"];

export interface DetectorScore {
  /** Events that should trigger this detector. */
  eventsExpected: number;
  /** Of those, events with at least one matching detection. */
  eventsDetected: number;
  /** All detections by this detector. */
  detections: number;
  /** Detections that match some event. */
  detectionsMatched: number;
  /** Per detected event: days from event start to its first matching detection. */
  delaysDays: number[];
}

export function scoreDetections(records: AnomalyRecord[], events: LabelledEvent[], toleranceDays = 14): Record<DiscoveryKind, DetectorScore> {
  const matches = (r: AnomalyRecord, e: LabelledEvent) =>
    e.detectors.includes(r.detector) && r.window.end >= e.start && r.window.end <= addDays(e.end, toleranceDays);

  const scores = {} as Record<DiscoveryKind, DetectorScore>;
  for (const kind of DETECTOR_KINDS) {
    const mine = records.filter((r) => r.detector === kind);
    const expected = events.filter((e) => e.detectors.includes(kind));
    const delaysDays: number[] = [];
    for (const e of expected) {
      const ends = mine.filter((r) => matches(r, e)).map((r) => r.window.end).sort();
      if (ends.length) delaysDays.push(daysBetween(e.start, ends[0]));
    }
    scores[kind] = {
      eventsExpected: expected.length,
      eventsDetected: delaysDays.length,
      detections: mine.length,
      detectionsMatched: mine.filter((r) => events.some((e) => matches(r, e))).length,
      delaysDays,
    };
  }
  return scores;
}
