import { CROPS } from "@/data/crops";
import { fitStagesToSeason, type CropSeason } from "@/lib/science/season";

/**
 * Crop calendar for the Lipa Cropland AOI, Plot A: FARMER-REPORTED, approximate.
 *
 * Source: interview with Mang Edgar, corn farmer of Plot A (file "NEXonaut interview.pdf", Part A, questions 3–6),
 * given to the ML engineer and confirmed by them on 2026-11-15 as real answers. NOTE: the PDF's own provenance
 * table says "Simulated respondent" / "Actual interview conducted: No"; the ML engineer states that this label is
 * wrong. Interview date and interviewer are not stated in the file (unknown).
 *
 * Scope: Plot A only. Per the same interview, the AOI is shared with at least one other farmer (vegetables,
 * e.g. tomato) and has trees, a path and grass; Plot A's location inside the AOI is not mapped yet (unknown).
 * The farmer says planting is sometimes staggered by a few days to a week (question 6). Rainfed, no regular
 * irrigation (question 7).
 *
 * Date convention for the approximate answers: early = 5th, mid = 15th, late = 25th of the month.
 * Yields in the PDF are labelled "illustrative" there and are NOT recorded here.
 */
export interface ReportedSeason {
  season: string;
  crop: "corn";
  plantedReported: string;
  harvestedReported: string;
  plantedOn: string;
  harvestedOn: string;
}

export const LIPA_PLOT_A_SEASONS: ReportedSeason[] = [
  { season: "2024 dry", crop: "corn", plantedReported: "Mid-December 2023", harvestedReported: "Mid-March 2024", plantedOn: "2023-12-15", harvestedOn: "2024-03-15" },
  { season: "2024 wet", crop: "corn", plantedReported: "Early June 2024", harvestedReported: "Mid-September 2024", plantedOn: "2024-06-05", harvestedOn: "2024-09-15" },
  { season: "2025 dry", crop: "corn", plantedReported: "Mid-November 2024", harvestedReported: "Late February 2025", plantedOn: "2024-11-15", harvestedOn: "2025-02-25" },
  { season: "2025 wet", crop: "corn", plantedReported: "Early June 2025", harvestedReported: "Mid-September 2025", plantedOn: "2025-06-05", harvestedOn: "2025-09-15" },
];

/** The seasons as model input: corn with its stage lengths fitted to each reported season (lib/science/season.ts). */
export const LIPA_PLOT_A_CROP_SEASONS: CropSeason[] = LIPA_PLOT_A_SEASONS.map((s) => ({
  crop: fitStagesToSeason(CROPS[s.crop], s.plantedOn, s.harvestedOn),
  plantedOn: s.plantedOn,
  harvestedOn: s.harvestedOn,
}));

/** Events the farmer reported (question 9). Used to check model output, never as model input. */
export const LIPA_PLOT_A_REPORTED_EVENTS = [
  { period: "2024-02..2024-03", event: "drought/heat: soil dried fast, corn weakened, poor growth, low yield", question: 9 },
] as const;
