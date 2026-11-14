import { Card, Metric, type MetricProps } from "@/components/ui";
import { longDate, shortDate } from "@/lib/dates";
import type { FieldSummary } from "@/lib/fieldSummary";
import { fmt, signed } from "@/lib/format";

function direction(change: number, threshold: number): "up" | "down" | "flat" {
  return change >= threshold ? "up" : change <= -threshold ? "down" : "flat";
}

/** The five measurements a user needs first. Everything else lives one level down. */
export function KeyMeasurements({ summary }: { summary: FieldSummary }) {
  const { latest } = summary;
  const observed = `Observed ${longDate(latest.date)}`;
  const rainShare = summary.rainExpected14 ? summary.rain14 / summary.rainExpected14 : 1;
  const period = `${shortDate(summary.rainPeriodStart)} to ${shortDate(latest.date)}`;

  const metrics: MetricProps[] = [
    {
      label: "Surface soil moisture", value: fmt(latest.surfaceVwc, 1), unit: "%", source: "measurement", when: `10 cm depth · ${observed}`,
      trend: { direction: direction(summary.surfaceChange14, 1), text: `${signed(summary.surfaceChange14)} points in 14 days`, tone: summary.surfaceChange14 <= -5 ? "warning" : "neutral" },
    },
    {
      label: "Deep soil moisture", value: fmt(latest.deepVwc, 1), unit: "%", source: "measurement", when: `40 cm depth · ${observed}`,
      trend: { direction: direction(summary.deepChange14, 1), text: `${signed(summary.deepChange14)} points in 14 days` },
    },
    {
      label: "Recent rainfall", value: fmt(summary.rain14, 0), unit: "mm", source: "measurement", when: `14 days · ${period}`,
      trend: { direction: direction(rainShare - 1, 0.25), text: `${fmt(rainShare * 100)}% of the ${fmt(summary.rainExpected14, 0)} mm usual for the period`, tone: rainShare < 0.45 || rainShare > 1.7 ? "warning" : "neutral" },
    },
    {
      label: "Soil temperature", value: fmt(latest.soilTempC, 1), unit: "°C", source: "measurement", when: `10 cm depth · ${observed}`,
      trend: { direction: direction(summary.soilTempChange14, 0.5), text: `${signed(summary.soilTempChange14)} °C in 14 days` },
    },
    summary.lastNdvi
      ? {
          label: "Vegetation condition", value: fmt(summary.lastNdvi.ndvi, 2), unit: "NDVI", source: "satellite", when: `16-day composite to ${longDate(summary.lastNdvi.date)}`,
          trend: { direction: direction(summary.ndviChange, 0.02), text: `${signed(summary.ndviChange, 2)} since the previous composite`, tone: summary.ndviChange <= -0.03 ? "warning" : "neutral" },
        }
      : { label: "Vegetation condition", value: "Unavailable", source: "satellite", when: "No composite received yet" },
  ];

  return (
    <Card>
      <div className="grid grid-cols-2 gap-x-6 gap-y-7 p-5 sm:p-6 md:grid-cols-3 xl:grid-cols-5">
        {metrics.map((m) => <Metric key={m.label} {...m} />)}
      </div>
    </Card>
  );
}
