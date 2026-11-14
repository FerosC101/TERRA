"use client";

import { ArrowRight, Hand } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Badge, Card, LINK, SourceTag } from "@/components/ui";
import { longDate } from "@/lib/dates";
import { coord, fmt } from "@/lib/format";
import type { DailyObservation, Field } from "@/types";

const StationModel = dynamic(() => import("@/components/three/StationModel"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted">Loading 3D model…</div>,
});

/** The field station in 3D, beside what it measures and its latest readings. */
export function FieldStation({ field, latest }: { field: Field; latest: DailyObservation }) {
  const station = field.station;
  const simulated = station.status === "simulated";
  const readings = [
    { label: "Soil moisture, 10 cm", value: `${fmt(latest.surfaceVwc, 1)} %`, part: "FDR soil probe" },
    { label: "Soil moisture, 40 cm", value: `${fmt(latest.deepVwc, 1)} %`, part: "FDR soil probe" },
    { label: "Soil temperature, 10 cm", value: `${fmt(latest.soilTempC, 1)} °C`, part: "DS18B20 temperature probe" },
    { label: "Bulk electrical conductivity", value: `${fmt(latest.ecDsM, 2)} dS/m`, part: "Pore-water EC probe" },
    { label: "Rainfall that day", value: `${fmt(latest.rainMm, 1)} mm`, part: "Tipping-bucket rain gauge" },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="relative h-[340px] border-b border-line bg-gradient-to-b from-sunken to-surface sm:h-[400px] lg:h-auto lg:min-h-[420px] lg:border-b-0 lg:border-r">
          <StationModel className="absolute inset-0" />
          <p className="pointer-events-none absolute left-4 top-4 flex items-center gap-1.5 text-xs text-muted">
            <Hand size={13} aria-hidden /> Drag to rotate
          </p>
        </div>

        <div className="p-6 sm:p-7">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-[17px] font-semibold tracking-tight text-ink">{station.name}</h2>
            <Badge tone={simulated ? "warning" : station.status === "online" ? "good" : "critical"}>
              {simulated ? "Simulated" : station.status === "online" ? "Online" : "Offline"}
            </Badge>
          </div>
          <p className="mt-1 text-[13px] text-muted">{station.id} · {coord(station.position.lat, station.position.lng)}</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Solar-powered ground truth for the satellites.{simulated && " Not connected yet: readings are demo values."}
          </p>

          <dl className="mt-5">
            {readings.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-0">
                <dt className="min-w-0">
                  <span className="block text-sm text-ink">{r.label}</span>
                  <span className="block text-xs text-faint">{r.part}</span>
                </dt>
                <dd className="tabular text-sm font-medium text-ink">{r.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className="flex flex-col gap-0.5">
              <SourceTag kind="measurement" />
              <span className="text-xs text-faint">Observed {longDate(latest.date)}</span>
            </span>
            <Link href="/explorer" className={LINK}>See it on the map <ArrowRight size={15} aria-hidden /></Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
