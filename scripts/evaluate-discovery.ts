/**
 * E-001: Discovery Engine rules on synthetic records with injected events.
 * Run: npm run experiment:discovery  → experiments/E-001/results.json
 * SIMULATED DATA ONLY. See docs/ai-ml/EXPERIMENTS.md E-001 for the plan and limits.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { CROPS, stageOnDay } from "@/data/crops";
import { daysBetween } from "@/lib/dates";
import { generateSyntheticFieldDays, type InjectedEvent } from "@/lib/demo/syntheticFieldDays";
import { createRng } from "@/lib/rng";
import { DETECTOR_VERSION, runDiscovery } from "@/lib/science/discovery/engine";
import { scoreDetections } from "@/lib/science/discovery/evaluate";
import { EXPERIMENT_FIELD, createHarness, provenance, randInt } from "./discoveryHarness";

const SEEDS = Array.from({ length: 50 }, (_, k) => k + 1);
const DAYS = 240;
const START = "2026-05-01";
const PLANTED = "2026-06-01"; // record day 31; corn development+mid-season = record days 51–120
const field = EXPERIMENT_FIELD;
const SOURCE_FILES = [
  "lib/science/discovery/engine.ts", "lib/science/discovery/evaluate.ts", "lib/demo/syntheticFieldDays.ts",
  "data/discoveryRules.ts", "data/crops.ts", "data/fields.ts", "scripts/evaluate-discovery.ts", "scripts/discoveryHarness.ts",
];

// E-001 was run with the original soil model and no station gaps; pinned so its results stay reproducible.
const { base, ctx, runScenario, flicker } = createHarness({
  seeds: SEEDS, days: DAYS, start: START, plantedOn: PLANTED, runAt: "2026-11-14T00:00:00Z", field,
  generatorOptions: () => ({ soilModel: "demo-v1" }),
});

const dry = (rng: () => number, days: number): Extract<InjectedEvent, { kind: "dry-spell" }> => ({ kind: "dry-spell", startDay: randInt(rng, 60, 180), days });

const results = {
  experiment: "E-001",
  dataKind: "SIMULATED — synthetic FieldDay records, not field or NASA data",
  ...provenance(SOURCE_FILES),
  detectorVersion: DETECTOR_VERSION,
  setup: { seeds: `${SEEDS[0]}-${SEEDS.at(-1)}`, eventSeed: "seed + 1000", days: DAYS, start: START, plantedOn: PLANTED, crop: "corn", climate: field.climate.source, matchToleranceDays: 14 },
  A_clean: runScenario(() => []),
  B_allEvents: runScenario((_s, rng) => {
    const d = dry(rng, 18);
    let wetStart = randInt(rng, 30, 210);
    while (Math.abs(wetStart - d.startDay) < 40) wetStart = randInt(rng, 30, 210);
    return [d, { kind: "wet-spell", startDay: wetStart, days: 14 }, { kind: "smap-bias", bias: 0.03 }, { kind: "ndvi-dip", day: randInt(rng, 51, 104), drop: 0.08 }];
  }),
  C_drySpellLength: Object.fromEntries([7, 10, 14, 21, 28].map((len) => {
    const r = runScenario((_s, rng) => [dry(rng, len)]);
    return [len, { "rain-departure": r["rain-departure"], "moisture-divergence": r["moisture-divergence"] }];
  })),
  C_smapBias: Object.fromEntries([0, 0.005, 0.01, 0.015, 0.02, 0.03].map((b) => {
    const r = runScenario(() => (b ? [{ kind: "smap-bias", bias: b }] : []));
    return [b, { runsWithAnyDetection: r["sensor-offset"].runsWithAnyDetection, ofRuns: SEEDS.length, delayDaysMedian: r["sensor-offset"].delayDaysMedian }];
  })),
  C_ndviDip: Object.fromEntries([0.01, 0.02, 0.03, 0.05, 0.08].map((drop) => {
    const r = runScenario((_s, rng) => [{ kind: "ndvi-dip", day: randInt(rng, 51, 104), drop }]);
    return [drop, r["ndvi-change"]];
  })),
};

// Diagnostics added after the first run (see docs/ai-ml/EXPERIMENTS.md E-001).
function ndviDipByStage(drop: number) {
  const out: Record<string, { injected: number; detected: number }> = {};
  for (const seed of SEEDS) {
    const rng = createRng(seed + 1000);
    const { days, events } = generateSyntheticFieldDays(base(seed, [{ kind: "ndvi-dip", day: randInt(rng, 51, 104), drop }]));
    const stage = stageOnDay(CROPS.corn, daysBetween(PLANTED, events[0].start));
    const detected = scoreDetections(runDiscovery(days, ctx(seed)), events)["ndvi-change"].eventsDetected;
    out[stage] ??= { injected: 0, detected: 0 };
    out[stage].injected++;
    out[stage].detected += detected;
  }
  return out;
}

Object.assign(results, {
  diagnostics_addedAfterFirstRun: {
    flickerOnCleanRecords: flicker(["moisture-divergence", "rain-departure"]),
    ndviDipRecallByStage: { "0.05": ndviDipByStage(0.05), "0.08": ndviDipByStage(0.08) },
  },
});

mkdirSync("experiments/E-001", { recursive: true });
writeFileSync("experiments/E-001/results.json", `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
