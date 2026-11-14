/**
 * Shared evaluation harness for Discovery Engine experiments on SIMULATED records
 * (E-001, E-002). Scoring follows D-003: recall, chance recall and attributable recall.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { CROPS } from "@/data/crops";
import { FIELDS } from "@/data/fields";
import { daysBetween } from "@/lib/dates";
import { generateSyntheticFieldDays, type InjectedEvent, type SyntheticOptions } from "@/lib/demo/syntheticFieldDays";
import { createRng } from "@/lib/rng";
import { BASELINE_DETECTORS, runDiscovery, type DetectorSet, type DiscoveryContext } from "@/lib/science/discovery/engine";
import { DETECTOR_KINDS, scoreDetections, type DetectorScore } from "@/lib/science/discovery/evaluate";
import type { DiscoveryKind, Field } from "@/types";

/**
 * The demo field whose climate (illustrative Cagayan Valley climatology) every synthetic experiment uses.
 * Chosen by id, not position: FIELDS[0] changed on main (Lipa Cropland), which would silently change results.
 * Only its climate enters the scores; its station position only fills AnomalyRecord.location.
 */
export const EXPERIMENT_FIELD: Field = (() => {
  const f = FIELDS.find((x) => x.id === "riverside");
  if (!f) throw new Error("Experiment field \"riverside\" not found in data/fields.ts");
  return f;
})();

export const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
export const randInt = (rng: () => number, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Wilson score 95% interval for a proportion. */
export function wilson(k: number, n: number): [number, number] | null {
  if (n === 0) return null;
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [round(c - h), round(c + h)];
}

/** Commit, dirty flag and short source hashes, so a run identifies its exact code. */
export function provenance(files: string[]) {
  return {
    commit: execSync("git rev-parse --short HEAD").toString().trim(),
    workingTreeDirty: execSync("git status --porcelain").toString().trim().length > 0,
    sourceSha256: Object.fromEntries(files.map((f) => [f, createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 16)])),
  };
}

export interface HarnessConfig {
  seeds: number[];
  days: number;
  start: string;
  plantedOn: string;
  runAt: string;
  field: Field;
  /** Generator options per seed (soil model, station gaps); applied to the injected and the clean run alike. */
  generatorOptions: (seed: number) => Partial<SyntheticOptions>;
  /** Detectors to run (default: the baseline rules). */
  detectors?: DetectorSet;
}

export function createHarness(cfg: HarnessConfig) {
  const { field } = cfg;
  const detectors = cfg.detectors ?? BASELINE_DETECTORS;
  const base = (seed: number, events: InjectedEvent[]): SyntheticOptions => ({
    fieldId: `synthetic-${seed}`, start: cfg.start, days: cfg.days, seed, climate: field.climate, crop: CROPS.corn,
    plantedOn: cfg.plantedOn, events, ...cfg.generatorOptions(seed),
  });
  const ctx = (seed: number): DiscoveryContext => ({
    fieldId: `synthetic-${seed}`, location: field.station.position, monthlyRainMm: field.climate.rainMm, crop: CROPS.corn,
    plantedOn: cfg.plantedOn, runAt: cfg.runAt,
  });

  /** Detections on each seed's clean record, for chance-level and attributable matching. */
  const cleanRecords = new Map(cfg.seeds.map((seed) => [seed, runDiscovery(generateSyntheticFieldDays(base(seed, [])).days, ctx(seed), detectors)]));

  function runScenario(makeEvents: (seed: number, rng: () => number) => InjectedEvent[]) {
    const chanceDetected: Record<string, number> = Object.fromEntries(DETECTOR_KINDS.map((k) => [k, 0]));
    const attributableDetected: Record<string, number> = Object.fromEntries(DETECTOR_KINDS.map((k) => [k, 0]));
    const total = {} as Record<DiscoveryKind, DetectorScore>;
    for (const k of DETECTOR_KINDS) total[k] = { eventsExpected: 0, eventsDetected: 0, detections: 0, detectionsMatched: 0, delaysDays: [] };
    const runsWithDetection: Record<string, number> = Object.fromEntries(DETECTOR_KINDS.map((k) => [k, 0]));
    for (const seed of cfg.seeds) {
      const events = makeEvents(seed, createRng(seed + 1000));
      const { days, events: labels } = generateSyntheticFieldDays(base(seed, events));
      const records = runDiscovery(days, ctx(seed), detectors);
      const s = scoreDetections(records, labels);
      // Chance level: the same event windows, scored against the record without the injected events.
      const clean = cleanRecords.get(seed)!;
      const chance = scoreDetections(clean, labels);
      // Paired (attributable): only alarms that do not occur, with the same id, in the same seed's clean record.
      const cleanIds = new Set(clean.map((r) => r.id));
      const attributable = scoreDetections(records.filter((r) => !cleanIds.has(r.id)), labels);
      for (const k of DETECTOR_KINDS) {
        chanceDetected[k] += chance[k].eventsDetected;
        attributableDetected[k] += attributable[k].eventsDetected;
        total[k].eventsExpected += s[k].eventsExpected;
        total[k].eventsDetected += s[k].eventsDetected;
        total[k].detections += s[k].detections;
        total[k].detectionsMatched += s[k].detectionsMatched;
        total[k].delaysDays.push(...s[k].delaysDays);
        if (s[k].detections > 0) runsWithDetection[k]++;
      }
    }
    return Object.fromEntries(DETECTOR_KINDS.map((k) => {
      const t = total[k];
      return [k, {
        eventsExpected: t.eventsExpected,
        eventsDetected: t.eventsDetected,
        recall: t.eventsExpected ? round(t.eventsDetected / t.eventsExpected) : null,
        recallCI95: wilson(t.eventsDetected, t.eventsExpected),
        chanceRecall: t.eventsExpected ? round(chanceDetected[k] / t.eventsExpected) : null,
        chanceRecallCI95: wilson(chanceDetected[k], t.eventsExpected),
        attributableRecall: t.eventsExpected ? round(attributableDetected[k] / t.eventsExpected) : null,
        attributableRecallCI95: wilson(attributableDetected[k], t.eventsExpected),
        detections: t.detections,
        // null when the scenario injects no event this detector should catch.
        precision: t.detections && t.eventsExpected ? round(t.detectionsMatched / t.detections) : null,
        alarmsPer100Days: round((t.detections / (cfg.seeds.length * cfg.days)) * 100, 2),
        runsWithAnyDetection: runsWithDetection[k],
        delayDaysMedian: median(t.delaysDays),
        delayDaysRange: t.delaysDays.length ? [Math.min(...t.delaysDays), Math.max(...t.delaysDays)] : null,
      }];
    }));
  }

  /** Gaps in days between consecutive alarms of one detector on the clean records. */
  function flicker(kinds: DiscoveryKind[]) {
    return Object.fromEntries(kinds.map((k) => {
      const gaps: number[] = [];
      for (const records of cleanRecords.values()) {
        const ends = records.filter((r) => r.detector === k).map((r) => r.window.end).sort();
        for (let j = 1; j < ends.length; j++) gaps.push(daysBetween(ends[j - 1], ends[j]));
      }
      return [k, { gaps: gaps.length, medianGapDays: median(gaps), shareOfGapsAtMost3Days: gaps.length ? round(gaps.filter((g) => g <= 3).length / gaps.length) : null }];
    }));
  }

  return { base, ctx, cleanRecords, runScenario, flicker };
}
