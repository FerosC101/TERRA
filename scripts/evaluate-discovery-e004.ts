/**
 * E-004: confirmatory test of field-z and imerg-fill (frozen at E-003's selections) on fresh seeds 51–100,
 * with the revised adoption rule in docs/ai-ml/EXPERIMENTS.md E-004.
 * Run: npm run experiment:e004  → experiments/E-004/results.json
 * SIMULATED DATA ONLY.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { InjectedEvent } from "@/lib/demo/syntheticFieldDays";
import { createRng } from "@/lib/rng";
import { fieldZMoisture, rainWithImergFill } from "@/lib/science/discovery/candidates";
import { BASELINE_DETECTORS, DETECTOR_VERSION, type DetectorSet } from "@/lib/science/discovery/engine";
import { EXPERIMENT_FIELD, createHarness, provenance, randInt } from "./discoveryHarness";

const TEST_SEEDS = Array.from({ length: 50 }, (_, k) => k + 51);
const SHARES = [0.1, 0.2, 0.3];
const DAYS = 240;
const START = "2026-05-01";
const PLANTED = "2026-06-01";
const field = EXPERIMENT_FIELD;
const SOURCE_FILES = [
  "lib/science/discovery/engine.ts", "lib/science/discovery/candidates.ts", "lib/science/discovery/evaluate.ts",
  "lib/demo/syntheticFieldDays.ts", "lib/demo/soilModel.ts", "data/discoveryRules.ts", "data/crops.ts", "data/fields.ts",
  "scripts/evaluate-discovery-e004.ts", "scripts/discoveryHarness.ts", "experiments/E-003/results.json",
];

// Frozen candidate settings: exactly what E-003 selected on seeds 101–150.
const frozen = JSON.parse(readFileSync("experiments/E-003/results.json", "utf8")).setup.selected as {
  fieldZThreshold: number; minHistory: number; imergMaxFilledDays: number;
};
const CANDIDATES: DetectorSet = {
  ...BASELINE_DETECTORS,
  "moisture-divergence": fieldZMoisture({ zThreshold: frozen.fieldZThreshold, minHistory: frozen.minHistory }),
  "rain-departure": rainWithImergFill({ maxFilledDays: frozen.imergMaxFilledDays }),
};

const gaps = (seed: number) => ({ rate: 0.03, outages: [{ startDay: randInt(createRng(seed + 2000), 20, 215), days: 5 }] });
const harness = (share: number, detectors: DetectorSet, withGaps: boolean) => createHarness({
  seeds: TEST_SEEDS, days: DAYS, start: START, plantedOn: PLANTED, runAt: "2026-11-14T00:00:00Z", field, detectors,
  generatorOptions: (seed) => ({ soilModel: "fao56", surfaceUptakeShare: share, ...(withGaps ? { missing: gaps(seed) } : {}) }),
});
const dry = (rng: () => number, days: number): Extract<InjectedEvent, { kind: "dry-spell" }> => ({ kind: "dry-spell", startDay: randInt(rng, 60, 180), days });
const allEvents = (_s: number, rng: () => number): InjectedEvent[] => {
  const d = dry(rng, 18);
  let wetStart = randInt(rng, 30, 210);
  while (Math.abs(wetStart - d.startDay) < 40) wetStart = randInt(rng, 30, 210);
  return [d, { kind: "wet-spell", startDay: wetStart, days: 14 }, { kind: "smap-bias", bias: 0.03 }, { kind: "ndvi-dip", day: randInt(rng, 51, 104), drop: 0.08 }];
};
const LENGTHS = [7, 14, 28];

const test = Object.fromEntries(SHARES.map((share) => {
  const run = (detectors: DetectorSet) => {
    const h = harness(share, detectors, true);
    return {
      A_clean: h.runScenario(() => []),
      B_allEvents: h.runScenario(allEvents),
      C_drySpellLength: Object.fromEntries(LENGTHS.map((len) => {
        const r = h.runScenario((_s, rng) => [dry(rng, len)]);
        return [len, { "rain-departure": r["rain-departure"], "moisture-divergence": r["moisture-divergence"] }];
      })),
    };
  };
  const noGaps = harness(share, BASELINE_DETECTORS, false);
  return [share, { baseline: run(BASELINE_DETECTORS), candidate: run(CANDIDATES), baselineWithoutGaps_A_clean: noGaps.runScenario(() => []) }];
}));

// ---- Pre-registered adoption rule (docs/ai-ml/EXPERIMENTS.md E-004).
type Kind = "moisture-divergence" | "rain-departure";
const decide = (kind: Kind, reference: "same-records" | "no-gap-records") => {
  const perShare = SHARES.map((share) => {
    const t = test[share];
    const attr = (who: "baseline" | "candidate") => t[who].B_allEvents[kind].attributableRecall ?? 0;
    const cAttr = (who: "baseline" | "candidate", len: number) => t[who].C_drySpellLength[len][kind].attributableRecall ?? 0;
    const bClean = t.baseline.A_clean[kind].alarmsPer100Days;
    const cClean = t.candidate.A_clean[kind].alarmsPer100Days;
    const refClean = reference === "same-records" ? bClean : t.baselineWithoutGaps_A_clean[kind].alarmsPer100Days;
    const detectionOk = attr("candidate") >= attr("baseline") - 0.05 - 1e-9
      && LENGTHS.every((len) => cAttr("candidate", len) >= cAttr("baseline", len) - 0.1 - 1e-9);
    const falseAlarmsOk = cClean <= refClean + 0.25 + 1e-9;
    const benefit = attr("candidate") >= attr("baseline") + 0.05 - 1e-9 || cClean <= 0.85 * bClean + 1e-9;
    return {
      share,
      attributableB: { baseline: attr("baseline"), candidate: attr("candidate") },
      attributableC: Object.fromEntries(LENGTHS.map((len) => [len, { baseline: cAttr("baseline", len), candidate: cAttr("candidate", len) }])),
      cleanPer100Days: { baseline: bClean, candidate: cClean, reference: refClean, referenceKind: reference },
      detectionOk, falseAlarmsOk, benefit,
    };
  });
  return { adopt: perShare.every((p) => p.detectionOk && p.falseAlarmsOk && p.benefit), perShare };
};
const decisions: Record<Kind, ReturnType<typeof decide>> = {
  "moisture-divergence": decide("moisture-divergence", "same-records"),
  "rain-departure": decide("rain-departure", "no-gap-records"),
};

const results = {
  experiment: "E-004",
  dataKind: "SIMULATED — synthetic FieldDay records, not field or NASA data",
  ...provenance(SOURCE_FILES),
  detectorVersion: DETECTOR_VERSION,
  setup: {
    testSeeds: "51-100", shares: SHARES, eventSeed: "seed + 1000", gapSeed: "seed + 2000", days: DAYS, start: START, plantedOn: PLANTED,
    crop: "corn", climate: field.climate.source, soilModel: "fao56", stationGaps: "3% random days + one 5-day outage starting day 20-215",
    matchToleranceDays: 14, frozenFromE003: frozen, candidates: ["moisture-divergence: field-z", "rain-departure: imerg-fill"] as const,
  },
  test,
  decisions,
};

mkdirSync("experiments/E-004", { recursive: true });
writeFileSync("experiments/E-004/results.json", `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(decisions, null, 2));
