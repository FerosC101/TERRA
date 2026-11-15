/**
 * Plot A's real record as the models see it, built from the source files (Node only): weather and SMAP L3 from the
 * Lipa Cropland pipeline record (Plot A has no record of its own; the source cells are far coarser than the 3.3 km
 * offset, see data/lipaPlotA.ts), HLS 30 m NDVI over the plot, and SMAP L4 at the plot centre.
 * Used by scripts/run-discovery-plot-a.ts and scripts/export-lipa-record.ts (the compact copy the app ships).
 */
import { existsSync, readFileSync } from "node:fs";
import { LIPA_PLOT_A } from "@/data/lipaPlotA";
import { hlsNdviToValues, parseHlsNdviCsv } from "@/lib/adapters/hlsNdvi";
import { mergeValues } from "@/lib/adapters/modisNdvi";
import { pipelineToFieldDays, type PipelineDailyRecord } from "@/lib/adapters/nasaPipeline";
import type { FieldDay } from "@/types/discovery-contract";
import { PIPELINE_FILE } from "./lipaRecord";
import { loadSmapL4Values } from "./smapL4Lipa";
import { loadSmapAcquisitionUtc } from "./smapTimes";

export const HLS_PLOT_A_CSV = "docs/Data Pipeline/data/external/hls_plot_a/hls_ndvi_plot_a.csv";
export const SMAP_L4_PLOT_A_CSV = "docs/Data Pipeline/data/external/smap_l4_plot_a/smap_l4_daily_lipa_plot_a.csv";

export function buildPlotARecord(): { days: FieldDay[]; counts: { hls: number; hlsOutside: number; smapL4: number; smapL4Outside: number } } {
  const tz = LIPA_PLOT_A.timezone;
  const weather = pipelineToFieldDays(JSON.parse(readFileSync(PIPELINE_FILE, "utf8")) as PipelineDailyRecord[],
    { fieldId: LIPA_PLOT_A.id, timeZone: tz, pipelineLocationId: LIPA_PLOT_A.weatherFromPipelineLocationId },
    { smapAcquisitionUtc: loadSmapAcquisitionUtc() });
  const hls = existsSync(HLS_PLOT_A_CSV) ? hlsNdviToValues(parseHlsNdviCsv(readFileSync(HLS_PLOT_A_CSV, "utf8"))) : [];
  const withHls = mergeValues(weather, hls, tz);
  const l4 = loadSmapL4Values(tz, SMAP_L4_PLOT_A_CSV);
  const withL4 = mergeValues(withHls.days, l4, tz);
  return { days: withL4.days, counts: { hls: hls.length, hlsOutside: withHls.dropped, smapL4: l4.length, smapL4Outside: withL4.dropped } };
}
