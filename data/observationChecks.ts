import type { DiscoveryKind } from "@/types";

/**
 * Possible causes of each discovery, and the field checks that can tell them apart
 * (lib/science/nextObservation.ts). "pattern-real" is the card's main interpretation.
 * Costs (minutes of work) and waiting times are rough estimates written for TERRA, not measured.
 */
export interface Cause {
  id: string;
  /** Shown under "It could also be" on the card; empty for the main interpretation. */
  text: string;
  /** Only for rain: which reading the alarm came from. */
  when?: "dry-gauge" | "wet-gauge" | "satellite";
}

export const CAUSES: Record<DiscoveryKind, Cause[]> = {
  "moisture-divergence": [
    { id: "pattern-real", text: "" },
    { id: "dry-spell", text: "A normal short dry spell that the next rain will erase." },
    { id: "sensor-contact", text: "The 10 cm sensor losing contact with drying, shrinking soil, which exaggerates the decline." },
    { id: "shallow-roots", text: "Roots still concentrated near the surface, so the crop has not started using deeper water." },
  ],
  "rain-departure": [
    { id: "pattern-real", text: "" },
    { id: "normal-variation", text: "The normal is an average: individual two-week periods often differ from it." },
    { id: "gauge-blocked", text: "A partly blocked rain gauge would also read low.", when: "dry-gauge" },
    { id: "single-storm", text: "A single intense storm can dominate a two-week total.", when: "wet-gauge" },
    { id: "satellite-miss", text: "The satellite estimate covers a ~10 km cell and can miss or misplace local showers.", when: "satellite" },
  ],
  "ndvi-change": [
    { id: "pattern-real", text: "" },
    { id: "cloud-haze", text: "Residual cloud or haze in the composite period." },
    { id: "mixed-pixels", text: "Mixed pixels: neighbouring land with a different crop or a harvested plot." },
    { id: "normal-variation", text: "Normal variation between composites." },
  ],
  "sensor-offset": [
    { id: "pattern-real", text: "" },
    { id: "probe-drift", text: "A drifting or badly calibrated station probe." },
    { id: "land-cover", text: "Land cover around the field (water, forest, town) pulling the 9 km SMAP value away from cropland." },
  ],
};

export interface ObservationCheck {
  id: string;
  action: string;
  rationale: string;
  costMinutes: number;
  /** Days before the answer is known. */
  waitDays: number;
  kinds: DiscoveryKind[];
  /** Cause ids this check can tell apart. */
  separates: string[];
  /** What the person can report back. */
  answers: string[];
}

export const OBSERVATION_CHECKS: ObservationCheck[] = [
  { id: "handheld-probe", action: "Read soil moisture with a hand-held probe right next to the station probe, at 10 cm and 40 cm.",
    rationale: "If the hand-held reading matches, the station sensor is working and the pattern is in the soil.",
    costMinutes: 15, waitDays: 0, kinds: ["moisture-divergence", "sensor-offset"], separates: ["pattern-real", "sensor-contact", "probe-drift"],
    answers: ["The station probe matches the hand-held reading", "The station probe differs from the hand-held reading"] },
  { id: "repeat-probe-other-spot", action: "Take a 10 cm and 40 cm reading at another spot in the field.",
    rationale: "If another spot is drying the same way, the pattern is not a single-sensor effect.",
    costMinutes: 20, waitDays: 0, kinds: ["moisture-divergence"], separates: ["pattern-real", "sensor-contact"],
    answers: ["The other spot is drying too", "The other spot is not drying"] },
  { id: "dig-roots", action: "Dig beside a plant and note how deep most roots reach.",
    rationale: "Shallow roots explain why the deep soil has not been drawn down yet.",
    costMinutes: 30, waitDays: 0, kinds: ["moisture-divergence"], separates: ["pattern-real", "shallow-roots"],
    answers: ["Most roots are in the top 20 cm", "Roots reach 40 cm or deeper"] },
  { id: "watch-week", action: "Watch rainfall and soil moisture over the next 7 days.",
    rationale: "A short dry or wet spell fades within a week; a real departure keeps growing.",
    costMinutes: 5, waitDays: 7, kinds: ["moisture-divergence", "rain-departure"], separates: ["pattern-real", "dry-spell", "normal-variation"],
    answers: ["The pattern faded", "The pattern continued"] },
  { id: "inspect-gauge", action: "Inspect the rain gauge for blockage, debris or a tilted funnel.",
    rationale: "A blocked gauge reads low and looks like a dry spell.",
    costMinutes: 10, waitDays: 0, kinds: ["rain-departure"], separates: ["pattern-real", "gauge-blocked"],
    answers: ["The gauge was blocked or damaged", "The gauge was clear"] },
  { id: "local-rain-record", action: "Compare with a nearby rain gauge or a farmer's own rain record for the same 14 days.",
    rationale: "A ground record shows whether the satellite missed or misplaced local showers.",
    costMinutes: 20, waitDays: 0, kinds: ["rain-departure"], separates: ["pattern-real", "satellite-miss", "single-storm"],
    answers: ["The ground record agrees with the satellite", "The ground record differs from the satellite"] },
  { id: "walk-canopy", action: "Walk the field and note leaf rolling or colour change.",
    rationale: "A healthy canopy on the ground means the NDVI dip came from the satellite, not the crop.",
    costMinutes: 30, waitDays: 0, kinds: ["ndvi-change"], separates: ["pattern-real", "cloud-haze", "mixed-pixels"],
    answers: ["Leaves are rolling or changing colour", "The canopy looks healthy"] },
  { id: "pixel-map", action: "Check on a map whether the 250 m NDVI pixels include roads or neighbouring plots.",
    rationale: "Pixels that mix in other land can dip when the neighbours are harvested.",
    costMinutes: 15, waitDays: 0, kinds: ["ndvi-change"], separates: ["pattern-real", "mixed-pixels"],
    answers: ["The pixels include other land", "The pixels lie inside the field"] },
  { id: "next-composite", action: "Compare with the next 16-day NDVI composite.",
    rationale: "Cloud and normal variation do not repeat; a real decline does.",
    costMinutes: 2, waitDays: 16, kinds: ["ndvi-change"], separates: ["pattern-real", "cloud-haze", "normal-variation"],
    answers: ["NDVI recovered", "NDVI stayed low or fell further"] },
  { id: "smap-land-cover", action: "Look at the land cover inside the 9 km SMAP cell on a map.",
    rationale: "Water, forest or town in the cell pulls SMAP away from the cropland value.",
    costMinutes: 15, waitDays: 0, kinds: ["sensor-offset"], separates: ["pattern-real", "land-cover"],
    answers: ["Much of the cell is not cropland", "The cell is mostly cropland"] },
];

/** Minutes of work one day of waiting is counted as when ranking checks. Heuristic. */
export const WAIT_MINUTES_PER_DAY = 30;
