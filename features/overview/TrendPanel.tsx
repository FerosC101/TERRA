"use client";

import { useState } from "react";
import { SeriesChart, type SeriesDef } from "@/components/charts/SeriesChart";
import { Card, CardHeader, Segmented } from "@/components/ui";
import { SERIES } from "@/lib/chartTheme";
import { longDate, shortDate } from "@/lib/dates";
import type { DailyObservation } from "@/types";

type MetricKey = "moisture" | "rain" | "temperature" | "vegetation";

/** Each view answers one question, on one axis, in one unit. */
const VIEWS: Record<MetricKey, { label: string; question: string; unit: string; digits: number; series: SeriesDef[]; note: string }> = {
  moisture: {
    label: "Soil moisture", question: "Is the soil getting wetter or drier?", unit: "% volumetric water content", digits: 1,
    series: [
      { key: "surfaceVwc", label: "Station, 10 cm", color: SERIES.green },
      { key: "deepVwc", label: "Station, 40 cm", color: SERIES.amber },
      { key: "smapVwc", label: "SMAP satellite, ~9 km area", color: SERIES.blue, sparse: true },
    ],
    note: "The station measures one point in the field. SMAP describes the surrounding ~9 km landscape, so its level differs: compare its direction of change, not its value.",
  },
  rain: {
    label: "Rainfall", question: "How much rain has fallen, and when?", unit: "mm per day", digits: 1,
    series: [
      { key: "rainMm", label: "Station gauge", color: SERIES.green, type: "bar" },
      { key: "rainImergMm", label: "IMERG satellite, ~10 km area", color: SERIES.blue, type: "line" },
    ],
    note: "The gauge records rain at the station. IMERG is an area average, so individual storms can differ.",
  },
  temperature: {
    label: "Temperature", question: "How warm are the soil and the air?", unit: "°C", digits: 1,
    series: [
      { key: "soilTempC", label: "Soil at 10 cm (station)", color: SERIES.green },
      { key: "tmaxC", label: "Air, daily maximum", color: SERIES.amber },
    ],
    note: "Soil temperature is read by the station at 10 cm. Air temperature is the daily maximum.",
  },
  vegetation: {
    label: "Vegetation", question: "How is the crop canopy developing?", unit: "NDVI (0 to 1, unitless)", digits: 2,
    series: [{ key: "ndvi", label: "NDVI, 16-day satellite composite", color: SERIES.blue, sparse: true }],
    note: "One value every 16 days from 250 m pixels. Pixels at the field edge include neighbouring land.",
  },
};

export function TrendPanel({ observations }: { observations: DailyObservation[] }) {
  const [metric, setMetric] = useState<MetricKey>("moisture");
  const [range, setRange] = useState<30 | 90 | 240>(90);
  const view = VIEWS[metric];
  const data = observations.slice(-range);

  return (
    <Card>
      <CardHeader title="Environmental trends" description={`${shortDate(data[0].date)} to ${longDate(data[data.length - 1].date)}`} info={<><span className="font-medium text-ink">{view.question}</span> {view.note}</>}
        actions={<Segmented label="Time range" value={range} onChange={setRange} options={[{ value: 30, label: "30 days" }, { value: 90, label: "90 days" }, { value: 240, label: "All" }]} />} />
      <div className="px-5 pt-4 sm:px-6">
        <Segmented label="Measurement" value={metric} onChange={setMetric} options={(Object.keys(VIEWS) as MetricKey[]).map((k) => ({ value: k, label: VIEWS[k].label }))} />
      </div>
      <div className="px-3 pb-4 pt-5 sm:px-5">
        <SeriesChart data={data} xKey="date" series={view.series} unit={view.unit} digits={view.digits} xFormat={shortDate} height={340}
          domain={metric === "vegetation" ? [0, 1] : undefined} ariaLabel={`${view.label} from ${longDate(data[0].date)} to ${longDate(data[data.length - 1].date)}`} />
      </div>
    </Card>
  );
}
