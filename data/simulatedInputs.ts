import { LIPA_PLOT_A_CROP_SEASONS } from "@/data/cropCalendar";
import type { CropSeason } from "@/lib/science/season";

/**
 * SIMULATED and ASSUMED inputs that let every Discovery Engine rule run on a field with a real record but without the
 * real input the rule needs (D-020). Discovery Engine only: none of this reaches the Living Field Model or
 * realRecord(). Every alarm built on these inputs says so on its card.
 *
 * - station: the planned (not installed) station's SIMULATED 10 cm / 40 cm soil moisture (lib/demo/stationModel.ts,
 *   driven by the real rain and the field model's crop water use) is added to the record as station probe values,
 *   provenance "simulated". Lets moisture divergence and source offset (station vs SMAP L3) run.
 * - assumedSeasons: a crop calendar ASSUMED for a field that has none, so the NDVI rule (growth stages only) can run.
 */
export interface SimulatedInputs {
  station: boolean;
  assumedSeasons?: { seasons: CropSeason[]; basis: string };
}

export const SIMULATED_DISCOVERY_INPUTS: Record<string, SimulatedInputs> = {
  "lipa-cropland": {
    station: true,
    assumedSeasons: {
      seasons: LIPA_PLOT_A_CROP_SEASONS,
      basis: "ASSUMED calendar: the four corn seasons reported by the farmer of Plot A (3.3 km west, data/cropCalendar.ts), applied to the AOI, which has no crop calendar",
    },
  },
  "lipa-plot-a": { station: true },
};
