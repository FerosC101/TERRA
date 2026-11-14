/**
 * E-003: candidate detectors vs the E-002 baselines. Tunes on seeds 101–150, tests on seeds 1–50.
 * Run: npm run experiment:e003  → experiments/E-003/results.json
 * SIMULATED DATA ONLY. See docs/ai-ml/EXPERIMENTS.md E-003 for the plan, tuning rule and adoption rule.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { CANDIDATE_RULES } from "@/data/discoveryRules";
import type { InjectedEvent } from "@/lib/demo/syntheticFieldDays";
import { createRng } from "@/lib/rng";
import { fieldZMoisture, ndviTrendBreak, rainWithImergFill } from "@/lib/science/discovery/candidates";
import { BASELINE_DETECTORS, DETECTOR_VERSION, type DetectorSet } from "@/lib/science/discovery/engine";
import type { DiscoveryKind } from "@/types";
import { EXPERIMENT_FIELD, createHarness, provenance, randInt, round } from "./discoveryHarness";

const TUNE_SEEDS = Array.from({ length: 50 }, (_, k) => k + 101);
const TEST_SEEDS = Array.from({ length: 50 }, (_, k) => k + 1);
const TUNE_SHARE = 0.2;
const TEST_SHARES = [0.1, 0.2, 0.3];
const DAYS = 240;
const START = "2026-05-01";
const PLANTED = "2026-06-01";
const field = EXPERIMENT_FIELD;
const SOURCE_FILES = [
  "lib/science/discovery/engine.ts", "lib/science/discovery/candidates.ts", "lib/science/discovery/evaluate.ts",
  "lib/demo/syntheticFieldDays.ts", "lib/demo/soilModel.ts", "data/discoveryRules.ts", "data/crops.ts", "data/fields.ts",
  "scripts/evaluate-discovery-e003.ts", "scripts/discoveryHarness.ts",
];

/** As E-002: 3% random missing station days plus one 5-day outage (seed + 2000). */
const gaps = (seed: number) => ({ rate: 0.03, outages: [{ startDay: randInt(createRng(seed + 2000), 20, 215), days: 5 }] });
const harness = (seeds: number[], share: number, detectors: DetectorSet) => createHarness({
  seeds, days: DAYS, start: START, plantedOn: PLANTED, runAt: "2026-11-14T00:00:00Z", field, detectors,
  generatorOptions: (seed) => ({ soilModel: "fao56", surfaceUptakeShare: share, missing: gaps(seed) }),
});
const dry = (rng: () => number, days: number): Extract<InjectedEvent, { kind: "dry-spell" }> => ({ kind: "dry-spell", startDay: randInt(rng, 60, 180), days });
const allEvents = (_s: number, rng: () => number): InjectedEvent[] => {
  const d = dry(rng, 18);
  let wetStart = randInt(rng, 30, 210);
  while (Math.abs(wetStart - d.startDay) < 40) wetStart = randInt(rng, 30, 210);
  return [d, { kind: "wet-spell", startDay: wetStart, days: 14 }, { kind: "smap-bias", bias: 0.03 }, { kind: "ndvi-dip", day: randInt(rng, 51, 104), drop: 0.08 }];
};

// ---- Tuning (seeds 101–150, share 0.20). Kinds are independent, so grid point k of both grids runs together.
const zGrid = [...CANDIDATE_RULES.fieldZMoisture.zThresholdGrid];
const slowGrid = [...CANDIDATE_RULES.ndviTrendBreak.minSlowdownGrid];
const tuneBase = harness(TUNE_SEEDS, TUNE_SHARE, BASELINE_DETECTORS);
const tuneBaseA = tuneBase.runScenario(() => []);
const tuneRuns = zGrid.map((z, k) => {
  const h = harness(TUNE_SEEDS, TUNE_SHARE, {
    ...BASELINE_DETECTORS,
    "moisture-divergence": fieldZMoisture({ zThreshold: z, minHistory: CANDIDATE_RULES.fieldZMoisture.minHistory }),
    "ndvi-change": ndviTrendBreak({ minSlowdown: slowGrid[k] }),
  });
  return { A: h.runScenario(() => []), B: h.runScenario(allEvents) };
});

/** Pre-registered tuning rule. `strictness` grows with how hard the value makes it to alarm. */
function select(kind: DiscoveryKind, values: number[], strictness: (v: number) => number) {
  const limit = round(tuneBaseA[kind].alarmsPer100Days + 0.25, 2);
  const rows = values.map((value, k) => ({
    value,
    cleanAlarmsPer100Days: tuneRuns[k].A[kind].alarmsPer100Days,
    attributableRecall: tuneRuns[k].B[kind].attributableRecall ?? 0,
    recall: tuneRuns[k].B[kind].recall,
    chanceRecall: tuneRuns[k].B[kind].chanceRecall,
    qualifies: tuneRuns[k].A[kind].alarmsPer100Days <= limit + 1e-9,
  }));
  const ok = rows.filter((r) => r.qualifies);
  const byStrict = (a: { value: number }, b: { value: number }) => strictness(b.value) - strictness(a.value);
  const selected = ok.length
    ? [...ok].sort((a, b) => b.attributableRecall - a.attributableRecall || byStrict(a, b))[0].value
    : [...rows].sort(byStrict)[0].value;
  return { baselineCleanAlarmsPer100Days: tuneBaseA[kind].alarmsPer100Days, cleanAlarmLimit: limit, rows, selected, noValueQualified: ok.length === 0 };
}
const tuning = {
  "moisture-divergence (field-z, zThreshold)": select("moisture-divergence", zGrid, (z) => -z),
  "ndvi-change (trend-break, minSlowdown)": select("ndvi-change", slowGrid, (v) => v),
};
const zSel = tuning["moisture-divergence (field-z, zThreshold)"].selected;
const slowSel = tuning["ndvi-change (trend-break, minSlowdown)"].selected;
const CANDIDATES: DetectorSet = {
  ...BASELINE_DETECTORS,
  "moisture-divergence": fieldZMoisture({ zThreshold: zSel, minHistory: CANDIDATE_RULES.fieldZMoisture.minHistory }),
  "rain-departure": rainWithImergFill({ maxFilledDays: CANDIDATE_RULES.rainWithImergFill.maxFilledDays }),
  "ndvi-change": ndviTrendBreak({ minSlowdown: slowSel }),
};

// ---- Test (seeds 1–50, three shares): baseline vs candidates on identical records.
const test = Object.fromEntries(TEST_SHARES.map((share) => {
  const run = (detectors: DetectorSet) => {
    const h = harness(TEST_SEEDS, share, detectors);
    return {
      A_clean: h.runScenario(() => []),
      B_allEvents: h.runScenario(allEvents),
      C_drySpellLength: Object.fromEntries([7, 14, 28].map((len) => {
        const r = h.runScenario((_s, rng) => [dry(rng, len)]);
        return [len, { "rain-departure": r["rain-departure"], "moisture-divergence": r["moisture-divergence"] }];
      })),
    };
  };
  return [share, { baseline: run(BASELINE_DETECTORS), candidate: run(CANDIDATES) }];
}));

// ---- Pre-registered adoption rule.
const decisions = Object.fromEntries((["moisture-divergence", "rain-departure", "ndvi-change"] as DiscoveryKind[]).map((kind) => {
  const perShare = TEST_SHARES.map((share) => {
    const { baseline, candidate } = test[share];
    const bAttr = baseline.B_allEvents[kind].attributableRecall ?? 0;
    const cAttr = candidate.B_allEvents[kind].attributableRecall ?? 0;
    const bClean = baseline.A_clean[kind].alarmsPer100Days;
    const cClean = candidate.A_clean[kind].alarmsPer100Days;
    return {
      share, baselineAttributable: bAttr, candidateAttributable: cAttr, baselineCleanPer100Days: bClean, candidateCleanPer100Days: cClean,
      attributableNotWorse: cAttr >= bAttr - 1e-9, cleanWithinLimit: cClean <= bClean + 0.25 + 1e-9, attributableGainAtLeast005: cAttr >= bAttr + 0.05 - 1e-9,
    };
  });
  const adopt = perShare.every((p) => p.attributableNotWorse && p.cleanWithinLimit) && perShare.some((p) => p.attributableGainAtLeast005);
  return [kind, { adopt, perShare }];
}));

const results = {
  experiment: "E-003",
  dataKind: "SIMULATED — synthetic FieldDay records, not field or NASA data",
  ...provenance(SOURCE_FILES),
  detectorVersion: DETECTOR_VERSION,
  setup: {
    tuneSeeds: "101-150", tuneShare: TUNE_SHARE, testSeeds: "1-50", testShares: TEST_SHARES, eventSeed: "seed + 1000", gapSeed: "seed + 2000",
    days: DAYS, start: START, plantedOn: PLANTED, crop: "corn", climate: field.climate.source, soilModel: "fao56",
    stationGaps: "3% random days + one 5-day outage starting day 20-215", matchToleranceDays: 14,
    selected: { fieldZThreshold: zSel, minHistory: CANDIDATE_RULES.fieldZMoisture.minHistory, imergMaxFilledDays: CANDIDATE_RULES.rainWithImergFill.maxFilledDays, ndviMinSlowdown: slowSel },
  },
  tuning,
  test,
  decisions,
};

mkdirSync("experiments/E-003", { recursive: true });
writeFileSync("experiments/E-003/results.json", `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify({ tuning, decisions }, null, 2));
