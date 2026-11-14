import type { Scenario } from "@/types";

/**
 * Predefined climate scenarios. These are fixed adjustments applied to the
 * historical climatology — stress tests, not forecasts and not CMIP6 output.
 */
export const SCENARIOS: Scenario[] = [
  { id: "historical", name: "Historical conditions", rainChange: 0, tempChangeC: 0,
    description: "Average monthly rainfall and evaporative demand, unchanged." },
  { id: "dry", name: "Reduced rainfall", rainChange: -0.25, tempChangeC: 0,
    description: "Every month receives 25% less rain." },
  { id: "wet", name: "Increased rainfall", rainChange: 0.25, tempChangeC: 0,
    description: "Every month receives 25% more rain." },
  { id: "hot", name: "Higher temperatures", rainChange: 0, tempChangeC: 2,
    description: "Air temperature 2 °C higher all year; rainfall unchanged." },
  { id: "hot-dry", name: "Heat and drought", rainChange: -0.3, tempChangeC: 2.5,
    description: "30% less rain combined with 2.5 °C of warming." },
];

export const HISTORICAL = SCENARIOS[0];
