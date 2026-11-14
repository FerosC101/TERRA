/**
 * E-002: the same rules on FAO-56-style synthetic soil with station gaps, at three surface uptake shares.
 * Run: npm run experiment:e002  → experiments/E-002/results.json
 * SIMULATED DATA ONLY. See docs/ai-ml/EXPERIMENTS.md E-002 for the plan and limits.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { InjectedEvent } from "@/lib/demo/syntheticFieldDays";
import { createRng } from "@/lib/rng";
import { DETECTOR_VERSION } from "@/lib/science/discovery/engine";
import { EXPERIMENT_FIELD, createHarness, provenance, randInt } from "./discoveryHarness";

const SEEDS = Array.from({ length: 50 }, (_, k) => k + 1);
const DAYS = 240;
const START = "2026-05-01";
const PLANTED = "2026-06-01";
const SHARES = [0.1, 0.2, 0.3];
const field = EXPERIMENT_FIELD;
const SOURCE_FILES = [
  "lib/science/discovery/engine.ts", "lib/science/discovery/evaluate.ts", "lib/demo/syntheticFieldDays.ts", "lib/demo/soilModel.ts",
  "data/discoveryRules.ts", "data/crops.ts", "data/fields.ts", "scripts/evaluate-discovery-e002.ts", "scripts/discoveryHarness.ts",
];

/** Station gaps per seed: 3% random days plus one 5-day outage (start from seed + 2000). */
const gaps = (seed: number) => ({ rate: 0.03, outages: [{ startDay: randInt(createRng(seed + 2000), 20, 215), days: 5 }] });
const dry = (rng: () => number, days: number): Extract<InjectedEvent, { kind: "dry-spell" }> => ({ kind: "dry-spell", startDay: randInt(rng, 60, 180), days });

const byShare = Object.fromEntries(SHARES.map((share) => {
  const { runScenario, flicker } = createHarness({
    seeds: SEEDS, days: DAYS, start: START, plantedOn: PLANTED, runAt: "2026-11-14T00:00:00Z", field,
    generatorOptions: (seed) => ({ soilModel: "fao56", surfaceUptakeShare: share, missing: gaps(seed) }),
  });
  return [share, {
    A_clean: runScenario(() => []),
    B_allEvents: runScenario((_s, rng) => {
      const d = dry(rng, 18);
      let wetStart = randInt(rng, 30, 210);
      while (Math.abs(wetStart - d.startDay) < 40) wetStart = randInt(rng, 30, 210);
      return [d, { kind: "wet-spell", startDay: wetStart, days: 14 }, { kind: "smap-bias", bias: 0.03 }, { kind: "ndvi-dip", day: randInt(rng, 51, 104), drop: 0.08 }];
    }),
    C_drySpellLength: Object.fromEntries([7, 14, 28].map((len) => {
      const r = runScenario((_s, rng) => [dry(rng, len)]);
      return [len, { "rain-departure": r["rain-departure"], "moisture-divergence": r["moisture-divergence"] }];
    })),
    flickerOnCleanRecords: flicker(["moisture-divergence", "rain-departure"]),
  }];
}));

const results = {
  experiment: "E-002",
  dataKind: "SIMULATED — synthetic FieldDay records, not field or NASA data",
  ...provenance(SOURCE_FILES),
  detectorVersion: DETECTOR_VERSION,
  setup: {
    seeds: `${SEEDS[0]}-${SEEDS.at(-1)}`, eventSeed: "seed + 1000", gapSeed: "seed + 2000", days: DAYS, start: START, plantedOn: PLANTED,
    crop: "corn", climate: field.climate.source, soilModel: "fao56", stationGaps: "3% random days + one 5-day outage starting day 20-215",
    surfaceUptakeShares: SHARES, matchToleranceDays: 14,
  },
  byShare,
};

mkdirSync("experiments/E-002", { recursive: true });
writeFileSync("experiments/E-002/results.json", `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
