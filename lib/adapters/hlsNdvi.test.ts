import { describe, expect, it } from "vitest";
import { hlsNdviToValues, parseHlsNdviCsv } from "./hlsNdvi";

const HEADER = "sensor,date_utc,acquisition_utc,local_date,n_plot_pixels,n_clear,n_ndvi_valid,ndvi_file,ndvi_mean_valid,ndvi_plot";
const CSV = [
  HEADER,
  "S30,2024-01-27,2024-01-27T02:19:31Z,2024-01-27,36,22,22,yes,0.3681,0.3681",
  "L30,2024-02-01,2024-02-01T02:17:00Z,2024-02-01,36,0,0,no,,",
  "L30,2025-04-26,2025-04-26T02:16:40Z,2025-04-26,36,31,31,yes,0.3879,0.3879",
  "S30,2025-04-26,2025-04-26T02:15:10Z,2025-04-26,36,25,25,yes,0.2985,0.2985",
].join("\n");

describe("parseHlsNdviCsv", () => {
  it("reads plot values and keeps cloud-only days as null", () => {
    const rows = parseHlsNdviCsv(CSV);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ sensor: "S30", acquisitionUtc: "2024-01-27T02:19:31Z", nPlot: 36, nValid: 22, ndvi: 0.3681 });
    expect(rows[1].ndvi).toBeNull();
  });

  it("refuses a file with other columns", () => {
    expect(() => parseHlsNdviCsv("sensor,ndvi\nS30,0.4")).toThrow(/column/);
  });
});

describe("hlsNdviToValues", () => {
  const values = hlsNdviToValues(parseHlsNdviCsv(CSV));

  it("gives one instantaneous value per overpass day with a plot value", () => {
    expect(values).toHaveLength(2);
    expect(values[0]).toMatchObject({
      variable: "ndvi", source: "hls", product: "HLSS30_VI 2.0", provenance: "satellite", value: 0.3681,
      unit: "dimensionless", depthCm: null, aggregation: "instant", sampleCount: 22, quality: "ok",
      period: { start: "2024-01-27T02:19:31Z", end: "2024-01-27T02:19:31Z" },
    });
  });

  it("keeps the sensor with more valid pixels when both pass on one local day, and names the other", () => {
    const day = values[1];
    expect(day).toMatchObject({ product: "HLSL30_VI 2.0", value: 0.3879, sampleCount: 31 });
    expect(day.qualityNote).toMatch(/S30 also passed: 0\.2985 \(25 pixels\)/);
  });
});
