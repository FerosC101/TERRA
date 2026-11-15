/**
 * Adapter: plot-mean HLS v2.0 NDVI (scripts/process-hls-ndvi-plot-a.py → hls_ndvi_plot_a.csv) → contract values
 * (D-002, D-012).
 *
 * - Source `hls` (Harmonized Landsat Sentinel-2, 30 m), not `modis`: a different product and resolution.
 * - One value per overpass, aggregation "instant", period = the acquisition time from the granule id.
 * - Only overpasses with a plot value are emitted (enough clear pixels); cloud-only days are left out.
 * - If both sensors (S30 Sentinel-2, L30 Landsat) pass on one local day, the one with more valid pixels is kept and
 *   the other is named in the note: the contract takes one value per variable/source/depth per day, and the two can
 *   differ by ~0.09 on the same day at Plot A (2025-04-26), so they are not averaged.
 */
import type { AnyObservationValue } from "@/types/discovery-contract";

export interface HlsNdviRow {
  sensor: "S30" | "L30";
  acquisitionUtc: string;
  localDate: string;
  nPlot: number;
  nValid: number;
  ndvi: number | null;
}

const COLUMNS = ["sensor", "acquisition_utc", "local_date", "n_plot_pixels", "n_ndvi_valid", "ndvi_plot"];
const PRODUCT = { S30: "HLSS30_VI 2.0", L30: "HLSL30_VI 2.0" } as const;

export function parseHlsNdviCsv(text: string): HlsNdviRow[] {
  const [header, ...lines] = text.trim().split(/\r?\n/).map((l) => l.split(","));
  const missing = COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`HLS NDVI CSV: missing column(s) ${missing.join(", ")}`);
  const col = (r: string[], name: string) => r[header.indexOf(name)];
  return lines.map((r) => {
    if (r.length !== header.length) throw new Error(`HLS NDVI CSV: row "${r.join(",")}" has ${r.length} fields, header has ${header.length}`);
    const sensor = col(r, "sensor");
    if (sensor !== "S30" && sensor !== "L30") throw new Error(`HLS NDVI CSV: unknown sensor ${sensor}`);
    const ndvi = col(r, "ndvi_plot") === "" ? null : Number(col(r, "ndvi_plot"));
    if (ndvi !== null && !(ndvi >= -1 && ndvi <= 1)) throw new Error(`HLS NDVI CSV: NDVI ${ndvi} outside -1..1`);
    return {
      sensor,
      acquisitionUtc: col(r, "acquisition_utc"),
      localDate: col(r, "local_date"),
      nPlot: Number(col(r, "n_plot_pixels")),
      nValid: Number(col(r, "n_ndvi_valid")),
      ndvi,
    };
  });
}

export function hlsNdviToValues(rows: HlsNdviRow[]): AnyObservationValue[] {
  const byDay = new Map<string, HlsNdviRow[]>();
  for (const r of rows) {
    if (r.ndvi === null) continue;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(r.acquisitionUtc)) throw new Error(`HLS NDVI: no acquisition time for ${r.sensor} ${r.localDate}`);
    byDay.set(r.localDate, [...(byDay.get(r.localDate) ?? []), r]);
  }
  return [...byDay.keys()].sort().map((day) => {
    const [best, ...others] = [...byDay.get(day)!].sort((a, b) => b.nValid - a.nValid);
    const also = others.map((o) => ` ${o.sensor} also passed: ${o.ndvi} (${o.nValid} pixels), not used.`).join("");
    return {
      variable: "ndvi",
      source: "hls",
      product: PRODUCT[best.sensor],
      provenance: "satellite",
      value: best.ndvi,
      unit: "dimensionless",
      depthCm: null,
      aggregation: "instant",
      period: { start: best.acquisitionUtc, end: best.acquisitionUtc },
      sampleCount: best.nValid,
      quality: "ok",
      qualityNote: `Mean of ${best.nValid} of ${best.nPlot} plot pixels clear in Fmask (30 m).${also}`,
    };
  });
}
