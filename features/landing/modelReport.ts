/**
 * Results shown on the website's "Models and results" section.
 *
 * Every number here is copied from the AI/ML workstream's reports (not computed in this app):
 *   - docs/TERRA-Model-Description-and-Results.docx ("TERRA — Models: Description, Structure, Operation and
 *     Results", revised on real Lipa data, built 2026-11-15 from commit e5fa04a + uncommitted changes)
 *   - docs/TERRA-Rain-Departure.docx (rain-departure model section, same build)
 * Lipa Cropland runs these calibrated models on its real record in the app (docs/ai-ml/CONTEXT.md). Keep this file in step
 * with the reports; do not add a value that is not in them.
 */

export const REPORT = {
  title: "TERRA — Models: Description, Structure, Operation and Results",
  built: "2026-11-15",
  tests: "25 test files, 164 tests passed",
};

export type ModelStatus = "works" | "pending" | "blocked";

export const MODELS: { name: string; before: string; after: string; status: ModelStatus; statusLabel: string }[] = [
  { name: "Rain departure", before: "Guessed limits; flagged 48% of days", after: "Limits from 23 years of real rain; flags 18% of days; both 2024 storms caught, 2024 drought caught late", status: "works", statusLabel: "Works; checked on 3 real events" },
  { name: "Daily water balance", before: "Assumed planting date", after: "Farmer's 4 seasons, Plot A soil; 48 stress days in the 2024 drought season", status: "works", statusLabel: "Works; agrees with the farmer's report" },
  { name: "Rotation planner", before: "Average climate only: never shows a dry year", after: "Also runs 24 real years; dry-season corn ran short in 10 of 24 years", status: "works", statusLabel: "Works; agrees with the farmer's report" },
  { name: "Moisture divergence", before: "Needed a field sensor: always off", after: "SMAP L4 fallback with limits from L4 history", status: "pending", statusLabel: "Built and tested; calibration pending" },
  { name: "NDVI change", before: "Needed a crop calendar the area lacks", after: "'Below normal' rule from 2001–2023 MODIS", status: "pending", statusLabel: "Built and tested; calibration pending" },
  { name: "Living Field Model", before: "Topsoil stuck at 'full' (SMAP L3)", after: "SMAP L4 for both layers, rescaled", status: "pending", statusLabel: "Built and tested; calibration pending" },
  { name: "Sensor offset", before: "Needs a ground sensor", after: "Unchanged: no sensor exists", status: "blocked", statusLabel: "Cannot run" },
  { name: "Next Best Observation", before: "Ranks field checks", after: "Unchanged (uses no data)", status: "works", statusLabel: "Works" },
];

/** Rain departure: monthly limits from NASA POWER daily rain 2001–2023 (ratio of 14-day rain to normal). */
export const RAIN_LIMITS: { month: string; dry14: number; wet14: number; drought90: number }[] = [
  { month: "Jan", dry14: 0.23, wet14: 2.293, drought90: 0.606 },
  { month: "Feb", dry14: 0.082, wet14: 2.328, drought90: 0.542 },
  { month: "Mar", dry14: 0.099, wet14: 2.946, drought90: 0.379 },
  { month: "Apr", dry14: 0.074, wet14: 3.49, drought90: 0.358 },
  { month: "May", dry14: 0.112, wet14: 2.656, drought90: 0.368 },
  { month: "Jun", dry14: 0.309, wet14: 1.929, drought90: 0.493 },
  { month: "Jul", dry14: 0.352, wet14: 1.851, drought90: 0.651 },
  { month: "Aug", dry14: 0.374, wet14: 1.993, drought90: 0.787 },
  { month: "Sep", dry14: 0.296, wet14: 1.953, drought90: 0.767 },
  { month: "Oct", dry14: 0.362, wet14: 2.027, drought90: 0.764 },
  { month: "Nov", dry14: 0.352, wet14: 2.202, drought90: 0.731 },
  { month: "Dec", dry14: 0.24, wet14: 2.112, drought90: 0.641 },
];
/** The fixed limits the calibration replaced (guessed for a rain gauge, never calibrated). */
export const OLD_RAIN_BAND = { dry: 0.45, wet: 1.7 };

/** Share flagged by the old fixed limits and the new monthly limits. */
export const FLAG_RATES: { label: string; detail: string; old: number; next: number }[] = [
  { label: "2001–2023", detail: "14-day windows flagged, calibration years", old: 30.4, next: 10.1 },
  { label: "2019–2023", detail: "Held out: limits fitted on 2001–2018 only", old: 33.7, next: 18.1 },
  { label: "2024–2025", detail: "Days flagged in the test record", old: 48.1, next: 18.1 },
];

export const RAIN_EVENTS: { event: string; dates: string; kind: "dry" | "wet"; oldRule: string; newRule: string; verdict: string }[] = [
  { event: "El Niño drought", dates: "1 Feb – 31 Mar 2024", kind: "dry", oldRule: "No alarm", newRule: "90-day alarm on 15 Apr 2024", verdict: "Caught late" },
  { event: "Typhoon Carina (Gaemi) with the southwest monsoon", dates: "22 – 25 Jul 2024", kind: "wet", oldRule: "Alarm ends 23 Jul", newRule: "Alarm ends 23 Jul", verdict: "Caught" },
  { event: "Severe Tropical Storm Kristine (Trami)", dates: "22 – 25 Oct 2024", kind: "wet", oldRule: "Alarm ends 23 Oct", newRule: "Alarm ends 24 Oct", verdict: "Caught" },
];

/** Daily water balance, Plot A corn, real weather. */
export const STRESS_SEASONS: { season: string; planted: string; daysInRecord: number; stressDays: number; period: string; maxUsed: string }[] = [
  { season: "2024 dry", planted: "15 Dec 2023 – 15 Mar 2024", daysInRecord: 74, stressDays: 48, period: "27 Jan – 14 Mar 2024", maxUsed: "72 of 76 mm" },
  { season: "2024 wet", planted: "5 Jun – 15 Sep 2024", daysInRecord: 102, stressDays: 7, period: "15 – 21 Aug 2024", maxUsed: "57 of 76 mm" },
  { season: "2025 dry", planted: "15 Nov 2024 – 25 Feb 2025", daysInRecord: 102, stressDays: 12, period: "26 Jan – 6 Feb 2025", maxUsed: "63 of 76 mm" },
  { season: "2025 wet", planted: "5 Jun – 15 Sep 2025", daysInRecord: 102, stressDays: 3, period: "4 – 6 Aug 2025", maxUsed: "49 of 76 mm" },
];

export const ROTATION_SHORT: { rotation: string; season: string; years: string; shortfall: string }[] = [
  { rotation: "Rotation A (corn – corn – corn)", season: "Corn, Dec – May", years: "10 of 24", shortfall: "66 mm" },
  { rotation: "Rotation C (corn – peanut – sweet potato)", season: "Peanut, Dec – May", years: "11 of 24", shortfall: "62 mm" },
];

export const LIMITS: { limit: string; effect: string; fix: string }[] = [
  { limit: "No ground soil sensor or rain gauge", effect: "No model is validated against field measurements; sensor offset cannot run", fix: "Install the station pod or take regular manual readings" },
  { limit: "Only one dry and two wet dated events", effect: "Results are agreement on a few cases, not accuracy rates", fix: "Field records from the farmer and the City Agriculture Office" },
  { limit: "Rain from a ~50 km model (POWER)", effect: "Local storms can differ", fix: "A rain gauge at the plot" },
  { limit: "Plot A outline drawn by hand", effect: "NDVI pixels near the edges may be wrong", fix: "GPS corners from a field visit" },
  { limit: "Clouds in the wet season", effect: "Few NDVI views when crops grow", fix: "Radar (Sentinel-1), not yet tested" },
];
