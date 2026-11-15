import clsx from "clsx";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Card, SourceTag } from "@/components/ui";
import { Sparkline } from "@/components/visual/Sparkline";
import { shortDate } from "@/lib/dates";
import type { FieldSummary } from "@/lib/fieldSummary";
import { fmt, signed } from "@/lib/format";
import { SERIES } from "@/lib/chartTheme";
import type { DailyObservation, Provenance } from "@/types";

function direction(change: number, threshold: number): "up" | "down" | "flat" {
  return change >= threshold ? "up" : change <= -threshold ? "down" : "flat";
}

interface Tile {
  label: string;
  /** Depth or period, shown after the label */
  where: string;
  value: string;
  unit?: string;
  source: Provenance;
  when: string;
  spark?: (number | null)[];
  change?: { direction: "up" | "down" | "flat"; text: string; warn?: boolean; title?: string };
}

/** One reading per tile, every tile built the same way so the row reads as one set. */
function MeasurementTile({ t }: { t: Tile }) {
  const Icon = t.change?.direction === "up" ? ArrowUpRight : t.change?.direction === "down" ? ArrowDownRight : ArrowRight;
  return (
    <Card as="div" className="flex min-w-0 flex-col p-5">
      <p className="min-w-0 text-[13px] leading-snug">
        <span className="block truncate font-medium text-ink">{t.label}</span>
        <span className="block truncate text-xs text-muted">{t.where}</span>
      </p>
      <p className="mt-3 flex items-baseline gap-1">
        <span className="tabular text-[28px] font-semibold leading-none tracking-tight text-ink">{t.value}</span>
        {t.unit && <span className="text-sm text-muted">{t.unit}</span>}
      </p>
      <div className="mt-3 h-7">
        {t.spark && <Sparkline values={t.spark} color={t.source === "satellite" ? SERIES.blue : SERIES.green} label={`${t.label}, recent trend`} />}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-2">
        {t.change ? (
          <p title={t.change.title} className={clsx("flex min-w-0 items-center gap-1 text-[13px] font-medium", t.change.warn ? "text-amber" : "text-ink-soft")}>
            <Icon size={14} className="shrink-0" aria-hidden /> <span className="whitespace-nowrap">{t.change.text}</span>
          </p>
        ) : <p className="text-[13px] text-muted">{t.when}</p>}
        <span title={`Observed ${t.when}`} className="shrink-0"><SourceTag kind={t.source} short className="text-[11px]!" /></span>
      </div>
    </Card>
  );
}

/** The five measurements a user needs first. Everything else lives one level down. */
export function KeyMeasurements({ summary, observations }: { summary: FieldSummary; observations: DailyObservation[] }) {
  const { latest } = summary;
  const observed = shortDate(latest.date);
  const last30 = observations.slice(-30);
  const ndvi = observations.filter((o) => o.ndvi !== null).slice(-8).map((o) => o.ndvi);
  const rainShare = summary.rainExpected14 ? summary.rain14 / summary.rainExpected14 : 1;

  const tiles: Tile[] = [
    {
      label: "Soil moisture", where: "Surface, 10 cm", value: fmt(latest.surfaceVwc, 1), unit: "%", source: "measurement", when: observed,
      spark: last30.map((o) => o.surfaceVwc),
      change: { direction: direction(summary.surfaceChange14, 1), text: `${signed(summary.surfaceChange14)} pts`, warn: summary.surfaceChange14 <= -5 },
    },
    {
      label: "Soil moisture", where: "Deep, 40 cm", value: fmt(latest.deepVwc, 1), unit: "%", source: "measurement", when: observed,
      spark: last30.map((o) => o.deepVwc),
      change: { direction: direction(summary.deepChange14, 1), text: `${signed(summary.deepChange14)} pts` },
    },
    {
      label: "Rain", where: "Last 14 days", value: fmt(summary.rain14, 0), unit: "mm", source: "measurement",
      when: `${shortDate(summary.rainPeriodStart)} to ${observed}`, spark: last30.map((o) => o.rainMm),
      change: {
        direction: direction(rainShare - 1, 0.25), text: `${fmt(rainShare * 100)}% of usual`, warn: rainShare < 0.45 || rainShare > 1.7,
        title: `About ${fmt(summary.rainExpected14, 0)} mm is usual for these 14 days, from this field's monthly climate record`,
      },
    },
    {
      label: "Soil temperature", where: "10 cm", value: fmt(latest.soilTempC, 1), unit: "°C", source: "measurement", when: observed,
      spark: last30.map((o) => o.soilTempC),
      change: { direction: direction(summary.soilTempChange14, 0.5), text: `${signed(summary.soilTempChange14)} °C` },
    },
    summary.lastNdvi
      ? {
        label: "Vegetation", where: "NDVI, 16-day", value: fmt(summary.lastNdvi.ndvi, 2), source: "satellite",
        when: shortDate(summary.lastNdvi.date), spark: ndvi,
        change: { direction: direction(summary.ndviChange, 0.02), text: `${signed(summary.ndviChange, 2)} vs last`, warn: summary.ndviChange <= -0.03 },
      }
      : { label: "Vegetation", where: "NDVI", value: "—", source: "satellite", when: "No composite yet" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {tiles.map((t) => <MeasurementTile key={`${t.label}-${t.where}`} t={t} />)}
    </div>
  );
}
