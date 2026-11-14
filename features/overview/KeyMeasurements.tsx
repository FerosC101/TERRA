import { Card, Metric, type MetricProps } from "@/components/ui";
import { shortDate } from "@/lib/dates";
import type { FieldSummary } from "@/lib/fieldSummary";
import type { DailyObservation } from "@/types";
import { fmt, signed } from "@/lib/format";

function direction(change: number, threshold: number): "up" | "down" | "flat" {
  return change >= threshold ? "up" : change <= -threshold ? "down" : "flat";
}

/** The five measurements a user needs first. Everything else lives one level down. */
export function KeyMeasurements({ summary, observations }: { summary: FieldSummary; observations: DailyObservation[] }) {
  const { latest } = summary;
  const observed = shortDate(latest.date);
  const last30 = observations.slice(-30);
  const ndvi = observations.filter((o) => o.ndvi !== null).slice(-8).map((o) => o.ndvi);
  const rainShare = summary.rainExpected14 ? summary.rain14 / summary.rainExpected14 : 1;
  const period = `${shortDate(summary.rainPeriodStart)} to ${shortDate(latest.date)}`;

  const metrics: MetricProps[] = [
    {
      label: "Surface soil moisture", value: fmt(latest.surfaceVwc, 1), unit: "%", source: "measurement", when: `10 cm · ${observed}`, spark: last30.map((o) => o.surfaceVwc),
      trend: { direction: direction(summary.surfaceChange14, 1), text: `${signed(summary.surfaceChange14)} pts, 14 d`, tone: summary.surfaceChange14 <= -5 ? "warning" : "neutral" },
    },
    {
      label: "Deep soil moisture", value: fmt(latest.deepVwc, 1), unit: "%", source: "measurement", when: `40 cm · ${observed}`, spark: last30.map((o) => o.deepVwc),
      trend: { direction: direction(summary.deepChange14, 1), text: `${signed(summary.deepChange14)} pts, 14 d` },
    },
    {
      label: "Rain, last 14 days", value: fmt(summary.rain14, 0), unit: "mm", source: "measurement", when: period, spark: last30.map((o) => o.rainMm),
      trend: { direction: direction(rainShare - 1, 0.25), text: `${fmt(rainShare * 100)}% of usual (${fmt(summary.rainExpected14, 0)} mm)`, tone: rainShare < 0.45 || rainShare > 1.7 ? "warning" : "neutral" },
    },
    {
      label: "Soil temperature", value: fmt(latest.soilTempC, 1), unit: "°C", source: "measurement", when: `10 cm · ${observed}`, spark: last30.map((o) => o.soilTempC),
      trend: { direction: direction(summary.soilTempChange14, 0.5), text: `${signed(summary.soilTempChange14)} °C, 14 d` },
    },
    summary.lastNdvi
      ? {
          label: "Vegetation (NDVI)", value: fmt(summary.lastNdvi.ndvi, 2), source: "satellite", when: `16-day · ${shortDate(summary.lastNdvi.date)}`, spark: ndvi,
          trend: { direction: direction(summary.ndviChange, 0.02), text: `${signed(summary.ndviChange, 2)} since last`, tone: summary.ndviChange <= -0.03 ? "warning" : "neutral" },
        }
      : { label: "Vegetation (NDVI)", value: "Unavailable", source: "satellite", when: "No composite yet" },
  ];

  return (
    <Card>
      <div className="grid grid-cols-2 gap-x-6 gap-y-7 p-5 sm:p-6 md:grid-cols-3 xl:grid-cols-5">
        {metrics.map((m) => <Metric key={m.label} {...m} />)}
      </div>
    </Card>
  );
}
