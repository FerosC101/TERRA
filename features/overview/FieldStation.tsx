"use client";

import { ArrowRight, Hand } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Badge, Card, LINK, SourceTag } from "@/components/ui";
import { InfoTip } from "@/components/visual/InfoTip";
import { shortDate } from "@/lib/dates";
import { coord, fmt } from "@/lib/format";
import type { DailyObservation, Field } from "@/types";

const StationModel = dynamic(() => import("@/components/three/StationModel"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted">Loading 3D model…</div>,
});

/** The field station in 3D, its status, and the two readings not already shown in Conditions now. */
export function FieldStation({ field, latest }: { field: Field; latest: DailyObservation }) {
  const station = field.station;
  const simulated = station.status === "simulated";
  const extra = [
    { label: "Bulk EC", value: fmt(latest.ecDsM, 2), unit: "dS/m" },
    { label: "Rain that day", value: fmt(latest.rainMm, 1), unit: "mm" },
  ];

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-6 pb-0">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
            {station.name}
            <InfoTip label="field station">
              Solar-powered sensor pod: two FDR soil-moisture probes (10 cm and 40 cm), a DS18B20 soil-temperature probe, a pore-water EC probe and a
              tipping-bucket rain gauge. It is the ground truth for the satellite layers.
            </InfoTip>
          </h2>
          <p className="tabular mt-0.5 text-xs text-muted">{station.id} · {coord(station.position.lat, station.position.lng)}</p>
        </div>
        <Badge tone={simulated ? "warning" : station.status === "online" ? "good" : "critical"}>
          {simulated ? "Simulated" : station.status === "online" ? "Online" : "Offline"}
        </Badge>
      </div>

      <div className="relative mx-6 mt-4 h-[230px] overflow-hidden rounded-xl bg-gradient-to-b from-sunken to-surface">
        <StationModel className="absolute inset-0" />
        <p className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 text-xs text-muted"><Hand size={13} aria-hidden /> Drag to rotate</p>
      </div>

      <dl className="mx-6 mt-4 grid grid-cols-2 gap-4">
        {extra.map((r) => (
          <div key={r.label}>
            <dt className="text-xs text-muted">{r.label}</dt>
            <dd className="mt-0.5 flex items-baseline gap-1"><span className="tabular text-lg font-semibold text-ink">{r.value}</span><span className="text-xs text-muted">{r.unit}</span></dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-6 pt-4">
        <span className="text-xs text-muted">
          <SourceTag kind="measurement" short detail={shortDate(latest.date)} />
          {simulated && <span className="mt-0.5 block">Not connected yet: demo values</span>}
        </span>
        <Link href="/explorer" className={LINK}>See it on the map <ArrowRight size={15} aria-hidden /></Link>
      </div>
    </Card>
  );
}
